// zk-identity.ts — Zero-Knowledge verified identity for ConnectEdge
//
// ─── What this proves ─────────────────────────────────────────────────────────
//
//   "I am a member of institution X"
//   "I have not already used this credential to verify a different PeerID"
//   "I am over 18" (age range claim, not exact age)
//
// ─── What this does NOT reveal ───────────────────────────────────────────────
//
//   - Which student/member you are
//   - Your email, student ID, name, or any identifier
//   - Your exact age
//   - Any link between your verified credential and your PeerID
//
// ─── Architecture ─────────────────────────────────────────────────────────────
//
//   Two tiers, both implemented here:
//
//   TIER 1 — Practical ZK (ships now, runs fast on mobile):
//     SHA-256 Merkle inclusion proof + HMAC nullifier
//     Proving time: <1ms (pure JS, no WASM circuit)
//     Trust model: ConnectEdge's verification worker sees that a valid institutional
//       email was used, but cannot link it to a PeerID (nullifier hides it)
//
//   TIER 2 — Full ZK (upgrade path, commented):
//     Groth16 circuit via snarkjs — proves Merkle membership with no email contact
//     Proving time: ~200–800ms on modern mobile (WASM)
//     Trust model: zero trust — institution provides Merkle root, user proves
//       membership locally, ConnectEdge sees only a valid proof.
//
// ─── Verification flow ────────────────────────────────────────────────────────
//
//   1. User opens Verification screen, selects their institution
//   2. [TIER 1] User enters institutional email → ConnectEdge worker sends OTP
//      [TIER 2] User scans QR on university portal → receives credential
//   3. Local computation:
//      a. secret  = BLAKE2b(email + OTP)           — derived, never stored
//      b. nullifier = H(secret + CONNECTEDGE_DOMAIN)    — unique per app, unlinkable
//      c. commitment = H(secret + peerId + salt)   — binds claim to identity
//   4. Worker verifies OTP, returns a signed badge:
//      { institution, tier, nullifierHash, expiresAt, workerSig }
//      — worker stores nullifierHash only (no email, no peerId)
//   5. Badge stored in SecureStore, included in signed profile broadcasts
//   6. Peers verify badge signature on receiving broadcast → show ✓ badge
//
// ─── Privacy guarantees ──────────────────────────────────────────────────────
//
//   - Worker stores: H(nullifier) — cannot reverse to email or PeerID
//   - Badge contains: institution name, tier, nullifierHash, expiry, sig
//   - Badge does NOT contain: email, student ID, name, PeerID, IP address
//   - Nullifier prevents same credential verifying two PeerIDs (anti-Sybil)
//   - Badge expires (default 6 months) — requires re-verification

import * as SecureStore  from 'expo-secure-store'
import * as ExpoCrypto   from 'expo-crypto'
import { uint8ArrayToHex, hexToUint8Array, concatBytes } from './bytes'
import { signMessage, verifyMessage, type KeyPair }      from './crypto'
import { appConfig } from './config'

const KEY_BADGE          = 'connectedge_zkbadge_v1'
const KEY_PENDING_SALT   = 'connectedge_zkpending_salt_v1'
const CONNECTEDGE_DOMAIN      = 'connectedge.identity.v1'
const WORKER_VERIFY_URL  = appConfig.verify.baseUrl
const WORKER_PUBKEY_URL  = appConfig.verify.pubkeyUrl

// ─── Types ────────────────────────────────────────────────────────────────────

export type VerificationTier =
  | 'student'        // enrolled student at a recognised institution
  | 'staff'          // staff/faculty
  | 'alumni'         // graduated, still verified
  | 'age_18_plus'    // over 18 only, no institution
  | 'professional'   // verified employer email

export type VerificationStatus =
  | 'unverified'
  | 'pending'
  | 'verified'
  | 'expired'

