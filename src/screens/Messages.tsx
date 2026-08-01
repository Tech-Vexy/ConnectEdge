// screens/Messages.tsx — conversations-only view
// Shows only matches that have an active message thread.
// New matches without messages live on the Matches tab.

import React, { useCallback, useState } from 'react'
import {
  View, Text, StyleSheet, Pressable,
  FlatList, RefreshControl, Image,
} from 'react-native'
import { SafeAreaView }  from 'react-native-safe-area-context'
import { router }        from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { useStore }      from '../store'
import type { Match }    from '../lib/types'
import { TabBar, type TabId } from '../components/TabBar'
import { peerGradient }  from '../lib/peer-gradient'
import { timeAgo }       from '../lib/format'
import { colors, typography, fontSizes, spacing, radius } from '../theme'

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
            : 'Say hello 👋'}
        </Text>
      </View>
    </Pressable>
  )
}

export default function Messages({ activeTab, onTabChange }: {
  activeTab: TabId
  onTabChange: (t: TabId) => void
}) {
  const matches     = useStore(s => s.matches)
  const messages    = useStore(s => s.messages)
  const handleAppForeground = useStore(s => s.handleAppForeground)
  const [refreshing, setRefreshing] = useState(false)

  const matchList = Array.from(matches.values())

  // Only conversations that have messages
  const conversations = matchList
    .filter(m => messages.get(m.peerId)?.length)
    .sort((a, b) => {
      const aLast = messages.get(a.peerId)?.at(-1)?.ts ?? a.matchedAt
      const bLast = messages.get(b.peerId)?.at(-1)?.ts ?? b.matchedAt
      return bLast - aLast
    })

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await handleAppForeground()
    setRefreshing(false)
  }, [handleAppForeground])

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Messages</Text>
          {conversations.length > 0 && (
            <Text style={styles.headerCount}>{conversations.length}</Text>
          )}
        </View>

        {conversations.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptyBody}>
              When you and a match start chatting, your conversations will appear here
            </Text>
            <Pressable
              style={styles.matchesBtn}
              onPress={() => onTabChange('matches')}
            >
              <Text style={styles.matchesBtnText}>View Matches</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={m => m.peerId}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => <ConversationRow match={item} />}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.pulse}
                colors={[colors.pulse]}
              />
            }
          />
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>🔒 All messages end-to-end encrypted</Text>
        </View>
      </SafeAreaView>
      <TabBar active={activeTab} onChange={onTabChange} />
    </View>
  )
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: colors.bg },
  safeArea:   { flex: 1 },

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

  listContent: { paddingBottom: spacing.xl },

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
    fontSize: fontSizes.md,
    color:     colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  matchesBtn: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.pulse,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  matchesBtnText: {
    ...typography.label,
    fontSize: fontSizes.md,
    color:    colors.pulse,
  },
  footer:     { alignItems: 'center', paddingVertical: spacing.md },
  footerText: {
    ...typography.body,
    fontSize: fontSizes.xs,
    color:    colors.textMuted,
  },
})
