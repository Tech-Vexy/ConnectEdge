// components/SwipeCard.tsx
// Full-screen swipeable profile card — the core Tinder-like interaction.
//
// Gesture model:
//   Drag right  → like  (green overlay, heart stamp)
//   Drag left   → pass  (red overlay, X stamp)
//   Drag up     → super like  (blue overlay, star stamp)
//   Release at >SWIPE_THRESHOLD → commit action + eject card
//   Release below threshold → spring back to center
//
// Built with react-native-reanimated + react-native-gesture-handler
// (both already in package.json).
//
// No actual photo until post-match — card shows a deterministic
// gradient avatar generated from the peerId hash.

import React, { useCallback } from 'react'
import {
  View, Text, StyleSheet, Dimensions, Platform,
} from 'react-native'
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring,
  withTiming, runOnJS, interpolate, Extrapolation,
  useAnimatedGestureHandler,
} from 'react-native-reanimated'
import { PanGestureHandler, type PanGestureHandlerGestureEvent } from 'react-native-gesture-handler'
import { LinearGradient } from 'expo-linear-gradient'
import type { PeerBroadcast } from '../lib/types'
import { colors, typography, fontSizes, spacing, radius, cardShadow } from '../theme'

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')
export const CARD_W = SCREEN_W - spacing.lg * 2
export const CARD_H = SCREEN_H * 0.68

const SWIPE_THRESHOLD = SCREEN_W * 0.32
const SUPER_THRESHOLD = -SCREEN_H * 0.22
const ROTATION_FACTOR = 12   // degrees at full swipe

export type SwipeAction = 'like' | 'pass' | 'super'

interface Props {
  peer:      PeerBroadcast
  score:     number
  index:     number
  onSwipe:   (peerId: string, action: SwipeAction) => void
  verified?: { institution: string; tier: string } | null
}

// Deterministic gradient from peerId — same peer always gets same colours
function peerGradient(peerId: string): [string, string] {
  const PALETTES: [string, string][] = [
    ['#667eea', '#764ba2'],
    ['#f093fb', '#f5576c'],
    ['#4facfe', '#00f2fe'],
    ['#43e97b', '#38f9d7'],
    ['#fa709a', '#fee140'],
    ['#a18cd1', '#fbc2eb'],
    ['#ffecd2', '#fcb69f'],
    ['#ff9a9e', '#fecfef'],
    ['#a1c4fd', '#c2e9fb'],
    ['#fddb92', '#d1fdff'],
  ]
  let hash = 0
  for (let i = 0; i < peerId.length; i++) {
    hash = ((hash << 5) - hash) + peerId.charCodeAt(i)
    hash |= 0
  }
  return PALETTES[Math.abs(hash) % PALETTES.length]
}

function intentLabel(score: number): string {
  if (score >= 80) return '🔥 Great match'
  if (score >= 65) return '✨ Good match'
  if (score >= 50) return 'Nearby'
  return 'In the area'
}