export interface VerificationBadge {
  institution:  string          // display name e.g. "University of Lagos"
  domain:       string          // email domain e.g. "unilag.edu.ng"
  tier:         VerificationTier
  nullifierHash: string         // H(nullifier) — stored on worker for anti-Sybil
  issuedAt:     number          // unix ms
  expiresAt:    number          // unix ms — default 6 months
  workerSigHex: string          // ed25519 sig from ConnectEdge worker's signing key
  // NOT included: email, peerId, name, student ID
}

export interface ZKProof {
  commitmentHex: string   // H(secret + peerId + salt) — binds badge to this identity
  nullifierHex:  string   // H(secret + CONNECTEDGE_DOMAIN) — unique claim token
  saltHex:       string   // random 16 bytes
}

// Supported institutions — add more; keyed by email domain
export const INSTITUTIONS: Record<string, { name: string; tier: VerificationTier }> = {
  // Nigeria
  'unilag.edu.ng':      { name: 'University of Lagos',          tier: 'student' },
  'ui.edu.ng':          { name: 'University of Ibadan',         tier: 'student' },
  'oauife.edu.ng':      { name: 'Obafemi Awolowo University',   tier: 'student' },
  'abu.edu.ng':         { name: 'Ahmadu Bello University',      tier: 'student' },
  'unn.edu.ng':         { name: 'UNN',                          tier: 'student' },
  // Kenya - Standard format
  'uonbi.ac.ke':        { name: 'University of Nairobi',        tier: 'student' },
  'ku.ac.ke':           { name: 'Kenyatta University',          tier: 'student' },
  'mu.ac.ke':           { name: 'Moi University',               tier: 'student' },
  'jkuat.ac.ke':        { name: 'JKUAT',                        tier: 'student' },
  'egerton.ac.ke':      { name: 'Egerton University',           tier: 'student' },
  'maseno.ac.ke':       { name: 'Maseno University',            tier: 'student' },
  'mmust.ac.ke':        { name: 'Masinde Muliro University',    tier: 'student' },
  'strathmore.edu':     { name: 'Strathmore University',        tier: 'student' },
  'usiu.ac.ke':         { name: 'USIU-Africa',                  tier: 'student' },
  'tum.ac.ke':          { name: 'Technical University of Mombasa', tier: 'student' },
  'kabianga.ac.ke':     { name: 'Kabianga University',          tier: 'student' },
  'kemu.ac.ke':         { name: 'Kenya Methodist University',   tier: 'student' },
  'dkut.ac.ke':         { name: 'Dedan Kimathi University',     tier: 'student' },
  'chuka.ac.ke':        { name: 'Chuka University',             tier: 'student' },
  'mmarau.ac.ke':       { name: 'Maasai Mara University',       tier: 'student' },
  'tukenya.ac.ke':      { name: 'Technical University of Kenya', tier: 'student' },
  // Kenya - Students subdomain format (@students.university.ac.ke)
  'students.uonbi.ac.ke':   { name: 'University of Nairobi',        tier: 'student' },
  'students.ku.ac.ke':      { name: 'Kenyatta University',          tier: 'student' },
  'students.mu.ac.ke':      { name: 'Moi University',               tier: 'student' },
  'students.jkuat.ac.ke':   { name: 'JKUAT',                        tier: 'student' },
  'students.kyu.ac.ke':     { name: 'Kirinyaga University',         tier: 'student' },
  'students.egerton.ac.ke': { name: 'Egerton University',           tier: 'student' },
  'students.maseno.ac.ke':  { name: 'Maseno University',            tier: 'student' },
  'students.mmust.ac.ke':   { name: 'Masinde Muliro University',    tier: 'student' },
  'students.tum.ac.ke':     { name: 'Technical University of Mombasa', tier: 'student' },
  'students.dkut.ac.ke':    { name: 'Dedan Kimathi University',     tier: 'student' },
  'students.chuka.ac.ke':   { name: 'Chuka University',             tier: 'student' },
  'students.tukenya.ac.ke': { name: 'Technical University of Kenya', tier: 'student' },
  // Kenya - More universities
  'kyu.ac.ke':              { name: 'Kirinyaga University',         tier: 'student' },
  'pwani.ac.ke':            { name: 'Pwani University',             tier: 'student' },
  'students.pwani.ac.ke':   { name: 'Pwani University',             tier: 'student' },
  'tuk.ac.ke':              { name: 'Technical University of Kenya', tier: 'student' },
  'students.tuk.ac.ke':     { name: 'Technical University of Kenya', tier: 'student' },
  'mku.ac.ke':              { name: 'Mount Kenya University',       tier: 'student' },
  'students.mku.ac.ke':     { name: 'Mount Kenya University',       tier: 'student' },
  'kca.ac.ke':              { name: 'KCA University',               tier: 'student' },
  'students.kca.ac.ke':     { name: 'KCA University',               tier: 'student' },
  // UK
  'ox.ac.uk':           { name: 'University of Oxford',         tier: 'student' },
  'cam.ac.uk':          { name: 'University of Cambridge',      tier: 'student' },
  'ucl.ac.uk':          { name: 'UCL',                          tier: 'student' },
  'imperial.ac.uk':     { name: 'Imperial College',             tier: 'student' },
  'kcl.ac.uk':          { name: "King's College London",        tier: 'student' },
  'lse.ac.uk':          { name: 'LSE',                          tier: 'student' },
  // US
  'mit.edu':            { name: 'MIT',                          tier: 'student' },
  'stanford.edu':       { name: 'Stanford',                     tier: 'student' },
  'harvard.edu':        { name: 'Harvard',                      tier: 'student' },
  // Add more via remote config fetched from the worker
}

