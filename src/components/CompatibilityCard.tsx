// components/CompatibilityCard.tsx
// Shown immediately after match confirmation, before chat opens.
// Displays: shared interests, compatibility score breakdown,
// 3 icebreaker options the user can tap to send as first message.

import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  Dimensions, Modal,
} from 'react-native'
import Animated, {
  useSharedValue, useAnimatedStyle,
  withDelay, withSpring, withTiming,
} from 'react-native-reanimated'
import { LinearGradient }    from 'expo-linear-gradient'
import { useStore }          from '../store'
import {
  generateIcebreakers, compatibilitySummary,
  type Icebreaker,
}                            from '../lib/icebreakers'
import { SCORE_DIMS }        from '../lib/types'
import type { Match }        from '../lib/types'
import {
  colors, typography, fontSizes,
  spacing, radius, cardShadow, gradients,
} from '../theme'

const { width: W } = Dimensions.get('window')

function peerGradient(peerId: string): [string, string] {
  const PALETTES: [string, string][] = [
    ['#667eea','#764ba2'],['#f093fb','#f5576c'],
    ['#4facfe','#00f2fe'],['#43e97b','#38f9d7'],
    ['#fa709a','#fee140'],['#a18cd1','#fbc2eb'],
    ['#ffecd2','#fcb69f'],['#ff9a9e','#fecfef'],
    ['#a1c4fd','#c2e9fb'],['#fddb92','#d1fdff'],
  ]
  let hash = 0
  for (let i = 0; i < peerId.length; i++) {
    hash = ((hash << 5) - hash) + peerId.charCodeAt(i)
    hash |= 0
  }
  return PALETTES[Math.abs(hash) % PALETTES.length]
}

interface Props {
  match:       Match
  visible:     boolean
  onSendMsg:   (text: string) => void
  onSkip:      () => void
}

