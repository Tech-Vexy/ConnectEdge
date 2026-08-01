/**
 * ConnectEdge Verification Worker
 * Handles institutional email OTP flow and badge signing.
 *
 * Endpoints:
 *   POST /verify/request-otp   — send OTP to institutional email
 *   POST /verify/submit        — verify OTP + nullifier, return signed badge
 *   GET  /verify/pubkey        — return worker's signing public key
 *
 * Privacy model:
 *   - Email is used ONLY to send the OTP, then discarded
 *   - KV stores: H(email) → rate-limit counter (expires 24h)
 *   - KV stores: H(nullifier) → "used" flag (permanent, prevents re-use)
 *   - KV stores: sessionToken → { emailHash, institutionDomain, expiresAt }
 *   - Badge contains: institution, tier, H(nullifier), expiry, signature
 *   - Badge does NOT contain: email, peerId, name, IP
 *
 * Bindings (wrangler.toml):
 *   VERIFY_STORE          — KV namespace
 *   WORKER_SIGNING_SECRET — ed25519 secret key hex (wrangler secret)
 *   SENDGRID_API_KEY      — for email delivery (wrangler secret)
 *   CONNECTEDGE_FROM_EMAIL     — sender address (wrangler var)
 */

export interface VerifyEnv {
  VERIFY_STORE:          KVNamespace
  WORKER_SIGNING_SECRET: string
  SENDGRID_API_KEY:      string
  CONNECTEDGE_FROM_EMAIL:     string
}

const OTP_TTL_SECONDS  = 600     // 10 minutes
const BADGE_TTL_MS     = 180 * 24 * 3600_000  // 6 months
const MAX_OTP_ATTEMPTS = 5       // per session
const RATE_LIMIT_DAILY = 3       // OTP requests per email per day

// ─── Router ───────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: VerifyEnv): Promise<Response> {
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }))

    const url  = new URL(request.url)
    const path = url.pathname

    if (request.method === 'POST' && path === '/verify/request-otp')
      return handleRequestOTP(request, env)

    if (request.method === 'POST' && path === '/verify/submit')
      return handleSubmit(request, env)

    if (request.method === 'GET'  && path === '/verify/pubkey')
      return handlePubkey(env)

    return json({ error: 'Not found' }, 404)
  },
}

// ─── Request OTP ─────────────────────────────────────────────────────────────

async function handleRequestOTP(request: Request, env: VerifyEnv): Promise<Response> {
  const { email, emailHash } = await request.json() as { email: string; emailHash: string }

  if (!email || !emailHash) return json({ error: 'Missing fields' }, 400)

  const emailLower = email.toLowerCase().trim()
  const domain = emailLower.split('@')[1]

  // Validate domain
  const KNOWN_DOMAINS = await getKnownDomains(env)
  if (!KNOWN_DOMAINS[domain]) {
    return json({ error: `Institution @${domain} is not supported` }, 400)
  }

  // Rate limit: max RATE_LIMIT_DAILY requests per email per day
  const rateLimitKey = `ratelimit:${emailHash}`
  const countStr     = await env.VERIFY_STORE.get(rateLimitKey)
  const count        = countStr ? parseInt(countStr) : 0
  if (count >= RATE_LIMIT_DAILY) {
    return json({ error: 'Too many verification attempts today. Try again tomorrow.' }, 429)
  }

  // Generate 6-digit OTP using cryptographically secure random
  const otpDigits = new Uint32Array(1)
  crypto.getRandomValues(otpDigits)
  const otp  = String(100000 + (otpDigits[0] % 900000))

  // Generate session token (opaque, not linked to email after this point)
  const sessionToken  = crypto.randomUUID()
  const sessionExpiry = Date.now() + OTP_TTL_SECONDS * 1000

  // Store session — emailHash only, NOT the email
  await env.VERIFY_STORE.put(
    `session:${sessionToken}`,
    JSON.stringify({
      emailHash,
      domain,
      otpHash: await sha256(otp),   // store hash of OTP, not plaintext
      expiresAt: sessionExpiry,
      attempts: 0,
    }),
    { expirationTtl: OTP_TTL_SECONDS },
  )

  // Increment rate limit counter
  await env.VERIFY_STORE.put(rateLimitKey, String(count + 1), { expirationTtl: 86400 })

  // Send OTP email via SendGrid
  const sent = await sendOTPEmail(emailLower, otp, KNOWN_DOMAINS[domain].name, env)
  if (!sent) return json({ error: 'Failed to send email. Check the address and try again.' }, 500)

  // Mask email for display: j***@unilag.edu.ng
  const [localPart] = emailLower.split('@')
  const maskedEmail = localPart[0] + '***@' + domain

  return json({
    sessionToken,
    expiresAt:  sessionExpiry,
    maskedEmail,
  })
}