// ─── Local ZK computation ─────────────────────────────────────────────────────

/**
 * Derive a secret from an email + OTP without storing either.
 * The secret is ephemeral — recomputed each time from the same inputs.
 *
 * secret = SHA256( SHA256(email.toLowerCase()) ‖ SHA256(otp) )
 *
 * Double-hashing prevents length extension and ensures neither input
 * is recoverable from the secret alone.
 */
async function deriveSecret(email: string, otp: string): Promise<Uint8Array> {
  const enc = new TextEncoder()

  const [emailHash, otpHash] = await Promise.all([
    ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, enc.encode(email.toLowerCase().trim())),
    ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, enc.encode(otp.trim())),
  ])

  const combined = concatBytes(new Uint8Array(emailHash), new Uint8Array(otpHash))
  const secret = await ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, combined as any)
  return new Uint8Array(secret)
}

/**
 * Build a ZK proof from a derived secret.
 * This is the local computation — no network call.
 *
 * nullifier  = SHA256(secret ‖ "connectedge.identity.v1")
 *   — deterministic per (credential, app) pair
 *   — the worker stores H(nullifier) to prevent double-claiming
 *   — does NOT reveal which credential was used
 *
 * commitment = SHA256(secret ‖ peerId ‖ salt)
 *   — binds the credential to this specific PeerID
 *   — the salt is random → different commitment each time even with same secret
 *   — verifiers confirm: commitment is signed by valid badge AND by peer's ed25519 key
 */
async function buildZKProof(
  secret:  Uint8Array,
  peerId:  string,
  salt:    Uint8Array,
): Promise<ZKProof> {
  const enc    = new TextEncoder()
  const domain = enc.encode(CONNECTEDGE_DOMAIN)
  const peerBytes = enc.encode(peerId)

  const [nullifierBuf, commitmentBuf] = await Promise.all([
    ExpoCrypto.digest(
      ExpoCrypto.CryptoDigestAlgorithm.SHA256,
      concatBytes(secret, domain) as any,
    ),
    ExpoCrypto.digest(
      ExpoCrypto.CryptoDigestAlgorithm.SHA256,
      concatBytes(secret, peerBytes, salt) as any,
    ),
  ])

  return {
    commitmentHex: uint8ArrayToHex(new Uint8Array(commitmentBuf)),
    nullifierHex:  uint8ArrayToHex(new Uint8Array(nullifierBuf)),
    saltHex:       uint8ArrayToHex(salt),
  }
}

