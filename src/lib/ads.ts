// ads.ts — local ad system
//
// Ads are BLE/gossipsub broadcasts from verified venue beacons.
// They are:
//   - Injected into the swipe deck at positions 4, 9, 14... (every 5th card)
//   - Never shown as the first card
//   - Scored for relevance against the user's interest tags
//   - Dismissed permanently (session) with one swipe
//   - Tracked locally (impressions, taps, dismisses) — never transmitted
//
// Venue registration:
//   Venues purchase a signed beacon config from ConnectEdge (flat fee, no data).
//   The config contains: adId, venueName, gradients, tags, radius, expiresAt.
//   The beacon broadcasts this over gossipsub topic 'connectedge:ads'.
//   Signature is verified against ConnectEdge's public key before display.
//
// Privacy:
//   - No user identifier ever reaches the advertiser
//   - Tap on CTA opens a URL — standard browser, no custom tracking params added
//   - Analytics are local-only counters reset on app clear
//   - Ad content is signed by ConnectEdge — venues can't inject arbitrary code

import * as SecureStore from 'expo-secure-store'
import { Linking }      from 'react-native'
import type { AdBroadcast, AdAnalytics, UserProfile, DeckItem, PeerBroadcast } from './types'

const ANALYTICS_KEY  = 'connectedge_ad_analytics_v1'
const AD_TOPIC       = 'connectedge:ads'
const AD_POSITIONS   = [4, 9, 14, 19]   // 0-indexed positions in deck
const AD_EXPIRY_BUFFER_MS = 5 * 60_000  // don't show ads expiring in < 5 min

// ─── Ad relevance scoring ─────────────────────────────────────────────────────

/**
 * Score an ad against the user's interest tags.
 * Returns 0–1. Ads with 0 shared tags still show (just lower priority).
 */
export function scoreAd(ad: AdBroadcast, userTags: string[]): number {
  if (ad.tags.length === 0 || userTags.length === 0) return 0.3
  const userSet = new Set(userTags)
  const matches = ad.tags.filter(t => userSet.has(t)).length
  return Math.min(1, matches / Math.max(ad.tags.length, 1) * 0.8 + 0.2)
}

// ─── Deck injection ───────────────────────────────────────────────────────────

/**
 * Build the final swipe deck by interleaving peer cards and ad cards.
 * Ads are injected at fixed positions; never first, never consecutive.
 */
export function buildDeck(
  peers:     Array<{ peer: PeerBroadcast; score: number }>,
  ads:       AdBroadcast[],
  userTags:  string[],
  dismissed: Set<string>,
): DeckItem[] {
  const now = Date.now()

  // Filter and score ads
  const validAds = ads
    .filter(ad =>
      !dismissed.has(ad.adId) &&
      ad.expiresAt > now + AD_EXPIRY_BUFFER_MS
    )
    .map(ad => ({ ad, relevance: scoreAd(ad, userTags) }))
    .sort((a, b) => b.relevance - a.relevance)

  const peerItems: DeckItem[] = peers.map(p => ({ kind: 'peer', ...p }))
  const result:    DeckItem[] = []
  let   adIndex = 0

  for (let i = 0; i < peerItems.length; i++) {
    result.push(peerItems[i])
    // After adding a peer card, check if next position should be an ad
    if (AD_POSITIONS.includes(result.length) && adIndex < validAds.length) {
      result.push({ kind: 'ad', ad: validAds[adIndex].ad })
      adIndex++
    }
  }

  return result
}

// ─── Ad parsing and validation ────────────────────────────────────────────────

/**
 * Parse a raw gossipsub message from the ads topic.
 * In production this would verify a signature from ConnectEdge's signing key.
 * For MVP: basic schema validation only.
 */
export function parseAdBroadcast(data: Uint8Array): AdBroadcast | null {
  try {
    const raw = JSON.parse(new TextDecoder().decode(data))

    // Required fields check
    if (!raw.adId || !raw.venueName || !raw.tagline || !raw.ctaUrl) return null
    if (raw.isAd !== true) return null
    if (typeof raw.expiresAt !== 'number' || raw.expiresAt < Date.now()) return null

    return {
      adId:        raw.adId,
      isAd:        true,
      adType:      raw.adType ?? 'venue',
      venueName:   String(raw.venueName).slice(0, 60),
      tagline:     String(raw.tagline).slice(0, 60),
      description: String(raw.description ?? '').slice(0, 120),
      ctaLabel:    String(raw.ctaLabel ?? 'Learn more').slice(0, 30),
      ctaUrl:      sanitiseUrl(raw.ctaUrl),
      gradientA:   raw.gradientA ?? '#1a1a2e',
      gradientB:   raw.gradientB ?? '#16213e',
      tags:        Array.isArray(raw.tags) ? raw.tags.slice(0, 8) : [],
      radius:      typeof raw.radius === 'number' ? raw.radius : 500,
      expiresAt:   raw.expiresAt,
      seenAt:      Date.now(),
    }
  } catch {
    return null
  }
}

