/**
 * ConnectEdge Relay Worker — Privacy-preserving offline envelope store & fetch
 * deploy: wrangler deploy
 *
 * Privacy model:
 *   - NO message content ever leaves client device plaintext
 *   - Envelope payloads remain opaque sealed-box ciphertext
 *   - Mailboxes auto-expire after TTL (max 24h)
 *   - Zero central user database or identity tracking
 */

export interface Env {
  RELAY_STORE: KVNamespace
}

const MAX_TTL       = 86_400
const MAX_BODY_SIZE = 64_000    // 64KB (for sealed box photo chunks / envelopes)
const MAX_ENVELOPES = 50

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }))

    const url  = new URL(request.url)
    const path = url.pathname

    if (request.method === 'POST' && path === '/envelope')
      return handleStore(request, env)

    const envGet = path.match(/^\/envelope\/([a-f0-9]{32})$/)
    if (request.method === 'GET' && envGet)
      return handleFetch(envGet[1], request, env)

    const envDel = path.match(/^\/envelope\/([a-f0-9]{32})\/([a-zA-Z0-9_-]+)$/)
    if (request.method === 'DELETE' && envDel)
      return handleDelete(envDel[1], envDel[2], request, env)

    return json({ error: 'Not found' }, 404)
  },
}

// ─── Envelope Store ───────────────────────────────────────────────────────────

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

  return json({ ok: true, id: envelopeId })
}

// ─── Envelope Fetch / Delete ──────────────────────────────────────────────────

async function handleFetch(recipientHash: string, request: Request, env: Env): Promise<Response> {
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
        return { id, payload: raw, hint: null }
      }
    })
  )

  return json({ envelopes: envelopes.filter(Boolean), count: envelopes.length })
}

async function handleDelete(
  recipientHash: string, envelopeId: string, request: Request, env: Env,
): Promise<Response> {
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function hashPeerId(peerId: string): Promise<string> {
  const enc  = new TextEncoder().encode(peerId)
  const hash = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
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
