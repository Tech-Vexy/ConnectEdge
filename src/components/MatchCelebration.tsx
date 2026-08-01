// components/MatchCelebration.tsx
// Fires when match:confirmed event arrives.
// Full-screen overlay — two avatar circles collide, "It's a Match!" text,
// two CTA buttons: Send Message / Keep Swiping.

import React, { useEffect, useRef, useMemo } from 'react'
import {
  View, Text, StyleSheet, Pressable, Modal,
  useWindowDimensions,
} from 'react-native'
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withDelay,
  withSequence, Easing,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { colors, typography, fontSizes, spacing, radius, gradients } from '../theme'
import type { Match } from '../lib/types'
import { peerGradient } from '../lib/peer-gradient'

interface Props {
  match:       Match | null
  myName:      string
  onMessage:   () => void
  onKeepSwiping: () => void
}

function Avatar({ name, peerId, side }: { name: string; peerId: string; side: 'left' | 'right' }) {
  const [a, b] = peerGradient(peerId)
  const scale   = useSharedValue(0)
  const translateX = useSharedValue(side === 'left' ? -60 : 60)

  useEffect(() => {
    scale.value = withDelay(200,
      withSpring(1, { damping: 12, stiffness: 180 })
    )
    translateX.value = withDelay(200,
      withSpring(0, { damping: 14, stiffness: 160 })
    )
  }, [])

  const style = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: translateX.value },
    ],
  }))

  return (
    <Animated.View style={[styles.avatarWrap, style]}>
      <LinearGradient colors={[a, b]} style={styles.avatarGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <Text style={styles.avatarInitial}>{name.slice(0, 1).toUpperCase()}</Text>
      </LinearGradient>
    </Animated.View>
  )
}

export function MatchCelebration({ match, myName, onMessage, onKeepSwiping }: Props) {
  const { width, height } = useWindowDimensions()
  const particles = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
    top:    (i * 0.083 * height) % height,
    left:   ((i * 73 + 17) % width),
    size:   4 + (i % 3) * 4,
    opacity: 0.15 + (i % 4) * 0.08,
  })), [width, height])
  const titleOpacity   = useSharedValue(0)
  const titleTranslate = useSharedValue(24)
  const ctaOpacity     = useSharedValue(0)

  useEffect(() => {
    if (!match) return
    titleOpacity.value   = withDelay(500, withTiming(1, { duration: 500 }))
    titleTranslate.value = withDelay(500, withSpring(0, { damping: 14 }))
    ctaOpacity.value     = withDelay(900, withTiming(1, { duration: 400 }))
  }, [match])

  const titleStyle = useAnimatedStyle(() => ({
    opacity:   titleOpacity.value,
    transform: [{ translateY: titleTranslate.value }],
  }))
  const ctaStyle = useAnimatedStyle(() => ({ opacity: ctaOpacity.value }))

  if (!match) return null

  return (
    <Modal visible={!!match} transparent animationType="fade">
      <View style={styles.overlay}>
        {/* Background gradient */}
        <LinearGradient
          colors={['rgba(255,68,88,0.92)', 'rgba(255,120,84,0.95)']}
          style={StyleSheet.absoluteFill}
        />

        {/* Particle dots — deterministic decorative circles */}
        {particles.map((p, i) => (
          <View
            key={i}
            style={[
              styles.particle,
              {
                top:    p.top,
                left:   p.left,
                width:  p.size,
                height: p.size,
                opacity: p.opacity,
              },
            ]}
          />
        ))}

        <View style={styles.content}>
          {/* Match label */}
          <Animated.View style={titleStyle}>
            <Text style={styles.matchedLabel}>It's a Match!</Text>
            <Text style={styles.matchedSub}>
              You and {match.displayName} liked each other nearby
            </Text>
          </Animated.View>

          {/* Two avatars */}
          <View style={styles.avatarRow}>
            <Avatar name={myName}            peerId="self"         side="left"  />
            <View style={styles.heartDivider}>
              <Text style={styles.heartIcon}>♥</Text>
            </View>
            <Avatar name={match.displayName} peerId={match.peerId} side="right" />
          </View>

          {/* CTA buttons */}
          <Animated.View style={[styles.cta, ctaStyle]}>
            <Pressable
              style={styles.messageBtn}
              onPress={onMessage}
              accessibilityLabel="Send a message"
            >
              <Text style={styles.messageBtnText}>Send a Message</Text>
            </Pressable>

            <Pressable
              style={styles.keepSwipingBtn}
              onPress={onKeepSwiping}
              accessibilityLabel="Keep swiping"
            >
              <Text style={styles.keepSwipingText}>Keep Swiping</Text>
            </Pressable>
          </Animated.View>

          {/* E2E notice */}
          <Text style={styles.e2eNote}>
            🔒 Your match is end-to-end encrypted
          </Text>
        </View>
      </View>
    </Modal>
  )
}

const AVATAR_SIZE = 110

const styles = StyleSheet.create({
  overlay: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  particle: {
    position:     'absolute',
    borderRadius: 99,
    backgroundColor: '#FFF',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
    width: '100%',
  },
  matchedLabel: {
    ...typography.display,
    fontSize:  fontSizes.hero,
    color:     '#FFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  matchedSub: {
    ...typography.body,
    fontSize:   fontSizes.md,
    color:      'rgba(255,255,255,0.85)',
    textAlign:  'center',
    marginTop:  spacing.sm,
    lineHeight: 22,
  },
  avatarRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            spacing.md,
  },
  avatarWrap: {
    width:        AVATAR_SIZE,
    height:       AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth:  3,
    borderColor:  '#FFF',
    overflow:     'hidden',
    shadowColor:  '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation:    10,
  },
  avatarGradient: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize:   AVATAR_SIZE * 0.42,
    color:      'rgba(255,255,255,0.3)',
    fontWeight: '800',
  },
  heartDivider: {
    width:           44,
    height:          44,
    borderRadius:    22,
    backgroundColor: '#FFF',
    alignItems:      'center',
    justifyContent:  'center',
    shadowColor:     colors.pulse,
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.5,
    shadowRadius:    8,
    elevation:       8,
  },
  heartIcon: {
    fontSize:  22,
    color:     colors.pulse,
    lineHeight: 26,
  },
  cta: {
    width: '100%',
    gap:   spacing.sm,
  },
  messageBtn: {
    backgroundColor: '#FFF',
    borderRadius:    radius.full,
    paddingVertical: spacing.md + 2,
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.2,
    shadowRadius:    8,
    elevation:       6,
  },
  messageBtnText: {
    ...typography.label,
    fontSize: fontSizes.lg,
    color:    colors.pulse,
  },
  keepSwipingBtn: {
    borderRadius:    radius.full,
    paddingVertical: spacing.md,
    alignItems:      'center',
    borderWidth:     1.5,
    borderColor:     'rgba(255,255,255,0.5)',
  },
  keepSwipingText: {
    ...typography.label,
    fontSize: fontSizes.md,
    color:    '#FFF',
  },
  e2eNote: {
    ...typography.body,
    fontSize: fontSizes.xs,
    color:    'rgba(255,255,255,0.55)',
    textAlign: 'center',
    marginTop: -spacing.sm,
  },
})
