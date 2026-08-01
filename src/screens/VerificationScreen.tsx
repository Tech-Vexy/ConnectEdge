// screens/VerificationScreen.tsx
// ZK identity verification — institutional email OTP flow.
// Three views: unverified prompt → email entry + OTP → verified badge.

import React, { useState, useRef, useEffect } from 'react'
import {
  View, Text, StyleSheet, Pressable, TextInput,
  ScrollView, Dimensions, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView }   from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { router }         from 'expo-router'
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withDelay,
} from 'react-native-reanimated'
import {
  requestOTP, submitOTPAndProve,
  loadBadge, clearBadge, badgeStatus, daysUntilExpiry,
  INSTITUTIONS, TIER_LABELS, TIER_ICONS,
  type VerificationBadge, type OTPChallenge,
} from '../lib/zk-identity'
import { appConfig } from '../lib/config'
import { colors, typography, fontSizes, spacing, radius, gradients } from '../theme'

const { width: W } = Dimensions.get('window')

type Step = 'landing' | 'email' | 'otp' | 'verified'

export default function VerificationScreen() {
  const [step,         setStep]         = useState<Step>('landing')
  const [email,        setEmail]        = useState('')
  const [otp,          setOtp]          = useState('')
  const [challenge,    setChallenge]    = useState<OTPChallenge | null>(null)
  const [badge,        setBadge]        = useState<VerificationBadge | null>(null)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [countdown,    setCountdown]    = useState(0)

  const otpRef = useRef<TextInput>(null)

  if (!appConfig.verify.enabled) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <View style={styles.header}>
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Text style={styles.backBtnText}>‹</Text>
            </Pressable>
            <Text style={styles.headerTitle}>Verification</Text>
            <View style={{ width: 36 }} />
          </View>

          <View style={styles.content}>
            <View style={styles.stepWrap}>
              <Text style={styles.stepTitle}>Verification is disabled</Text>
              <Text style={styles.stepBody}>
                This build is running in P2P-only mode, so verification and relay-backed features are turned off.
              </Text>
              <Pressable style={styles.secondaryBtn} onPress={() => router.back()}>
                <Text style={styles.secondaryBtnText}>Go back</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </View>
    )
  }

  // Load existing badge on mount
  useEffect(() => {
    loadBadge().then(b => {
      if (b) { setBadge(b); setStep('verified') }
    })
  }, [])

  // OTP countdown timer
  useEffect(() => {
    if (!challenge) return
    const remaining = Math.floor((challenge.expiresAt - Date.now()) / 1000)
    setCountdown(remaining)
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(interval); return 0 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [challenge])

  const emailDomain = email.toLowerCase().split('@')[1] ?? ''
  const institution = INSTITUTIONS[emailDomain]

  const handleRequestOTP = async () => {
    setError(null)
    setLoading(true)
    const { ok, challenge: ch, error: err } = await requestOTP(email)
    setLoading(false)
    if (!ok || !ch) {
      setError(err ?? 'Failed to send code')
      return
    }
    setChallenge(ch)
    setStep('otp')
    setTimeout(() => otpRef.current?.focus(), 400)
  }

  const handleSubmitOTP = async () => {
    if (!challenge || otp.length < 6) return
    setError(null)
    setLoading(true)

    const { connectEdgeNode } = await import('../lib/node')
    const keys   = connectEdgeNode.keyPair
    const peerId = connectEdgeNode.peerId

    if (!keys || !peerId) {
      setError('Node not ready — go back to the discover screen first')
      setLoading(false)
      return
    }

    const { ok, badge: b, error: err } = await submitOTPAndProve(
      email, otp, challenge.sessionToken, peerId, keys,
    )
    setLoading(false)

    if (!ok || !b) {
      setError(err ?? 'Verification failed')
      return
    }

    setBadge(b)
    setStep('verified')
  }

  const handleRevoke = async () => {
    await clearBadge()
    setBadge(null)
    setStep('landing')
    setEmail('')
    setOtp('')
    setChallenge(null)
    setError(null)
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Verification</Text>
          <View style={{ width: 36 }} />
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Landing ── */}
            {step === 'landing' && <LandingView onContinue={() => setStep('email')} />}

            {/* ── Email entry ── */}
            {step === 'email' && (
              <View style={styles.stepWrap}>
                <Text style={styles.stepTitle}>Enter your institutional email</Text>
                <Text style={styles.stepBody}>
                  We'll send a one-time code. Your email is discarded after sending — it's never stored on our servers.
                </Text>

                <View style={styles.inputWrap}>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={v => { setEmail(v); setError(null) }}
                    placeholder="you@university.edu"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    autoFocus
                    returnKeyType="send"
                    onSubmitEditing={handleRequestOTP}
                  />
                  {institution && (
                    <View style={styles.institutionBadge}>
                      <Text style={styles.institutionText}>
                        {TIER_ICONS[institution.tier as keyof typeof TIER_ICONS]}{'  '}{institution.name}
                      </Text>
                    </View>
                  )}
                </View>

                {error && <ErrorBanner message={error} />}

                <Pressable
                  style={[
                    styles.primaryBtn,
                    (!institution || loading) && styles.primaryBtnDisabled,
                  ]}
                  onPress={handleRequestOTP}
                  disabled={!institution || loading}
                >
                  <LinearGradient
                    colors={gradients.brand}
                    start={{x:0,y:0}} end={{x:1,y:0}}
                    style={styles.primaryBtnGrad}
                  >
                    <Text style={styles.primaryBtnText}>
                      {loading ? 'Sending…' : 'Send verification code'}
                    </Text>
                  </LinearGradient>
                </Pressable>

                <View style={styles.privacyNote}>
                  <Text style={styles.privacyNoteText}>
                    🔒  Your email is used only to deliver the code. The code proves membership — no identifying data is stored.
                  </Text>
                </View>
              </View>
            )}

            {/* ── OTP entry ── */}
            {step === 'otp' && challenge && (
              <View style={styles.stepWrap}>
                <Text style={styles.stepTitle}>Enter the code</Text>
                <Text style={styles.stepBody}>
                  Sent to{' '}
                  <Text style={styles.maskedEmail}>{challenge.maskedEmail}</Text>
                </Text>

                <OTPInput
                  ref={otpRef}
                  value={otp}
                  onChange={v => { setOtp(v); setError(null) }}
                />

                {countdown > 0 ? (
                  <Text style={styles.countdownText}>
                    Code expires in {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2,'0')}
                  </Text>
                ) : (
                  <Pressable onPress={() => { setStep('email'); setOtp('') }}>
                    <Text style={styles.resendText}>Code expired — try again</Text>
                  </Pressable>
                )}

                {error && <ErrorBanner message={error} />}

                <Pressable
                  style={[
                    styles.primaryBtn,
                    (otp.length < 6 || loading) && styles.primaryBtnDisabled,
                  ]}
                  onPress={handleSubmitOTP}
                  disabled={otp.length < 6 || loading}
                >
                  <LinearGradient
                    colors={gradients.brand}
                    start={{x:0,y:0}} end={{x:1,y:0}}
                    style={styles.primaryBtnGrad}
                  >
                    <Text style={styles.primaryBtnText}>
                      {loading ? 'Verifying…' : 'Confirm'}
                    </Text>
                  </LinearGradient>
                </Pressable>

                <Pressable
                  style={styles.secondaryBtn}
                  onPress={() => { setStep('email'); setOtp(''); setError(null) }}
                >
                  <Text style={styles.secondaryBtnText}>Change email</Text>
                </Pressable>

                <View style={styles.privacyNote}>
                  <Text style={styles.privacyNoteText}>
                    🔒  This code is verified locally. We never learn which account confirmed it — only that a valid code was used.
                  </Text>
                </View>
              </View>
            )}

            {/* ── Verified ── */}
            {step === 'verified' && badge && (
              <VerifiedView badge={badge} onRevoke={handleRevoke} />
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LandingView({ onContinue }: { onContinue: () => void }) {
  const fadeIn = useSharedValue(0)
  const slideY = useSharedValue(20)
  useEffect(() => {
    fadeIn.value = withTiming(1, { duration: 400 })
    slideY.value = withSpring(0, { damping: 16 })
  }, [])
  const animStyle = useAnimatedStyle(() => ({
    opacity: fadeIn.value, transform: [{ translateY: slideY.value }],
  }))

  return (
    <Animated.View style={[styles.landingWrap, animStyle]}>
      {/* Shield icon */}
      <View style={styles.shieldWrap}>
        <LinearGradient colors={gradients.brand} style={styles.shieldGradient} start={{x:0,y:0}} end={{x:1,y:1}}>
          <Text style={styles.shieldIcon}>✓</Text>
        </LinearGradient>
      </View>

      <Text style={styles.landingTitle}>Get verified</Text>
      <Text style={styles.landingBody}>
        A verified badge proves you're a real member of your institution — without revealing who you are.
      </Text>

      {/* What the badge proves */}
      <View style={styles.proofCard}>
        <ProofRow icon="✓" label="You're enrolled at a recognised institution" positive />
        <ProofRow icon="✓" label="You haven't already verified a different account" positive />
        <ProofRow icon="✗" label="Which student or staff member you are" positive={false} />
        <ProofRow icon="✗" label="Your email address" positive={false} />
        <ProofRow icon="✗" label="Your student ID or name" positive={false} />
      </View>

      <View style={styles.zkNote}>
        <Text style={styles.zkNoteTitle}>Zero-knowledge proof</Text>
        <Text style={styles.zkNoteBody}>
          The verification uses a cryptographic commitment scheme — the same technique used in privacy-preserving blockchain protocols. Your credential proves membership without revealing your identity.
        </Text>
      </View>

      <Pressable style={styles.primaryBtn} onPress={onContinue}>
        <LinearGradient colors={gradients.brand} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.primaryBtnGrad}>
          <Text style={styles.primaryBtnText}>Verify with institutional email</Text>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  )
}

function ProofRow({ icon, label, positive }: { icon: string; label: string; positive: boolean }) {
  return (
    <View style={styles.proofRow}>
      <Text style={[styles.proofIcon, positive ? styles.proofIconPos : styles.proofIconNeg]}>
        {icon}
      </Text>
      <Text style={[styles.proofLabel, !positive && styles.proofLabelNeg]}>{label}</Text>
    </View>
  )
}

const OTPInput = React.forwardRef<TextInput, {
  value: string; onChange: (v: string) => void
}>(({ value, onChange }, ref) => (
  <View style={styles.otpWrap}>
    <TextInput
      ref={ref}
      style={styles.otpInput}
      value={value}
      onChangeText={v => onChange(v.replace(/\D/g, '').slice(0, 6))}
      keyboardType="number-pad"
      maxLength={6}
      textContentType="oneTimeCode"
      autoComplete="one-time-code"
      caretHidden={false}
      textAlign="center"
      accessibilityLabel="Verification code"
      accessibilityHint="Enter the 6-digit code sent to your email"
    />
    {/* Visual digit boxes */}
    <View style={styles.otpBoxes} pointerEvents="none">
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={[styles.otpBox, value.length === i && styles.otpBoxActive]}>
          <Text style={styles.otpDigit}>{value[i] ?? ''}</Text>
        </View>
      ))}
    </View>
  </View>
))