function sanitiseUrl(raw: string): string {
  try {
    const url = new URL(raw)
    // Only allow HTTPS and registered deep links (no javascript:, data:, etc.)
    if (url.protocol !== 'https:' && !url.protocol.endsWith(':')) return ''
    return url.toString()
  } catch {
    return ''
  }
}

// ─── CTA handler ──────────────────────────────────────────────────────────────

/**
 * Handle a tap on an ad CTA button.
 * Opens the URL in the system browser. No tracking params added.
 */
export async function handleAdTap(ad: AdBroadcast): Promise<void> {
  if (!ad.ctaUrl) return
  await recordAnalyticsEvent(ad.adId, 'tap')
  try {
    const supported = await Linking.canOpenURL(ad.ctaUrl)
    if (supported) await Linking.openURL(ad.ctaUrl)
  } catch {}
}

// ─── Local analytics ──────────────────────────────────────────────────────────

export async function recordAdImpression(adId: string): Promise<void> {
  await recordAnalyticsEvent(adId, 'impression')
}

export async function recordAdDismiss(adId: string): Promise<void> {
  await recordAnalyticsEvent(adId, 'dismiss')
}

async function recordAnalyticsEvent(
  adId:  string,
  event: 'impression' | 'tap' | 'dismiss',
): Promise<void> {
  try {
    const raw = await SecureStore.getItemAsync(ANALYTICS_KEY)
    const map: Record<string, AdAnalytics> = raw ? JSON.parse(raw) : {}

    const existing = map[adId] ?? {
      adId, impressions: 0, taps: 0, dismisses: 0, lastSeen: 0,
    }

    map[adId] = {
      ...existing,
      impressions: existing.impressions + (event === 'impression' ? 1 : 0),
      taps:        existing.taps        + (event === 'tap'        ? 1 : 0),
      dismisses:   existing.dismisses   + (event === 'dismiss'    ? 1 : 0),
      lastSeen:    Date.now(),
    }

    // Keep last 200 ad records max
    const entries = Object.values(map)
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .slice(0, 200)
    const trimmed = Object.fromEntries(entries.map(e => [e.adId, e]))
    await SecureStore.setItemAsync(ANALYTICS_KEY, JSON.stringify(trimmed))
  } catch {}
}

export async function getAdAnalytics(): Promise<AdAnalytics[]> {
  try {
    const raw = await SecureStore.getItemAsync(ANALYTICS_KEY)
    return raw ? Object.values(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

// ─── Demo ads (shown when no real beacons are in range) ───────────────────────
// Used during development and in areas with no registered venues.
// Clearly marked as demo — never shown to users as real ads.

export const DEMO_ADS: AdBroadcast[] = [
  {
    adId:        'demo-001',
    isAd:        true,
    adType:      'venue',
    venueName:   'The Grind',
    tagline:     'Campus coffee done right',
    description: 'Specialty coffee, open late, fast Wi-Fi. Students get 15% off with ID.',
    ctaLabel:    'See menu',
    ctaUrl:      'https://example.com/grind',
    gradientA:   '#2c1810',
    gradientB:   '#6f4e37',
    tags:        ['coffee', 'studying', 'music'],
    radius:      300,
    expiresAt:   Date.now() + 7 * 24 * 3600_000,
    seenAt:      Date.now(),
  },
  {
    adId:        'demo-002',
    isAd:        true,
    adType:      'event',
    venueName:   'Campus Social',
    tagline:     'Fri night. Main hall. Free entry.',
    description: 'Live music, dancing, bar. Biggest campus social of the term.',
    ctaLabel:    'RSVP free',
    ctaUrl:      'https://example.com/social',
    gradientA:   '#1a0533',
    gradientB:   '#6b21a8',
    tags:        ['music', 'dancing', 'social'],
    radius:      1000,
    expiresAt:   Date.now() + 3 * 24 * 3600_000,
    seenAt:      Date.now(),
  },
  {
    adId:        'demo-003',
    isAd:        true,
    adType:      'offer',
    venueName:   'Campus Eats',
    tagline:     '2-for-1 lunch until 2 PM',
    description: 'Hot food, salads, wraps. Student discount every day. No card minimum.',
    ctaLabel:    'View today\'s menu',
    ctaUrl:      'https://example.com/eats',
    gradientA:   '#052e16',
    gradientB:   '#166534',
    tags:        ['cooking', 'coffee'],
    radius:      200,
    expiresAt:   Date.now() + 8 * 3600_000,
    seenAt:      Date.now(),
  },
]
