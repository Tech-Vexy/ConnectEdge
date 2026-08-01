import React, { useEffect, useState, useCallback, useRef } from 'react'
import { View, Text, StyleSheet, Pressable, Dimensions, ScrollView, RefreshControl } from 'react-native'
import { SafeAreaView }      from 'react-native-safe-area-context'
import { router }            from 'expo-router'
import { LinearGradient }    from 'expo-linear-gradient'
import { HapticFeedback }    from '../lib/haptics'
import { useStore }          from '../store'
import { SwipeCard, ActionButton, CARD_W, CARD_H, type SwipeAction } from '../components/SwipeCard'
import { AdCard }            from '../components/AdCard'
import { MatchCelebration }  from '../components/MatchCelebration'
import { CompatibilityCard } from '../components/CompatibilityCard'
import { TabBar, type TabId } from '../components/TabBar'
import { ModeSelector }        from '../components/ModeSelector'
import { buildDeck }         from '../lib/ads'
import { DEMO_ADS }          from '../lib/ads'
import type { Match }        from '../lib/types'
import { colors, typography, fontSizes, spacing, radius, gradients, cardShadow } from '../theme'

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
    activeSocialMode, setSocialMode,
  } = useStore()

  const [celebMatch,  setCelebMatch]  = useState<Match | null>(null)
  const [compatMatch, setCompatMatch] = useState<Match | null>(null)
  const [dismissed,   setDismissed]   = useState<Set<string>>(new Set())
  const [cardHistory, setCardHistory] = useState<Array<{ id: string; action: SwipeAction }>>([])
  const [refreshing,  setRefreshing]  = useState(false)

  useEffect(() => {
    void startNode().catch((error) => {
      console.warn('Discover startNode failed:', error)
    })
  }, [startNode])

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
    .filter(p => activeSocialMode === 'all' || !p.activeMode || p.activeMode === 'all' || p.activeMode === activeSocialMode)
    .map(p => ({ peer: p, score: scores.get(p.peerId) ?? 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)

  const deck = buildDeck(peerItems, adList, userTags, dismissed)

  const handleSwipe = useCallback((id: string, action: SwipeAction) => {
    // Track in history for undo
    setCardHistory(prev => [...prev, { id, action }])
    
    // Haptic feedback (safe - falls back gracefully if unavailable)
    if (action === 'pass') {
      HapticFeedback.light()
    } else if (action === 'like') {
      HapticFeedback.medium()
    } else if (action === 'super') {
      HapticFeedback.success()
    }
    
    setDismissed(prev => new Set([...prev, id]))
    if (action === 'pass') dismissPeer(id)
  }, [dismissPeer])
  
  const handleUndo = useCallback(() => {
    if (cardHistory.length === 0) return
    
    const last = cardHistory[cardHistory.length - 1]
    setDismissed(prev => {
      const next = new Set(prev)
      next.delete(last.id)
      return next
    })
    setCardHistory(prev => prev.slice(0, -1))
    
    HapticFeedback.medium()
  }, [cardHistory])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    HapticFeedback.light()
    
    // Clear dismissed cards to show fresh deck
    setDismissed(new Set())
    setCardHistory([])
    
    // Wait a moment for visual feedback
    await new Promise(resolve => setTimeout(resolve, 800))
    setRefreshing(false)
    HapticFeedback.light()
  }, [])

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
          <Pressable onPress={() => onTabChange('profile')} style={styles.headerBtn} accessibilityLabel="View profile">
            <Text style={styles.headerBtnIcon}>○</Text>
          </Pressable>
          <LinearGradient
            colors={gradients.brand}
            start={{x:0,y:0}} end={{x:1,y:0}}
            style={styles.logoWrap}
          >
            <Text style={styles.logo}>ConnectEdge</Text>
          </LinearGradient>
          <Pressable onPress={() => onTabChange('matches')} style={styles.headerBtn} accessibilityLabel="View matches">
            {unreadMatches > 0 && (
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>{unreadMatches}</Text>
              </View>
            )}
            <Text style={styles.headerBtnIcon}>♡</Text>
          </Pressable>
        </View>

        {/* Mode Selector */}
        <ModeSelector activeMode={activeSocialMode} onSelectMode={setSocialMode} />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.pulse}
              colors={[colors.pulse]}
              title="Pull to refresh deck"
              titleColor={colors.textMuted}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Top Picks Banner */}
        {peerItems.filter(p => p.score >= 75).length > 0 && (
          <View style={styles.topPicksBanner}>
            <LinearGradient
              colors={['#667eea', '#764ba2']}
              start={{x:0,y:0}} end={{x:1,y:0}}
              style={styles.topPicksGradient}
            >
              <Text style={styles.topPicksIcon}>✨</Text>
              <Text style={styles.topPicksText}>
                {peerItems.filter(p => p.score >= 75).length} Top Pick
                {peerItems.filter(p => p.score >= 75).length > 1 ? 's' : ''} Today
              </Text>
            </LinearGradient>
          </View>
        )}

        {/* Card deck */}
        <ScrollView
          style={styles.deckScroll}
          contentContainerStyle={styles.deck}
        >
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
        </ScrollView>

        {/* Action buttons — only show when top card is a peer card */}
        {deck.length > 0 && deck[0].kind === 'peer' && (
          <View style={styles.actions}>
            <ActionButton
              onPress={() => handleSwipe(deck[0].kind === 'peer' ? deck[0].peer.peerId : '', 'pass')}
              icon="✕" color={colors.pass} size="sm"
            />
            <ActionButton
              onPress={handleUndo}
              icon="↶" 
              color={cardHistory.length > 0 ? '#FFC107' : colors.textMuted}
              size="sm"
            />
            <ActionButton
              onPress={() => handleSwipe(deck[0].kind === 'peer' ? deck[0].peer.peerId : '', 'super')}
              icon="★" color={colors.superLike} size="sm"
            />
            <ActionButton
              onPress={() => handleSwipe(deck[0].kind === 'peer' ? deck[0].peer.peerId : '', 'like')}
              icon="♥" color={colors.like} size="lg" bg={colors.likeAlpha18}
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
        </ScrollView>
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
      <LinearGradient 
        colors={nodeReady ? ['#4facfe', '#00f2fe'] : ['#667eea', '#764ba2']} 
        style={styles.emptyCard}
        start={{x:0,y:0}} end={{x:1,y:1}}
      >
        <Text style={styles.emptyIcon}>{nodeReady ? '🔍' : '📡'}</Text>
        <Text style={styles.emptyTitle}>
          {nodeReady ? 'No one nearby' : 'Connecting…'}
        </Text>
        <Text style={styles.emptyBody}>
          {nodeReady
            ? 'Open the app in a crowd. ConnectEdge finds people over Bluetooth and local Wi-Fi — no GPS.'
            : 'Starting your peer-to-peer node. Just a moment.'}
        </Text>
        {nodeReady && (
          <View style={styles.emptyTips}>
            <Text style={styles.emptyTip}>💡 Try a coffee shop or campus</Text>
            <Text style={styles.emptyTip}>💡 Keep Bluetooth on</Text>
          </View>
        )}
      </LinearGradient>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safeArea:  { flex: 1 },
  scrollContent: { flexGrow: 1 },
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

  deckScroll: { flex: 1 },
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
  emptyIcon:  { fontSize: 64, marginBottom: spacing.md },
  emptyTitle: { ...typography.heading, fontSize: fontSizes.xl, color: '#FFF', textAlign: 'center', marginBottom: spacing.sm },
  emptyBody:  { ...typography.body, fontSize: fontSizes.md, color: 'rgba(255,255,255,0.85)', textAlign: 'center', lineHeight: 22, marginBottom: spacing.lg },
  emptyTips: { gap: spacing.sm },
  emptyTip: { ...typography.label, fontSize: fontSizes.sm, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  
  topPicksBanner: {
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  topPicksGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    ...cardShadow,
  },
  topPicksIcon: {
    fontSize: fontSizes.lg,
  },
  topPicksText: {
    ...typography.heading,
    fontSize: fontSizes.sm,
    color: '#FFF',
  },
})