export function SwipeCard({ peer, score, index, onSwipe, verified }: Props) {
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const [gradA, gradB] = peerGradient(peer.peerId)

  const isTopCard = index === 0

  const gestureHandler = useAnimatedGestureHandler<
    PanGestureHandlerGestureEvent,
    { startX: number; startY: number }
  >({
    onStart: (_, ctx) => {
      ctx.startX = translateX.value
      ctx.startY = translateY.value
    },
    onActive: (event, ctx) => {
      if (!isTopCard) return
      translateX.value = ctx.startX + event.translationX
      translateY.value = ctx.startY + event.translationY
    },
    onEnd: (event) => {
      if (!isTopCard) return
      const vx = event.velocityX
      const vy = event.velocityY

      // Super like — swipe up fast or far
      if (translateY.value < SUPER_THRESHOLD || vy < -800) {
        translateY.value = withTiming(-SCREEN_H, { duration: 300 })
        runOnJS(onSwipe)(peer.peerId, 'super')
        return
      }

      // Like — swipe right
      if (translateX.value > SWIPE_THRESHOLD || vx > 600) {
        translateX.value = withTiming(SCREEN_W * 1.5, { duration: 300 })
        runOnJS(onSwipe)(peer.peerId, 'like')
        return
      }

      // Pass — swipe left
      if (translateX.value < -SWIPE_THRESHOLD || vx < -600) {
        translateX.value = withTiming(-SCREEN_W * 1.5, { duration: 300 })
        runOnJS(onSwipe)(peer.peerId, 'pass')
        return
      }

      // Spring back
      translateX.value = withSpring(0, { damping: 15, stiffness: 200 })
      translateY.value = withSpring(0, { damping: 15, stiffness: 200 })
    },
  })

  const cardStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      translateX.value,
      [-SCREEN_W / 2, 0, SCREEN_W / 2],
      [-ROTATION_FACTOR, 0, ROTATION_FACTOR],
      Extrapolation.CLAMP,
    )
    const scale = index === 0 ? 1 : index === 1 ? 0.95 : 0.90
    const yOffset = index === 1 ? 12 : index === 2 ? 24 : 0

    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value + yOffset },
        { rotate: `${rotate}deg` },
        { scale },
      ],
      zIndex: 10 - index,
    }
  })

  // Stamp overlays
  const likeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value, [0, SWIPE_THRESHOLD * 0.5], [0, 1], Extrapolation.CLAMP,
    ),
  }))
  const passStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value, [-SWIPE_THRESHOLD * 0.5, 0], [1, 0], Extrapolation.CLAMP,
    ),
  }))
  const superStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value, [SUPER_THRESHOLD * 0.5, 0], [1, 0], Extrapolation.CLAMP,
    ),
  }))

  return (
    <PanGestureHandler onGestureEvent={gestureHandler} enabled={isTopCard}>
      <Animated.View style={[styles.card, cardStyle, cardShadow]}>
        {/* Background gradient avatar */}
        <LinearGradient
          colors={[gradA, gradB]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          {/* Initials */}
          <Text style={styles.initials}>
            {peer.displayName.slice(0, 1).toUpperCase()}
          </Text>
        </LinearGradient>

        {/* Bottom info overlay */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.90)']}
          style={styles.infoOverlay}
        >
          <View style={styles.infoContent}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{peer.displayName}</Text>
              <Text style={styles.age}>{peer.age}</Text>
              {verified && (
                <View style={styles.verifiedChip}>
                  <Text style={styles.verifiedChipText}>✓ Verified</Text>
                </View>
              )}
            </View>

            {verified && (
              <Text style={styles.verifiedInstitution}>{verified.institution}</Text>
            )}

            <Text style={styles.intentBadge}>{intentLabel(score)}</Text>

            <View style={styles.tags}>
              {peer.interestTags.slice(0, 4).map(tag => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>

            {/* Score bar */}
            <View style={styles.scoreRow}>
              <View style={styles.scoreBar}>
                <Animated.View style={[styles.scoreFill, { width: `${score}%` }]} />
              </View>
              <Text style={styles.scoreLabel}>{score}% match</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Swipe stamps */}
        <Animated.View style={[styles.stamp, styles.stampLike, likeStyle]}>
          <Text style={styles.stampTextLike}>LIKE</Text>
        </Animated.View>
        <Animated.View style={[styles.stamp, styles.stampPass, passStyle]}>
          <Text style={styles.stampTextPass}>NOPE</Text>
        </Animated.View>
        <Animated.View style={[styles.stamp, styles.stampSuper, superStyle]}>
          <Text style={styles.stampTextSuper}>SUPER</Text>
        </Animated.View>

        {/* PeerID — subtle texture at very bottom */}
        <Text style={styles.peerId} numberOfLines={1}>
          {peer.peerId.slice(0, 16)}…
        </Text>
      </Animated.View>
    </PanGestureHandler>
  )
}

// Animated action button — used in the button row below the deck
interface ActionBtnProps {
  onPress:     () => void
  icon:        string
  color:       string
  size?:       'sm' | 'lg'
  bg?:         string
}

export function ActionButton({ onPress, icon, color, size = 'lg', bg }: ActionBtnProps) {
  const dim = size === 'lg' ? 64 : 50
  return (
    <Animated.View>
      <View
        style={[
          styles.actionBtn,
          {
            width:           dim,
            height:          dim,
            borderRadius:    dim / 2,
            backgroundColor: bg ?? colors.surface,
            borderColor:     color,
          },
        ]}
      >
        <Text
          style={{ fontSize: size === 'lg' ? 28 : 22, lineHeight: size === 'lg' ? 32 : 26 }}
          onPress={onPress}
        >
          {icon}
        </Text>
      </View>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  card: {
    position:     'absolute',
    width:        CARD_W,
    height:       CARD_H,
    borderRadius: radius.card,
    overflow:     'hidden',
    backgroundColor: colors.surface,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
    alignItems:     'center',
    justifyContent: 'center',
  },
  initials: {
    fontSize:   CARD_W * 0.28,
    color:      'rgba(255,255,255,0.25)',
    fontWeight: '800',
    letterSpacing: -4,
  },
  infoOverlay: {
    position: 'absolute',
    bottom:   0,
    left:     0,
    right:    0,
    paddingTop: 80,
  },
  infoContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom:     spacing.lg,
    gap:               spacing.sm,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems:    'baseline',
    gap:           spacing.sm,
  },
  name: {
    ...typography.display,
    fontSize: fontSizes.xxl,
    color:    '#FFF',
  },
  age: {
    ...typography.heading,
    fontSize: fontSizes.xl,
    color:    'rgba(255,255,255,0.85)',
  },
  intentBadge: {
    ...typography.label,
    fontSize: fontSizes.sm,
    color:    'rgba(255,255,255,0.75)',
  },
  tags: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           spacing.xs,
  },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical:   3,
    borderRadius:      radius.full,
    backgroundColor:   'rgba(255,255,255,0.18)',
    borderWidth:       0.5,
    borderColor:       'rgba(255,255,255,0.3)',
  },
  tagText: {
    ...typography.label,
    fontSize: fontSizes.xs,
    color:    '#FFF',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
    marginTop:     spacing.xs,
  },
  scoreBar: {
    flex:            1,
    height:          3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius:    2,
    overflow:        'hidden',
  },
  scoreFill: {
    height:          3,
    backgroundColor: colors.like,
    borderRadius:    2,
  },
  scoreLabel: {
    ...typography.label,
    fontSize: fontSizes.xs,
    color:    'rgba(255,255,255,0.6)',
  },

  // Stamps
  stamp: {
    position:     'absolute',
    top:          spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical:   spacing.sm,
    borderRadius: radius.sm,
    borderWidth:  3,
  },
  stampLike: {
    right:       spacing.lg,
    borderColor: colors.like,
    transform:   [{ rotate: '15deg' }],
  },
  stampPass: {
    left:        spacing.lg,
    borderColor: colors.pass,
    transform:   [{ rotate: '-15deg' }],
  },
  stampSuper: {
    alignSelf:   'center',
    left:        CARD_W / 2 - 70,
    top:         CARD_H * 0.35,
    borderColor: colors.superLike,
  },
  stampTextLike: {
    ...typography.display,
    fontSize: fontSizes.xl,
    color:    colors.like,
  },
  stampTextPass: {
    ...typography.display,
    fontSize: fontSizes.xl,
    color:    colors.pass,
  },
  stampTextSuper: {
    ...typography.display,
    fontSize: fontSizes.xl,
    color:    colors.superLike,
  },

  verifiedChip: {
    backgroundColor: 'rgba(76, 217, 100, 0.25)',
    borderRadius:    radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical:   2,
    borderWidth:     1,
    borderColor:     'rgba(76, 217, 100, 0.6)',
  },
  verifiedChipText: {
    ...typography.label,
    fontSize: fontSizes.xs,
    color:    '#4CD964',
  },
  verifiedInstitution: {
    ...typography.label,
    fontSize: fontSizes.xs,
    color:    'rgba(76, 217, 100, 0.85)',
    marginTop: -spacing.xs,
  },
  peerId: {
    position:  'absolute',
    bottom:    spacing.xs,
    left:      spacing.md,
    right:     spacing.md,
    ...typography.mono,
    fontSize:  8,
    color:     'rgba(255,255,255,0.12)',
    textAlign: 'center',
  },

  actionBtn: {
    borderWidth:    1.5,
    alignItems:     'center',
    justifyContent: 'center',
    ...cardShadow,
    shadowOpacity: 0.15,
  },
})