// ─── Submit OTP + proof ───────────────────────────────────────────────────────

async function handleSubmit(request: Request, env: VerifyEnv): Promise<Response> {
  const {
    sessionToken,
    otp,
    nullifierHash,
    commitmentHex,
    commitmentSig,
    commitmentPubKey,
  } = await request.json() as Record<string, string>

  if (!sessionToken || !otp || !nullifierHash || !commitmentHex) {
    return json({ error: 'Missing fields' }, 400)
  }

  // Load session
  const sessionRaw = await env.VERIFY_STORE.get(`session:${sessionToken}`)
  if (!sessionRaw) return json({ error: 'Session expired or not found' }, 404)

  const session = JSON.parse(sessionRaw) as {
    emailHash: string; domain: string; otpHash: string
    expiresAt: number; attempts: number
  }

  if (session.expiresAt < Date.now()) return json({ error: 'Session expired' }, 410)
  if (session.attempts >= MAX_OTP_ATTEMPTS) return json({ error: 'Too many attempts' }, 429)

  // Verify OTP
  const providedOtpHash = await sha256(otp.trim())
  if (providedOtpHash !== session.otpHash) {
    // Increment attempt counter
    await env.VERIFY_STORE.put(
      `session:${sessionToken}`,
      JSON.stringify({ ...session, attempts: session.attempts + 1 }),
      { expirationTtl: Math.floor((session.expiresAt - Date.now()) / 1000) },
    )
    return json({
      error: `Incorrect code. ${MAX_OTP_ATTEMPTS - session.attempts - 1} attempts remaining.`,
    }, 401)
  }

  // Check nullifier has not been used before (anti-Sybil)
  const nullifierKey    = `nullifier:${nullifierHash}`
  const nullifierExists = await env.VERIFY_STORE.get(nullifierKey)
  if (nullifierExists) {
    return json({
      error: 'This credential has already been used to verify an account.',
    }, 409)
  }

  // Verify the commitment signature — proves peer owns the PeerID
  const sigValid = await verifyCommitmentSig(commitmentHex, commitmentSig, commitmentPubKey)
  if (!sigValid) return json({ error: 'Invalid commitment signature' }, 400)

  // All checks passed — issue badge
  const KNOWN_DOMAINS = await getKnownDomains(env)
  const institution   = KNOWN_DOMAINS[session.domain]

  const now     = Date.now()
  const badge   = {
    institution:  institution.name,
    domain:       session.domain,
    tier:         institution.tier,
    nullifierHash,
    issuedAt:     now,
    expiresAt:    now + BADGE_TTL_MS,
  }

  // Sign the badge with the worker's ed25519 key
  const badgeSig = await signBadge(badge, env.WORKER_SIGNING_SECRET)
  const signedBadge = { ...badge, workerSigHex: badgeSig }

  // Mark nullifier as used — permanent (no expiry)
  await env.VERIFY_STORE.put(nullifierKey, '1')

  // Delete session — no longer needed
  await env.VERIFY_STORE.delete(`session:${sessionToken}`)

  return json(signedBadge)
}

