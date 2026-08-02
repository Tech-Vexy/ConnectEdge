// node.ts — libp2p node (v2) — full feature integration
//
// What's new vs MVP:
//   - Signed gossip messages (crypto.ts) — verifiable sender on likes + broadcasts
//   - Box-encrypted chat (crypto.ts)     — E2E on both direct streams and relay
//   - BLE signal strength (ble.ts)       — real RSSI for proximity dimension
//   - Photo protocol (photos.ts)         — encrypted transfer over /connectedge/photo/1.0.0
//   - Relay poller (relay-poll.ts)       — foreground + background envelope delivery

import { createLibp2p }   from 'libp2p'
import { noise }          from '@chainsafe/libp2p-noise'
import { yamux }          from '@chainsafe/libp2p-yamux'
import { webSockets }     from '@libp2p/websockets'
// import { webRTC }         from '@libp2p/webrtc'  // Disabled: requires react-native-webrtc native module
import { gossipsub }      from '@chainsafe/libp2p-gossipsub'
import { identify }       from '@libp2p/identify'
import type { Libp2p }    from 'libp2p'
import type { Stream }    from '@libp2p/interface'

import { scorePeer }                from './matching'
import { createLikeCommitment,
         verifyCommitment,
         buildRevealMessage,
         sha256Hex }                from './commitment'
import { hexToUint8Array,
         uint8ArrayToHex }          from './bytes'
import {
  loadOrCreateKeyPair,
  peerIdFromPublicKey,
  buildSignedBroadcast,
  parseSignedBroadcast,
  buildSignedLikeMessage,
  parseSignedLikeMessage,
  boxEncrypt,
  boxDecrypt,
  sealBox,
  getPeerXPubKey,
  registerPeerXPubKey,
  type KeyPair,
}                                   from './crypto'
import { parseAdBroadcast }          from './ads'
import { getSharedTags }             from './icebreakers'
import {
  loadBadge, verifyBadge,
  badgeToBroadcastFields,
}                                    from './zk-identity'
import { appConfig }                from './config'
import type { HyperswarmEvent }       from './hyperswarm-bridge'
import { safetyRegistry }            from './safety'
import {
  serialisePhotoEnvelope,
  deserialisePhotoEnvelope,
  PROTO_PHOTO,
  type EncryptedPhoto,
}                                   from './photos'
import {
  relayPoller,
  registerBackgroundPoll,
  drainRelayQueue,
  setupNotifications,
}                                   from './relay-poll'
import type {
  UserProfile, PeerBroadcast,
  LikeCommitment, Match, ChatMessage,
}                                   from './types'
import { EVICT_AFTER_MS, LIKE_THRESHOLD } from './types'

const PROTO_CHAT  = '/connectedge/chat/1.0.0'
const PROTO_MATCH = '/connectedge/match/1.0.0'
const TOPIC_PEERS = 'connectedge:peers'
const TOPIC_LIKES = 'connectedge:likes'
const TOPIC_POSTS = 'connectedge:posts'

export type NodeEventMap = {
  'peer:discovered': (peer: PeerBroadcast) => void
  'peer:scored':     (peerId: string, score: number) => void
  'peer:verified':   (peerId: string, institution: string, tier: string) => void
  'peer:evicted':    (peerId: string) => void
  'match:confirmed': (match: Match) => void
  'chat:message':    (msg: ChatMessage) => void
  'photo:received':  (peerId: string, env: EncryptedPhoto) => void
  'ad:received':     (ad: import('./types').AdBroadcast) => void
  'post:received':   (post: import('./types').SocialPost) => void
  'node:ready':      (peerId: string) => void
  'hyperswarm:peer': (peerIdHash: string) => void
}

export class ConnectEdgeNode {
  private node!:      Libp2p
  private profile!:   UserProfile
  private keys!:      KeyPair
  private peers:      Map<string, PeerBroadcast>  = new Map()
  private myLikes:    Map<string, LikeCommitment> = new Map()
  // peerId → { commitHex, xPubKey } — now we know the sender
  private theirLikes: Map<string, { commitHex: string }> = new Map()
  private matches:    Map<string, Match>          = new Map()
  private evictTimer?: ReturnType<typeof setInterval>
  private broadcastTimer?: ReturnType<typeof setTimeout>
  private listeners:  Partial<{ [K in keyof NodeEventMap]: NodeEventMap[K][] }> = {}
  private hyperswarmBridge: any = null
  private connectEdgeBLE: any = null
  private requestBluetoothPermissions: any = null
  private discoveryModulesLoaded = false

