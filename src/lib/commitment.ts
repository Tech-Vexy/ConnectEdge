// commitment.ts — blind like commitment scheme
// Uses expo-crypto (wraps Web Crypto on device).
// All state is session-memory only — nothing written to disk.

import * as ExpoCrypto from 'expo-crypto'
import { uint8ArrayToHex, hexToUint8Array, concatBytes } from './bytes'
import type { LikeCommitment } from './types'

/**
 * Create a commitment for liking a peer.
 * Returns the commitment to publish on gossipsub AND the nonce to store locally.
 * The nonce is NEVER published — only revealed during match verification.
 *
 * C = SHA256( myPeerId ‖ theirPeerId ‖ nonce )
 */
export async function createLikeCommitment(
  myPeerId:    string,
  theirPeerId: string,
  score:       number,
): Promise<LikeCommitment> {
  // 16 random bytes — sufficient for commitment security
  const nonce = ExpoCrypto.getRandomBytes(16)

  const payload = buildPayload(myPeerId, theirPeerId, nonce)
  const hashHex = await sha256Hex(payload)

  return {
    nonce,
    commitHex: hashHex,
    score,
    ts: Date.now(),
  }
}

/**
 * Verify that a received commitment matches a claimed reveal.
 * Called when the other side sends us their nonce during match handshake.
 */
export async function verifyCommitment(
  theirPeerId:  string,
  myPeerId:     string,
  nonce:        Uint8Array,
  commitHex:    string,
): Promise<boolean> {
  const payload  = buildPayload(theirPeerId, myPeerId, nonce)
  const expected = await sha256Hex(payload)
  return expected === commitHex
}

/**
 * Build the gossipsub publish payload for our like.
 * Only the commitment hash and destination are broadcast — not the nonce.
 */
export function buildLikeMessage(
  commitHex:   string,
  toPeerId:    string,
): Uint8Array {
  const msg = JSON.stringify({ type: 'like', commit: commitHex, to: toPeerId })
  return new TextEncoder().encode(msg)
}

/**
 * Build the direct-stream reveal message sent to a matched peer.
 * This opens the match — only sent if we ALSO have a like from them.
 */
export function buildRevealMessage(
  nonce:       Uint8Array,
  commitHex:   string,
): Uint8Array {
  const msg = JSON.stringify({
    type:      'reveal',
    nonce:     uint8ArrayToHex(nonce),
    commitHex,
  })
  return new TextEncoder().encode(msg)
}

// --- Internal helpers ---

function buildPayload(
  id1:   string,
  id2:   string,
  nonce: Uint8Array,
): Uint8Array {
  const enc   = new TextEncoder()
  const part1 = enc.encode(id1)
  const part2 = enc.encode(id2)
  return concatBytes(part1, part2, nonce)
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const hashBytes = await ExpoCrypto.digest(
    ExpoCrypto.CryptoDigestAlgorithm.SHA256,
    data as any,
  )
  return uint8ArrayToHex(new Uint8Array(hashBytes))
}
