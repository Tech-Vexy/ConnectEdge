// screens/Onboarding.tsx — first launch, Tinder-style
// Full-screen gradient slides, bold display type, single CTA button.

import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, Pressable,
  Dimensions, Animated as RNAnimated,
} from 'react-native'
import { SafeAreaView }   from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import * as ExpoCrypto    from 'expo-crypto'
import { router }         from 'expo-router'
import { colors, typography, fontSizes, spacing, radius, gradients } from '../theme'

const { width: W, height: H } = Dimensions.get('window')

const SLIDES = [
  {
    gradient: ['#FF4458', '#FF7854'] as [string, string],
    icon:     '◈',
    headline: 'Dating, nearby.',
    body:     'Proxim finds people around you using Bluetooth and local Wi-Fi — no GPS, no servers, just the people in the same room.',
  },
  {
    gradient: ['#764ba2', '#667eea'] as [string, string],
    icon:     '◎',
    headline: 'Private by design.',
    body:     'Your likes are cryptographic hashes. Nobody knows you liked them unless they liked you back. Zero servers hold your data.',
  },
  {
    gradient: ['#43e97b', '#38f9d7'] as [string, string],
    icon:     '⊕',
    headline: 'Your identity, your device.',
    body:     'No email, no phone number. A cryptographic key lives on your phone. Close the app — the session is gone.',
  },
]

export default function Onboarding() {
  const [step,   setStep]   = useState(0)
  const [keyHex, setKeyHex] = useState('')
  const fadeAnim = useRef(new RNAnimated.Value(1)).current

  useEffect(() => {
    ExpoCrypto.getRandomBytesAsync(6).then(bytes => {
      setKeyHex(Array.from(new Uint8Array(bytes))
        .map(b => b.toString(16).padStart(2, '0')).join(''))
    })
  }, [])

  const advance = () => {
    if (step < SLIDES.length - 1) {
      RNAnimated.sequence([
        RNAnimated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
        RNAnimated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]).start(() => setStep(s => s + 1))
    } else {
      router.replace('/profile-setup')
    }
  }

  const slide = SLIDES[step]

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={slide.gradient}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Decorative circles */}
      <View style={[styles.circle, styles.circle1]} />
      <View style={[styles.circle, styles.circle2]} />

      <SafeAreaView style={styles.safeArea}>
        <RNAnimated.View style={[styles.content, { opacity: fadeAnim }]}>

          {/* Logo */}
          <View style={styles.logoRow}>
            <Text style={styles.logo}>proxim</Text>
          </View>

          {/* Big icon */}
          <View style={styles.iconWrap}>
            <Text style={styles.icon}>{slide.icon}</Text>
          </View>

          {/* Text */}
          <View style={styles.textBlock}>
            <Text style={styles.headline}>{slide.headline}</Text>
            <Text style={styles.body}>{slide.body}</Text>
          </View>

          {/* Key fingerprint on last slide */}
          {step === SLIDES.length - 1 && (
            <View style={styles.keyBlock}>
              <Text style={styles.keyLabel}>your peer identity</Text>
              <Text style={styles.keyHex}>
                {keyHex.slice(0,4)} {keyHex.slice(4,8)} {keyHex.slice(8,12)}
              </Text>
            </View>
          )}

        </RNAnimated.View>

        <View style={styles.bottom}>
          {/* Step dots */}
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
            ))}
          </View>

          {/* CTA */}
          <Pressable
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.88 }]}
            onPress={advance}
          >
            <Text style={styles.ctaText}>
              {step < SLIDES.length - 1 ? 'Continue' : 'Get started'}
            </Text>
          </Pressable>

          <Text style={styles.terms}>
            No account · No data uploaded · No location tracking
          </Text>
        </View>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex:              1,
    paddingHorizontal: spacing.lg,
    paddingBottom:     spacing.xl,
    justifyContent:    'space-between',
  },
  circle: {
    position:        'absolute',
    borderRadius:    9999,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  circle1: { width: W * 1.4, height: W * 1.4, top: -W * 0.5, left: -W * 0.2 },
  circle2: { width: W * 0.9, height: W * 0.9, bottom: -W * 0.3, right: -W * 0.3 },

  content: {
    flex:           1,
    justifyContent: 'center',
    alignItems:     'center',
    gap:            spacing.xl,
  },
  logoRow: { position: 'absolute', top: spacing.md, alignSelf: 'center' },
  logo: {
    ...typography.display,
    fontSize:      fontSizes.xl,
    color:         'rgba(255,255,255,0.7)',
    letterSpacing: 2,
  },
  iconWrap: {
    width:           120,
    height:          120,
    borderRadius:    60,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  icon: { fontSize: 52, color: '#FFF' },

  textBlock: { alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.sm },
  headline: {
    ...typography.display,
    fontSize:  fontSizes.xxl,
    color:     '#FFF',
    textAlign: 'center',
    lineHeight: 38,
  },
  body: {
    ...typography.body,
    fontSize:  fontSizes.md,
    color:     'rgba(255,255,255,0.82)',
    textAlign: 'center',
    lineHeight: 24,
  },

  keyBlock: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius:    radius.md,
    padding:         spacing.md,
    alignItems:      'center',
    gap:             spacing.xs,
    width:           '100%',
  },
  keyLabel: {
    ...typography.mono,
    fontSize:      fontSizes.xs,
    color:         'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  keyHex: {
    ...typography.mono,
    fontSize:      fontSizes.md,
    color:         '#FFF',
    letterSpacing: 3,
  },

  bottom: { gap: spacing.md },
  dots: {
    flexDirection:  'row',
    justifyContent: 'center',
    gap:            spacing.sm,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotActive: {
    backgroundColor: '#FFF',
    width:           24,
  },
  cta: {
    backgroundColor: '#FFF',
    borderRadius:    radius.full,
    paddingVertical: spacing.md + 2,
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.2,
    shadowRadius:    12,
    elevation:       6,
  },
  ctaText: {
    ...typography.label,
    fontSize: fontSizes.lg,
    color:    '#FF4458',
  },
  terms: {
    ...typography.body,
    fontSize:  fontSizes.xs,
    color:     'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
})