  on<K extends keyof NodeEventMap>(event: K, handler: NodeEventMap[K]) {
    if (!this.listeners[event]) this.listeners[event] = []
    ;(this.listeners[event] as NodeEventMap[K][]).push(handler)
  }

  private emit<K extends keyof NodeEventMap>(
    event: K, ...args: Parameters<NodeEventMap[K]>
  ) {
    const hs = this.listeners[event] as ((...a: Parameters<NodeEventMap[K]>) => void)[] | undefined
    hs?.forEach(h => (h as (...a: Parameters<NodeEventMap[K]>) => void)(...args))
  }

  private async ensureDiscoveryModules() {
    if (!this.discoveryModulesLoaded) {
      this.discoveryModulesLoaded = true

      const [hyperswarmModule, bleModule, permissionsModule] = await Promise.allSettled([
        import('./hyperswarm-bridge'),
        import('./ble'),
        import('./permissions'),
      ])

      if (hyperswarmModule.status === 'fulfilled') {
        this.hyperswarmBridge = hyperswarmModule.value.hyperswarmBridge
      }
      if (bleModule.status === 'fulfilled') {
        this.connectEdgeBLE = bleModule.value.connectEdgeBLE
      }
      if (permissionsModule.status === 'fulfilled') {
        this.requestBluetoothPermissions = permissionsModule.value.requestBluetoothPermissions
      }
    }

    return {
      hyperswarmBridge: this.hyperswarmBridge,
      connectEdgeBLE: this.connectEdgeBLE,
      requestBluetoothPermissions: this.requestBluetoothPermissions,
    }
  }

  // ─── Start ────────────────────────────────────────────────────────────────

  async start(profile: UserProfile) {
    this.profile = profile

    // 0. Load safety registry FIRST — before any peer processing begins
    await safetyRegistry.load()

    // 1. Load / generate cryptographic identity
    this.keys = await loadOrCreateKeyPair()
    const derivedPeerId = peerIdFromPublicKey(this.keys.edPublicKey)
    this.profile = { ...profile, peerId: derivedPeerId }

    if (appConfig.relay.enabled) {
      const notifGranted = await setupNotifications()
      if (notifGranted) {
        const peerIdHash = uint8ArrayToHex(this.keys.xPublicKey).slice(0, 32)
        await registerBackgroundPoll(peerIdHash)
      }
    }

    const {
      connectEdgeBLE,
      requestBluetoothPermissions,
    } = await this.ensureDiscoveryModules()

    if (appConfig.relay.enabled) {
      await this.drainQueue()
    }

    // 4. Init libp2p (WebSocket only - WebRTC disabled until react-native-webrtc is configured)
    this.node = await createLibp2p({
      addresses: { listen: ['/ip4/0.0.0.0/tcp/0/ws'] },
      transports:          [webSockets()],
      connectionEncryption:[noise()],
      streamMuxers:        [yamux()],
      services: {
        pubsub:   gossipsub({ allowPublishToZeroTopicPeers: true }),
        identify: identify(),
      },
    })

    await this.node.start()
    this.emit('node:ready', this.profile.peerId)

    // 5. Subscribe gossipsub topics
    const pubsub = this.node.services.pubsub as import('@chainsafe/libp2p-gossipsub').GossipSub
    pubsub.subscribe(TOPIC_PEERS)
    pubsub.subscribe(TOPIC_LIKES)
    pubsub.subscribe(TOPIC_POSTS)
    pubsub.subscribe('connectedge:ads')
    pubsub.addEventListener('message', (event: { detail: { topic: string; data: Uint8Array } }) => {
      const { topic, data } = event.detail
      if (topic === TOPIC_PEERS)      this.handlePeerBroadcast(data)
      if (topic === TOPIC_LIKES)      this.handleLikeMessage(data)
      if (topic === TOPIC_POSTS)      this.handlePostMessage(data)
      if (topic === 'connectedge:ads') this.handleAdBroadcast(data)
    })

    // 6. Protocol handlers
    await this.node.handle(PROTO_MATCH, ({ stream }) => this.handleMatchStream(stream))
    await this.node.handle(PROTO_CHAT,  ({ stream }) => this.handleChatStream(stream))
    await this.node.handle(PROTO_PHOTO, ({ stream }) => this.handlePhotoStream(stream))

    // 7. BLE — request permissions first, then scan AND advertise
    const blePermission = requestBluetoothPermissions
      ? await requestBluetoothPermissions()
      : 'unavailable'
    const bleOk = !!connectEdgeBLE && blePermission === 'granted'
      ? await connectEdgeBLE.init(this.profile.peerId)
      : false
    if (bleOk && connectEdgeBLE) {
      await Promise.all([
        connectEdgeBLE.startScanning(),
        connectEdgeBLE.startAdvertising(),
      ])
      connectEdgeBLE.onPeerDiscovered(async () => {
        for (const [peerId] of this.peers) {
          const strength = await connectEdgeBLE.getSignalStrength(peerId)
          const peer = this.peers.get(peerId)
          if (peer) peer.signalStrength = strength
        }
      })
    }

    // 8. Start broadcasting + eviction (adaptive interval: 15–45s based on peer density)
    this.broadcastProfile()
    this.scheduleAdaptiveBroadcast()
    this.evictTimer = setInterval(() => {
      this.evictStalePeers()
      connectEdgeBLE?.evictStale()
    }, 10_000)

    if (appConfig.relay.enabled) {
      const peerIdHash = uint8ArrayToHex(this.keys.xPublicKey).slice(0, 32)
      relayPoller.start(peerIdHash, this.keys, items => {
        for (const item of items) {
          if ('text' in item) {
            this.emit('chat:message', item as ChatMessage)
          } else if (item.type === 'photo') {
            this.emit('photo:received', item.envelope.senderPeerId, item.envelope)
          }
        }
      })
    }
  }

