// store.ts — global state (v3)
import { create }       from 'zustand'
import * as SecureStore from 'expo-secure-store'
import { AppState, type AppStateStatus } from 'react-native'
import type { UserProfile, PeerBroadcast, Match, ChatMessage, AdBroadcast } from '../lib/types'
import type { EncryptedPhoto }   from '../lib/photos'
import type { ReportCategory }   from '../lib/safety'
import type { VerificationBadge } from '../lib/zk-identity'
import { loadBadge }             from '../lib/zk-identity'
import { safetyRegistry }        from '../lib/safety'
import { decryptAndCachePhoto }  from '../lib/photos'
import { proximNode }            from '../lib/node'

const PROFILE_KEY = 'proxim_profile_v1'

interface AppStore {
  profile:       UserProfile | null
  isOnboarded:   boolean
  setProfile:    (p: UserProfile) => Promise<void>
  loadProfile:   () => Promise<void>
  updateProfile: (partial: Partial<UserProfile>) => Promise<void>

  nodeReady:  boolean
  myPeerId:   string
  startNode:  () => Promise<void>

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
    set({ profile, isOnboarded: true })
  },
  loadProfile: async () => {
    try {
      const raw = await SecureStore.getItemAsync(PROFILE_KEY)
      if (raw) set({ profile: JSON.parse(raw), isOnboarded: true })
    } catch {}
  },
  updateProfile: async (partial) => {
    const current = get().profile
    if (!current) return
    const updated = { ...current, ...partial }
    await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(updated))
    set({ profile: updated })
  },

  // ── Node ───────────────────────────────────────────────────────────────────
  nodeReady: false, myPeerId: '',
  myBadge: null,
  verifiedPeers: new Map(),

  loadMyBadge: async () => {
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

    await get().loadMyBadge()

    proximNode.on('node:ready',      (peerId)        => set({ nodeReady: true, myPeerId: peerId }))
    proximNode.on('peer:discovered', (peer)          => {
      if (get().isBlocked(peer.peerId)) return
      get().addPeer(peer)
    })
    proximNode.on('peer:scored',     (peerId, score) => {
      if (get().isBlocked(peerId)) return
      get().setScore(peerId, score)
    })
    proximNode.on('peer:verified',   (peerId, institution, tier) => {
      get().setPeerVerified(peerId, institution, tier)
    })
    proximNode.on('peer:evicted',    (peerId)        => get().dropPeer(peerId))
    proximNode.on('match:confirmed', (match) => {
      if (get().isBlocked(match.peerId)) return
      get().addMatch(match)
    })
    proximNode.on('ad:received',     (ad)    => get().addAd(ad))
    proximNode.on('chat:message',    (msg)   => {
      if (get().isBlocked(msg.from)) return
      get().addMessage(msg.from, msg)
    })
    proximNode.on('photo:received',  (peerId, env)   => {
      if (get().isBlocked(peerId)) return
      get().addPhoto(peerId, env)
    })

    AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') get().handleAppForeground()
    })

    await proximNode.start(profile)
  },

  // ── Discovery ──────────────────────────────────────────────────────────────
  peers: new Map(), scores: new Map(),

  addPeer: (peer) => set(state => {
    const peers = new Map(state.peers)
    peers.set(peer.peerId, peer)
    return { peers }
  }),
  setScore: (peerId, score) => set(state => {
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
    await proximNode.blockPeer(peerId)
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
    await proximNode.unblockPeer(peerId)
  },

  dismissPeer: async (peerId) => {
    await proximNode.dismissPeer(peerId)
    // Remove from radar — they'll reappear capped below threshold if they broadcast again
    set(state => {
      const peers  = new Map(state.peers);  peers.delete(peerId)
      const scores = new Map(state.scores); scores.delete(peerId)
      return { peers, scores }
    })
  },

  reportPeer: async (peerId, category, note) => {
    await proximNode.reportPeer(peerId, category, note)
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
    messages.set(peerId, [...thread, msg])
    return { messages }
  }),
  sendMessage: async (toPeerId, text) => {
    const msg = await proximNode.sendMessage(toPeerId, text)
    get().addMessage(toPeerId, msg)
  },
  openChat:  (peerId) => set({ activeChat: peerId }),
  closeChat: ()       => set({ activeChat: null }),

  // ── Photos ─────────────────────────────────────────────────────────────────
  photos: new Map(),

  addPhoto: async (peerId, envelope) => {
    const keys = proximNode.keyPair
    if (!keys) return
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
    const { pickAndEncryptPhoto } = await import('../lib/photos')
    const result = await pickAndEncryptPhoto(proximNode.keyPair, toPeerId, source)
    if (!result) return
    await proximNode.sendPhoto(toPeerId, result.encrypted)
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
