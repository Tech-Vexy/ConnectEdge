// crypto.ts — full cryptographic layer for Proxim
//
// Uses libsodium-wrappers (NaCl primitives) for:
//   - Box encryption  (crypto_box_seal)  — sealed messages to a public key
//   - Sign/verify     (crypto_sign)      — ed25519 signatures on gossip messages
//   - Key derivation  — X25519 from ed25519 identity key for DH encryption
//
// The libp2p PeerID is an ed25519 keypair. We derive a Curve25519
// keypair from it for encryption (standard technique: multiply ed25519
// private scalar through the birational map to X25519).
//
// All keys are stored in SecureStore (iOS Keychain / Android Keystore).

import _sodium          from 'libsodium-wrappers'
import * as SecureStore from 'expo-secure-store'
import { uint8ArrayToHex, hexToUint8Array, concatBytes } from './bytes'
import {
  SECURE_STORE_BIOMETRIC_OPTIONS,
  SECURE_STORE_STANDARD_OPTIONS,
  authenticate,
} from './biometrics'

// Keys stored in SecureStore
const KEY_ED_SECRET  = 'proxim_ed_secret_v1'   // ed25519 secret key (64 bytes)
const KEY_ED_PUBLIC  = 'proxim_ed_public_v1'    // ed25519 public key (32 bytes)
const KEY_X_SECRET   = 'proxim_x_secret_v1'    // X25519 secret key  (32 bytes)
const KEY_X_PUBLIC   = 'proxim_x_public_v1'    // X25519 public key  (32 bytes)

export interface KeyPair {
  edPublicKey:  Uint8Array   // ed25519 — for signing / PeerID
  edSecretKey:  Uint8Array   // ed25519 secret
  xPublicKey:   Uint8Array   // X25519  — for encryption
  xSecretKey:   Uint8Array   // X25519 secret
}

let _sodium_ready = false

async function sodium() {
  if (!_sodium_ready) {
    await _sodium.ready
    _sodium_ready = true
  }
  return _sodium
}

// ─── Key generation and storage ──────────────────────────────────────────────

/**
 * Load existing keys from SecureStore (biometric-gated), or generate and persist new ones.
 * Called once at app start — subsequent calls return the cached pair.
 * Key read requires biometric auth if enrolled (HIGH gate).
 */
export async function loadOrCreateKeyPair(): Promise<KeyPair> {
  const na = await sodium()

  // Gate key access behind biometrics (silently passes if not enrolled)
  const authed = await authenticate('high')
  if (!authed) throw new Error('Biometric authentication required to access identity keys')

  // Try to load existing — biometric SecureStore options enforce Keychain access control
  const [edPubHex, edSecHex, xPubHex, xSecHex] = await Promise.all([
    SecureStore.getItemAsync(KEY_ED_PUBLIC, SECURE_STORE_BIOMETRIC_OPTIONS),
    SecureStore.getItemAsync(KEY_ED_SECRET, SECURE_STORE_BIOMETRIC_OPTIONS),
    SecureStore.getItemAsync(KEY_X_PUBLIC,  SECURE_STORE_BIOMETRIC_OPTIONS),
    SecureStore.getItemAsync(KEY_X_SECRET,  SECURE_STORE_BIOMETRIC_OPTIONS),
  ])

  if (edPubHex && edSecHex && xPubHex && xSecHex) {
    return {
      edPublicKey: hexToUint8Array(edPubHex),
      edSecretKey: hexToUint8Array(edSecHex),
      xPublicKey:  hexToUint8Array(xPubHex),
      xSecretKey:  hexToUint8Array(xSecHex),
    }
  }

  // Generate fresh ed25519 keypair
  const edKP = na.crypto_sign_keypair()

  // Derive X25519 keypair from ed25519 secret scalar
  const xSecretKey = na.crypto_sign_ed25519_sk_to_curve25519(edKP.privateKey)
  const xPublicKey = na.crypto_scalarmult_base(xSecretKey)

  // Persist to Keychain with biometric access control
  await Promise.all([
    SecureStore.setItemAsync(KEY_ED_PUBLIC, uint8ArrayToHex(edKP.publicKey), SECURE_STORE_BIOMETRIC_OPTIONS),
    SecureStore.setItemAsync(KEY_ED_SECRET, uint8ArrayToHex(edKP.privateKey), SECURE_STORE_BIOMETRIC_OPTIONS),
    SecureStore.setItemAsync(KEY_X_PUBLIC,  uint8ArrayToHex(xPublicKey),      SECURE_STORE_BIOMETRIC_OPTIONS),
    SecureStore.setItemAsync(KEY_X_SECRET,  uint8ArrayToHex(xSecretKey),      SECURE_STORE_BIOMETRIC_OPTIONS),
  ])

  return {
    edPublicKey: edKP.publicKey,
    edSecretKey: edKP.privateKey,
    xPublicKey,
    xSecretKey,
  }
}

