// screens/Discover.tsx — swipe deck with ads + compatibility flow

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native'
import { SafeAreaView }      from 'react-native-safe-area-context'
import { router }            from 'expo-router'
import { LinearGradient }    from 'expo-linear-gradient'
import { useStore }          from '../store'
import { SwipeCard, ActionButton, CARD_W, CARD_H, type SwipeAction } from '../components/SwipeCard'
import { AdCard }            from '../components/AdCard'
import { MatchCelebration }  from '../components/MatchCelebration'
import { CompatibilityCard } from '../components/CompatibilityCard'
import { TabBar, type TabId } from '../components/TabBar'
import { buildDeck }         from '../lib/ads'
import { DEMO_ADS }          from '../lib/ads'
import type { Match }        from '../lib/types'
import { colors, typography, fontSizes, spacing, radius, gradients } from '../theme'

const { width: W, height: H } = Dimensions.get('window')

export default function Discover({ activeTab, onTabChange }: {
  activeTab:   TabId
  onTabChange: (t: TabId) => void
}) {
  const {
    peers, scores, ads, startNode, nodeReady,
    profile, matches, dismissPeer, unreadMatches,
    pendingCompatMatch, clearPendingMatch,
    openChat, sendMessage, verifiedPeers,
  } = useStore()

  const [celebMatch,  setCelebMatch]  = useState<Match | null>(null)
  const [compatMatch, setCompatMatch] = useState<Match | null>(null)
  const [dismissed,   setDismissed]   = useState<Set<string>>(new Set())

  useEffect(() => { startNode() }, [])

  // Watch for new matches → show celebration then compat card
  const prevMatchCount = useRef(0)
  useEffect(() => {
    const matchList = Array.from(matches.values())
    if (matchList.length > prevMatchCount.current) {
      const newest = matchList[matchList.length - 1]
      setCelebMatch(newest)
    }
    prevMatchCount.current = matchList.length
  }, [matches])

  // Build deck interleaving peers and ads
  const userTags = profile?.prefs.interestTags ?? []
  const adList   = Array.from(ads.values()).length > 0
    ? Array.from(ads.values())
    : DEMO_ADS   // show demo ads when no real beacons in range

  const peerItems = Array.from(peers.values())
    .filter(p => !dismissed.has(p.peerId))
    .map(p => ({ peer: p, score: scores.get(p.peerId) ?? 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)

  const deck = buildDeck(peerItems, adList, userTags, dismissed)

  const handleSwipe = useCallback((id: string, action: SwipeAction) => {
    setDismissed(prev => new Set([...prev, id]))
    if (action === 'pass') dismissPeer(id)
  }, [dismissPeer])

  const handleAdDismiss = (adId: string) => {
    setDismissed(prev => new Set([...prev, adId]))
  }

  const handleCelebMessage = () => {
    setCelebMatch(null)
    if (celebMatch) setCompatMatch(celebMatch)
  }
  const handleCelebKeep = () => {
    setCelebMatch(null)
    if (celebMatch) setCompatMatch(celebMatch)
  }

  const handleCompatSend = async (text: string) => {
    if (compatMatch) {
      openChat(compatMatch.peerId)
      if (text) await sendMessage(compatMatch.peerId, text)
      setCompatMatch(null)
      clearPendingMatch()
      router.push('/chat')
    }
  }
  const handleCompatSkip = () => {
    setCompatMatch(null)
    clearPendingMatch()
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => onTabChange('profile')} style={styles.headerBtn}>
            <Text style={styles.headerBtnIcon}>○</Text>
          </Pressable>
          <LinearGradient
            colors={gradients.brand}
            start={{x:0,y:0}} end={{x:1,y:0}}
            style={styles.logoWrap}
          >
            <Text style={styles.logo}>proxim</Text>
          </LinearGradient>
          <Pressable onPress={() => onTabChange('matches')} style={styles.headerBtn}>
            {unreadMatches > 0 && (
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>{unreadMatches}</Text>
              </View>
            )}
            <Text style={styles.headerBtnIcon}>♡</Text>
          </Pressable>
        </View>

        {/* Card deck */}
        <View style={styles.deck}>
          {deck.length === 0 ? (
            <EmptyState nodeReady={nodeReady} />
          ) : (
            // Render up to 3 cards — back cards peek out
            deck.slice(0, 3).map((item, index) => {
              if (item.kind === 'ad') {
                return (
                  <AdCard
                    key={item.ad.adId}
                    ad={item.ad}
                    index={index}
                    onDismiss={handleAdDismiss}
                  />
                )
              }
              return (
                <SwipeCard
                  key={item.peer.peerId}
                  peer={item.peer}
                  score={item.score}
                  index={index}
                  onSwipe={handleSwipe}
                  verified={verifiedPeers.get(item.peer.peerId) ?? null}
                />
              )
            }).reverse()
          )}
        </View>

        {/* Action buttons — only show when top card is a peer card */}
        {deck.length > 0 && deck[0].kind === 'peer' && (
          <View style={styles.actions}>
            <ActionButton
              onPress={() => handleSwipe(deck[0].kind === 'peer' ? deck[0].peer.peerId : '', 'pass')}
              icon="✕" color={colors.pass} size="sm"
            />
            <ActionButton
              onPress={() => handleSwipe(deck[0].kind === 'peer' ? deck[0].peer.peerId : '', 'super')}
              icon="★" color={colors.superLike} size="sm"
            />
            <ActionButton
              onPress={() => handleSwipe(deck[0].kind === 'peer' ? deck[0].peer.peerId : '', 'like')}
              icon="♥" color={colors.like} size="lg" bg={colors.like + '18'}
            />
          </View>
        )}

        {/* Skip button for ad cards */}
        {deck.length > 0 && deck[0].kind === 'ad' && (
          <View style={styles.actions}>
            <View style={styles.adHint}>
              <Text style={styles.adHintText}>
                Swipe to dismiss · Tap to visit
              </Text>
            </View>
          </View>
        )}

        {/* Status */}
        <Text style={styles.status}>
          {!nodeReady
            ? '⬤  connecting…'
            : peerItems.length > 0
            ? `⬤  ${peerItems.length} nearby`
            : '⬤  scanning…'}
        </Text>
      </SafeAreaView>

      <TabBar active={activeTab} onChange={onTabChange} />

      {/* Match celebration */}
      <MatchCelebration
        match={celebMatch}
        myName={profile?.displayName ?? 'You'}
        onMessage={handleCelebMessage}
        onKeepSwiping={handleCelebKeep}
      />

      {/* Compatibility + icebreakers */}
      {compatMatch && (
        <CompatibilityCard
          match={compatMatch}
          visible={!!compatMatch}
          onSendMsg={handleCompatSend}
          onSkip={handleCompatSkip}
        />
      )}
    </View>
  )
}

function EmptyState({ nodeReady }: { nodeReady: boolean }) {
  return (
    <View style={styles.empty}>
      <LinearGradient colors={['#2A2A2A', '#1A1A1A']} style={styles.emptyCard}>
        <Text style={styles.emptyIcon}>{nodeReady ? '◎' : '◌'}</Text>
        <Text style={styles.emptyTitle}>
          {nodeReady ? 'No one nearby' : 'Connecting…'}
        </Text>
        <Text style={styles.emptyBody}>
          {nodeReady
            ? 'Open the app in a crowd. Proxim finds people over Bluetooth and local Wi-Fi — no GPS.'
            : 'Starting your peer-to-peer node. Just a moment.'}
        </Text>
      </LinearGradient>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safeArea:  { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  headerBtnIcon: { fontSize: 26, color: colors.textMuted },
  headerBadge: {
    position: 'absolute', top: 0, right: 0,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.pulse, alignItems: 'center', justifyContent: 'center', zIndex: 1,
  },
  headerBadgeText: { ...typography.label, fontSize: 9, color: '#FFF', lineHeight: 12 },
  logoWrap: { borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 4 },
  logo: { ...typography.display, fontSize: fontSizes.xl, color: '#FFF', letterSpacing: 1 },

  deck: { flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },

  actions: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    gap: spacing.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.xl,
  },
  adHint: { alignItems: 'center', paddingVertical: spacing.md },
  adHintText: { ...typography.body, fontSize: fontSizes.sm, color: colors.textMuted },

  status: {
    ...typography.mono, fontSize: fontSizes.xs, color: colors.textMuted,
    textAlign: 'center', paddingBottom: spacing.sm,
  },

  empty: { width: CARD_W, height: CARD_H, alignItems: 'center', justifyContent: 'center' },
  emptyCard: {
    width: CARD_W, height: CARD_H, borderRadius: radius.card,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.xl, gap: spacing.md,
  },
  emptyIcon:  { fontSize: 56, color: colors.textMuted },
  emptyTitle: { ...typography.heading, fontSize: fontSizes.xl, color: colors.textSecondary, textAlign: 'center' },
  emptyBody:  { ...typography.body, fontSize: fontSizes.md, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
})