  async stop() {
    clearInterval(this.evictTimer)
    clearTimeout(this.broadcastTimer)
    relayPoller.stop()
    await this.connectEdgeBLE?.stopAll()
    await this.node?.stop()
  }

  // ─── Profile broadcast ────────────────────────────────────────────────────

  private async broadcastProfile() {
    const badge = appConfig.verify.enabled ? await loadBadge() : null

    const broadcast: PeerBroadcast = {
      peerId:       this.profile.peerId,
      displayName:  this.profile.displayName,
      age:          this.profile.age,
      intentScore:  quantise(this.profile.prefs.intentScore),
      interestTags: this.profile.prefs.interestTags.slice(0, 5),
      valuesScore:  quantise(this.profile.prefs.valuesScore),
      activityLevel:       quantise(this.profile.prefs.activityLevel),
      communicationStyle:  quantise(this.profile.prefs.communicationStyle),
      socialPreference:    quantise(this.profile.prefs.socialPreference),
      seenAt:       Date.now(),
      // Embed verification badge if present
      ...(badge ? badgeToBroadcastFields(badge) : {}),
    }

    const signed = await buildSignedBroadcast(
      JSON.stringify(broadcast),
      this.keys,
    )

    const pubsub = this.node.services.pubsub as import('@chainsafe/libp2p-gossipsub').GossipSub
    await pubsub.publish(TOPIC_PEERS, signed)
  }

  // ─── Incoming peer broadcast ──────────────────────────────────────────────

  /**
   * Adaptive broadcast interval: more peers → slower broadcast to avoid mesh flood.
   * 0–2 peers  → 15s  (aggressive discovery)
   * 3–10 peers → 30s  (balanced)
   * 11+ peers  → 45s  (conservative, dense environment)
   */
  private scheduleAdaptiveBroadcast() {
    const peerCount = this.peers.size
    const interval  = peerCount <= 2 ? 15_000
                    : peerCount <= 10 ? 30_000
                    : 45_000
    this.broadcastTimer = setTimeout(() => {
      this.broadcastProfile()
      this.scheduleAdaptiveBroadcast()
    }, interval)
  }

