// cache-manager.ts — bounded filesystem cache for decrypted photos
//
// Problem: photos.ts writes decrypted images to the cache directory but never
// enforces a size limit. On a device with many matches this grows unbounded.
//
// Solution: LRU cache with a configurable max size (default 100MB).
// Each write records the file in a manifest (SecureStore). When the limit
// is exceeded, the oldest files are deleted first.
//
// Cache directory: <cacheDirectory>/connectedge_photos/
// Manifest key:    connectedge_photo_manifest_v1  → JSON array of CacheEntry[]
//
// This module wraps expo-file-system — import it instead of using
// FileSystem directly for photo operations.

import * as FileSystem from 'expo-file-system'
import * as SecureStore from 'expo-secure-store'

export const PHOTO_CACHE_DIR    = FileSystem.cacheDirectory + 'connectedge_photos/'
const MANIFEST_KEY              = 'connectedge_photo_manifest_v1'
const MAX_CACHE_BYTES           = 100 * 1024 * 1024  // 100 MB
const MAX_CACHE_FILES           = 500

interface CacheEntry {
  filename:  string
  sizeBytes: number
  ts:        number    // write timestamp — used for LRU ordering
}

// ─── Read / write manifest ────────────────────────────────────────────────────

async function loadManifest(): Promise<CacheEntry[]> {
  try {
    const raw = await SecureStore.getItemAsync(MANIFEST_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

async function saveManifest(entries: CacheEntry[]): Promise<void> {
  await SecureStore.setItemAsync(MANIFEST_KEY, JSON.stringify(entries))
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Write a decrypted photo to the cache.
 * Automatically evicts oldest files if size or count limit is exceeded.
 * Returns the local URI.
 */
export async function writeCachedPhoto(
  filename:    string,
  base64Data:  string,
): Promise<string> {
  await FileSystem.makeDirectoryAsync(PHOTO_CACHE_DIR, { intermediates: true })

  const uri   = PHOTO_CACHE_DIR + filename
  await FileSystem.writeAsStringAsync(uri, base64Data, {
    encoding: FileSystem.EncodingType.Base64,
  })

  // Get actual file size
  const info  = await FileSystem.getInfoAsync(uri, { size: true })
  const size  = (info as any).size ?? estimateBase64Size(base64Data)

  // Update manifest
  const entries = await loadManifest()
  entries.push({ filename, sizeBytes: size, ts: Date.now() })
  await saveManifest(entries)

  // Evict if over limit
  await evictIfNeeded()

  return uri
}

// ─── Eviction ─────────────────────────────────────────────────────────────────

export async function evictIfNeeded(): Promise<void> {
  let entries = await loadManifest()

  const totalBytes = entries.reduce((s, e) => s + e.sizeBytes, 0)
  const overSize   = totalBytes > MAX_CACHE_BYTES
  const overCount  = entries.length > MAX_CACHE_FILES

  if (!overSize && !overCount) return

  // Sort oldest first
  entries.sort((a, b) => a.ts - b.ts)

  const toDelete: CacheEntry[] = []
  let   remaining = totalBytes

  for (const entry of entries) {
    if (remaining <= MAX_CACHE_BYTES * 0.8 && entries.length - toDelete.length <= MAX_CACHE_FILES) break
    toDelete.push(entry)
    remaining -= entry.sizeBytes
  }

  await Promise.all(
    toDelete.map(e =>
      FileSystem.deleteAsync(PHOTO_CACHE_DIR + e.filename, { idempotent: true })
        .catch(() => {})
    )
  )

  const deletedSet = new Set(toDelete.map(e => e.filename))
  await saveManifest(entries.filter(e => !deletedSet.has(e.filename)))
}

// ─── Clear ────────────────────────────────────────────────────────────────────

export async function clearPhotoCache(): Promise<void> {
  try {
    await FileSystem.deleteAsync(PHOTO_CACHE_DIR, { idempotent: true })
    await SecureStore.deleteItemAsync(MANIFEST_KEY)
  } catch {}
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface CacheStats {
  fileCount:  number
  totalBytes: number
  totalMB:    string
  limitMB:    string
  usagePct:   number
}

export async function getCacheStats(): Promise<CacheStats> {
  const entries   = await loadManifest()
  const totalBytes = entries.reduce((s, e) => s + e.sizeBytes, 0)
  return {
    fileCount:  entries.length,
    totalBytes,
    totalMB:    (totalBytes / (1024 * 1024)).toFixed(1),
    limitMB:    (MAX_CACHE_BYTES / (1024 * 1024)).toFixed(0),
    usagePct:   Math.round((totalBytes / MAX_CACHE_BYTES) * 100),
  }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function estimateBase64Size(b64: string): number {
  // base64 encodes 3 bytes as 4 chars; subtract padding
  const padding = (b64.match(/=+$/) || [''])[0].length
  return Math.floor(b64.length * 0.75) - padding
}