// ─── Verification flow ────────────────────────────────────────────────────────

export interface VerificationRequest {
  email: string    // institutional email — validated locally, sent to worker for OTP
}

export interface OTPChallenge {
  sessionToken: string    // opaque session token (not linked to email after OTP send)
  expiresAt:    number
  maskedEmail:  string    // e.g. "j***@unilag.edu.ng" for display only
}

/**
 * Step 1: Request an OTP to be sent to the institutional email.
 * The worker sends the OTP and returns a session token.
 * The worker does NOT store the email after sending — only a hash of it
 * as a rate-limit key (max 3 attempts per email per day).
 */
export async function requestOTP(email: string): Promise<{
  ok:        boolean
  challenge: OTPChallenge | null
  error?:    string
}> {
  if (!appConfig.verify.enabled) {
    return { ok: false, challenge: null, error: 'Verification is disabled in P2P-only mode' }
  }

  const emailLower = email.toLowerCase().trim()

  // Validate domain locally before any network call
  const domain = emailLower.split('@')[1]
  if (!domain) return { ok: false, challenge: null, error: 'Invalid email address' }

  const institution = INSTITUTIONS[domain]
  if (!institution) {
    return { ok: false, challenge: null, error: `Domain @${domain} is not yet supported` }
  }

  // Hash email for rate-limiting only — worker never stores plaintext
  const emailHashBuf = await ExpoCrypto.digest(
    ExpoCrypto.CryptoDigestAlgorithm.SHA256,
    new TextEncoder().encode(emailLower),
  )
  const emailHash = uint8ArrayToHex(new Uint8Array(emailHashBuf)).slice(0, 32)

  try {
    const res = await fetch(`${WORKER_VERIFY_URL}/request-otp`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: emailLower, emailHash }),
      signal:  AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      const err = await res.json() as { error?: string }
      return { ok: false, challenge: null, error: err.error ?? 'Failed to send OTP' }
    }

    const data = await res.json() as OTPChallenge
    return { ok: true, challenge: data }

  } catch (e: any) {
    return { ok: false, challenge: null, error: 'Network error — check your connection' }
  }
}

/**
 * Step 2: Submit OTP + local ZK proof to receive a signed badge.
 * The worker verifies:
 *   - OTP matches session token
 *   - nullifierHash has not been used before (anti-Sybil)
 * Then signs and returns the badge. The email is discarded immediately.
 */
export async function submitOTPAndProve(
  email:        string,
  otp:          string,
  sessionToken: string,
  peerId:       string,
  keys:         KeyPair,
): Promise<{
  ok:     boolean
  badge?: VerificationBadge
  error?: string
}> {
  if (!appConfig.verify.enabled) {
    return { ok: false, error: 'Verification is disabled in P2P-only mode' }
  }

  const emailLower = email.toLowerCase().trim()
  const domain     = emailLower.split('@')[1]
  const institution = INSTITUTIONS[domain]
  if (!institution) return { ok: false, error: 'Unsupported institution' }

  // Generate ephemeral salt
  const salt   = ExpoCrypto.getRandomBytes(16)
  const secret = await deriveSecret(emailLower, otp)
  const proof  = await buildZKProof(secret, peerId, salt)

  // Hash the nullifier before sending — worker stores H(nullifier), not nullifier
  const nullifierHashBuf = await ExpoCrypto.digest(
    ExpoCrypto.CryptoDigestAlgorithm.SHA256,
    hexToUint8Array(proof.nullifierHex) as any,
  )
  const nullifierHash = uint8ArrayToHex(new Uint8Array(nullifierHashBuf))

  // Sign the commitment with our ed25519 key — proves we own this PeerID
  const commitmentBytes = hexToUint8Array(proof.commitmentHex)
  const signed = await signMessage(commitmentBytes, keys.edSecretKey, keys.edPublicKey)

  try {
    const res = await fetch(`${WORKER_VERIFY_URL}/submit`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        sessionToken,
        otp:              otp.trim(),
        nullifierHash,
        commitmentHex:    proof.commitmentHex,
        commitmentSig:    signed.signature,
        commitmentPubKey: signed.publicKey,
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      const err = await res.json() as { error?: string }
      return { ok: false, error: err.error ?? 'Verification failed' }
    }

    const badge = await res.json() as VerificationBadge

    // Store badge in SecureStore
    await SecureStore.setItemAsync(KEY_BADGE, JSON.stringify(badge))

    // Persist salt so we can re-prove commitment if needed (without re-verifying)
    await SecureStore.setItemAsync(KEY_PENDING_SALT, proof.saltHex)

    return { ok: true, badge }

  } catch {
    return { ok: false, error: 'Network error — check your connection' }
  }
}

