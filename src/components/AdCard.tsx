// components/AdCard.tsx
// Sponsored venue card — visually distinct from peer cards but uses
// the same swipe gesture system. Clear "Sponsored" label. One CTA button.
// Swiping left or right dismisses. Tapping CTA opens venue URL.

import React, { useEffect } from 'react'
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native'
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring,
  withTiming, runOnJS, interpolate, Extrapolation,
  useAnimatedGestureHandler,
} from 'react-native-reanimated'
import { PanGestureHandler, type PanGestureHandlerGestureEvent } from 'react-native-gesture-handler'
import { LinearGradient } from 'expo-linear-gradient'
import type { AdBroadcast } from '../lib/types'
import { AD_TYPE_LABELS } from '../lib/types'
import { handleAdTap, recordAdImpression, recordAdDismiss } from '../lib/ads'
import { colors, typography, fontSizes, spacing, radius, cardShadow } from '../theme'
import { CARD_W, CARD_H } from './SwipeCard'

const { width: SCREEN_W } = Dimensions.get('window')
const SWIPE_THRESHOLD = SCREEN_W * 0.30

interface Props {
  ad:       AdBroadcast
  index:    number
  onDismiss: (adId: string) => void
}

export function AdCard({ ad, index, onDismiss }: Props) {
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const isTopCard  = index === 0

  // Record impression when card becomes top card
  useEffect(() => {
    if (isTopCard) recordAdImpression(ad.adId)
  }, [isTopCard])

  const handleDismiss = (adId: string) => {
    recordAdDismiss(adId)
    onDismiss(adId)
  }

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
      if (Math.abs(translateX.value) > SWIPE_THRESHOLD || Math.abs(event.velocityX) > 600) {
        const dir = translateX.value > 0 ? 1 : -1
        translateX.value = withTiming(dir * SCREEN_W * 1.5, { duration: 280 })
        runOnJS(handleDismiss)(ad.adId)
        return
      }
      translateX.value = withSpring(0, { damping: 15, stiffness: 200 })
      translateY.value = withSpring(0, { damping: 15, stiffness: 200 })
    },
  })

  const cardStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      translateX.value,
      [-SCREEN_W / 2, 0, SCREEN_W / 2],
      [-10, 0, 10],
      Extrapolation.CLAMP,
    )
    const scale   = index === 0 ? 1 : index === 1 ? 0.95 : 0.90
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

  return (
    <PanGestureHandler onGestureEvent={gestureHandler} enabled={isTopCard}>
      <Animated.View style={[styles.card, cardStyle, cardShadow]}>
        <LinearGradient
          colors={[ad.gradientA, ad.gradientB] as [string, string]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Sponsored badge — top left, always visible */}
        <View style={styles.sponsoredBadge}>
          <Text style={styles.sponsoredText}>Sponsored</Text>
        </View>

        {/* Ad type chip — top right */}
        <View style={styles.typeBadge}>
          <Text style={styles.typeText}>{AD_TYPE_LABELS[ad.adType]}</Text>
        </View>

        {/* Main content — centred */}
        <View style={styles.body}>
          <Text style={styles.venueName}>{ad.venueName}</Text>
          <Text style={styles.tagline}>{ad.tagline}</Text>
          {ad.description.length > 0 && (
            <Text style={styles.description}>{ad.description}</Text>
          )}

          {/* Interest tag chips */}
          {ad.tags.length > 0 && (
            <View style={styles.tags}>
              {ad.tags.slice(0, 4).map(tag => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* CTA button */}
        <View style={styles.ctaWrap}>
          <Pressable
            style={({ pressed }) => [styles.ctaBtn, pressed && styles.ctaBtnPressed]}
            onPress={() => handleAdTap(ad)}
          >
            <Text style={styles.ctaText}>{ad.ctaLabel}</Text>
          </Pressable>
          <Text style={styles.swipeHint}>Swipe to dismiss</Text>
        </View>

        {/* Decorative circle */}
        <View style={styles.decCircle} />
      </Animated.View>
    </PanGestureHandler>
  )
}

const styles = StyleSheet.create({
  card: {
    position:        'absolute',
    width:           CARD_W,
    height:          CARD_H,
    borderRadius:    radius.card,
    overflow:        'hidden',
    backgroundColor: '#111',
  },
  sponsoredBadge: {
    position:          'absolute',
    top:               spacing.md,
    left:              spacing.md,
    backgroundColor:   'rgba(255,255,255,0.15)',
    borderRadius:      radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical:   3,
    borderWidth:       0.5,
    borderColor:       'rgba(255,255,255,0.3)',
    zIndex:            10,
  },
  sponsoredText: {
    ...typography.label,
    fontSize: fontSizes.xs,
    color:    'rgba(255,255,255,0.7)',
  },
  typeBadge: {
    position:          'absolute',
    top:               spacing.md,
    right:             spacing.md,
    backgroundColor:   'rgba(0,0,0,0.3)',
    borderRadius:      radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical:   3,
    zIndex:            10,
  },
  typeText: {
    ...typography.body,
    fontSize: fontSizes.xs,
    color:    'rgba(255,255,255,0.8)',
  },
  body: {
    flex:            1,
    justifyContent:  'center',
    paddingHorizontal: spacing.xl,
    gap:             spacing.md,
    paddingTop:      spacing.xxl * 1.5,
    paddingBottom:   spacing.xl,
  },
  venueName: {
    ...typography.display,
    fontSize:  fontSizes.xxl,
    color:     '#FFF',
    lineHeight: 36,
  },
  tagline: {
    ...typography.heading,
    fontSize:  fontSizes.lg,
    color:     'rgba(255,255,255,0.9)',
    lineHeight: 26,
  },
  description: {
    ...typography.body,
    fontSize:  fontSizes.md,
    color:     'rgba(255,255,255,0.7)',
    lineHeight: 22,
  },
  tags: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           spacing.xs,
    marginTop:     spacing.xs,
  },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical:   3,
    borderRadius:      radius.full,
    backgroundColor:   'rgba(255,255,255,0.12)',
    borderWidth:       0.5,
    borderColor:       'rgba(255,255,255,0.25)',
  },
  tagText: { ...typography.label, fontSize: fontSizes.xs, color: '#FFF' },

  ctaWrap: {
    paddingHorizontal: spacing.xl,
    paddingBottom:     spacing.xl,
    gap:               spacing.sm,
    alignItems:        'center',
  },
  ctaBtn: {
    width:           '100%',
    backgroundColor: '#FFF',
    borderRadius:    radius.full,
    paddingVertical: spacing.md,
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.25,
    shadowRadius:    8,
    elevation:       6,
  },
  ctaBtnPressed: { opacity: 0.88 },
  ctaText: {
    ...typography.label,
    fontSize: fontSizes.md,
    color:    '#111',
  },
  swipeHint: {
    ...typography.body,
    fontSize: fontSizes.xs,
    color:    'rgba(255,255,255,0.4)',
  },

  decCircle: {
    position:        'absolute',
    width:           CARD_W * 1.2,
    height:          CARD_W * 1.2,
    borderRadius:    CARD_W * 0.6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    top:             -CARD_W * 0.3,
    right:           -CARD_W * 0.4,
  },
})