function VerifiedView({ badge, onRevoke }: { badge: VerificationBadge; onRevoke: () => void }) {
  const scale = useSharedValue(0.85)
  useEffect(() => {
    scale.value = withDelay(100, withSpring(1, { damping: 14, stiffness: 180 }))
  }, [])
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  const days = daysUntilExpiry(badge)

  return (
    <View style={styles.verifiedWrap}>
      <Animated.View style={[styles.badgeCard, animStyle]}>
        <LinearGradient colors={gradients.brand} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.badgeGradient}>
          <Text style={styles.badgeTierIcon}>
            {TIER_ICONS[badge.tier as keyof typeof TIER_ICONS]}
          </Text>
          <Text style={styles.badgeInstitution}>{badge.institution}</Text>
          <Text style={styles.badgeTierLabel}>{TIER_LABELS[badge.tier as keyof typeof TIER_LABELS]}</Text>
          <View style={styles.badgeFooter}>
            <Text style={styles.badgeExpiry}>Valid for {days} more days</Text>
            <View style={styles.badgeCheckWrap}>
              <Text style={styles.badgeCheck}>✓</Text>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>

      <View style={styles.verifiedInfoCard}>
        <Text style={styles.verifiedInfoTitle}>What others see on your profile</Text>
        <View style={styles.verifiedBadgePreview}>
          <Text style={styles.verifiedBadgePreviewIcon}>
            {TIER_ICONS[badge.tier as keyof typeof TIER_ICONS]}
          </Text>
          <Text style={styles.verifiedBadgePreviewText}>
            {TIER_LABELS[badge.tier as keyof typeof TIER_LABELS]} · {badge.institution}
          </Text>
        </View>
        <Text style={styles.verifiedInfoBody}>
          Your badge is broadcast as part of your profile signature. Any nearby peer can verify it is authentic without contacting a server.
        </Text>
      </View>

      <View style={styles.privacyNote}>
        <Text style={styles.privacyNoteText}>
          🔒  This badge contains no identifying information. Your email and student ID were discarded after verification.
        </Text>
      </View>

      <Pressable style={styles.revokeBtn} onPress={onRevoke}>
        <Text style={styles.revokeBtnText}>Remove verification</Text>
      </Pressable>
    </View>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorBannerText}>{message}</Text>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: colors.bg },
  safeArea:   { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { fontSize: 24, color: colors.textSecondary, lineHeight: 28 },
  headerTitle: { ...typography.label, fontSize: fontSizes.md, color: colors.textPrimary },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl },

  // Landing
  landingWrap: { alignItems: 'center', gap: spacing.lg },
  shieldWrap: {
    width: 80, height: 80, borderRadius: 40, overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  shieldGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  shieldIcon: { fontSize: 36, color: '#FFF' },
  landingTitle: {
    ...typography.display, fontSize: fontSizes.xxl,
    color: colors.textPrimary, textAlign: 'center',
  },
  landingBody: {
    ...typography.body, fontSize: fontSizes.md,
    color: colors.textSecondary, textAlign: 'center', lineHeight: 24,
  },
  proofCard: {
    width: '100%', backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 0.5, borderColor: colors.border,
    padding: spacing.md, gap: spacing.sm,
  },
  proofRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  proofIcon: { fontSize: fontSizes.sm, width: 20, textAlign: 'center' },
  proofIconPos: { color: colors.like },
  proofIconNeg: { color: colors.pass },
  proofLabel:    { ...typography.body, fontSize: fontSizes.sm, color: colors.textPrimary, flex: 1 },
  proofLabelNeg: { color: colors.textMuted, textDecorationLine: 'line-through' },
  zkNote: {
    width: '100%', backgroundColor: colors.surfaceHigh,
    borderRadius: radius.md, padding: spacing.md, gap: spacing.xs,
  },
  zkNoteTitle: { ...typography.label, fontSize: fontSizes.sm, color: colors.superLike },
  zkNoteBody: { ...typography.body, fontSize: fontSizes.sm, color: colors.textSecondary, lineHeight: 20 },

  // Steps
  stepWrap: { gap: spacing.lg, width: '100%' },
  stepTitle: { ...typography.display, fontSize: fontSizes.xxl, color: colors.textPrimary },
  stepBody:  { ...typography.body, fontSize: fontSizes.md, color: colors.textSecondary, lineHeight: 22 },
  maskedEmail: { color: colors.textPrimary, fontWeight: '500' },

  // Input
  inputWrap: { gap: spacing.sm },
  input: {
    ...typography.body, fontSize: fontSizes.lg,
    color: colors.textPrimary, backgroundColor: colors.surface,
    borderWidth: 0.5, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  institutionBadge: {
    backgroundColor: colors.likeAlpha18,
    borderRadius: radius.sm, padding: spacing.sm,
    borderWidth: 0.5, borderColor: 'rgba(77,217,100,0.27)',
  },
  institutionText: { ...typography.label, fontSize: fontSizes.sm, color: colors.like },

  // OTP
  otpWrap: { position: 'relative', height: 64 },
  otpInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
    zIndex: 2,
    fontSize: 32,
  },
  otpBoxes: {
    flexDirection: 'row', gap: spacing.sm,
    justifyContent: 'center',
    position: 'absolute', top: 0, left: 0, right: 0,
  },
  otpBox: {
    width: (W - spacing.lg * 2 - spacing.sm * 5) / 6,
    height: 64, borderRadius: radius.sm,
    backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  otpBoxActive: { borderColor: colors.pulse },
  otpDigit: { ...typography.display, fontSize: fontSizes.xl, color: colors.textPrimary },
  countdownText: { ...typography.mono, fontSize: fontSizes.sm, color: colors.textMuted, textAlign: 'center' },
  resendText: { ...typography.label, fontSize: fontSizes.sm, color: colors.pulse, textAlign: 'center' },

  // Buttons
  primaryBtn:         { borderRadius: radius.full, overflow: 'hidden' },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnGrad: { paddingVertical: spacing.md, alignItems: 'center' },
  primaryBtnText: { ...typography.label, fontSize: fontSizes.md, color: '#FFF' },
  secondaryBtn: { paddingVertical: spacing.md, alignItems: 'center' },
  secondaryBtnText: { ...typography.label, fontSize: fontSizes.md, color: colors.textMuted },

  // Error
  errorBanner: {
    backgroundColor: colors.passAlpha18, borderRadius: radius.sm,
    borderWidth: 0.5, borderColor: colors.passAlpha44, padding: spacing.md,
  },
  errorBannerText: { ...typography.body, fontSize: fontSizes.sm, color: colors.pass, lineHeight: 20 },

  // Privacy note
  privacyNote: {
    backgroundColor: colors.surface, borderRadius: radius.sm,
    borderWidth: 0.5, borderColor: colors.border, padding: spacing.md,
  },
  privacyNoteText: { ...typography.body, fontSize: fontSizes.xs, color: colors.textMuted, lineHeight: 18 },

  // Verified
  verifiedWrap: { gap: spacing.lg, alignItems: 'center' },
  badgeCard:    { width: '100%', borderRadius: radius.card, overflow: 'hidden' },
  badgeGradient: { padding: spacing.xl, gap: spacing.sm, minHeight: 200, justifyContent: 'center' },
  badgeTierIcon: { fontSize: 40 },
  badgeInstitution: { ...typography.display, fontSize: fontSizes.xxl, color: '#FFF' },
  badgeTierLabel:   { ...typography.label,   fontSize: fontSizes.md, color: 'rgba(255,255,255,0.8)' },
  badgeFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
  badgeExpiry: { ...typography.mono, fontSize: fontSizes.xs, color: 'rgba(255,255,255,0.65)' },
  badgeCheckWrap: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center',
  },
  badgeCheck: { fontSize: 14, color: '#FFF' },

  verifiedInfoCard: {
    width: '100%', backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 0.5, borderColor: colors.border, padding: spacing.md, gap: spacing.sm,
  },
  verifiedInfoTitle: { ...typography.label, fontSize: fontSizes.sm, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8 },
  verifiedBadgePreview: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surfaceHigh, borderRadius: radius.sm, padding: spacing.sm,
  },
  verifiedBadgePreviewIcon: { fontSize: fontSizes.md },
  verifiedBadgePreviewText: { ...typography.label, fontSize: fontSizes.sm, color: colors.like },
  verifiedInfoBody: { ...typography.body, fontSize: fontSizes.sm, color: colors.textMuted, lineHeight: 20 },

  revokeBtn: {
    paddingVertical: spacing.md, alignItems: 'center',
    borderRadius: radius.md, borderWidth: 0.5, borderColor: colors.border, width: '100%',
  },
  revokeBtnText: { ...typography.label, fontSize: fontSizes.sm, color: colors.textMuted },
})