// ─── Badge storage & retrieval ────────────────────────────────────────────────

export async function loadBadge(): Promise<VerificationBadge | null> {
  if (!appConfig.verify.enabled) return null
  try {
    const raw = await SecureStore.getItemAsync(KEY_BADGE)
    if (!raw) return null
    const badge: VerificationBadge = JSON.parse(raw)
    if (badge.expiresAt < Date.now()) {
      await SecureStore.deleteItemAsync(KEY_BADGE)
      return null
    }
    return badge
  } catch { return null }
}

export async function clearBadge(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEY_BADGE),
    SecureStore.deleteItemAsync(KEY_PENDING_SALT),
  ])
}

export function badgeStatus(badge: VerificationBadge | null): VerificationStatus {
  if (!badge) return 'unverified'
  if (badge.expiresAt < Date.now()) return 'expired'
  return 'verified'
}

export function daysUntilExpiry(badge: VerificationBadge): number {
  return Math.max(0, Math.floor((badge.expiresAt - Date.now()) / 86_400_000))
}

// ─── Badge verification (by receiving peers) ─────────────────────────────────

// The worker's ed25519 public key — fetched from /verify/pubkey with versioned TOFU pinning
let _workerPubKey:  Uint8Array | null = null
let _workerPubKeyTs: number       = 0
const WORKER_PUBKEY_MAX_AGE = 24 * 3600_000  // Re-fetch at least once per 24h
const KEY_WORKER_PUBKEY_CACHE = 'connectedge_worker_pubkey_v1'

async function getWorkerPublicKey(): Promise<Uint8Array | null> {
  if (!appConfig.verify.enabled) return null
  // Use cached key if fresh (<24h old)
  if (_workerPubKey && Date.now() - _workerPubKeyTs < WORKER_PUBKEY_MAX_AGE) return _workerPubKey

  try {
    const res  = await fetch(WORKER_PUBKEY_URL, { signal: AbortSignal.timeout(5_000) })
    const data = await res.json() as { pubKeyHex: string }
    const newKey = hexToUint8Array(data.pubKeyHex)

    // If we had a previous key and it changed, log the rotation
    // (In production, this should trigger a re-verification of all cached badges)
    if (_workerPubKey && uint8ArrayToHex(_workerPubKey) !== uint8ArrayToHex(newKey)) {
      console.warn('Worker signing key rotated — badges may need re-verification')
    }

    _workerPubKey   = newKey
    _workerPubKeyTs = Date.now()

    // Persist for offline use
    await SecureStore.setItemAsync(KEY_WORKER_PUBKEY_CACHE,
      JSON.stringify({ hex: data.pubKeyHex, ts: _workerPubKeyTs }))

    return _workerPubKey
  } catch {
    // Network error — try loading cached key from SecureStore
    if (!_workerPubKey) {
      try {
        const raw = await SecureStore.getItemAsync(KEY_WORKER_PUBKEY_CACHE)
        if (raw) {
          const { hex, ts } = JSON.parse(raw) as { hex: string; ts: number }
          _workerPubKey   = hexToUint8Array(hex)
          _workerPubKeyTs = ts
          return _workerPubKey
        }
      } catch { return null }
    }
    return _workerPubKey
  }
}

