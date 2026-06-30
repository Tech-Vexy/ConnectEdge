// Core data types for Proxim

export interface UserProfile {
  // Identity — generated on first launch, never leaves device
  peerId: string          // base58 ed25519 public key
  displayName: string
  age: number
  bio: string
  photoUri?: string       // local file URI only — never uploaded as-is

  // Preference vector — what you want (normalised 0–1 internally)
  prefs: MatchPrefs

  // What we broadcast publicly (subset of profile)
  // Photos are NOT in the broadcast — only shared post-match as encrypted CID
}

export interface MatchPrefs {
  ageRange:   [number, number] // e.g. [24, 35]
  intentScore: number          // 0 = very casual, 1 = serious relationship
  interestTags: string[]       // up to 8 tags selected from fixed taxonomy
  proximityWeight: number      // how much physical closeness matters 0–1
  valuesScore: number          // 0 = adventurous/spontaneous, 1 = stability/depth
}

// What gets gossiped over the mesh — public, signed, minimal
export interface PeerBroadcast {
  peerId:        string
  displayName:   string
  age:           number
  intentScore:   number
  interestTags:  string[]
  valuesScore:   number
  seenAt:        number
  signalStrength?: number
  // Verification badge fields — included only when verified
  verified?:     true
  institution?:  string
  verifiedTier?: string   // 'student' | 'staff' | 'alumni' | etc.
  badgeSig?:     string   // worker ed25519 sig — peers verify locally
  badgeExpiry?:  number   // unix ms
}

// Scoring dimensions with weights (must sum to 1.0)
export const SCORE_DIMS = [
  { key: 'age',       weight: 0.20, label: 'Age range'  },
  { key: 'interests', weight: 0.30, label: 'Interests'  },
  { key: 'intent',    weight: 0.25, label: 'Intent'     },
  { key: 'proximity', weight: 0.15, label: 'Proximity'  },
  { key: 'values',    weight: 0.10, label: 'Values'     },
] as const

export const LIKE_THRESHOLD = 65   // score out of 100 to trigger commitment
export const EVICT_AFTER_MS = 60_000  // remove peers not seen in 60s

// Blind commitment — session memory only, never persisted
export interface LikeCommitment {
  nonce:     Uint8Array  // 16 random bytes
  commitHex: string      // SHA-256(myPeerId + theirPeerId + nonce) as hex
  score:     number
  ts:        number
}

export interface Match {
  peerId:           string
  displayName:      string
  matchedAt:        number
  streamId?:        string
  // Connection data — populated at match time from peer broadcast
  sharedTags:       string[]    // intersection of interestTags
  compatibilityScore: number    // 0–100
  icebreakerId?:    string      // selected starter from icebreakers.ts
}

// ─── Ads ─────────────────────────────────────────────────────────────────────

// Venues broadcast this over gossipsub alongside regular peer broadcasts.
// Ad cards appear in the swipe deck every 5th position, clearly labelled.
// No user data is ever sent to the advertiser.
export interface AdBroadcast {
  adId:        string      // unique ad identifier
  isAd:        true
  adType:      AdType
  venueName:   string
  tagline:     string      // one line, max 60 chars
  description: string      // max 120 chars
  ctaLabel:    string      // e.g. "Get 20% off", "See menu", "RSVP"
  ctaUrl:      string      // deep link or HTTPS URL
  gradientA:   string      // hex — venue chooses their brand colours
  gradientB:   string
  tags:        string[]    // interest tags this ad is relevant to (for relevance scoring)
  radius:      number      // metres — only show within this radius
  expiresAt:   number      // unix ms — don't show after this
  seenAt:      number      // unix ms — LRU
}

export type AdType = 'venue' | 'event' | 'offer' | 'service'

export const AD_TYPE_LABELS: Record<AdType, string> = {
  venue:   '📍 Nearby venue',
  event:   '🎉 Event',
  offer:   '🏷️  Offer',
  service: '✨ Service',
}

// Local ad analytics — never transmitted, session + persisted
export interface AdAnalytics {
  adId:       string
  impressions: number
  taps:        number
  dismisses:   number
  lastSeen:    number
}

export type DeckItem =
  | { kind: 'peer'; peer: PeerBroadcast; score: number }
  | { kind: 'ad';   ad: AdBroadcast }

export interface ChatMessage {
  id:       string
  from:     string   // peerId
  text:     string
  ts:       number
  pending?: boolean
}

// Relay item types — what the relay can carry beyond chat/photo
export type RelayItemType = 'chat' | 'photo' | 'like' | 'match'

export interface RelayLikeItem {
  type:       'like'
  fromPeerId: string   // hashed — doesn't reveal identity, just signals activity
  ts:         number
}

export interface RelayMatchItem {
  type:       'match'
  withPeerId: string
  displayName: string
  ts:         number
}
export interface RelayEnvelope {
  to:           string   // recipient peerId
  ciphertext:   string   // base64 — encrypted with recipient's pubkey
  nonce:        string   // base64 — for decryption
  senderCommit: string   // proves sender identity without revealing it
  ttl:          number   // seconds, max 86400
}

// Interest taxonomy — fixed set keeps broadcasts small
export const INTEREST_TAGS = [
  'music', 'hiking', 'film', 'cooking', 'travel', 'tech',
  'art', 'sports', 'reading', 'gaming', 'yoga', 'coffee',
  'photography', 'dancing', 'volunteering', 'startups',
] as const

export type InterestTag = typeof INTEREST_TAGS[number]
