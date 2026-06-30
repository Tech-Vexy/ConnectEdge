// relay-poll.ts — relay polling, FCM integration, background delivery
//
// Delivery modes (in priority order):
//   1. FCM push → device wakes → app polls → local notification  (best, instant)
//   2. Foreground poller every 30s (app open, no FCM needed)
//   3. BackgroundFetch every ~15min (fallback if FCM fails)
//
// RelayItem is the union type for everything the relay can deliver.
// FCM carries NO content — only a data-only wake signal.
// All notification content is generated locally after decryption.

import * as BackgroundFetch from 'expo-background-fetch'
import * as TaskManager     from 'expo-task-manager'
import * as Notifications   from 'expo-notifications'
import * as SecureStore     from 'expo-secure-store'
import { openBox }          from './crypto'
import type { KeyPair }     from './crypto'
import { hexToUint8Array }  from './bytes'
import type { ChatMessage, RelayLikeItem, RelayMatchItem, RelayItemType } from './types'
import type { EncryptedPhoto } from './photos'

export type RelayItem =
  | ChatMessage
  | { type: 'photo';  envelope: EncryptedPhoto }
  | RelayLikeItem
  | RelayMatchItem

const TASK_NAME        = 'proxim-relay-poll'
const RELAY_BASE_URL   = process.env.EXPO_PUBLIC_RELAY_URL ?? 'https://relay.proxim.workers.dev'
const POLL_INTERVAL_MS = 30_000
const KEY_PEER_ID_HASH = 'proxim_relay_hash_v1'
const KEY_QUEUE        = 'proxim_relay_queue_v1'

// ─── Notifications ────────────────────────────────────────────────────────────

export async function setupNotifications(): Promise<boolean> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge:  true,
    }),
  })

  // Configure notification categories for actionable notifications
  await Notifications.setNotificationCategoryAsync('MESSAGE', [
    {
      identifier: 'REPLY',
      buttonTitle: 'Reply',
      options: { opensAppToForeground: true },
    },
  ])

  await Notifications.setNotificationCategoryAsync('MATCH', [
    {
      identifier: 'VIEW',
      buttonTitle: 'View Match',
      options: { opensAppToForeground: true },
    },
  ])

  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert:       true,
      allowBadge:       true,
      allowSound:       true,
      allowProvisional: true,
    },
  })
  return status === 'granted'
}

export function fireLocalNotification(item: RelayItem): Promise<string> {
  const content = notificationContentForItem(item)
  return Notifications.scheduleNotificationAsync({
    content: {
      ...content,
      sound:  true,
      badge:  1,
      data:   { type: 'type' in item ? item.type : 'chat' },
    },
    trigger: null,
  })
}

function notificationContentForItem(item: RelayItem): {
  title: string; body: string; categoryIdentifier?: string
} {
  if ('text' in item) {
    const msg = item as ChatMessage
    return {
      title:              'New message',
      body:               msg.text.length > 80 ? msg.text.slice(0, 80) + '…' : msg.text,
      categoryIdentifier: 'MESSAGE',
    }
  }
  switch (item.type) {
    case 'photo':
      return { title: 'New photo', body: 'Tap to view' }
    case 'like':
      return {
        title:              'Someone nearby liked you',
        body:               'Open Proxim to find out who',
        categoryIdentifier: 'MATCH',
      }
    case 'match':
      return {
        title:              "It's a match! 🎉",
        body:               `You and ${(item as RelayMatchItem).displayName} liked each other`,
        categoryIdentifier: 'MATCH',
      }
    default:
      return { title: 'Proxim', body: 'New activity' }
  }
}

// ─── Relay polling ────────────────────────────────────────────────────────────

export async function pollRelay(
  peerIdHash: string,
  myKeys:     KeyPair,
): Promise<RelayItem[]> {
  const results: RelayItem[] = []

  let response: Response
  try {
    response = await fetch(`${RELAY_BASE_URL}/envelope/${peerIdHash}`, {
      signal: AbortSignal.timeout(8_000),
    })
  } catch {
    return results
  }

  if (!response.ok) return results

  const { envelopes } = await response.json() as {
    envelopes: Array<{ id: string; payload: string; hint?: string }>
  }

  for (const env of envelopes) {
    try {
      // hint is an unencrypted type signal the worker adds (no content)
      // It lets the background handler know what kind of notification to show
      // without decrypting — used only if decryption fails in headless context
      const hint = env.hint as RelayItemType | undefined

      const ciphertext = hexToUint8Array(env.payload)
      const plaintext  = await openBox(ciphertext, myKeys.xPublicKey, myKeys.xSecretKey)

      if (!plaintext) {
        // Decryption failed — use hint to fire a generic notification
        if (hint) results.push(hintToItem(hint))
        continue
      }

      const decoded = new TextDecoder().decode(plaintext)
      const parsed  = JSON.parse(decoded) as { type: string; payload: unknown }

      switch (parsed.type) {
        case 'chat':
          results.push(parsed.payload as ChatMessage)
          break
        case 'photo':
          results.push({ type: 'photo', envelope: parsed.payload as EncryptedPhoto })
          break
        case 'like':
          results.push(parsed.payload as RelayLikeItem)
          break
        case 'match':
          results.push(parsed.payload as RelayMatchItem)
          break
      }

      // Delete from relay after successful read
      fetch(`${RELAY_BASE_URL}/envelope/${peerIdHash}/${env.id}`, {
        method: 'DELETE',
      }).catch(() => {})

    } catch (e) {
      console.warn('Relay envelope error:', e)
    }
  }

  return results
}