// ─── Public key endpoint ──────────────────────────────────────────────────────

async function handlePubkey(env: VerifyEnv): Promise<Response> {
  const { default: _sodium } = await import('libsodium-wrappers' as any)
  await _sodium.ready

  const secretBytes = hexToBytes(env.WORKER_SIGNING_SECRET)
  const kp          = _sodium.crypto_sign_seed_keypair(secretBytes.slice(0, 32))

  return json({ pubKeyHex: bytesToHex(kp.publicKey) })
}

// ─── Crypto helpers ───────────────────────────────────────────────────────────

async function sha256(input: string): Promise<string> {
  const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return bytesToHex(new Uint8Array(buf))
}

async function signBadge(
  badge:     Record<string, unknown>,
  secretHex: string,
): Promise<string> {
  const { default: _sodium } = await import('libsodium-wrappers' as any)
  await _sodium.ready

  const payload     = new TextEncoder().encode(JSON.stringify(badge))
  const secretBytes = hexToBytes(secretHex)
  const kp          = _sodium.crypto_sign_seed_keypair(secretBytes.slice(0, 32))
  const sig         = _sodium.crypto_sign_detached(payload, kp.privateKey)
  return bytesToHex(sig)
}

async function verifyCommitmentSig(
  commitmentHex: string,
  sigHex:        string,
  pubKeyHex:     string,
): Promise<boolean> {
  try {
    const { default: _sodium } = await import('libsodium-wrappers' as any)
    await _sodium.ready

    const commitment = hexToBytes(commitmentHex)
    const sig        = hexToBytes(sigHex)
    const pubKey     = hexToBytes(pubKeyHex)

    return _sodium.crypto_sign_verify_detached(sig, commitment, pubKey)
  } catch { return false }
}

// ─── Email sending ────────────────────────────────────────────────────────────

async function sendOTPEmail(
  to:          string,
  otp:         string,
  institution: string,
  env:         VerifyEnv,
): Promise<boolean> {
  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.SENDGRID_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from:    { email: env.CONNECTEDGE_FROM_EMAIL, name: 'ConnectEdge' },
        subject: `Your ConnectEdge verification code: ${otp}`,
        content: [{
          type:  'text/plain',
          value: [
            `Your ConnectEdge verification code is: ${otp}`,
            '',
            `This confirms you are a member of ${institution}.`,
            `The code expires in 10 minutes.`,
            '',
            `Your personal information is never stored by ConnectEdge.`,
            `This code proves membership only — no identifying data is shared.`,
          ].join('\n'),
        }, {
          type:  'text/html',
          value: `
            <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px">
              <h2 style="color:#FF4458;margin-bottom:8px">ConnectEdge</h2>
              <p style="color:#666;margin-bottom:24px">Your verification code</p>
              <div style="background:#f5f5f5;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
                <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#111">${otp}</span>
              </div>
              <p style="color:#444">This confirms you are a member of <strong>${institution}</strong>.</p>
              <p style="color:#888;font-size:13px">Expires in 10 minutes. Your personal information is never stored by ConnectEdge.</p>
            </div>
          `,
        }],
      }),
    })
    return res.ok || res.status === 202
  } catch { return false }
}

// ─── Institution registry ─────────────────────────────────────────────────────
// In production, fetch this from a separate KV or R2 object so it can be
// updated without redeploying. For now, hardcoded mirror of client-side list.

type InstitutionMap = Record<string, { name: string; tier: string }>