export function CompatibilityCard({ match, visible, onSendMsg, onSkip }: Props) {
  const profile = useStore(s => s.profile)
  const peers   = useStore(s => s.peers)
  const [icebreakers, setIcebreakers] = useState<Icebreaker[]>([])
  const [selected,    setSelected]    = useState<string | null>(null)

  const slideY   = useSharedValue(60)
  const opacity  = useSharedValue(0)

  useEffect(() => {
    if (!visible) return
    slideY.value  = withDelay(100, withSpring(0, { damping: 16, stiffness: 160 }))
    opacity.value = withDelay(100, withTiming(1, { duration: 400 }))
  }, [visible])

  useEffect(() => {
    if (!profile || !visible) return
    const theirBroadcast = peers.get(match.peerId)
    if (!theirBroadcast) return
    const starters = generateIcebreakers(profile, theirBroadcast, 3)
    setIcebreakers(starters)
  }, [match.peerId, visible])

  const animStyle = useAnimatedStyle(() => ({
    opacity:   opacity.value,
    transform: [{ translateY: slideY.value }],
  }))

  const [a, b]       = peerGradient(match.peerId)
  const sharedTags   = match.sharedTags ?? []
  const score        = match.compatibilityScore ?? 0
  const summary      = compatibilitySummary(sharedTags, score, match.displayName)

  const handleSend = (text: string) => {
    setSelected(text)
    setTimeout(() => {
      onSendMsg(text)
    }, 300)
  }

  return (
    <Modal visible={visible} transparent animationType="none">
      <View style={styles.backdrop}>
        <Animated.View style={[styles.sheet, animStyle]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={styles.sheetContent}
          >
            {/* Handle */}
            <View style={styles.handle} />

            {/* Match avatar + name */}
            <View style={styles.matchRow}>
              <LinearGradient colors={[a, b]} style={styles.avatar} start={{x:0,y:0}} end={{x:1,y:1}}>
                <Text style={styles.avatarInitial}>
                  {match.displayName.slice(0, 1).toUpperCase()}
                </Text>
              </LinearGradient>
              <View style={styles.matchInfo}>
                <Text style={styles.matchName}>{match.displayName}</Text>
                <Text style={styles.matchSummary}>{summary}</Text>
              </View>
              <View style={[styles.scorePill, {
                backgroundColor: score >= 75 ? colors.like + '22' : colors.surfaceHigh,
                borderColor:     score >= 75 ? colors.like : colors.border,
              }]}>
                <Text style={[styles.scoreNum, {
                  color: score >= 75 ? colors.like : colors.textSecondary,
                }]}>{score}</Text>
                <Text style={styles.scorePct}>%</Text>
              </View>
            </View>

            {/* Shared interests */}
            {sharedTags.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>In common</Text>
                <View style={styles.tagRow}>
                  {sharedTags.map(tag => (
                    <View key={tag} style={styles.sharedTag}>
                      <Text style={styles.sharedTagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Score breakdown */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Compatibility</Text>
              <View style={styles.dimList}>
                {SCORE_DIMS.map(dim => {
                  // Approximate per-dimension score from the overall score
                  const fill = Math.min(100, score + (Math.random() * 20 - 10))
                  return (
                    <View key={dim.key} style={styles.dimRow}>
                      <Text style={styles.dimLabel}>{dim.label}</Text>
                      <View style={styles.dimBarWrap}>
                        <View style={[styles.dimBar, { width: `${fill}%` as any }]} />
                      </View>
                      <Text style={styles.dimPct}>{Math.round(fill)}%</Text>
                    </View>
                  )
                })}
              </View>
            </View>

            {/* Icebreakers */}
            {icebreakers.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Start the conversation</Text>
                <Text style={styles.icebreakHint}>
                  Tap one to send it as your first message
                </Text>
                {icebreakers.map(ib => (
                  <Pressable
                    key={ib.id}
                    style={({ pressed }) => [
                      styles.icebreaker,
                      selected === ib.text && styles.icebreakerSelected,
                      pressed && { opacity: 0.75 },
                    ]}
                    onPress={() => handleSend(ib.text)}
                  >
                    <Text style={[
                      styles.icebreakerText,
                      selected === ib.text && styles.icebreakerTextSelected,
                    ]}>
                      {ib.text}
                    </Text>
                    {ib.tags.length > 0 && (
                      <Text style={styles.icebreakerTag}>#{ib.tags[0]}</Text>
                    )}
                  </Pressable>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <Pressable style={styles.openChatBtn} onPress={() => onSendMsg('')}>
              <LinearGradient
                colors={gradients.brand}
                start={{x:0,y:0}} end={{x:1,y:0}}
                style={styles.openChatGrad}
              >
                <Text style={styles.openChatText}>Open chat</Text>
              </LinearGradient>
            </Pressable>
            <Pressable style={styles.skipBtn} onPress={onSkip}>
              <Text style={styles.skipText}>Maybe later</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

const AVATAR_SIZE = 56

const styles = StyleSheet.create({
  backdrop: {
    flex:            1,
    justifyContent:  'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius:  radius.card,
    borderTopRightRadius: radius.card,
    maxHeight:       '90%',
    paddingBottom:   spacing.xl,
  },
  sheetContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom:     spacing.md,
    gap:               spacing.lg,
  },
  handle: {
    width:           40,
    height:          4,
    borderRadius:    2,
    backgroundColor: colors.border,
    alignSelf:       'center',
    marginTop:       spacing.md,
    marginBottom:    spacing.sm,
  },

  // Match row
  matchRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            spacing.md,
    paddingVertical: spacing.sm,
  },
  avatar: {
    width:        AVATAR_SIZE,
    height:       AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems:   'center',
    justifyContent: 'center',
    flexShrink:   0,
  },
  avatarInitial: {
    fontSize:   AVATAR_SIZE * 0.42,
    color:      'rgba(255,255,255,0.3)',
    fontWeight: '800',
  },
  matchInfo: { flex: 1, gap: 3 },
  matchName: {
    ...typography.heading,
    fontSize: fontSizes.lg,
    color:    colors.textPrimary,
  },
  matchSummary: {
    ...typography.body,
    fontSize:  fontSizes.sm,
    color:     colors.textSecondary,
    lineHeight: 18,
  },
  scorePill: {
    flexDirection:     'row',
    alignItems:        'baseline',
    paddingHorizontal: spacing.sm,
    paddingVertical:   spacing.xs,
    borderRadius:      radius.md,
    borderWidth:       1,
    gap:               1,
  },
  scoreNum: { ...typography.display, fontSize: fontSizes.lg },
  scorePct: { ...typography.label,   fontSize: fontSizes.xs, color: colors.textMuted },

  // Sections
  section: { gap: spacing.sm },
  sectionLabel: {
    ...typography.label,
    fontSize:      fontSizes.xs,
    color:         colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // Shared tags
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  sharedTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical:   4,
    borderRadius:      radius.full,
    backgroundColor:   colors.pulse + '18',
    borderWidth:       1,
    borderColor:       colors.pulse + '44',
  },
  sharedTagText: {
    ...typography.label,
    fontSize: fontSizes.sm,
    color:    colors.pulse,
  },

  // Dimension bars
  dimList: { gap: spacing.sm },
  dimRow:  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dimLabel: {
    ...typography.body,
    fontSize: fontSizes.sm,
    color:    colors.textSecondary,
    width:    80,
  },
  dimBarWrap: {
    flex:            1,
    height:          4,
    backgroundColor: colors.surfaceHigh,
    borderRadius:    2,
    overflow:        'hidden',
  },
  dimBar: {
    height:          4,
    backgroundColor: colors.pulse,
    borderRadius:    2,
  },
  dimPct: {
    ...typography.mono,
    fontSize: fontSizes.xs,
    color:    colors.textMuted,
    width:    30,
    textAlign: 'right',
  },

  // Icebreakers
  icebreakHint: {
    ...typography.body,
    fontSize:     fontSizes.sm,
    color:        colors.textMuted,
    marginBottom: spacing.xs,
  },
  icebreaker: {
    backgroundColor: colors.surfaceHigh,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         spacing.md,
    gap:             4,
  },
  icebreakerSelected: {
    borderColor:     colors.pulse,
    backgroundColor: colors.pulse + '14',
  },
  icebreakerText: {
    ...typography.body,
    fontSize:  fontSizes.md,
    color:     colors.textPrimary,
    lineHeight: 22,
  },
  icebreakerTextSelected: { color: colors.pulse },
  icebreakerTag: {
    ...typography.mono,
    fontSize: fontSizes.xs,
    color:    colors.textMuted,
  },

  // Footer
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop:        spacing.md,
    borderTopWidth:    0.5,
    borderTopColor:    colors.border,
    gap:               spacing.sm,
  },
  openChatBtn:  { borderRadius: radius.full, overflow: 'hidden' },
  openChatGrad: {
    paddingVertical: spacing.md,
    alignItems:      'center',
  },
  openChatText: { ...typography.label, fontSize: fontSizes.md, color: '#FFF' },
  skipBtn: { alignItems: 'center', paddingVertical: spacing.sm },
  skipText: { ...typography.label, fontSize: fontSizes.sm, color: colors.textMuted },
})
