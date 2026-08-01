/**
 * ConnectEdge Relay Worker v2 — with FCM push dispatch
 * deploy: wrangler deploy
 *
 * New in v2:
 *   POST /register-token         — store FCM token against double-hashed peerIdHash
 *   DELETE /register-token/:hash — deregister on sign-out
 *   FCM HTTP v1 API dispatch on every envelope store
 *
 * Privacy model:
 *   - FCM token stored as: token:<SHA256(peerIdHash)> — double-hashed
 *   - FCM data payload contains ONLY: { type: "relay_wake", hint: <type> }
 *   - NO message content ever leaves this worker
 *   - Envelope payloads remain opaque ciphertext
 *
 * Bindings needed in wrangler.toml:
 *   RELAY_STORE       — KV namespace (envelopes + token registry)
 *   FCM_SERVICE_ACCOUNT_JSON — Secret (Firebase service account JSON)
 */

export interface Env {
  RELAY_STORE:               KVNamespace
  FCM_SERVICE_ACCOUNT_JSON:  string      // wrangler secret
  FCM_PROJECT_ID:            string      // wrangler var
}

const MAX_TTL        = 86_400
const MAX_BODY_SIZE  = 64_000    // 64KB (raised for photo chunks)
const MAX_ENVELOPES  = 50
const TOKEN_TTL      = 8 * 24 * 3600   // 8 days

// Authentication: clients must prove ownership of the peerIdHash
// by providing an ed25519 signature over the request body.
// The public key derived from the signature must hash to the peerIdHash.
//
// Header: X-Peer-Sig: <ed25519-detached-signature-hex>
// Header: X-Peer-PubKey: <ed25519-publickey-hex>
//
// Verification: SHA256(pubKeyHex).slice(0,32) === peerIdHash
//               crypto_sign_verify_detached(sig, message, pubKey)

// ─── Router ───────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }))

    const url  = new URL(request.url)
    const path = url.pathname

    if (request.method === 'POST' && path === '/envelope')
      return handleStore(request, env)

    if (request.method === 'POST' && path === '/register-token')
      return handleRegisterToken(request, env)

    const envGet = path.match(/^\/envelope\/([a-f0-9]{32})$/)
    if (request.method === 'GET' && envGet)
      return handleFetch(envGet[1], request, env)

    const envDel = path.match(/^\/envelope\/([a-f0-9]{32})\/([a-zA-Z0-9_-]+)$/)
    if (request.method === 'DELETE' && envDel)
      return handleDelete(envDel[1], envDel[2], request, env)

    const tokDel = path.match(/^\/register-token\/([a-f0-9]{32})$/)
    if (request.method === 'DELETE' && tokDel)
      return handleDeregisterToken(tokDel[1], env)

    return json({ error: 'Not found' }, 404)
  },
}

// ─── Envelope store ───────────────────────────────────────────────────────────

async function handleStore(request: Request, env: Env): Promise<Response> {
  const contentLength = parseInt(request.headers.get('content-length') ?? '0')
  if (contentLength > MAX_BODY_SIZE) return json({ error: 'Envelope too large' }, 413)

  let body: { to: string; payload: string; ttl?: number; hint?: string }
  try { body = await request.json() }
  catch { return json({ error: 'Invalid JSON' }, 400) }

  if (!body.to || !body.payload) return json({ error: 'Missing fields' }, 400)

  const ttl        = Math.min(body.ttl ?? 3600, MAX_TTL)
  const recipientH = await hashPeerId(body.to)
  const envelopeId = crypto.randomUUID()

  // Check mailbox capacity
  const existing: string[] = JSON.parse(
    (await env.RELAY_STORE.get(`idx:${recipientH}`)) ?? '[]'
  )
  if (existing.length >= MAX_ENVELOPES) return json({ error: 'Mailbox full' }, 429)

  // Store envelope — opaque ciphertext + optional type hint
  const envelopeData = JSON.stringify({
    payload: body.payload,
    hint:    body.hint ?? null,   // 'chat' | 'photo' | 'like' | 'match' | null
  })
  await env.RELAY_STORE.put(`env:${recipientH}:${envelopeId}`, envelopeData, {
    expirationTtl: ttl,
  })

  existing.push(envelopeId)
  await env.RELAY_STORE.put(`idx:${recipientH}`, JSON.stringify(existing), {
    expirationTtl: ttl,
  })

  // Fire FCM wake signal — non-blocking, don't fail the store if FCM errors
  dispatchFCM(recipientH, body.hint ?? 'chat', env).catch(e =>
    console.error('FCM dispatch error:', e)
  )

  return json({ ok: true, id: envelopeId })
}