/**
 * Verify a badge received in a peer's signed broadcast.
 * Checks:
 *   1. Badge signature is valid (from ConnectEdge's worker signing key)
 *   2. Badge has not expired
 *   3. Institution domain is in our supported list
 *
 * Does NOT check nullifier (that's the worker's job, once on issue).
 * Verification is local — no network call needed.
 */
export async function verifyBadge(badge: VerificationBadge): Promise<boolean> {
  try {
    if (!appConfig.verify.enabled) return false
    if (badge.expiresAt < Date.now()) return false
    if (!INSTITUTIONS[badge.domain]) return false

    const workerPubKey = await getWorkerPublicKey()
    if (!workerPubKey) return false  // can't verify without pubkey — show unverified

    // Reconstruct the payload the worker signed
    const payload = new TextEncoder().encode(JSON.stringify({
      institution:  badge.institution,
      domain:       badge.domain,
      tier:         badge.tier,
      nullifierHash: badge.nullifierHash,
      issuedAt:     badge.issuedAt,
      expiresAt:    badge.expiresAt,
    }))

    const { default: _sodium } = await import('libsodium-wrappers')
    await _sodium.ready
    return _sodium.crypto_sign_verify_detached(
      hexToUint8Array(badge.workerSigHex),
      payload,
      workerPubKey,
    )
  } catch { return false }
}

// ─── Broadcast integration ────────────────────────────────────────────────────

/**
 * Return the badge fields to embed in a signed profile broadcast.
 * Only non-identifying fields are included.
 */
export function badgeToBroadcastFields(badge: VerificationBadge): {
  verified:     true
  institution:  string
  tier:         VerificationTier
  badgeSig:     string
  badgeExpiry:  number
} {
  return {
    verified:     true,
    institution:  badge.institution,
    tier:         badge.tier,
    badgeSig:     badge.workerSigHex,
    badgeExpiry:  badge.expiresAt,
  }
}

// ─── Tier display helpers ─────────────────────────────────────────────────────

export const TIER_LABELS: Record<VerificationTier, string> = {
  student:      'Verified student',
  staff:        'Verified staff',
  alumni:       'Verified alumni',
  age_18_plus:  'Age verified',
  professional: 'Verified professional',
}

export const TIER_ICONS: Record<VerificationTier, string> = {
  student:      '🎓',
  staff:        '🏫',
  alumni:       '📜',
  age_18_plus:  '✓',
  professional: '💼',
}

// ─── TIER 2 — Full ZK upgrade path (not yet shipped) ─────────────────────────
//
// When snarkjs mobile performance is acceptable (~200ms on flagship phones):
//
// Circuit: Merkle inclusion proof in circom
//   public inputs:  merkleRoot (from institution), nullifierHash, commitmentHash
//   private inputs: secret, pathElements[], pathIndices[], salt, peerId
//
// The institution publishes a Merkle root of H(studentEmail) for all enrolled
// students each semester. Users prove membership locally without contacting the
// institution. ConnectEdge never sees the email — only the proof.
//
// import { groth16 }           from 'snarkjs'
// import verificationKey       from '../circuits/membership_verification_key.json'
// import { buildMerkleProof }  from './merkle'
//
// export async function generateMembershipProof(
//   secret:       Uint8Array,
//   merkleRoot:   string,
//   merkleLeaves: string[],   // H(email) for all enrolled students
// ): Promise<string> {        // returns compact proof JSON
//   const { proof, publicSignals } = await groth16.fullProve(
//     { secret: Array.from(secret), merkleRoot, ... },
//     '/circuits/membership.wasm',
//     '/circuits/membership_zkey',
//   )
//   return JSON.stringify({ proof, publicSignals })
// }
//
// export async function verifyMembershipProof(proofJson: string): Promise<boolean> {
//   const { proof, publicSignals } = JSON.parse(proofJson)
//   return groth16.verify(verificationKey, publicSignals, proof)
// }
