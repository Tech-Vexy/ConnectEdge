// matching.ts — on-device scoring engine
// O(d) per peer, d = fixed dimensions (5). Sub-microsecond per call.
// No allocations beyond the return value. No async. No I/O.

import type { UserProfile, PeerBroadcast } from './types'
import { SCORE_DIMS, LIKE_THRESHOLD } from './types'

export interface ScoreResult {
  score:      number   // 0–100
  passesGate: boolean  // score >= LIKE_THRESHOLD
  breakdown:  { key: string; contribution: number; dimScore: number }[]
}

/**
 * Score a peer's broadcast against the local user's preferences.
 * Pure function — same inputs always give same output.
 */
export function scorePeer(me: UserProfile, peer: PeerBroadcast): ScoreResult {
  const my = me.prefs

  // --- Build normalised value pairs for each dimension ---
  // All values normalised to 0–1 before comparison.

  // Age: how well does peer's age fit my stated range?
  // Returns 1.0 if in range, decays linearly outside it.
  const ageScore = ageCompatibility(peer.age, my.ageRange)

  // Interests: Jaccard similarity on tag sets
  const interestScore = jaccardSimilarity(my.interestTags, peer.interestTags)

  // Intent: simple absolute difference on 0–1 scale
  const intentScore = 1 - Math.abs(my.intentScore - peer.intentScore)

  // Proximity: signal strength (0–1, higher = closer)
  const proximityScore = peer.signalStrength ?? 0.5

  // Values: absolute difference on 0–1 scale
  const valuesScore = 1 - Math.abs(my.valuesScore - peer.valuesScore)

  const dimValues: Record<string, number> = {
    age:       ageScore,
    interests: interestScore,
    intent:    intentScore,
    proximity: proximityScore,
    values:    valuesScore,
  }

  // Weighted squared distance — penalises large mismatches superlinearly
  // 1 - d² maps high similarity → high score
  let wDistSq = 0
  let wSum    = 0
  const breakdown = []

  for (const dim of SCORE_DIMS) {
    const similarity = dimValues[dim.key]             // 0–1, 1 = perfect
    const diff       = 1 - similarity                 // 0 = perfect, 1 = worst
    const distSq     = diff * diff
    const contribution = dim.weight * distSq

    wDistSq += contribution
    wSum    += dim.weight

    breakdown.push({
      key:          dim.key,
      contribution: contribution,
      dimScore:     Math.round(similarity * 100),
    })
  }

  const score = Math.round(100 - (wDistSq / wSum) * 100)

  return {
    score:      Math.max(0, Math.min(100, score)),
    passesGate: score >= LIKE_THRESHOLD,
    breakdown,
  }
}

// --- Helpers ---

function ageCompatibility(peerAge: number, [min, max]: [number, number]): number {
  if (peerAge >= min && peerAge <= max) return 1.0
  // Decay: 1 year outside range = 0.85, 5 years = 0.25, 10+ = 0
  const outside = peerAge < min ? min - peerAge : peerAge - max
  return Math.max(0, 1 - outside * 0.075)
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0.5 // neutral if both empty
  const setA = new Set(a)
  const setB = new Set(b)
  let intersection = 0
  for (const tag of setA) {
    if (setB.has(tag)) intersection++
  }
  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}

/**
 * Batch score all known peers. Returns sorted descending by score.
 * Called when a new broadcast arrives — re-scores only that peer,
 * then merges into the existing sorted list.
 */
export function rankPeers(
  me: UserProfile,
  peers: Map<string, PeerBroadcast>
): Array<{ peerId: string; result: ScoreResult }> {
  const results: Array<{ peerId: string; result: ScoreResult }> = []

  for (const [peerId, peer] of peers) {
    results.push({ peerId, result: scorePeer(me, peer) })
  }

  results.sort((a, b) => b.result.score - a.result.score)
  return results
}