// ─── FCM dispatch ─────────────────────────────────────────────────────────────

async function dispatchFCM(
  recipientDoubleHash: string,   // SHA256(peerIdHash) — already hashed
  hint:                string,
  env:                 Env,
): Promise<void> {
  // Look up FCM token
  const tokenRecord = await env.RELAY_STORE.get(`token:${recipientDoubleHash}`)
  if (!tokenRecord) return   // device not registered for push

  const { token, platform } = JSON.parse(tokenRecord) as {
    token: string; platform: 'ios' | 'android'
  }

  // Get Firebase access token (service account → OAuth2)
  const accessToken = await getFirebaseAccessToken(env.FCM_SERVICE_ACCOUNT_JSON)
  if (!accessToken) return

  // Build FCM HTTP v1 message
  // Data-only payload — NO notification field → no content on Google servers
  const message = {
    message: {
      token,
      data: {
        type: 'relay_wake',
        hint,                          // tells app what kind of item to expect
        urgent: hint === 'match' || hint === 'like' ? 'true' : 'false',
      },
      // Android: high priority ensures delivery even in Doze mode
      android: {
        priority: 'high',
        ttl:      '300s',
      },
      // APNs (iOS): content-available:1 for background wake
      apns: {
        headers: {
          'apns-priority':    '5',     // 5 = low priority for silent push (battery friendly)
          'apns-push-type':   'background',
          'apns-expiration':  String(Math.floor(Date.now() / 1000) + 300),
        },
        payload: {
          aps: {
            'content-available': 1,    // required for silent background wake
          },
        },
      },
    },
  }

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${env.FCM_PROJECT_ID}/messages:send`,
    {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(message),
    }
  )

  if (!response.ok) {
    const body = await response.text()
    // Handle token invalidation
    if (response.status === 404 || body.includes('UNREGISTERED')) {
      await env.RELAY_STORE.delete(`token:${recipientDoubleHash}`)
    }
    console.error(`FCM send failed ${response.status}:`, body)
  }
}

// ─── Firebase OAuth2 (service account → bearer token) ─────────────────────────

let _cachedToken: string | null = null
let _tokenExpiry: number        = 0

async function getFirebaseAccessToken(serviceAccountJson: string): Promise<string | null> {
  // Return cached token if still valid (5min buffer)
  if (_cachedToken && Date.now() < _tokenExpiry - 300_000) return _cachedToken

  try {
    const sa = JSON.parse(serviceAccountJson) as {
      client_email: string
      private_key:  string
    }

    // Build JWT for service account auth
    const now  = Math.floor(Date.now() / 1000)
    const claim = {
      iss:   sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud:   'https://oauth2.googleapis.com/token',
      iat:   now,
      exp:   now + 3600,
    }

    const header  = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const payload = btoa(JSON.stringify(claim))
    const sigInput = `${header}.${payload}`

    // Sign with the service account private key (RSA-SHA256)
    const keyData   = sa.private_key
      .replace(/-----BEGIN PRIVATE KEY-----/, '')
      .replace(/-----END PRIVATE KEY-----/, '')
      .replace(/\n/g, '')
    const keyBuffer = Uint8Array.from(atob(keyData), c => c.charCodeAt(0))

    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8', keyBuffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false, ['sign'],
    )

    const sigBuffer = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      new TextEncoder().encode(sigInput),
    )
    const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)))
    const jwt = `${sigInput}.${sig}`

    // Exchange JWT for access token
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    })

    const data = await resp.json() as { access_token?: string; expires_in?: number }
    if (!data.access_token) return null

    _cachedToken = data.access_token
    _tokenExpiry = Date.now() + (data.expires_in ?? 3600) * 1000
    return _cachedToken

  } catch (e) {
    console.error('Firebase token error:', e)
    return null
  }
}

// ─── Token registration ───────────────────────────────────────────────────────

async function handleRegisterToken(request: Request, env: Env): Promise<Response> {
  let body: { tokenHash: string; token: string; platform: string; ttl?: number }
  try { body = await request.json() }
  catch { return json({ error: 'Invalid JSON' }, 400) }

  if (!body.tokenHash || !body.token) return json({ error: 'Missing fields' }, 400)

  // Validate tokenHash format (32 hex chars = 16 bytes)
  if (!/^[a-f0-9]{32}$/.test(body.tokenHash)) return json({ error: 'Invalid tokenHash' }, 400)

  const ttl = Math.min(body.ttl ?? TOKEN_TTL, TOKEN_TTL)

  await env.RELAY_STORE.put(
    `token:${body.tokenHash}`,
    JSON.stringify({ token: body.token, platform: body.platform }),
    { expirationTtl: ttl },
  )

  return json({ ok: true })
}

async function handleDeregisterToken(tokenHash: string, env: Env): Promise<Response> {
  await env.RELAY_STORE.delete(`token:${tokenHash}`)
  return json({ ok: true })
}

// ─── Envelope fetch / delete ──────────────────────────────────────────────────

async function handleFetch(recipientHash: string, request: Request, env: Env): Promise<Response> {
  if (!await verifyPeerAuth(recipientHash, request)) {
    return json({ error: 'Authentication required — provide X-Peer-Sig and X-Peer-PubKey headers' }, 401)
  }

  const index: string[] = JSON.parse(
    (await env.RELAY_STORE.get(`idx:${recipientHash}`)) ?? '[]'
  )

  const envelopes = await Promise.all(
    index.map(async id => {
      const raw = await env.RELAY_STORE.get(`env:${recipientHash}:${id}`)
      if (!raw) return null
      try {
        const { payload, hint } = JSON.parse(raw)
        return { id, payload, hint }
      } catch {
        return { id, payload: raw, hint: null }   // legacy format
      }
    })
  )

  return json({ envelopes: envelopes.filter(Boolean), count: envelopes.length })
}

async function handleDelete(
  recipientHash: string, envelopeId: string, request: Request, env: Env,
): Promise<Response> {
  if (!await verifyPeerAuth(recipientHash, request)) {
    return json({ error: 'Authentication required' }, 401)
  }

  await env.RELAY_STORE.delete(`env:${recipientHash}:${envelopeId}`)

  const index: string[] = JSON.parse(
    (await env.RELAY_STORE.get(`idx:${recipientHash}`)) ?? '[]'
  )
  await env.RELAY_STORE.put(
    `idx:${recipientHash}`,
    JSON.stringify(index.filter(id => id !== envelopeId)),
  )

  return json({ ok: true })
}

// ─── Peer authentication ──────────────────────────────────────────────────────

/**
 * Verify that the requester owns the peerIdHash by checking an ed25519
 * signature over the request body. The public key must hash to the peerIdHash.
 *
 * Headers required for authenticated endpoints:
 *   X-Peer-Sig:    hex-encoded ed25519 detached signature of request body
 *   X-Peer-PubKey: hex-encoded ed25519 public key
 */
async function verifyPeerAuth(
  peerIdHash: string,
  request:    Request,
): Promise<boolean> {
  const sigHex    = request.headers.get('X-Peer-Sig')
  const pubKeyHex = request.headers.get('X-Peer-PubKey')
  if (!sigHex || !pubKeyHex) return false

  // Verify: SHA256(ed25519_pubkey_hex).slice(0,32) === peerIdHash
  const pubKeyHash = await sha256Hex(pubKeyHex)
  if (pubKeyHash.slice(0, 32) !== peerIdHash) return false

  // Verify signature against request body
  const body = await request.clone().arrayBuffer()
  const { default: _sodium } = await import('libsodium-wrappers' as any)
  await _sodium.ready

  try {
    return _sodium.crypto_sign_verify_detached(
      hexToBytes(sigHex),
      new Uint8Array(body),
      hexToBytes(pubKeyHex),
    )
  } catch { return false }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function hashPeerId(peerId: string): Promise<string> {
  const enc  = new TextEncoder().encode(peerId)
  const hash = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

async function sha256Hex(input: string): Promise<string> {
  const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function cors(response: Response): Response {
  const h = new Headers(response.headers)
  h.set('Access-Control-Allow-Origin', '*')
  h.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  h.set('Access-Control-Allow-Headers', 'Content-Type')
  return new Response(response.body, { status: response.status, headers: h })
}

function json(data: unknown, status = 200): Response {
  return cors(new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }))
}
