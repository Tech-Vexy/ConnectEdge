// store.ts — global state (v3)
import { create }       from 'zustand'
import * as SecureStore from 'expo-secure-store'
import { AppState, type AppStateStatus } from 'react-native'
import type { UserProfile, PeerBroadcast, Match, ChatMessage, AdBroadcast, SocialMode, SocialPost, SocialHub, SocialEvent } from '../lib/types'
import { DEMO_POSTS, DEMO_HUBS, DEMO_EVENTS, createSocialPost } from '../lib/social'
import type { EncryptedPhoto }   from '../lib/photos'
import type { ReportCategory }   from '../lib/safety'
import type { VerificationBadge } from '../lib/zk-identity'
import { safetyRegistry }        from '../lib/safety'

let nodeModulePromise: Promise<typeof import('../lib/node')> | null = null
let appStateSubscription: { remove: () => void } | null = null

async function getNodeModule() {
  nodeModulePromise ??= import('../lib/node')
  return nodeModulePromise
}

const PROFILE_KEY = 'connectedge_profile_v1'

interface AppStore {
  profile:       UserProfile | null
  isOnboarded:   boolean
  setProfile:    (p: UserProfile) => Promise<void>
  loadProfile:   () => Promise<void>
  updateProfile: (partial: Partial<UserProfile>) => Promise<void>

  // Social Mode & Platform state
  activeSocialMode: SocialMode
  setSocialMode:    (mode: SocialMode) => void
  statusMessage:    string
  setStatusMessage: (msg: string) => Promise<void>

  posts:       Map<string, SocialPost>
  addPost:     (post: SocialPost) => void
  createPost:  (content: string, tags?: string[], mode?: SocialMode, hubId?: string, photoUri?: string) => Promise<void>
  likePost:    (postId: string) => void

  hubs:          Map<string, SocialHub>
  toggleJoinHub: (hubId: string) => void

  events:          Map<string, SocialEvent>
  toggleRSVPEvent: (eventId: string) => void
  createEvent:     (title: string, description: string, location: string, dateStr: string, category: string) => void

  nodeReady:  boolean
  myPeerId:   string
  startNode:  () => Promise<void>
  stopNode:   () => Promise<void>

  // My verification badge
  myBadge:        VerificationBadge | null
  loadMyBadge:    () => Promise<void>
  setMyBadge:     (badge: VerificationBadge | null) => void

  // Verified peer registry — peerId → { institution, tier }
  verifiedPeers:  Map<string, { institution: string; tier: string }>
  setPeerVerified:(peerId: string, institution: string, tier: string) => void

  peers:    Map<string, PeerBroadcast>
  scores:   Map<string, number>
  addPeer:  (peer: PeerBroadcast) => void
  setScore: (peerId: string, score: number) => void
  dropPeer: (peerId: string) => void

  ads:       Map<string, AdBroadcast>
  addAd:     (ad: AdBroadcast) => void

  blockPeer:    (peerId: string) => Promise<void>
  unblockPeer:  (peerId: string) => Promise<void>
  dismissPeer:  (peerId: string) => Promise<void>
  reportPeer:   (peerId: string, category: ReportCategory, note: string) => Promise<void>
  isBlocked:    (peerId: string) => boolean
  isDismissed:  (peerId: string) => boolean

  matches:            Map<string, Match>
  addMatch:           (match: Match) => void
  removeMatch:        (peerId: string) => void
  unreadMatches:      number
  clearUnread:        () => void
  pendingCompatMatch: Match | null
  clearPendingMatch:  () => void

  messages:    Map<string, ChatMessage[]>
  addMessage:  (peerId: string, msg: ChatMessage) => void
  sendMessage: (toPeerId: string, text: string) => Promise<void>
  activeChat:  string | null
  openChat:    (peerId: string) => void
  closeChat:   () => void

  photos:    Map<string, Array<{ uri: string; ts: number }>>
  addPhoto:  (peerId: string, envelope: EncryptedPhoto) => Promise<void>
  sendPhoto: (toPeerId: string, source?: 'library' | 'camera') => Promise<void>

