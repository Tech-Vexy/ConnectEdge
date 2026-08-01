// screens/Matches.tsx — Tinder-style matches screen
// Two sections:
//   New Matches — horizontal bubble row (unread, no messages yet)
//   Messages    — conversation list sorted by last message time

import React, { useEffect, useCallback, useState } from 'react'
import {
  View, Text, StyleSheet, Pressable,
  ScrollView, FlatList, RefreshControl, Image,
} from 'react-native'
import { SafeAreaView }  from 'react-native-safe-area-context'
import { router }        from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { useStore }      from '../store'
import type { Match }    from '../lib/types'
import { peerGradient }  from '../lib/peer-gradient'
import { timeAgo }       from '../lib/format'
import { TabBar, type TabId } from '../components/TabBar'
import { colors, typography, fontSizes, spacing, radius, cardShadow } from '../theme'

// ─── New match bubble ─────────────────────────────────────────────────────────

function NewMatchBubble({ match }: { match: Match }) {
  const openChat = useStore(s => s.openChat)
  const [a, b]   = peerGradient(match.peerId)

  return (
    <Pressable
      style={styles.bubble}
      onPress={() => { openChat(match.peerId); router.push('/chat') }}
    >
      {match.photoUri ? (
        <Image source={{ uri: match.photoUri }} style={styles.bubbleGradient} />
      ) : (
        <LinearGradient colors={[a, b]} style={styles.bubbleGradient} start={{x:0,y:0}} end={{x:1,y:1}}>
          <Text style={styles.bubbleInitial}>{match.displayName.slice(0, 1).toUpperCase()}</Text>
        </LinearGradient>
      )}
      <View style={styles.bubbleNewDot} />
      <Text style={styles.bubbleName} numberOfLines={1}>{match.displayName}</Text>
    </Pressable>
  )
}

// ─── Conversation row ─────────────────────────────────────────────────────────

function ConversationRow({ match }: { match: Match }) {
  const openChat = useStore(s => s.openChat)
  const messages = useStore(s => s.messages.get(match.peerId) ?? [])
  const lastMsg  = messages[messages.length - 1]
  const [a, b]   = peerGradient(match.peerId)
  const hasUnread = lastMsg && lastMsg.from === match.peerId

  return (
    <Pressable
      style={({ pressed }) => [styles.convoRow, pressed && { opacity: 0.75 }]}
      onPress={() => { openChat(match.peerId); router.push('/chat') }}
    >
      <View style={styles.convoAvatarWrap}>
        {match.photoUri ? (
          <Image source={{ uri: match.photoUri }} style={styles.convoAvatar} />
        ) : (
          <LinearGradient colors={[a, b]} style={styles.convoAvatar} start={{x:0,y:0}} end={{x:1,y:1}}>
            <Text style={styles.convoInitial}>{match.displayName.slice(0, 1).toUpperCase()}</Text>
          </LinearGradient>
        )}
        {hasUnread && <View style={styles.unreadDot} />}
      </View>

      <View style={styles.convoBody}>
        <View style={styles.convoTop}>
          <Text style={[styles.convoName, hasUnread && styles.convoNameUnread]}>
            {match.displayName}
          </Text>
          <Text style={styles.convoTime}>{timeAgo(lastMsg?.ts ?? match.matchedAt)}</Text>
        </View>
        <Text style={[styles.convoLastMsg, hasUnread && styles.convoLastMsgUnread]} numberOfLines={1}>
          {lastMsg
            ? (lastMsg.from !== match.peerId ? 'You: ' : '') + lastMsg.text
            : 'Matched nearby · say hello 👋'}
        </Text>
      </View>
    </Pressable>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function Matches({ activeTab, onTabChange }: {
  activeTab: TabId
  onTabChange: (t: TabId) => void
}) {
  const matches     = useStore(s => s.matches)
  const clearUnread = useStore(s => s.clearUnread)
  const messages    = useStore(s => s.messages)
  const handleAppForeground = useStore(s => s.handleAppForeground)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => { clearUnread() }, [])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await handleAppForeground()
    setRefreshing(false)
  }, [handleAppForeground])

  const matchList = Array.from(matches.values())
    .sort((a, b) => b.matchedAt - a.matchedAt)

  // Split: new (no messages) vs conversations (has messages)
  const newMatches    = matchList.filter(m => !messages.get(m.peerId)?.length)
  const conversations = matchList.filter(m =>  messages.get(m.peerId)?.length)
    .sort((a, b) => {
      const aLast = messages.get(a.peerId)?.at(-1)?.ts ?? a.matchedAt
      const bLast = messages.get(b.peerId)?.at(-1)?.ts ?? b.matchedAt
      return bLast - aLast
    })

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Matches</Text>
          {matchList.length > 0 && (
            <Text style={styles.headerCount}>{matchList.length}</Text>
          )}
        </View>

        {matchList.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>♡</Text>
            <Text style={styles.emptyTitle}>No matches yet</Text>
            <Text style={styles.emptyBody}>
              Start swiping on Discover to find mutual matches nearby
            </Text>
            <Pressable
              style={styles.discoverBtn}
              onPress={() => onTabChange('discover')}
            >
              <LinearGradient
                colors={['#FF4458', '#FF7854']}
                start={{x:0,y:0}} end={{x:1,y:0}}
                style={styles.discoverBtnGrad}
              >
                <Text style={styles.discoverBtnText}>Start Discovering</Text>
              </LinearGradient>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={styles.scroll}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.pulse}
                colors={[colors.pulse]}
              />
            }
          >
            {/* New matches row */}
            {newMatches.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>New Matches</Text>
                <FlatList
                  data={newMatches}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={m => m.peerId}
                  contentContainerStyle={styles.bubblesRow}
                  renderItem={({ item }) => <NewMatchBubble match={item} />}
                />
              </View>
            )}

            {/* Conversations */}
            {conversations.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Messages</Text>
                {conversations.map(match => (
                  <ConversationRow key={match.peerId} match={match} />
                ))}
              </View>
            )}

            <View style={styles.footer}>
              <Text style={styles.footerText}>
                🔒 All messages end-to-end encrypted
              </Text>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
      <TabBar active={activeTab} onChange={onTabChange} />
    </View>
  )
}