function hintToItem(hint: string): RelayItem {
  if (hint === 'like')  return { type: 'like',  fromPeerId: '', ts: Date.now() }
  if (hint === 'match') return { type: 'match', withPeerId: '', displayName: 'Someone', ts: Date.now() }
  // Default: opaque chat notification
  return { id: '', from: '', text: 'New message', ts: Date.now() } as ChatMessage
}

// ─── Queue (shared between background task + FCM handler) ─────────────────────

export async function enqueueItems(items: RelayItem[]): Promise<void> {
  if (items.length === 0) return
  const raw   = await SecureStore.getItemAsync(KEY_QUEUE)
  const queue = raw ? JSON.parse(raw) : []
  queue.push(...items)
  await SecureStore.setItemAsync(KEY_QUEUE, JSON.stringify(queue.slice(-50)))
}

export async function drainRelayQueue(): Promise<RelayItem[]> {
  const raw = await SecureStore.getItemAsync(KEY_QUEUE)
  if (!raw) return []
  await SecureStore.deleteItemAsync(KEY_QUEUE)
  return JSON.parse(raw)
}

// ─── Foreground poller ────────────────────────────────────────────────────────

export class RelayPoller {
  private timer?:      ReturnType<typeof setInterval>
  private peerIdHash:  string = ''
  private keys?:       KeyPair
  private onItems?:    (items: RelayItem[]) => void
  private isActive     = false

  start(
    peerIdHash: string,
    keys:       KeyPair,
    onItems:    (items: RelayItem[]) => void,
  ) {
    this.peerIdHash = peerIdHash
    this.keys       = keys
    this.onItems    = onItems
    this.isActive   = true
    this.poll()
    this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS)
  }

  stop() {
    clearInterval(this.timer)
    this.isActive = false
  }

  async pollNow() {
    await this.poll()
  }

  private async poll() {
    if (!this.isActive || !this.keys) return
    const items = await pollRelay(this.peerIdHash, this.keys)
    if (items.length > 0) this.onItems?.(items)
  }
}

// ─── Background fetch task (fallback) ─────────────────────────────────────────

TaskManager.defineTask(TASK_NAME, async () => {
  try {
    const [xPubHex, xSecHex, peerIdHash] = await Promise.all([
      SecureStore.getItemAsync('proxim_x_public_v1'),
      SecureStore.getItemAsync('proxim_x_secret_v1'),
      SecureStore.getItemAsync(KEY_PEER_ID_HASH),
    ])

    if (!xPubHex || !xSecHex || !peerIdHash) {
      return BackgroundFetch.BackgroundFetchResult.NoData
    }

    const keys: KeyPair = {
      edPublicKey: new Uint8Array(0),
      edSecretKey: new Uint8Array(0),
      xPublicKey:  hexToUint8Array(xPubHex),
      xSecretKey:  hexToUint8Array(xSecHex),
    }

    const items = await pollRelay(peerIdHash, keys)
    if (items.length === 0) return BackgroundFetch.BackgroundFetchResult.NoData

    await enqueueItems(items)
    await Promise.all(items.map(item => fireLocalNotification(item)))

    return BackgroundFetch.BackgroundFetchResult.NewData
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed
  }
})

export async function registerBackgroundPoll(peerIdHash: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_PEER_ID_HASH, peerIdHash)

  const isRegistered = await TaskManager.isTaskRegisteredAsync(TASK_NAME)
  if (isRegistered) return

  await BackgroundFetch.registerTaskAsync(TASK_NAME, {
    minimumInterval: 15 * 60,
    stopOnTerminate: false,
    startOnBoot:     true,
  })
}

export async function unregisterBackgroundPoll(): Promise<void> {
  try { await BackgroundFetch.unregisterTaskAsync(TASK_NAME) } catch {}
}

export const relayPoller = new RelayPoller()