/**
 * Derive a stable PeerID string from an ed25519 public key.
 * Format: "px_" + first 20 hex bytes of pubkey (readable, not full multihash).
 * In production wire this to @libp2p/peer-id-factory with the actual key.
 */
export function peerIdFromPublicKey(edPublicKey: Uint8Array): string {
  return 'px_' + uint8ArrayToHex(edPublicKey).slice(0, 40)
}

// ─── Signing ─────────────────────────────────────────────────────────────────

/**
 * Sign a payload with the local ed25519 secret key.
 * Returns: { payload, signature, publicKey } all as hex strings.
 * The full signed envelope can be broadcast on gossipsub.
 */
export async function signMessage(
  payload:    Uint8Array,
  secretKey:  Uint8Array,
  publicKey:  Uint8Array,
): Promise<SignedMessage> {
  const na        = await sodium()
  const signature = na.crypto_sign_detached(payload, secretKey)
  return {
    payload:    uint8ArrayToHex(payload),
    signature:  uint8ArrayToHex(signature),
    publicKey:  uint8ArrayToHex(publicKey),
  }
}

/**
 * Verify a signed message envelope.
 * Returns true if signature is valid for the given payload and publicKey.
 */
export async function verifyMessage(msg: SignedMessage): Promise<boolean> {
  try {
    const na = await sodium()
    return na.crypto_sign_verify_detached(
      hexToUint8Array(msg.signature),
      hexToUint8Array(msg.payload),
      hexToUint8Array(msg.publicKey),
    )
  } catch {
    return false
  }
}

export interface SignedMessage {
  payload:   string   // hex — the actual content bytes
  signature: string   // hex — ed25519 detached signature
  publicKey: string   // hex — sender's ed25519 pubkey (= their PeerID source)
}

// ─── Box encryption ──────────────────────────────────────────────────────────

/**
 * Sealed box encryption — encrypt to a recipient's X25519 public key.
 * The sender is anonymous (no sender keypair needed for sealing).
 * This is what goes into the Cloudflare relay envelope.
 *
 * crypto_box_seal: ephemeral DH keypair + XSalsa20-Poly1305
 */
export async function sealBox(
  plaintext:        Uint8Array,
  recipientXPubKey: Uint8Array,
): Promise<Uint8Array> {
  const na = await sodium()
  return na.crypto_box_seal(plaintext, recipientXPubKey)
}

/**
 * Open a sealed box with the recipient's X25519 keypair.
 * Returns null if decryption fails (wrong key or tampered ciphertext).
 */
export async function openBox(
  ciphertext:  Uint8Array,
  xPublicKey:  Uint8Array,
  xSecretKey:  Uint8Array,
): Promise<Uint8Array | null> {
  try {
    const na = await sodium()
    return na.crypto_box_seal_open(ciphertext, xPublicKey, xSecretKey)
  } catch {
    return null
  }
}

/**
 * Authenticated box — encrypt with sender/recipient keypair.
 * Used for direct stream messages (provides sender identity + encryption).
 *
 * Returns { ciphertext, nonce } both as Uint8Array.
 */
export async function boxEncrypt(
  plaintext:        Uint8Array,
  recipientXPubKey: Uint8Array,
  senderXSecKey:    Uint8Array,
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
  const na    = await sodium()
  const nonce = na.randombytes_buf(na.crypto_box_NONCEBYTES)
  const ciphertext = na.crypto_box_easy(
    plaintext,
    nonce,
    recipientXPubKey,
    senderXSecKey,
  )
  return { ciphertext, nonce }
}

export async function boxDecrypt(
  ciphertext:       Uint8Array,
  nonce:            Uint8Array,
  senderXPubKey:    Uint8Array,
  recipientXSecKey: Uint8Array,
): Promise<Uint8Array | null> {
  try {
    const na = await sodium()
    return na.crypto_box_open_easy(
      ciphertext,
      nonce,
      senderXPubKey,
      recipientXSecKey,
    )
  } catch {
    return null
  }
}

