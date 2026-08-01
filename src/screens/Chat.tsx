// screens/Chat.tsx
// E2E encrypted chat between matched peers.
// Direct stream when online, Cloudflare relay when offline.
// Intentionally minimal — no read receipts, no typing indicators,
// nothing that would require a server.

import React, { useState, useRef, useEffect } from 'react'
import {
  View, Text, StyleSheet, Pressable, TextInput,
  FlatList, KeyboardAvoidingView, Platform, Animated, Image, Alert,
} from 'react-native'
import { SafeAreaView }  from 'react-native-safe-area-context'
import { router }        from 'expo-router'
import { useStore }      from '../store'
import { ReportModal }   from '../components/ReportModal'
import { generateIcebreakers, type Icebreaker } from '../lib/icebreakers'
import type { ChatMessage } from '../lib/types'
import { colors, typography, spacing, fontSizes, radius } from '../theme'

function timeLabel(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function MessageBubble({
  msg,
  isMe,
  showTime,
}: {
  msg: ChatMessage
  isMe: boolean
  showTime: boolean
}) {
  const fadeIn = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(fadeIn, {
      toValue: 1, duration: 220, useNativeDriver: true,
    }).start()
  }, [])

  return (
    <Animated.View style={{ opacity: fadeIn }}>
        <View style={[styles.bubbleRow, isMe && styles.bubbleRowMe]}>
          <View style={[
            styles.bubble,
            isMe ? styles.bubbleMe : styles.bubbleThem,
            msg.pending && styles.bubblePending,
          ]}>
            <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>
              {msg.text}
            </Text>
          </View>
        </View>
        {showTime && (
          <Text style={[styles.timeLabel, isMe && styles.timeLabelMe]}>
            {timeLabel(msg.ts)}{msg.pending ? ' · sending…' : ''}
          </Text>
        )}
    </Animated.View>
  )
}