  private async handlePeerBroadcast(data: Uint8Array) {
    const parsed = await parseSignedBroadcast(data)
    if (!parsed) return

    const peer = parsed as unknown as PeerBroadcast
    if (peer.peerId === this.profile.peerId) return

    // ── Node-level safety gate ──────────────────────────────────────────────
    const safetyLevel = safetyRegistry.level(peer.peerId)
    if (safetyLevel === 'blocked') return  // silent drop — don't even score

    const bleStrength = this.connectEdgeBLE
      ? await this.connectEdgeBLE.getSignalStrength(peer.peerId)
      : 0.5
    peer.signalStrength = bleStrength
    peer.seenAt = Date.now()

    this.peers.set(peer.peerId, peer)
    this.emit('peer:discovered', peer)

    // Verify badge asynchronously — don't block scoring
    if (peer.verified && peer.badgeSig && peer.institution && peer.verifiedTier) {
      verifyBadge({
        institution:  peer.institution,
        domain:       peer.institution, // resolved from sig verification
        tier:         peer.verifiedTier as any,
        nullifierHash: '',
        issuedAt:     0,
        expiresAt:    peer.badgeExpiry ?? 0,
        workerSigHex: peer.badgeSig,
      }).then(valid => {
        if (valid) this.emit('peer:verified', peer.peerId, peer.institution!, peer.verifiedTier!)
      })
    }

    const result = scorePeer(this.profile, peer)

    // Dismissed peers: cap score below like threshold permanently
    const effectiveScore = safetyLevel === 'dismissed'
      ? Math.min(result.score, LIKE_THRESHOLD - 1)
      : result.score

    this.emit('peer:scored', peer.peerId, effectiveScore)

    // Never like a dismissed or blocked peer
    if (safetyLevel === 'clear' && result.passesGate && !this.myLikes.has(peer.peerId)) {
      await this.publishLike(peer.peerId, result.score)
    }
  }

  // ─── Signed like ──────────────────────────────────────────────────────────

  private async publishLike(toPeerId: string, score: number) {
    const commitment = await createLikeCommitment(
      this.profile.peerId, toPeerId, score,
    )
    this.myLikes.set(toPeerId, commitment)

    // Now signed — recipient can attribute this like to our PeerID
    const signedMsg = await buildSignedLikeMessage(
      commitment.commitHex, toPeerId, this.keys,
    )

    const pubsub = this.node.services.pubsub as import('@chainsafe/libp2p-gossipsub').GossipSub
    await pubsub.publish(TOPIC_LIKES, signedMsg)
  }

  private async handleLikeMessage(data: Uint8Array) {
    const parsed = await parseSignedLikeMessage(data)
    if (!parsed) return
    if (parsed.toPeerId !== this.profile.peerId) return

    // ── Drop likes from blocked or dismissed peers ──────────────────────────
    // Dismissed: they can like, but we never match — their like is recorded
    // nowhere, so they get no signal that we're there. Pure silence.
    if (safetyRegistry.isBlocked(parsed.fromPeerId)) return

    // For dismissed peers: don't store their like, don't match
    if (safetyRegistry.isDismissed(parsed.fromPeerId)) return

    this.theirLikes.set(parsed.fromPeerId, { commitHex: parsed.commitHex })

    if (this.myLikes.has(parsed.fromPeerId) && !this.matches.has(parsed.fromPeerId)) {
      const myLike = this.myLikes.get(parsed.fromPeerId)!
      await this.openMatchStream(parsed.fromPeerId, myLike)
    }
  }

  // ─── Match handshake ──────────────────────────────────────────────────────

  private async openMatchStream(peerId: string, myLike: LikeCommitment) {
    try {
      const connections = this.node.getConnections()
      const connection  = connections.find(c =>
        c.remotePeer.toString() === peerId
      )
      if (!connection) return

      const stream  = await connection.newStream(PROTO_MATCH)
      const reveal  = buildRevealMessage(myLike.nonce, myLike.commitHex)
      await writeToStream(stream, reveal)
      const theirReveal = await readFromStream(stream)
      await this.processMatchReveal(peerId, theirReveal)
    } catch (e) {
      console.warn('Match stream error:', e)
    }
  }