const BUBBLE_SIZE = 72

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: colors.bg },
  safeArea:   { flex: 1 },
  scroll:     { flex: 1 },

  header: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop:      spacing.md,
    paddingBottom:   spacing.lg,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    ...typography.display,
    fontSize: fontSizes.xl,
    color:    colors.textPrimary,
    flex:     1,
  },
  headerCount: {
    ...typography.label,
    fontSize:        fontSizes.sm,
    color:           colors.pulse,
    backgroundColor: colors.pulseLight,
    paddingHorizontal: spacing.sm,
    paddingVertical:   3,
    borderRadius:    radius.full,
  },

  section:      { paddingTop: spacing.lg },
  sectionTitle: {
    ...typography.heading,
    fontSize:          fontSizes.sm,
    color:             colors.textMuted,
    textTransform:     'uppercase',
    letterSpacing:     1,
    paddingHorizontal: spacing.lg,
    marginBottom:      spacing.md,
  },

  // Bubbles
  bubblesRow: {
    paddingHorizontal: spacing.lg,
    gap:               spacing.md,
  },
  bubble: {
    alignItems: 'center',
    gap:        spacing.xs,
    width:      BUBBLE_SIZE + 8,
    position:   'relative',
  },
  bubbleGradient: {
    width:        BUBBLE_SIZE,
    height:       BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    alignItems:   'center',
    justifyContent: 'center',
    borderWidth:  2.5,
    borderColor:  colors.pulse,
  },
  bubbleInitial: {
    fontSize:   BUBBLE_SIZE * 0.38,
    color:      'rgba(255,255,255,0.3)',
    fontWeight: '800',
  },
  bubbleNewDot: {
    position:        'absolute',
    top:             2,
    right:           8,
    width:           14,
    height:          14,
    borderRadius:    7,
    backgroundColor: colors.pulse,
    borderWidth:     2,
    borderColor:     colors.bg,
  },
  bubbleName: {
    ...typography.label,
    fontSize: fontSizes.xs,
    color:    colors.textSecondary,
    width:    BUBBLE_SIZE + 8,
    textAlign: 'center',
  },

  // Conversations
  convoRow: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: spacing.lg,
    paddingVertical:   spacing.md,
    gap:               spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  convoAvatarWrap: { position: 'relative' },
  convoAvatar: {
    width:        56,
    height:       56,
    borderRadius: 28,
    alignItems:   'center',
    justifyContent: 'center',
  },
  convoInitial: {
    fontSize:   56 * 0.38,
    color:      'rgba(255,255,255,0.3)',
    fontWeight: '800',
  },
  unreadDot: {
    position:        'absolute',
    bottom:          1,
    right:           1,
    width:           13,
    height:          13,
    borderRadius:    7,
    backgroundColor: colors.pulse,
    borderWidth:     2,
    borderColor:     colors.bg,
  },
  convoBody:  { flex: 1, gap: 3 },
  convoTop: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
  },
  convoName: {
    ...typography.heading,
    fontSize: fontSizes.md,
    color:    colors.textSecondary,
  },
  convoNameUnread: { color: colors.textPrimary },
  convoTime: {
    ...typography.mono,
    fontSize: fontSizes.xs,
    color:    colors.textMuted,
  },
  convoLastMsg: {
    ...typography.body,
    fontSize: fontSizes.sm,
    color:    colors.textMuted,
  },
  convoLastMsgUnread: { color: colors.textSecondary },

  // Empty
  empty: {
    flex:              1,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: spacing.xl,
    gap:               spacing.md,
  },
  emptyIcon:  { fontSize: 56, color: colors.textMuted },
  emptyTitle: {
    ...typography.display,
    fontSize:  fontSizes.xl,
    color:     colors.textSecondary,
    textAlign: 'center',
  },
  emptyBody: {
    ...typography.body,
    fontSize:  fontSizes.md,
    color:     colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  discoverBtn: { marginTop: spacing.md, width: '80%' },
  discoverBtnGrad: {
    borderRadius:    radius.full,
    paddingVertical: spacing.md,
    alignItems:      'center',
  },
  discoverBtnText: {
    ...typography.label,
    fontSize: fontSizes.md,
    color:    '#FFF',
  },
  footer:     { alignItems: 'center', paddingVertical: spacing.xl },
  footerText: {
    ...typography.body,
    fontSize: fontSizes.xs,
    color:    colors.textMuted,
  },
})
