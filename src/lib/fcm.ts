// fcm.ts — FCM token registration and management
//
// Architecture: data-only push, privacy-preserving token registration.
//
// FCM is used ONLY as a wake signal — the notification content never
// travels through Google. Flow:
//
//   1. App registers FCM token with the relay worker (hashed, see below)
//   2. Relay worker stores: SHA256(peerIdHash) → FCM token
//   3. When a new envelope arrives for a peer, worker sends FCM data push
//   4. Device wakes → app polls relay → decrypts → fires LOCAL notification
//
// Privacy properties:
//   - Google sees: device token + timestamp of wake signal. Nothing else.
//   - Relay worker sees: hashed peerIdHash → token mapping only.
//   - Token is re-registered on every app launch to rotate it.
//   - Token is deleted from relay on sign-out.
//
// Supported:
//   iOS    — APNs via Firebase (FCM HTTP v1 API)
//   Android — FCM native
//
// On iOS, FCM wraps APNs. The app must have push entitlements and an
// APNs key configured in Firebase Console.

import messaging           from '@react-native-firebase/messaging'
import * as SecureStore    from 'expo-secure-store'
import { Platform }        from 'react-native'
import { uint8ArrayToHex } from './bytes'

const KEY_FCM_TOKEN    = 'proxim_fcm_token_v1'
const RELAY_BASE       = process.env.EXPO_PUBLIC_RELAY_URL ?? 'https://relay.proxim.workers.dev'

export interface FCMRegistration {
  token:     string
  platform:  'ios' | 'android'
  updatedAt: number
}

// ─── Permission ───────────────────────────────────────────────────────────────

/**
 * Request FCM/APNs permission.
 * On Android 13+ this fires the POST_NOTIFICATIONS dialog.
 * On iOS this fires the standard push permission prompt.
 * Returns true if granted.
 */
export async function requestFCMPermission(): Promise<boolean> {
  const authStatus = await messaging().requestPermission({
    alert:         true,
    announcement:  false,
    badge:         true,
    carPlay:       false,
    criticalAlert: false,
    provisional:   false,   // don't use provisional — we want real permission
    sound:         true,
  })

  return (
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL
  )
}

// ─── Token registration ───────────────────────────────────────────────────────

/**
 * Get the current FCM token, requesting one if needed.
 * Rotates the token by re-fetching on every app launch.
 */
export async function getFCMToken(): Promise<string | null> {
  try {
    // iOS: must register for remote notifications first
    if (Platform.OS === 'ios') {
      await messaging().registerDeviceForRemoteMessages()
    }

    const token = await messaging().getToken()
    return token
  } catch (e) {
    console.warn('FCM token fetch failed:', e)
    return null
  }
}

/**
 * Register our FCM token with the relay worker so it can wake us.
 * The token is stored against SHA256(peerIdHash) — double-hashed so
 * the relay can't correlate token → PeerID without the hash.
 *
 * Called on every app start (token rotation) and when token refreshes.
 */
export async function registerTokenWithRelay(
  peerIdHash: string,
  token:      string,
): Promise<boolean> {
  try {
    // Hash the peerIdHash again for the relay's lookup key
    const enc       = new TextEncoder().encode(peerIdHash)
    const hashBuf   = await crypto.subtle.digest('SHA-256', enc)
    const doubleHash = uint8ArrayToHex(new Uint8Array(hashBuf)).slice(0, 32)

    const response = await fetch(`${RELAY_BASE}/register-token`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        tokenHash: doubleHash,
        token,
        platform: Platform.OS,
        ttl:      7 * 24 * 3600,   // 7 days — rotate on next app open
      }),
      signal: AbortSignal.timeout(8_000),
    })

    if (response.ok) {
      // Cache locally so we can deregister on sign-out
      await SecureStore.setItemAsync(KEY_FCM_TOKEN, JSON.stringify({
        token,
        platform:  Platform.OS as 'ios' | 'android',
        updatedAt: Date.now(),
      } satisfies FCMRegistration))
      return true
    }
    return false
  } catch (e) {
    console.warn('FCM token registration failed:', e)
    return false
  }
}

/**
 * Deregister our token from the relay (call on sign-out / data clear).
 */