// ─── Peer public key registry ─────────────────────────────────────────────────
// We learn peers' X25519 pubkeys from their signed profile broadcasts.
// Stored in session memory — never persisted.

const peerXPubKeys = new Map<string, Uint8Array>()  // peerId → X25519 pubkey

export function registerPeerXPubKey(peerId: string, xPubKeyHex: string) {
  peerXPubKeys.set(peerId, hexToUint8Array(xPubKeyHex))
}

export function getPeerXPubKey(peerId: string): Uint8Array | undefined {
  return peerXPubKeys.get(peerId)
}

// ─── Signed like message ──────────────────────────────────────────────────────

/**
 * Build a signed like message for gossipsub broadcast.
 * The commitment hash proves intent; the signature proves sender identity.
 * Bystanders cannot infer who liked whom — they see only a hash and a dest.
 * But the recipient can now attribute the like to a real PeerID.
 */
export async function buildSignedLikeMessage(
  commitHex:  string,
  toPeerId:   string,
  senderKeys: KeyPair,
): Promise<Uint8Array> {
  const payload = new TextEncoder().encode(
    JSON.stringify({ type: 'like', commit: commitHex, to: toPeerId })
  )
  const signed = await signMessage(payload, senderKeys.edSecretKey, senderKeys.edPublicKey)
  return new TextEncoder().encode(JSON.stringify({ ...signed, type: 'signed_like' }))
}

/**
 * Parse and verify a signed like message.
 * Returns { fromPeerId, commitHex, toPeerId } or null if invalid.
 */
export async function parseSignedLikeMessage(
  data: Uint8Array,
): Promise<{ fromPeerId: string; commitHex: string; toPeerId: string } | null> {
  try {
    const outer: SignedMessage & { type: string } =
      JSON.parse(new TextDecoder().decode(data))

    if (outer.type !== 'signed_like') return null

    const valid = await verifyMessage(outer)
    if (!valid) return null

    const inner: { type: string; commit: string; to: string } =
      JSON.parse(new TextDecoder().decode(hexToUint8Array(outer.payload)))

    const fromPeerId = peerIdFromPublicKey(hexToUint8Array(outer.publicKey))

    return {
      fromPeerId,
      commitHex: inner.commit,
      toPeerId:  inner.to,
    }
  } catch {
    return null
  }
}

// ─── Signed profile broadcast ─────────────────────────────────────────────────

export interface SignedBroadcast {
  type:       'signed_broadcast'
  payload:    string   // hex — JSON of PeerBroadcast + xPubKey
  signature:  string   // hex
  publicKey:  string   // hex — ed25519
}

/**
 * Wrap a PeerBroadcast payload with a signature AND include the X25519
 * encryption pubkey so recipients can encrypt messages to us later.
 */
export async function buildSignedBroadcast(
  broadcastJson: string,
  keys:          KeyPair,
): Promise<Uint8Array> {
  // Embed xPubKey in the broadcast so peers can seal boxes to us
  const withKey = JSON.stringify({
    ...JSON.parse(broadcastJson),
    xPubKey: uint8ArrayToHex(keys.xPublicKey),
  })
  const payload  = new TextEncoder().encode(withKey)
  const signed   = await signMessage(payload, keys.edSecretKey, keys.edPublicKey)
  const envelope: SignedBroadcast = { type: 'signed_broadcast', ...signed }
  return new TextEncoder().encode(JSON.stringify(envelope))
}

/**
 * Verify and unpack a signed broadcast.
 * Returns the parsed PeerBroadcast (with xPubKey) or null.
 */
export async function parseSignedBroadcast(
  data: Uint8Array,
): Promise<(Record<string, unknown> & { xPubKey?: string }) | null> {
  try {
    const envelope: SignedBroadcast & { type: string } =
      JSON.parse(new TextDecoder().decode(data))

    if (envelope.type !== 'signed_broadcast') return null

    const valid = await verifyMessage(envelope)
    if (!valid) return null

    const broadcast = JSON.parse(
      new TextDecoder().decode(hexToUint8Array(envelope.payload))
    )

    // Register their X25519 pubkey for future encryption
    if (broadcast.xPubKey && broadcast.peerId) {
      registerPeerXPubKey(broadcast.peerId, broadcast.xPubKey)
    }

    return broadcast
  } catch {
    return null
  }
}
