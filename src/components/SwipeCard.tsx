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

import React, { useCallback, useEffect } from 'react'
import {
  View, Text, StyleSheet, Dimensions, Platform,
  useWindowDimensions,
} from 'react-native'
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring,
  withTiming, runOnJS, interpolate, Extrapolation,
  useAnimatedGestureHandler,
} from 'react-native-reanimated'
import { PanGestureHandler, type PanGestureHandlerGestureEvent } from 'react-native-gesture-handler'
import { LinearGradient } from 'expo-linear-gradient'
import type { PeerBroadcast } from '../lib/types'
import { peerGradient } from '../lib/peer-gradient'
import { colors, typography, fontSizes, spacing, radius, cardShadow } from '../theme'

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')
export const CARD_W = SCREEN_W - spacing.lg * 2
export const CARD_H = SCREEN_H * 0.68

const ROTATION_FACTOR = 15   // degrees at full swipe
const SPRING_CONFIG = { damping: 15, stiffness: 200 }

export type SwipeAction = 'like' | 'pass' | 'super'

interface Props {
  peer:      PeerBroadcast
  score:     number
  index:     number
  onSwipe:   (peerId: string, action: SwipeAction) => void
  verified?: { institution: string; tier: string } | null
}

function intentLabel(score: number): string {
  if (score >= 80) return '🔥 Great match'
  if (score >= 65) return '✨ Good match'
  if (score >= 50) return 'Nearby'
  return 'In the area'
}

function getProximityInfo(strength: number): { icon: string; text: string; color: string } {
  if (strength > 0.8) return { icon: '📍', text: 'Very close', color: '#4CD964' }
  if (strength > 0.5) return { icon: '📌', text: 'Nearby', color: '#FF9500' }
  return { icon: '🗺️', text: 'In the area', color: '#8E8E93' }
}

export function SwipeCard({ peer, score, index, onSwipe, verified }: Props) {
  const { width, height } = useWindowDimensions()
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const [gradA, gradB] = peerGradient(peer.peerId)

  // Dynamic thresholds & screen dimensions — responsive to orientation changes
  const swipeThreshold = useSharedValue(width * 0.28)
  const superThreshold  = useSharedValue(-height * 0.25)
  const screenW         = useSharedValue(width)
  const screenH         = useSharedValue(height)

  useEffect(() => {
    swipeThreshold.value = width * 0.28
    superThreshold.value  = -height * 0.25
    screenW.value         = width
    screenH.value         = height
  }, [width, height])

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
      if (translateY.value < superThreshold.value || vy < -900) {
        translateY.value = withTiming(-screenH.value, { duration: 350, easing: (v) => v })
        translateX.value = withTiming(0, { duration: 200 })
        runOnJS(onSwipe)(peer.peerId, 'super')
        return
      }

      // Like — swipe right
      if (translateX.value > swipeThreshold.value || vx > 700) {
        translateX.value = withTiming(screenW.value * 1.5, { duration: 350, easing: (v) => v })
        translateY.value = withTiming(0, { duration: 200 })
        runOnJS(onSwipe)(peer.peerId, 'like')
        return
      }

      // Pass — swipe left
      if (translateX.value < -swipeThreshold.value || vx < -700) {
        translateX.value = withTiming(-screenW.value * 1.5, { duration: 350, easing: (v) => v })
        translateY.value = withTiming(0, { duration: 200 })
        runOnJS(onSwipe)(peer.peerId, 'pass')
        return
      }

      // Spring back with better feel
      translateX.value = withSpring(0, SPRING_CONFIG)
      translateY.value = withSpring(0, SPRING_CONFIG)
    },
  })

  const cardStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      translateX.value,
      [-screenW.value / 2, 0, screenW.value / 2],
      [-ROTATION_FACTOR, 0, ROTATION_FACTOR],
      Extrapolation.CLAMP,
    )
    
    // Enhanced parallax for stacked cards with smoother transitions
    const scale = index === 0 ? 1 : index === 1 ? 0.97 : 0.94
    const yOffset = index === 1 ? 8 : index === 2 ? 16 : 0
    const xOffset = index * 1.5  // Subtle parallax depth
    const opacity = index === 0 ? 1 : index === 1 ? 0.9 : 0.8  // Fade background cards

    return {
      transform: [
        { translateX: translateX.value + xOffset },
        { translateY: translateY.value + yOffset },
        { rotate: `${rotate}deg` },
        { scale },
      ],
      opacity,
      zIndex: 10 - index,
    }
  })

  // Stamp overlays with scale animation
  const likeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value, [0, swipeThreshold.value * 0.4], [0, 1], Extrapolation.CLAMP,
    ),
    transform: [{
      scale: interpolate(
        translateX.value, [0, swipeThreshold.value * 0.4], [0.8, 1], Extrapolation.CLAMP,
      ),
    }],
  }))
  const passStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value, [-swipeThreshold.value * 0.4, 0], [1, 0], Extrapolation.CLAMP,
    ),
    transform: [{
      scale: interpolate(
        translateX.value, [-swipeThreshold.value * 0.4, 0], [1, 0.8], Extrapolation.CLAMP,
      ),
    }],
  }))
  const superStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value, [superThreshold.value * 0.4, 0], [1, 0], Extrapolation.CLAMP,
    ),
    transform: [{
      scale: interpolate(
        translateY.value, [superThreshold.value * 0.4, 0], [1, 0.8], Extrapolation.CLAMP,
      ),
    }],
  }))

  return (
    <PanGestureHandler onGestureEvent={gestureHandler} enabled={isTopCard}>
      <Animated.View style={[styles.card, { width: width - spacing.lg * 2, height: height * 0.68 }, cardStyle, cardShadow]}>
        {/* Background gradient avatar */}
        <LinearGradient
          colors={[gradA, gradB]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          {/* Initials */}
          <Text style={[styles.initials, { fontSize: (width - spacing.lg * 2) * 0.28 }]}>
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

            {/* Proximity indicator */}
            <View style={styles.proximityBadge}>
              <Text style={styles.proximityIcon}>
                {getProximityInfo(peer.signalStrength || 0.5).icon}
              </Text>
              <Text style={[
                styles.proximityText,
                { color: getProximityInfo(peer.signalStrength || 0.5).color }
              ]}>
                {getProximityInfo(peer.signalStrength || 0.5).text}
              </Text>
            </View>

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
                <View style={[styles.scoreFill, { width: `${score}%` }]} />
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
        <Animated.View style={[styles.stamp, { alignSelf: 'center', left: (width - spacing.lg * 2) / 2 - 70, top: (height * 0.68) * 0.35, borderColor: colors.superLike }, superStyle]}>
          <Text style={styles.stampTextSuper}>SUPER</Text>
        </Animated.View>
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
  proximityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  proximityIcon: {
    fontSize: fontSizes.md,
  },
  proximityText: {
    ...typography.label,
    fontSize: fontSizes.xs,
    fontWeight: '600',
  },

  actionBtn: {
    borderWidth:    1.5,
    alignItems:     'center',
    justifyContent: 'center',
    ...cardShadow,
    shadowOpacity: 0.15,
  },
})