  handleAppForeground: () => Promise<void>
}
export const useStore = create<AppStore>((set, get) => ({
  // ── Profile ────────────────────────────────────────────────────────────────
  profile: null, isOnboarded: false,

  setProfile: async (profile) => {
    await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(profile))
    set({ profile, isOnboarded: true, activeSocialMode: profile.activeMode ?? 'all', statusMessage: profile.statusMessage ?? '' })
  },
  loadProfile: async () => {
    try {
      const raw = await SecureStore.getItemAsync(PROFILE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        set({
          profile: parsed,
          isOnboarded: true,
          activeSocialMode: parsed.activeMode ?? 'all',
          statusMessage: parsed.statusMessage ?? '',
        })
      }
    } catch (e) {
      console.warn('Failed to load profile from SecureStore:', e)
    }
  },
  updateProfile: async (partial) => {
    const current = get().profile
    if (!current) return
    const updated = { ...current, ...partial }
    await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(updated))
    set({ profile: updated })
  },

  // ── Social Mode & Feed State ────────────────────────────────────────────────
  activeSocialMode: 'all',
  setSocialMode: (mode) => set({ activeSocialMode: mode }),
  statusMessage: '',
  setStatusMessage: async (msg) => {
    set({ statusMessage: msg })
    await get().updateProfile({ statusMessage: msg })
  },

  posts: new Map(DEMO_POSTS.map(p => [p.id, p])),
  addPost: (post) => set(state => {
    const posts = new Map(state.posts)
    posts.set(post.id, post)
    return { posts }
  }),
  createPost: async (content, tags = [], mode = 'all', hubId, photoUri) => {
    const { profile, myPeerId } = get()
    if (!profile) return
    const post = createSocialPost(
      myPeerId || profile.peerId,
      profile.displayName,
      content,
      tags,
      mode,
      hubId,
      photoUri,
    )
    get().addPost(post)
    const { connectEdgeNode } = await getNodeModule()
    await connectEdgeNode.publishPost(post)
  },
  likePost: (postId) => set(state => {
    const posts = new Map(state.posts)
    const post = posts.get(postId)
    if (!post) return state
    const liked = !post.likedByMe
    posts.set(postId, {
      ...post,
      likedByMe: liked,
      likesCount: liked ? post.likesCount + 1 : Math.max(0, post.likesCount - 1),
    })
    return { posts }
  }),

  hubs: new Map(DEMO_HUBS.map(h => [h.id, h])),
  toggleJoinHub: (hubId) => set(state => {
    const hubs = new Map(state.hubs)
    const hub = hubs.get(hubId)
    if (!hub) return state
    const joined = !hub.isJoined
    hubs.set(hubId, {
      ...hub,
      isJoined: joined,
      memberCount: joined ? hub.memberCount + 1 : Math.max(1, hub.memberCount - 1),
    })
    return { hubs }
  }),

  events: new Map(DEMO_EVENTS.map(e => [e.id, e])),
  toggleRSVPEvent: (eventId) => set(state => {
    const events = new Map(state.events)
    const evt = events.get(eventId)
    if (!evt) return state
    const rsvp = !evt.isRSVPed
    events.set(eventId, {
      ...evt,
      isRSVPed: rsvp,
      attendeesCount: rsvp ? evt.attendeesCount + 1 : Math.max(0, evt.attendeesCount - 1),
    })
    return { events }
  }),
  createEvent: (title, description, location, dateStr, category) => set(state => {
    const events = new Map(state.events)
    const { profile, myPeerId } = get()
    const newEvt: SocialEvent = {
      id: `evt-${Date.now()}`,
      title,
      description,
      organizerPeerId: myPeerId || profile?.peerId || 'me',
      organizerName: profile?.displayName || 'You',
      location,
      dateStr,
      category,
      attendeesCount: 1,
      isRSVPed: true,
      gradient: ['#667eea', '#764ba2'],
    }
    events.set(newEvt.id, newEvt)
    return { events }
  }),

  // ── Node ───────────────────────────────────────────────────────────────────
  nodeReady: false, myPeerId: '',
  myBadge: null,
  verifiedPeers: new Map(),

  loadMyBadge: async () => {
    const { loadBadge } = await import('../lib/zk-identity')
    const badge = await loadBadge()
    set({ myBadge: badge })
  },
  setMyBadge: (badge) => set({ myBadge: badge }),
  setPeerVerified: (peerId, institution, tier) => set(state => {
    const verifiedPeers = new Map(state.verifiedPeers)
    verifiedPeers.set(peerId, { institution, tier })
    return { verifiedPeers }
  }),

  startNode: async () => {
    const { profile } = get()
    if (!profile) return

    const { connectEdgeNode } = await getNodeModule()
    const { loadBadge } = await import('../lib/zk-identity')
    const { loadPeerXPubKeys } = await import('../lib/crypto')
    const badge = await loadBadge()
    await loadPeerXPubKeys()
    set({ myBadge: badge })

    connectEdgeNode.on('node:ready',      (peerId)        => set({ nodeReady: true, myPeerId: peerId }))
    connectEdgeNode.on('peer:discovered', (peer)          => {
      if (get().isBlocked(peer.peerId)) return
      get().addPeer(peer)
    })
    connectEdgeNode.on('peer:scored',     (peerId, score) => {
      if (get().isBlocked(peerId)) return
      get().setScore(peerId, score)
    })
    connectEdgeNode.on('peer:verified',   (peerId, institution, tier) => {
      get().setPeerVerified(peerId, institution, tier)
    })
    connectEdgeNode.on('peer:evicted',    (peerId)        => get().dropPeer(peerId))
    connectEdgeNode.on('match:confirmed', (match) => {
      if (get().isBlocked(match.peerId)) return
      get().addMatch(match)
    })
    connectEdgeNode.on('ad:received',     (ad)    => get().addAd(ad))
    connectEdgeNode.on('post:received',   (post)  => {
      if (!get().isBlocked(post.authorPeerId)) get().addPost(post)
    })
    connectEdgeNode.on('chat:message',    (msg)   => {
      if (get().isBlocked(msg.from)) return
      get().addMessage(msg.from, msg)
    })
    connectEdgeNode.on('photo:received',  (peerId, env)   => {
      if (get().isBlocked(peerId)) return
      get().addPhoto(peerId, env)
    })

    appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') get().handleAppForeground()
    })

    await connectEdgeNode.start(profile)
  },

  stopNode: async () => {
    if (appStateSubscription) {
      appStateSubscription.remove()
      appStateSubscription = null
    }
    const { connectEdgeNode } = await getNodeModule()
    await connectEdgeNode.stop()
    set({ nodeReady: false })
  },

  // ── Discovery ──────────────────────────────────────────────────────────────
  peers: new Map(), scores: new Map(),

  addPeer: (peer) => set(state => {
    // Only clone if the peer is actually new or changed
    if (state.peers.get(peer.peerId)?.seenAt === peer.seenAt) return state
    const peers = new Map(state.peers)
    peers.set(peer.peerId, peer)
    return { peers }
  }),
  setScore: (peerId, score) => set(state => {
    if (state.scores.get(peerId) === score) return state
    const scores = new Map(state.scores)
    scores.set(peerId, score)
    return { scores }
  }),
  dropPeer: (peerId) => set(state => {
    const peers = new Map(state.peers); peers.delete(peerId)
    const scores = new Map(state.scores); scores.delete(peerId)
    return { peers, scores }
  }),

  // ── Safety ─────────────────────────────────────────────────────────────────

  blockPeer: async (peerId) => {
    const { connectEdgeNode } = await getNodeModule()
    await connectEdgeNode.blockPeer(peerId)
    // Purge from all UI state
    set(state => {
      const peers    = new Map(state.peers);    peers.delete(peerId)
      const scores   = new Map(state.scores);   scores.delete(peerId)
      const matches  = new Map(state.matches);  matches.delete(peerId)
      const messages = new Map(state.messages); messages.delete(peerId)
      const photos   = new Map(state.photos);   photos.delete(peerId)
      return { peers, scores, matches, messages, photos }
    })
  },

  unblockPeer: async (peerId) => {
    const { connectEdgeNode } = await getNodeModule()
    await connectEdgeNode.unblockPeer(peerId)
  },

  dismissPeer: async (peerId) => {
    const { connectEdgeNode } = await getNodeModule()
    await connectEdgeNode.dismissPeer(peerId)
    // Remove from radar — they'll reappear capped below threshold if they broadcast again
    set(state => {
      const peers  = new Map(state.peers);  peers.delete(peerId)
      const scores = new Map(state.scores); scores.delete(peerId)
      return { peers, scores }
    })
  },

  reportPeer: async (peerId, category, note) => {
    const { connectEdgeNode } = await getNodeModule()
    await connectEdgeNode.reportPeer(peerId, category, note)
    // Same cleanup as block — report implies block
    set(state => {
      const peers    = new Map(state.peers);    peers.delete(peerId)
      const scores   = new Map(state.scores);   scores.delete(peerId)
      const matches  = new Map(state.matches);  matches.delete(peerId)
      const messages = new Map(state.messages); messages.delete(peerId)
      const photos   = new Map(state.photos);   photos.delete(peerId)
      return { peers, scores, matches, messages, photos }
    })
  },

  isBlocked:   (peerId) => safetyRegistry.isBlocked(peerId),
  isDismissed: (peerId) => safetyRegistry.isDismissed(peerId),

  // ── Matches ────────────────────────────────────────────────────────────────
  matches: new Map(), unreadMatches: 0,

  addMatch: (match) => set(state => {
    const matches = new Map(state.matches)
    matches.set(match.peerId, match)
    return { matches, unreadMatches: state.unreadMatches + 1, pendingCompatMatch: match }
  }),
  removeMatch: (peerId) => set(state => {
    const matches = new Map(state.matches)
    matches.delete(peerId)
    return { matches }
  }),
  clearUnread: () => set({ unreadMatches: 0 }),

  // ── Ads ────────────────────────────────────────────────────────────────────
  ads: new Map(),
  addAd: (ad) => set(state => {
    const ads = new Map(state.ads)
    ads.set(ad.adId, ad)
    return { ads }
  }),

  // ── Pending compat match ────────────────────────────────────────────────────
  pendingCompatMatch: null,
  clearPendingMatch:  () => set({ pendingCompatMatch: null }),

  // ── Chat ───────────────────────────────────────────────────────────────────
  messages: new Map(), activeChat: null,

  addMessage: (peerId, msg) => set(state => {
    const messages = new Map(state.messages)
    const thread   = messages.get(peerId) ?? []
    // Dedup: skip if message ID already exists in thread
    if (thread.some(m => m.id === msg.id)) return state
    messages.set(peerId, [...thread, msg])
    return { messages }
  }),
  sendMessage: async (toPeerId, text) => {
    const { connectEdgeNode } = await getNodeModule()
    const msg = await connectEdgeNode.sendMessage(toPeerId, text)
    get().addMessage(toPeerId, msg)
  },
  openChat:  (peerId) => set(state => {
    const matches = new Map(state.matches)
    if (!matches.has(peerId)) {
      const peer = state.peers.get(peerId)
      const syntheticMatch: Match = {
        peerId,
        displayName: peer?.displayName || 'Peer ' + peerId.slice(0, 6),
        matchedAt: Date.now(),
        sharedTags: peer?.interestTags || [],
        compatibilityScore: state.scores.get(peerId) ?? 80,
        connectionType: 'friend',
      }
      matches.set(peerId, syntheticMatch)
    }
    return { activeChat: peerId, matches }
  }),
  closeChat: ()       => set({ activeChat: null }),

  // ── Photos ─────────────────────────────────────────────────────────────────
  photos: new Map(),

  addPhoto: async (peerId, envelope) => {
    const { connectEdgeNode } = await getNodeModule()
    const keys = connectEdgeNode.keyPair
    if (!keys) return
    const { decryptAndCachePhoto } = await import('../lib/photos')
    const result = await decryptAndCachePhoto(envelope, keys)
    if (!result) return
    set(state => {
      const photos   = new Map(state.photos)
      const existing = photos.get(peerId) ?? []
      photos.set(peerId, [...existing, { uri: result.uri, ts: envelope.ts }])
      return { photos }
    })
  },
  sendPhoto: async (toPeerId, source = 'library') => {
    if (!get().profile) return
    const { connectEdgeNode } = await getNodeModule()
    const { pickAndEncryptPhoto } = await import('../lib/photos')
    const result = await pickAndEncryptPhoto(connectEdgeNode.keyPair, toPeerId, source)
    if (!result) return
    await connectEdgeNode.sendPhoto(toPeerId, result.encrypted)
    set(state => {
      const photos   = new Map(state.photos)
      const existing = photos.get(toPeerId) ?? []
      photos.set(toPeerId, [...existing, { uri: result.localUri, ts: result.encrypted.ts }])
      return { photos }
    })
  },

  // ── App lifecycle ──────────────────────────────────────────────────────────
  handleAppForeground: async () => {
    const { drainRelayQueue } = await import('../lib/relay-poll')
    const items = await drainRelayQueue()
    for (const item of items) {
      if ('text' in item) {
        const msg = item as ChatMessage
        if (!get().isBlocked(msg.from)) get().addMessage(msg.from, msg)
      } else if (item.type === 'photo') {
        const peerId = item.envelope.senderPeerId
        if (!get().isBlocked(peerId)) get().addPhoto(peerId, item.envelope)
      }
    }
  },
}))