async function getKnownDomains(env: VerifyEnv): Promise<InstitutionMap> {
  // Try to get from KV (allows updating without redeploy)
  const cached = await env.VERIFY_STORE.get('config:institutions')
  if (cached) return JSON.parse(cached)

  // Fallback hardcoded list
  return {
    'unilag.edu.ng':  { name: 'University of Lagos',        tier: 'student' },
    'ui.edu.ng':      { name: 'University of Ibadan',       tier: 'student' },
    'oauife.edu.ng':  { name: 'Obafemi Awolowo University', tier: 'student' },
    'abu.edu.ng':     { name: 'Ahmadu Bello University',    tier: 'student' },
    'unn.edu.ng':     { name: 'UNN',                        tier: 'student' },
    'uonbi.ac.ke':    { name: 'University of Nairobi',      tier: 'student' },
    'ku.ac.ke':       { name: 'Kenyatta University',        tier: 'student' },
    'mu.ac.ke':       { name: 'Moi University',             tier: 'student' },
    'jkuat.ac.ke':    { name: 'JKUAT',                      tier: 'student' },
    'kyu.ac.ke':      { name: 'Kirinyaga University',       tier: 'student' },
    'egerton.ac.ke':  { name: 'Egerton University',         tier: 'student' },
    'maseno.ac.ke':   { name: 'Maseno University',          tier: 'student' },
    'mmust.ac.ke':    { name: 'Masinde Muliro University',  tier: 'student' },
    'strathmore.edu': { name: 'Strathmore University',      tier: 'student' },
    'usiu.ac.ke':     { name: 'USIU-Africa',                tier: 'student' },
    'tum.ac.ke':      { name: 'Technical University of Mombasa', tier: 'student' },
    'dkut.ac.ke':     { name: 'Dedan Kimathi University',   tier: 'student' },
    'pwani.ac.ke':    { name: 'Pwani University',           tier: 'student' },
    'mku.ac.ke':      { name: 'Mount Kenya University',     tier: 'student' },
    'kca.ac.ke':      { name: 'KCA University',             tier: 'student' },
    'students.uonbi.ac.ke':   { name: 'University of Nairobi',   tier: 'student' },
    'students.ku.ac.ke':      { name: 'Kenyatta University',     tier: 'student' },
    'students.mu.ac.ke':      { name: 'Moi University',          tier: 'student' },
    'students.jkuat.ac.ke':   { name: 'JKUAT',                   tier: 'student' },
    'students.kyu.ac.ke':     { name: 'Kirinyaga University',    tier: 'student' },
    'students.egerton.ac.ke': { name: 'Egerton University',      tier: 'student' },
    'students.maseno.ac.ke':  { name: 'Maseno University',       tier: 'student' },
    'students.mmust.ac.ke':   { name: 'Masinde Muliro University', tier: 'student' },
    'students.tum.ac.ke':     { name: 'Technical University of Mombasa', tier: 'student' },
    'students.dkut.ac.ke':    { name: 'Dedan Kimathi University', tier: 'student' },
    'students.pwani.ac.ke':   { name: 'Pwani University',        tier: 'student' },
    'students.mku.ac.ke':     { name: 'Mount Kenya University',  tier: 'student' },
    'students.kca.ac.ke':     { name: 'KCA University',          tier: 'student' },
    'ox.ac.uk':       { name: 'University of Oxford',       tier: 'student' },
    'cam.ac.uk':      { name: 'University of Cambridge',    tier: 'student' },
    'ucl.ac.uk':      { name: 'UCL',                        tier: 'student' },
    'imperial.ac.uk': { name: 'Imperial College',           tier: 'student' },
    'lse.ac.uk':      { name: 'LSE',                        tier: 'student' },
    'mit.edu':        { name: 'MIT',                        tier: 'student' },
    'stanford.edu':   { name: 'Stanford',                   tier: 'student' },
    'harvard.edu':    { name: 'Harvard',                    tier: 'student' },
  }
}

// ─── Byte helpers ─────────────────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string): Uint8Array {
  const result = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2)
    result[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  return result
}

function cors(response: Response): Response {
  const h = new Headers(response.headers)
  h.set('Access-Control-Allow-Origin', '*')
  h.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  h.set('Access-Control-Allow-Headers', 'Content-Type')
  return new Response(response.body, { status: response.status, headers: h })
}

function json(data: unknown, status = 200): Response {
  return cors(new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }))
}