  private async handleMatchStream(stream: Stream) {
    try {
      const data = await readFromStream(stream)
      const msg: { type: string; nonce: string; commitHex: string } =
        JSON.parse(new TextDecoder().decode(data))
      if (msg.type !== 'reveal') return

      const peerId = (stream as { stat?: { remotePeer?: { toString(): string } } }).stat?.remotePeer?.toString()
        ?? (stream as { metadata?: { connection?: { remotePeer?: { toString(): string } } } }).metadata?.connection?.remotePeer?.toString()
      if (!peerId) return

      // ── Block check on incoming match stream ──────────────────────────────
      if (safetyRegistry.isBlocked(peerId) || safetyRegistry.isDismissed(peerId)) {
        stream.abort(new Error('blocked'))
        return
      }

      const nonce = hexToUint8Array(msg.nonce)
      const valid = await verifyCommitment(peerId, this.profile.peerId, nonce, msg.commitHex)
      if (!valid) return

      const myLike = this.myLikes.get(peerId)
      if (!myLike) return

      const ourReveal = buildRevealMessage(myLike.nonce, myLike.commitHex)
      await writeToStream(stream, ourReveal)
      this.confirmMatch(peerId)
    } catch (e) {
      console.warn('Match handler error:', e)
    }
  }

  private async processMatchReveal(peerId: string, data: Uint8Array) {
    const msg: { type: string; nonce: string; commitHex: string } =
      JSON.parse(new TextDecoder().decode(data))
    const nonce = hexToUint8Array(msg.nonce)
    const valid = await verifyCommitment(peerId, this.profile.peerId, nonce, msg.commitHex)
    if (valid) this.confirmMatch(peerId)
  }

  private handleAdBroadcast(data: Uint8Array) {
    const ad = parseAdBroadcast(data)
    if (ad) this.emit('ad:received', ad)
  }

  private handlePostMessage(data: Uint8Array) {
    try {
      const post = JSON.parse(new TextDecoder().decode(data)) as import('./types').SocialPost
      if (post && post.id && !safetyRegistry.isBlocked(post.authorPeerId)) {
        this.emit('post:received', post)
      }
    } catch (e) {
      console.warn('Failed to parse incoming social post:', e)
    }
  }

  async publishPost(post: import('./types').SocialPost) {
    if (!this.node) return
    const pubsub = this.node.services.pubsub as import('@chainsafe/libp2p-gossipsub').GossipSub
    const payload = new TextEncoder().encode(JSON.stringify(post))
    await pubsub.publish(TOPIC_POSTS, payload)
  }

  private confirmMatch(peerId: string) {
    if (this.matches.has(peerId)) return
    const peer = this.peers.get(peerId)
    if (!peer) return

    const sharedTags = this.profile
      ? getSharedTags(this.profile.prefs.interestTags, peer.interestTags)
      : []

    const match: Match = {
      peerId,
      displayName:        peer.displayName,
      matchedAt:          Date.now(),
      photoUri:            this.profile?.photoUri,
      sharedTags,
      compatibilityScore: this.myLikes.get(peerId)?.score ?? 0,
    }
    this.matches.set(peerId, match)
    this.emit('match:confirmed', match)
  }

  // ─── Chat — box-encrypted ─────────────────────────────────────────────────

  /** Find an existing libp2p connection to a peer by their string PeerID */
  private findConnection(peerId: string) {
    return this.node.getConnections().find(c =>
      c.remotePeer.toString() === peerId
    )
  }

  async sendMessage(toPeerId: string, text: string): Promise<ChatMessage> {
    const msg: ChatMessage = {
      id:   (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) ? globalThis.crypto.randomUUID() : Math.random().toString(36).slice(2),
      from: this.profile.peerId,
      text,
      ts:   Date.now(),
    }

    const recipientXPub = getPeerXPubKey(toPeerId)
    const plaintext     = new TextEncoder().encode(
      JSON.stringify({ type: 'chat', payload: msg })
    )

    if (this.peers.has(toPeerId) && recipientXPub) {
      // Direct stream — authenticated box (sender + recipient keys)
      const { ciphertext, nonce } = await boxEncrypt(
        plaintext, recipientXPub, this.keys.xSecretKey,
      )
      await this.sendDirectEncrypted(toPeerId, ciphertext, nonce)
        .catch(() => this.sendViaRelay(toPeerId, plaintext, recipientXPub))
    } else if (recipientXPub) {
      // Offline — sealed box to relay
      await this.sendViaRelay(toPeerId, plaintext, recipientXPub)
    }

    return msg
  }

