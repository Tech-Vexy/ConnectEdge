// photos.ts — encrypted photo sharing
//
// Photos are NEVER included in profile broadcasts.
// Flow:
//   1. On match, both sides can request to share photos.
//   2. Sender encrypts photo with recipient's X25519 pubkey (sealed box).
//   3. Encrypted bytes are added to local IPFS node → returns a CID.
//   4. The CID (not the photo) is sent over the match's encrypted chat stream.
//   5. Recipient fetches the CID from IPFS, decrypts with their private key.
//
// For the MVP without a full IPFS daemon, we use a hybrid:
//   - If both peers are online: transfer encrypted bytes directly over libp2p stream
//   - If offline: encrypted bytes go to the Cloudflare relay as a large envelope
//
// The relay never sees the plaintext — just opaque ciphertext.
//
// Photo metadata (dimensions, caption) is encrypted alongside the image bytes.

import * as FileSystem   from 'expo-file-system'
import { sealBox, openBox, getPeerXPubKey } from './crypto'
import type { KeyPair }  from './crypto'
import { uint8ArrayToHex, hexToUint8Array } from './bytes'
import { writeCachedPhoto,
         getCacheStats, PHOTO_CACHE_DIR }   from './cache-manager'
import { pickPhotoWithPermission }          from './permissions'

export { clearPhotoCache } from './cache-manager'

export const PROTO_PHOTO  = '/proxim/photo/1.0.0'
const MAX_PHOTO_BYTES     = 2 * 1024 * 1024   // 2MB max per photo

export interface PhotoMeta {
  width:    number
  height:   number
  caption?: string
  mimeType: string
}

export interface EncryptedPhoto {
  ciphertextHex: string    // base64 or hex of sealed box
  metaHex:       string    // encrypted PhotoMeta
  senderPeerId:  string
  ts:            number
  sizeBytes:     number
}

// ─── Sending ──────────────────────────────────────────────────────────────────

/**
 * Pick a photo from the device library and encrypt it for a recipient.
 * Returns the EncryptedPhoto envelope ready to send, or null if cancelled.
 */
export async function pickAndEncryptPhoto(
  senderKeys:    KeyPair,
  recipientId:   string,
  source:        'library' | 'camera' = 'library',
): Promise<{ encrypted: EncryptedPhoto; localUri: string } | null> {
  // Permission-gated picker — handles denied/undetermined states with proper UI
  const result = await pickPhotoWithPermission(source)
  if (!result || result.canceled || !result.assets?.[0]) return null

  const asset = result.assets[0]

  // Read as binary
  const base64 = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.Base64,
  })

  const photoBytes = base64ToUint8Array(base64)
  if (photoBytes.length > MAX_PHOTO_BYTES) {
    throw new Error(`Photo too large (${(photoBytes.length / 1024 / 1024).toFixed(1)}MB). Please choose a smaller image.`)
  }

  // Get recipient's X25519 key
  const recipientXPub = getPeerXPubKey(recipientId)
  if (!recipientXPub) {
    throw new Error('Recipient encryption key not known yet — wait for their broadcast')
  }

  const meta: PhotoMeta = {
    width:    asset.width,
    height:   asset.height,
    mimeType: asset.mimeType ?? 'image/jpeg',
    caption:  '',
  }
  const metaBytes = new TextEncoder().encode(JSON.stringify(meta))

  const [ciphertext, metaCiphertext] = await Promise.all([
    sealBox(photoBytes, recipientXPub),
    sealBox(metaBytes,  recipientXPub),
  ])

  const encrypted: EncryptedPhoto = {
    ciphertextHex: uint8ArrayToHex(ciphertext),
    metaHex:       uint8ArrayToHex(metaCiphertext),
    senderPeerId:  senderKeys.edPublicKey.toString(),  // or peerId
    ts:            Date.now(),
    sizeBytes:     ciphertext.length,
  }

  return { encrypted, localUri: asset.uri }
}

/**
 * Decrypt a received EncryptedPhoto envelope.
 * Returns the local URI where the decrypted photo is cached, and its metadata.
 */
export async function decryptAndCachePhoto(
  envelope:   EncryptedPhoto,
  myKeys:     KeyPair,
): Promise<{ uri: string; meta: PhotoMeta } | null> {
  try {
    const cipherBytes = hexToUint8Array(envelope.ciphertextHex)
    const metaBytes   = hexToUint8Array(envelope.metaHex)

    const [photoBytes, metaPlain] = await Promise.all([
      openBox(cipherBytes, myKeys.xPublicKey, myKeys.xSecretKey),
      openBox(metaBytes,   myKeys.xPublicKey, myKeys.xSecretKey),
    ])

    if (!photoBytes || !metaPlain) return null  // decryption failed

    const meta: PhotoMeta = JSON.parse(new TextDecoder().decode(metaPlain))

    // Write via bounded cache manager (enforces 100MB limit, LRU eviction)
    const filename = `photo_${envelope.ts}_${envelope.senderPeerId.slice(0, 8)}.jpg`
    const uri = await writeCachedPhoto(filename, uint8ArrayToBase64(photoBytes))

    return { uri, meta }
  } catch (e) {
    console.warn('Photo decrypt failed:', e)
    return null
  }
}



// ─── Stream transfer helpers ──────────────────────────────────────────────────

/**
 * Serialise an EncryptedPhoto to bytes for libp2p stream transfer.
 * Format: 4-byte length prefix + JSON envelope.
 * For large files we chunk — but 2MB fits in a single stream write.
 */
export function serialisePhotoEnvelope(envelope: EncryptedPhoto): Uint8Array {
  const json  = new TextEncoder().encode(JSON.stringify(envelope))
  const out   = new Uint8Array(4 + json.length)
  const view  = new DataView(out.buffer)
  view.setUint32(0, json.length, false)   // big-endian length prefix
  out.set(json, 4)
  return out
}

export function deserialisePhotoEnvelope(data: Uint8Array): EncryptedPhoto {
  const view   = new DataView(data.buffer, data.byteOffset)
  const len    = view.getUint32(0, false)
  const json   = new TextDecoder().decode(data.slice(4, 4 + len))
  return JSON.parse(json)
}

// ─── Byte ↔ base64 helpers ────────────────────────────────────────────────────

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes  = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}