export async function deregisterTokenFromRelay(peerIdHash: string): Promise<void> {
  try {
    const enc       = new TextEncoder().encode(peerIdHash)
    const hashBuf   = await crypto.subtle.digest('SHA-256', enc)
    const doubleHash = uint8ArrayToHex(new Uint8Array(hashBuf)).slice(0, 32)

    await fetch(`${RELAY_BASE}/register-token/${doubleHash}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(5_000),
    })
    await SecureStore.deleteItemAsync(KEY_FCM_TOKEN)
  } catch {}
}

// ─── Message handler ──────────────────────────────────────────────────────────

export type FCMWakeHandler = () => Promise<void>

/**
 * Set up FCM message handlers for all app states.
 *
 * Foreground:   onMessage fires → we ignore (foreground poller already running)
 * Background:   setBackgroundMessageHandler fires → poll relay → queue items
 * Killed state: notification tap opens app → onNotificationOpenedApp fires
 *
 * The handler NEVER fires local notifications directly from FCM payload —
 * all notification content comes from decrypting relay envelopes locally.
 */
export function setupFCMHandlers(onWake: FCMWakeHandler): () => void {
  // Foreground message (app open)
  const unsubFg = messaging().onMessage(async (remoteMessage) => {
    if (remoteMessage.data?.type === 'relay_wake') {
      // Foreground poller is already running — no action needed
      // But trigger an immediate poll if data signals urgency
      if (remoteMessage.data?.urgent === 'true') {
        await onWake()
      }
    }
  })

  // Background / quit state — this MUST be registered outside of any component
  // It runs in a headless JS context on Android
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    if (remoteMessage.data?.type !== 'relay_wake') return

    // Dynamically import to avoid pulling in React Native modules
    // in the headless background context
    const SecureStore         = await import('expo-secure-store')
    const { openBox }         = await import('./crypto')
    const { hexToUint8Array } = await import('./bytes')
    const { pollRelay }       = await import('./relay-poll')
    const Notifications       = await import('expo-notifications')

    const [xPubHex, xSecHex, peerIdHash] = await Promise.all([
      SecureStore.getItemAsync('proxim_x_public_v1'),
      SecureStore.getItemAsync('proxim_x_secret_v1'),
      SecureStore.getItemAsync('proxim_relay_hash_v1'),
    ])

    if (!xPubHex || !xSecHex || !peerIdHash) return

    const keys = {
      edPublicKey: new Uint8Array(0),
      edSecretKey: new Uint8Array(0),
      xPublicKey:  hexToUint8Array(xPubHex),
      xSecretKey:  hexToUint8Array(xSecHex),
    }

    const items = await pollRelay(peerIdHash, keys)
    if (items.length === 0) return

    // Write to SecureStore queue for app to drain on resume
    const existing  = await SecureStore.getItemAsync('proxim_relay_queue_v1')
    const queue     = existing ? JSON.parse(existing) : []
    queue.push(...items)
    await SecureStore.setItemAsync(
      'proxim_relay_queue_v1',
      JSON.stringify(queue.slice(-50)),
    )

    // Fire local notifications with CONTENT (FCM data payload had none)
    for (const item of items) {
      const { title, body } = notificationContent(item)
      await Notifications.scheduleNotificationAsync({
        content: { title, body, sound: true, badge: 1 },
        trigger: null,
      })
    }
  })

  // App opened from a notification tap (background → foreground)
  const unsubOpened = messaging().onNotificationOpenedApp(async (remoteMessage) => {
    if (remoteMessage.data?.type === 'relay_wake') {
      await onWake()
    }
  })

  return () => {
    unsubFg()
    unsubOpened()
  }
}

/**
 * Check if app was opened from a killed state via notification tap.
 * Call on app mount.
 */
export async function checkInitialNotification(onWake: FCMWakeHandler): Promise<void> {
  const initial = await messaging().getInitialNotification()
  if (initial?.data?.type === 'relay_wake') {
    await onWake()
  }
}

// ─── Token refresh ────────────────────────────────────────────────────────────

/**
 * Listen for FCM token refreshes and re-register automatically.
 * FCM rotates tokens periodically; old tokens stop delivering.
 */
export function setupTokenRefreshListener(peerIdHash: string): () => void {
  return messaging().onTokenRefresh(async (newToken) => {
    await registerTokenWithRelay(peerIdHash, newToken)
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function notificationContent(
  item: import('./relay-poll').RelayItem,
): { title: string; body: string } {
  if ('text' in item) {
    const msg = item as import('./types').ChatMessage
    return {
      title: 'New message',
      body:  msg.text.length > 80 ? msg.text.slice(0, 80) + '…' : msg.text,
    }
  }
  if (item.type === 'photo') {
    return { title: 'New photo', body: 'Tap to view' }
  }
  if (item.type === 'like') {
    return { title: 'Someone nearby liked you', body: 'Open Proxim to find out' }
  }
  if (item.type === 'match') {
    return { title: "It's a match", body: 'You both liked each other nearby' }
  }
  return { title: 'Proxim', body: 'New activity' }
}