export default function Chat() {
  const myPeerId    = useStore(s => s.myPeerId)
  const activeChat  = useStore(s => s.activeChat)
  const matches     = useStore(s => s.matches)
  const messages    = useStore(s => s.messages.get(activeChat ?? '') ?? [])
  const peers       = useStore(s => s.peers)
  const photos      = useStore(s => s.photos.get(activeChat ?? '') ?? [])
  const sendMessage = useStore(s => s.sendMessage)
  const sendPhoto   = useStore(s => s.sendPhoto)
  const closeChat   = useStore(s => s.closeChat)
  const blockPeer  = useStore(s => s.blockPeer)
  const profile    = useStore(s => s.profile)
  const [reportVisible, setReportVisible] = useState(false)
  const [icebreakers, setIcebreakers]     = useState<Icebreaker[]>([])

  const match = activeChat ? matches.get(activeChat) : null

  // Generate icebreakers when first opening an empty thread
  useEffect(() => {
    if (!profile || !match || messages.length > 0) return
    const theirBroadcast = peers.get(match.peerId)
    if (!theirBroadcast) return
    setIcebreakers(generateIcebreakers(profile, theirBroadcast, 3))
  }, [activeChat, messages.length])

  const handlePhotoPress = () => {
    if (!activeChat) return
    Alert.alert('Share a photo', '', [
      { text: 'Camera',        onPress: () => sendPhoto(activeChat, 'camera')  },
      { text: 'Photo library', onPress: () => sendPhoto(activeChat, 'library') },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  const handleSafetyPress = () => {
    if (!activeChat || !match) return
    Alert.alert(match.displayName, 'What would you like to do?', [
      {
        text: 'Block',
        style: 'destructive',
        onPress: () => Alert.alert(
          `Block ${match.displayName}?`,
          "They won't appear on your radar and can't contact you. This action cannot be undone.",
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Block', style: 'destructive',
              onPress: () => {
                blockPeer(activeChat)
                closeChat()
                router.back()
                Alert.alert('Blocked', `${match.displayName} has been blocked`)
              } },
          ]
        ),
      },
      { 
        text: 'Report',  
        onPress: () => {
          setReportVisible(true)
          Alert.alert('Report submitted', 'Thank you for helping keep ConnectEdge safe. Your report has been saved locally.')
        } 
      },
      { text: 'Cancel',  style: 'cancel' },
    ])
  }

  const [text, setText]     = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<FlatList>(null)

  const isOnline = activeChat ? peers.has(activeChat) : false

  useEffect(() => {
    if (messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true })
    }
  }, [messages.length])

  const handleSend = async () => {
    const trimmed = text.trim()
    if (!trimmed || !activeChat || sending) return

    setText('')
    setSending(true)
    try {
      await sendMessage(activeChat, trimmed)
    } finally {
      setSending(false)
    }
  }

  if (!match) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>No active conversation</Text>
        <Pressable onPress={() => { closeChat(); router.back() }}>
          <Text style={styles.backLink}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => { closeChat(); router.back() }}
          accessibilityLabel="Go back"
        >
          <Text style={styles.backBtnText}>‹</Text>
        </Pressable>

        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{match.displayName}</Text>
          <View style={styles.headerStatusRow}>
            <View style={[
              styles.statusDot,
              { backgroundColor: isOnline ? colors.signalStrong : colors.textMuted },
            ]} />
            <Text style={styles.headerStatus}>
              {isOnline ? 'nearby · direct stream' : 'away · relay'}
            </Text>
          </View>
        </View>

        <Pressable style={styles.blockBtn} onPress={handleSafetyPress} accessibilityLabel="Safety options">
          <Text style={styles.blockBtnText}>⊘</Text>
        </Pressable>
      </View>

      {match && (
        <ReportModal
          visible={reportVisible}
          peerId={match.peerId}
          peerName={match.displayName}
          onClose={() => setReportVisible(false)}
          onBlocked={() => { closeChat(); router.back() }}
        />
      )}

      {/* E2E notice — shown once at top */}
      {messages.length === 0 && (
        <View style={styles.e2eNotice}>
          <Text style={styles.e2eText}>
            ⊕  End-to-end encrypted · no server reads this
          </Text>
        </View>
      )}

      {/* Messages */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Text style={styles.emptyChatText}>
                You matched nearby. Say hello.
              </Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const isMe     = item.from === myPeerId
            const next     = messages[index + 1]
            const showTime = !next || next.from !== item.from ||
                             (next.ts - item.ts) > 60_000
            return (
              <MessageBubble msg={item} isMe={isMe} showTime={showTime} />
            )
          }}
        />

        {/* Photo strip */}
        {photos.length > 0 && (
          <FlatList
            data={photos}
            horizontal
            keyExtractor={p => p.ts.toString()}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photoStrip}
            renderItem={({ item }) => (
              <Image source={{ uri: item.uri }} style={styles.photoThumb} resizeMode="cover" />
            )}
          />
        )}

        {/* Icebreaker suggestions — only when thread is empty */}
        {messages.length === 0 && icebreakers.length > 0 && (
          <View style={styles.icebreakerStrip}>
            <Text style={styles.icebreakerStripLabel}>Conversation starters</Text>
            <FlatList
              data={icebreakers}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={ib => ib.id}
              contentContainerStyle={styles.icebreakerRow}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [
                    styles.icebreakerChip,
                    pressed && styles.icebreakerChipPressed,
                  ]}
                  onPress={() => {
                    setText(item.text)
                    setIcebreakers([])
                  }}
                >
                  <Text style={styles.icebreakerChipText} numberOfLines={2}>
                    {item.text}
                  </Text>
                  {item.tags.length > 0 && (
                    <Text style={styles.icebreakerChipTag}>#{item.tags[0]}</Text>
                  )}
                </Pressable>
              )}
            />
          </View>
        )}

        {/* Shared tags banner — compact, shows once */}
        {messages.length === 0 && match?.sharedTags && match.sharedTags.length > 0 && (
          <View style={styles.sharedTagsBanner}>
            <Text style={styles.sharedTagsBannerText}>
              You both love{' '}
              <Text style={styles.sharedTagsBannerHighlight}>
                {match.sharedTags.slice(0, 3).join(', ')}
              </Text>
            </Text>
          </View>
        )}

        {/* Input bar */}
        <View style={styles.inputRow}>
          <Pressable
            style={styles.photoBtn}
            onPress={handlePhotoPress}
            accessibilityLabel="Share a photo"
          >
            <Text style={styles.photoBtnText}>⊕</Text>
          </Pressable>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Message"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={1000}
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />
          <Pressable
            style={[
              styles.sendBtn,
              (!text.trim() || sending) && styles.sendBtnDisabled,
            ]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
            accessibilityLabel="Send message"
          >
            <Text style={styles.sendBtnText}>↑</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    gap:             spacing.sm,
  },
  backBtn: {
    width:  36,
    height: 36,
    alignItems:     'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize:   24,
    color:      colors.textSecondary,
    lineHeight: 28,
  },
  headerInfo: {
    flex: 1,
    gap:  2,
  },
  headerName: {
    ...typography.label,
    fontSize: fontSizes.md,
    color:    colors.textPrimary,
  },
  headerStatusRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.xs,
  },
  statusDot: {
    width:        5,
    height:       5,
    borderRadius: 2.5,
  },
  headerStatus: {
    ...typography.mono,
    fontSize: fontSizes.xs,
    color:    colors.textMuted,
  },
  e2eNotice: {
    alignItems:   'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  e2eText: {
    ...typography.mono,
    fontSize: fontSizes.xs,
    color:    colors.textMuted,
  },
  messageList: {
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.md,
    flexGrow:          1,
    justifyContent:    'flex-end',
  },
  bubbleRow: {
    flexDirection: 'row',
    marginBottom:  4,
  },
  bubbleRowMe: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth:      '75%',
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    borderRadius:  radius.lg,
  },
  bubbleMe: {
    backgroundColor: colors.textPrimary,
    borderBottomRightRadius: radius.sm,
  },
  bubbleThem: {
    backgroundColor: colors.surfaceHigh,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderBottomLeftRadius: radius.sm,
  },
  bubblePending: {
    opacity: 0.6,
  },
  bubbleText: {
    ...typography.body,
    fontSize:   fontSizes.md,
    color:      colors.textPrimary,
    lineHeight: 22,
  },
  bubbleTextMe: {
    color: colors.bg,
  },
  timeLabel: {
    ...typography.mono,
    fontSize:    fontSizes.xs,
    color:       colors.textMuted,
    marginBottom: spacing.sm,
    paddingLeft:  spacing.xs,
  },
  timeLabelMe: {
    textAlign: 'right',
    paddingLeft:  0,
    paddingRight: spacing.xs,
  },
  emptyChat: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyChatText: {
    ...typography.body,
    fontSize:  fontSizes.sm,
    color:     colors.textMuted,
    textAlign: 'center',
  },
  inputRow: {
    flexDirection:   'row',
    alignItems:      'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.md,
    borderTopWidth:  0.5,
    borderTopColor:  colors.border,
    gap:             spacing.sm,
    backgroundColor: colors.bg,
  },
  input: {
    flex:            1,
    ...typography.body,
    fontSize:        fontSizes.md,
    color:           colors.textPrimary,
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    maxHeight:       120,
  },
  sendBtn: {
    width:           40,
    height:          40,
    borderRadius:    20,
    backgroundColor: colors.textPrimary,
    alignItems:      'center',
    justifyContent:  'center',
  },
  sendBtnDisabled: {
    backgroundColor: colors.surfaceHigh,
  },
  sendBtnText: {
    fontSize:   18,
    color:      colors.bg,
    fontWeight: '500',
    lineHeight: 22,
  },
  photoStrip: {
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    gap:               spacing.sm,
    borderTopWidth:    0.5,
    borderTopColor:    colors.border,
  },
  photoThumb: {
    width:        72,
    height:       72,
    borderRadius: radius.sm,
    borderWidth:  0.5,
    borderColor:  colors.border,
  },
  photoBtn: {
    width:           40,
    height:          40,
    borderRadius:    20,
    backgroundColor: colors.surfaceHigh,
    borderWidth:     0.5,
    borderColor:     colors.border,
    alignItems:      'center',
    justifyContent:  'center',
  },
  photoBtnText: {
    fontSize:   18,
    color:      colors.textSecondary,
    lineHeight: 22,
  },
  blockBtn: {
    width: 34, height: 34, alignItems: 'center', justifyContent: 'center',
    borderRadius: 17, borderWidth: 0.5, borderColor: colors.border,
  },
  blockBtnText: { fontSize: 15, color: colors.textMuted },
  errorText: {
    ...typography.body,
    color:     colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
  backLink: {
    ...typography.label,
    color:     colors.pulse,
    textAlign: 'center',
    marginTop: spacing.md,
  },

  // Icebreaker strip
  icebreakerStrip: {
    borderTopWidth:  0.5,
    borderTopColor:  colors.border,
    paddingTop:      spacing.sm,
    paddingBottom:   spacing.xs,
    backgroundColor: colors.bg,
  },
  icebreakerStripLabel: {
    ...typography.label,
    fontSize:          fontSizes.xs,
    color:             colors.textMuted,
    textTransform:     'uppercase',
    letterSpacing:     0.8,
    paddingHorizontal: spacing.md,
    marginBottom:      spacing.xs,
  },
  icebreakerRow: {
    paddingHorizontal: spacing.md,
    gap:               spacing.sm,
  },
  icebreakerChip: {
    backgroundColor: colors.surfaceHigh,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         spacing.sm,
    maxWidth:        220,
    gap:             3,
  },
  icebreakerChipPressed: {
    borderColor:     colors.pulse,
    backgroundColor: colors.pulseAlpha14,
  },
  icebreakerChipText: {
    ...typography.body,
    fontSize:  fontSizes.sm,
    color:     colors.textPrimary,
    lineHeight: 18,
  },
  icebreakerChipTag: {
    ...typography.mono,
    fontSize: fontSizes.xs,
    color:    colors.textMuted,
  },

  // Shared tags banner
  sharedTagsBanner: {
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    backgroundColor:   colors.bg,
    alignItems:        'center',
  },
  sharedTagsBannerText: {
    ...typography.body,
    fontSize:  fontSizes.sm,
    color:     colors.textMuted,
    textAlign: 'center',
  },
  sharedTagsBannerHighlight: {
    color:     colors.pulse,
    fontWeight: '600',
  },
})