  private async sendDirectEncrypted(
    toPeerId:   string,
    ciphertext: Uint8Array,
    nonce:      Uint8Array,
  ) {
    const connection = this.findConnection(toPeerId)
    if (!connection) throw new Error('No connection')
    const stream  = await connection.newStream(PROTO_CHAT)
    const payload = new TextEncoder().encode(JSON.stringify({
      ciphertext: uint8ArrayToHex(ciphertext),
      nonce:      uint8ArrayToHex(nonce),
      from:       this.profile.peerId,
      xPubKey:    uint8ArrayToHex(this.keys.xPublicKey),
    }))
    await writeToStream(stream, payload)
  }

  private async sendViaRelay(
    toPeerId:    string,
    plaintext:   Uint8Array,
    recipientXPub: Uint8Array,
  ) {
    if (!appConfig.relay.enabled) return

    // Seal the box — anonymous sender, only recipient can open
    const sealed = await sealBox(plaintext, recipientXPub)

    await fetch(`${appConfig.relay.baseUrl}/envelope`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        to:      toPeerId,
        payload: uint8ArrayToHex(sealed),
        ttl:     86400,
      }),
    })
  }

  private async handleChatStream(stream: Stream) {
    try {
      const data = await readFromStream(stream)
      const env: {
        ciphertext: string; nonce: string; from: string; xPubKey: string
      } = JSON.parse(new TextDecoder().decode(data))

      // ── Block check on incoming chat ──────────────────────────────────────
      if (safetyRegistry.isBlocked(env.from)) {
        stream.abort(new Error('blocked'))
        return
      }

      // Register sender's X25519 key (if new)
      registerPeerXPubKey(env.from, env.xPubKey)

      // Decrypt with authenticated box
      const senderXPub = hexToUint8Array(env.xPubKey)
      const plaintext  = await boxDecrypt(
        hexToUint8Array(env.ciphertext),
        hexToUint8Array(env.nonce),
        senderXPub,
        this.keys.xSecretKey,
      )
      if (!plaintext) return

      const inner = JSON.parse(new TextDecoder().decode(plaintext))
      if (inner.type === 'chat') {
        this.emit('chat:message', inner.payload as ChatMessage)
      }
    } catch (e) {
      console.warn('Chat stream error:', e)
    }
  }

  // ─── Photo protocol ───────────────────────────────────────────────────────

  async sendPhoto(toPeerId: string, encrypted: EncryptedPhoto) {
    const recipientXPub = getPeerXPubKey(toPeerId)
    if (!recipientXPub) throw new Error('Recipient key not known')

    const payload   = serialisePhotoEnvelope(encrypted)
    const isOnline  = this.peers.has(toPeerId)

    if (isOnline) {
      try {
      const connection = this.findConnection(toPeerId)
      if (!connection) throw new Error('no conn')
        const stream = await connection.newStream(PROTO_PHOTO)
        await writeToStream(stream, payload)
        return
      } catch {}
    }

    // Relay fallback — wrap in an outer sealed envelope
    const outerPayload = new TextEncoder().encode(
      JSON.stringify({ type: 'photo', payload: encrypted })
    )
    await this.sendViaRelay(toPeerId, outerPayload, recipientXPub)
  }

  private async handlePhotoStream(stream: Stream) {
    try {
      const data      = await readFromStream(stream)
      const envelope  = deserialisePhotoEnvelope(data)
      const peerId    = envelope.senderPeerId

      // ── Block check on incoming photo ─────────────────────────────────────
      if (safetyRegistry.isBlocked(peerId)) {
        stream.abort(new Error('blocked'))
        return
      }

      this.emit('photo:received', peerId, envelope)
    } catch (e) {
      console.warn('Photo stream error:', e)
    }
  }

  // ─── Relay queue drain ────────────────────────────────────────────────────

  private async drainQueue() {
    const items = await drainRelayQueue()
    for (const item of items) {
      if ('text' in item) {
        this.emit('chat:message', item as ChatMessage)
      } else if (item.type === 'photo') {
        this.emit('photo:received', item.envelope.senderPeerId, item.envelope)
      }
    }
  }

  // ─── LRU eviction ─────────────────────────────────────────────────────────

  private evictStalePeers() {
    const now = Date.now()
    for (const [peerId, peer] of this.peers) {
      if (now - peer.seenAt > EVICT_AFTER_MS) {
        this.peers.delete(peerId)
        this.myLikes.delete(peerId)
        this.emit('peer:evicted', peerId)
      }
    }
  }

  // ─── Hyperswarm bridge — opt-in global discovery beyond LAN/BLE range ────────
  //
  // Not started automatically. Call explicitly after consent (uses coarse
  // location to derive a swarm topic). Runs in a Bare worklet thread so
  // discovery continues when the app is backgrounded — unlike BackgroundFetch.
  //
  // Discovered peers are correlated by peerIdHash only. The actual profile
  // exchange still happens over the existing libp2p/gossipsub channel once
  // both peers are in range of each other through whatever transport works.

  private hyperswarmActive = false

  async enableHyperswarmDiscovery(): Promise<boolean> {
    if (this.hyperswarmActive) return true

    const { hyperswarmBridge } = await this.ensureDiscoveryModules()
    if (!hyperswarmBridge) return false

    const started = await hyperswarmBridge.start(this.profile.peerId)
    if (!started) return false

    hyperswarmBridge.on(this.handleHyperswarmEvent)
    this.hyperswarmActive = true
    return true
  }

  async disableHyperswarmDiscovery(): Promise<void> {
    if (!this.hyperswarmActive) return
    const { hyperswarmBridge } = await this.ensureDiscoveryModules()
    if (!hyperswarmBridge) return
    hyperswarmBridge.off(this.handleHyperswarmEvent)
    await hyperswarmBridge.stop()
    this.hyperswarmActive = false
  }

  get hyperswarmEnabled() { return this.hyperswarmActive }

  private handleHyperswarmEvent = (event: HyperswarmEvent) => {
    if (event.type === 'peer:hello') {
      // We only learn a hashed PeerID over Hyperswarm — not enough to
      // build a full PeerBroadcast. This signals "someone is nearby on
      // a different network" so the UI can show a soft "X people nearby
      // via extended range" hint, prompting the user to keep the app open
      // for full gossipsub/BLE profile exchange.
      this.emit('hyperswarm:peer', event.peerIdHash)
    }
  }

  // ─── Safety controls (called by store on user action) ─────────────────────

  async blockPeer(peerId: string): Promise<void> {
    await safetyRegistry.block(peerId)
    // Immediately close any open streams from this peer
    this.closePeerStreams(peerId)
    // Clear local like state — if they re-appear after unblock, we start fresh
    this.myLikes.delete(peerId)
    this.theirLikes.delete(peerId)
    this.matches.delete(peerId)
    this.peers.delete(peerId)
  }

  async unblockPeer(peerId: string): Promise<void> {
    await safetyRegistry.unblock(peerId)
    // Don't restore like state — fresh session only
  }

  async dismissPeer(peerId: string): Promise<void> {
    await safetyRegistry.dismiss(peerId)
    // Clear like state — dismissed means "never match"
    this.myLikes.delete(peerId)
    this.theirLikes.delete(peerId)
    this.peers.delete(peerId)
  }

  async reportPeer(
    peerId:   string,
    category: import('./safety').ReportCategory,
    note:     string,
  ): Promise<void> {
    await safetyRegistry.report(peerId, category, note)
    // Report implies block — run the same cleanup
    await this.blockPeer(peerId)
  }

  private closePeerStreams(peerId: string) {
    try {
      const connections = this.node.getConnections().filter(c =>
        c.remotePeer.toString() === peerId
      )
      for (const conn of connections) {
        conn.close().catch(() => {})
      }
    } catch {}
  }

  getSafetyLevel(peerId: string) {
    return safetyRegistry.level(peerId)
  }

  // ─── Public accessors ─────────────────────────────────────────────────────
  get peerId()   { return this.profile?.peerId ?? '' }
  get peerList() { return new Map(this.peers) }
  get matchList(){ return new Map(this.matches) }
  get keyPair()  { return this.keys }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function writeToStream(stream: Stream, data: Uint8Array) {
  await stream.sink([data])
}

async function readFromStream(stream: Stream): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  for await (const chunk of stream.source) chunks.push(chunk.subarray())
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) { out.set(c, off); off += c.length }
  return out
}

function quantise(v: number): number {
  return Math.round(v * 4) / 4
}

export const connectEdgeNode = new ConnectEdgeNode()
