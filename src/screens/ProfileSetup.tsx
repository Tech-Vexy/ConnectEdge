// screens/ProfileSetup.tsx — extended with bio + connection prompt

import React, { useState } from 'react'
import {
  View, Text, StyleSheet, Pressable, TextInput,
  ScrollView, Image, Alert, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView }  from 'react-native-safe-area-context'
import Slider            from '@react-native-community/slider'
import { LinearGradient } from 'expo-linear-gradient'
import { router }        from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { useStore }      from '../store'
import { INTEREST_TAGS } from '../lib/types'
import type { UserProfile, MatchPrefs } from '../lib/types'
import { colors, typography, spacing, fontSizes, radius, gradients } from '../theme'

const STEPS = ['Photo', 'Who you are', 'What you want', 'Your interests', 'About you', 'Ready']

// Prompt options — user picks one to display on their post-match card
const PROMPTS = [
  "My ideal Sunday looks like…",
  "A topic I could talk about for hours…",
  "The most spontaneous thing I've done…",
  "I'm looking for someone who…",
  "A hidden talent of mine is…",
  "My go-to comfort is…",
  "Something I want to try…",
  "The last thing that made me laugh…",
  "My favorite way to spend a Friday night…",
  "A book/movie that changed my perspective…",
  "The best advice I ever received…",
  "My biggest pet peeve is…",
  "If I could have any superpower, it would be…",
  "My dream travel destination…",
  "A skill I'm currently learning…",
  "My love language is…",
  "The most important quality in a friend…",
  "My morning routine usually involves…",
  "A controversial opinion I hold…",
  "The thing I'm most proud of…",
]

export default function ProfileSetup() {
  const setProfile = useStore(s => s.setProfile)
  const [step, setStep] = useState(0)

  const [photoUri,    setPhotoUri]    = useState<string | null>(null)
  const [name,        setName]        = useState('')
  const [age,         setAge]         = useState('')
  const [ageRangeMin, setAgeRangeMin] = useState(22)
  const [ageRangeMax, setAgeRangeMax] = useState(35)
  const [intentScore, setIntentScore] = useState(0.5)
  const [valuesScore, setValuesScore] = useState(0.5)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [bio,          setBio]          = useState('')
  const [selectedPrompt, setSelectedPrompt] = useState(PROMPTS[0])
  const [promptAnswer,   setPromptAnswer]   = useState('')
  const [saving,         setSaving]         = useState(false)

  const canAdvance = () => {
    if (step === 0) return true // Photo is optional
    if (step === 1) return name.trim().length >= 2 && +age >= 18 && +age <= 99
    if (step === 3) return selectedTags.length >= 2
    return true
  }

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : prev.length < 8 ? [...prev, tag] : prev
    )
  }

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant photo library permissions to add a profile photo')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri)
    }
  }

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant camera permissions to take a profile photo')
      return
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri)
    }
  }

  const finish = async () => {
    setSaving(true)
    try {
      const prefs: MatchPrefs = {
        ageRange:           [ageRangeMin, ageRangeMax],
        intentScore,
        interestTags:       selectedTags,
        proximityWeight:    0.15,
        valuesScore,
        activityLevel:      0.5,
        communicationStyle: 0.5,
        socialPreference:   0.5,
      }
      const fullBio = [
        bio.trim(),
        promptAnswer.trim() ? `${selectedPrompt} ${promptAnswer.trim()}` : '',
      ].filter(Boolean).join('\n\n')

      const profile: UserProfile = {
        peerId:      '',
        displayName: name.trim(),
        age:         parseInt(age),
        bio:         fullBio,
        photoUri:    photoUri || undefined,
        prefs,
      }
      await setProfile(profile)
      router.replace('/app')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
      {/* Progress bar */}
      <View style={styles.progressBar}>
        {STEPS.map((_, i) => (
          <View key={i} style={[styles.progressSeg, i <= step && styles.progressActive]} />
        ))}
      </View>

      {/* Step label */}
      <Text style={styles.stepLabel}>{STEPS[step]}</Text>

      {/* ── Step 0: Photo ── */}
      {step === 0 && (
        <View style={styles.stepContent}>
          <Text style={styles.fieldLabel}>Profile photo</Text>
          <Text style={styles.hint}>Optional — shown to matches only</Text>
          
          <Pressable onPress={handlePickPhoto} style={styles.photoUploadArea}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photoPreview} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Text style={styles.photoPlaceholderIcon}>📷</Text>
                <Text style={styles.photoPlaceholderText}>Tap to add photo</Text>
              </View>
            )}
          </Pressable>

          <View style={styles.photoButtons}>
            <Pressable style={styles.photoButton} onPress={handlePickPhoto}>
              <Text style={styles.photoButtonText}>From Library</Text>
            </Pressable>
            <Pressable style={styles.photoButton} onPress={handleTakePhoto}>
              <Text style={styles.photoButtonText}>Take Photo</Text>
            </Pressable>
            {photoUri && (
              <Pressable style={[styles.photoButton, styles.photoButtonDelete]} onPress={() => setPhotoUri(null)}>
                <Text style={styles.photoButtonText}>Remove</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* ── Step 1: Name + Age ── */}
      {step === 1 && (
        <View style={styles.stepContent}>
          <Text style={styles.fieldLabel}>First name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.textMuted}
            autoFocus
            maxLength={20}
          />
          <Text style={[styles.fieldLabel, { marginTop: spacing.lg }]}>Age</Text>
          <TextInput
            style={styles.input}
            value={age}
            onChangeText={setAge}
            placeholder="Your age"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={2}
          />
        </View>
      )}

      {/* ── Step 2: Intent + Age range + Vibe ── */}
      {step === 2 && (
        <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.fieldLabel}>Looking for</Text>
          <View style={styles.intentRow}>
            <Text style={styles.sliderEndLabel}>Casual</Text>
            <Text style={styles.sliderEndLabel}>Serious</Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={0} maximumValue={1}
            value={intentScore} onValueChange={setIntentScore}
            minimumTrackTintColor={colors.pulse}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.textPrimary}
          />

          <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>
            Age range · {ageRangeMin}–{ageRangeMax}
          </Text>
          <Text style={styles.hint}>Minimum</Text>
          <Slider
            style={styles.slider}
            minimumValue={18} maximumValue={70} step={1}
            value={ageRangeMin}
            onValueChange={v => setAgeRangeMin(Math.min(v, ageRangeMax - 1))}
            minimumTrackTintColor={colors.like}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.textPrimary}
          />
          <Text style={styles.hint}>Maximum</Text>
          <Slider
            style={styles.slider}
            minimumValue={18} maximumValue={70} step={1}
            value={ageRangeMax}
            onValueChange={v => setAgeRangeMax(Math.max(v, ageRangeMin + 1))}
            minimumTrackTintColor={colors.like}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.textPrimary}
          />

          <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>Vibe</Text>
          <View style={styles.intentRow}>
            <Text style={styles.sliderEndLabel}>Spontaneous</Text>
            <Text style={styles.sliderEndLabel}>Stable</Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={0} maximumValue={1}
            value={valuesScore} onValueChange={setValuesScore}
            minimumTrackTintColor={colors.superLike}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.textPrimary}
          />
        </ScrollView>
      )}

      {/* ── Step 3: Interests ── */}
      {step === 3 && (
        <View style={styles.stepContent}>
          <Text style={styles.hint}>
            Pick at least 2, up to 8 · {selectedTags.length}/8 selected
          </Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.tagGrid}>
              {INTEREST_TAGS.map(tag => {
                const active = selectedTags.includes(tag)
                return (
                  <Pressable
                    key={tag}
                    style={[styles.tag, active && styles.tagActive]}
                    onPress={() => toggleTag(tag)}
                  >
                    <Text style={[styles.tagText, active && styles.tagTextActive]}>
                      {tag}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </ScrollView>
        </View>
      )}

      {/* ── Step 4: Bio + Prompt (new step) ── */}
      {step === 4 && (
        <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.fieldLabel}>Short bio</Text>
          <Text style={styles.hint}>Shared with matches only — not broadcast</Text>
          <TextInput
            style={[styles.input, styles.bioInput]}
            value={bio}
            onChangeText={setBio}
            placeholder="A few words about you…"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={150}
            textAlignVertical="top"
          />
          <Text style={[styles.charCount]}>{bio.length}/150</Text>

          <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>
            Pick a prompt
          </Text>
          <Text style={styles.hint}>
            Gives matches a conversation starter. Shown on your post-match card.
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.promptPicker}>
            {PROMPTS.map(p => (
              <Pressable
                key={p}
                style={[styles.promptChip, selectedPrompt === p && styles.promptChipActive]}
                onPress={() => setSelectedPrompt(p)}
              >
                <Text style={[styles.promptChipText, selectedPrompt === p && styles.promptChipTextActive]}>
                  {p}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.promptAnswerWrap}>
            <Text style={styles.promptQuestion}>{selectedPrompt}</Text>
            <TextInput
              style={[styles.input, styles.promptInput]}
              value={promptAnswer}
              onChangeText={setPromptAnswer}
              placeholder="Your answer…"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={120}
              textAlignVertical="top"
            />
          </View>
        </ScrollView>
      )}

      {/* ── Step 5: Review ── */}
      {step === 5 && (
        <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
          <View style={styles.reviewCard}>
            {[
              { label: 'Photo',       value: photoUri ? 'Added' : '(none)' },
              { label: 'Name',        value: name },
              { label: 'Age',         value: age },
              { label: 'Looking for', value: intentScore < 0.33 ? 'Casual' : intentScore < 0.66 ? 'Open' : 'Serious' },
              { label: 'Age range',   value: `${ageRangeMin}–${ageRangeMax}` },
              { label: 'Interests',   value: selectedTags.join(', ') },
              { label: 'Bio',         value: bio || '(empty)' },
            ].map((row, i, arr) => (
              <View key={row.label} style={[
                styles.reviewRow,
                i === arr.length - 1 && { borderBottomWidth: 0 },
              ]}>
                <Text style={styles.reviewLabel}>{row.label}</Text>
                <Text style={styles.reviewValue} numberOfLines={3}>{row.value}</Text>
              </View>
            ))}
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              Name, intent (coarse), and interests are shared with nearby peers. Bio and prompt are shared with matches only. Nothing leaves your device otherwise.
            </Text>
          </View>
        </ScrollView>
      )}

      {/* Nav */}
      <View style={styles.nav}>
        {step > 0 && (
          <Pressable style={styles.backButton} onPress={() => setStep(s => s - 1)}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        )}
        {step < STEPS.length - 1 ? (
          <Pressable
            style={[styles.nextButton, !canAdvance() && styles.nextButtonDisabled]}
            onPress={() => setStep(s => s + 1)}
            disabled={!canAdvance()}
          >
            <LinearGradient
              colors={gradients.brand}
              start={{x:0,y:0}} end={{x:1,y:0}}
              style={styles.nextButtonGrad}
            >
              <Text style={styles.nextButtonText}>Continue</Text>
            </LinearGradient>
          </Pressable>
        ) : (
          <Pressable style={[styles.nextButton, saving && styles.nextButtonDisabled]} onPress={finish} disabled={saving}>
            <LinearGradient
              colors={gradients.brand}
              start={{x:0,y:0}} end={{x:1,y:0}}
              style={styles.nextButtonGrad}
            >
              <Text style={styles.nextButtonText}>{saving ? 'Saving…' : 'Start discovering'}</Text>
            </LinearGradient>
          </Pressable>
        )}
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:              1,
    backgroundColor:   colors.bg,
    paddingHorizontal: spacing.lg,
    paddingBottom:     spacing.xl,
  },
  progressBar: {
    flexDirection:  'row',
    gap:            4,
    marginTop:      spacing.md,
    marginBottom:   spacing.xl,
  },
  progressSeg: {
    flex:            1,
    height:          3,
    borderRadius:    1.5,
    backgroundColor: colors.border,
  },
  progressActive: { backgroundColor: colors.pulse },
  stepLabel: {
    ...typography.display,
    fontSize:     fontSizes.xxl,
    color:        colors.textPrimary,
    marginBottom: spacing.lg,
  },
  stepContent: { flex: 1 },
  fieldLabel: {
    ...typography.label,
    fontSize:      fontSizes.sm,
    color:         colors.textSecondary,
    marginBottom:  spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  input: {
    ...typography.body,
    fontSize:          fontSizes.lg,
    color:             colors.textPrimary,
    backgroundColor:   colors.surface,
    borderWidth:       0.5,
    borderColor:       colors.border,
    borderRadius:      radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.md,
  },
  bioInput: { height: 90, fontSize: fontSizes.md },
  charCount: {
    ...typography.mono,
    fontSize:  fontSizes.xs,
    color:     colors.textMuted,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  promptPicker: { marginBottom: spacing.md },
  promptChip: {
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    borderRadius:      radius.full,
    borderWidth:       1,
    borderColor:       colors.border,
    backgroundColor:   colors.surface,
    marginRight:       spacing.sm,
  },
  promptChipActive:     { borderColor: colors.pulse, backgroundColor: colors.pulseAlpha18 },
  promptChipText:       { ...typography.body, fontSize: fontSizes.sm, color: colors.textSecondary },
  promptChipTextActive: { color: colors.pulse },
  promptAnswerWrap: {
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    borderWidth:     0.5,
    borderColor:     colors.border,
    padding:         spacing.md,
    gap:             spacing.sm,
  },
  promptQuestion: {
    ...typography.label,
    fontSize: fontSizes.sm,
    color:    colors.pulse,
  },
  promptInput: {
    height:          80,
    fontSize:        fontSizes.md,
    backgroundColor: 'transparent',
    borderWidth:     0,
    paddingHorizontal: 0,
    padding:         0,
  },
  photoUploadArea: {
    width:           200,
    height:          200,
    alignSelf:       'center',
    borderRadius:    100,
    overflow:        'hidden',
    marginBottom:    spacing.lg,
  },
  photoPreview: {
    width:  200,
    height: 200,
  },
  photoPlaceholder: {
    width:           200,
    height:          200,
    borderRadius:    100,
    backgroundColor: colors.surface,
    borderWidth:     2,
    borderColor:     colors.border,
    alignItems:       'center',
    justifyContent:   'center',
    gap:              spacing.sm,
  },
  photoPlaceholderIcon: {
    fontSize: 48,
  },
  photoPlaceholderText: {
    ...typography.body,
    fontSize: fontSizes.sm,
    color:    colors.textMuted,
  },
  photoButtons: {
    flexDirection: 'row',
    gap:           spacing.sm,
    justifyContent: 'center',
  },
  photoButton: {
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    borderRadius:      radius.md,
    borderWidth:       0.5,
    borderColor:       colors.border,
    backgroundColor:   colors.surface,
  },
  photoButtonDelete: {
    borderColor: colors.pass,
    backgroundColor: 'rgba(255,59,48,0.06)',
  },
  photoButtonText: {
    ...typography.label,
    fontSize: fontSizes.sm,
    color:    colors.textSecondary,
  },
  slider:    { width: '100%', height: 40 },
  intentRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  sliderEndLabel: { ...typography.body, fontSize: fontSizes.xs, color: colors.textMuted },
  hint: { ...typography.body, fontSize: fontSizes.xs, color: colors.textMuted, marginBottom: spacing.xs },
  tagGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  tag: {
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    borderRadius:      radius.full,
    borderWidth:       0.5,
    borderColor:       colors.border,
    backgroundColor:   colors.surface,
  },
  tagActive:     { backgroundColor: colors.pulseLight, borderColor: colors.pulse },
  tagText:       { ...typography.body, fontSize: fontSizes.sm, color: colors.textSecondary },
  tagTextActive: { color: colors.pulse },
  reviewCard: {
    backgroundColor: colors.surface,
    borderRadius:    radius.lg,
    borderWidth:     0.5,
    borderColor:     colors.border,
    marginBottom:    spacing.md,
    overflow:        'hidden',
  },
  reviewRow: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    gap:               spacing.md,
  },
  reviewLabel: { ...typography.label, fontSize: fontSizes.sm, color: colors.textMuted, width: 80, flexShrink: 0 },
  reviewValue: { ...typography.body, fontSize: fontSizes.sm, color: colors.textPrimary, flex: 1, textAlign: 'right' },
  infoBox: {
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    borderWidth:     0.5,
    borderColor:     colors.border,
    padding:         spacing.md,
    marginBottom:    spacing.md,
  },
  infoText: { ...typography.body, fontSize: fontSizes.xs, color: colors.textMuted, lineHeight: 18 },
  nav: { flexDirection: 'row', gap: spacing.sm },
  backButton: {
    flex:            1,
    paddingVertical: spacing.md,
    borderRadius:    radius.md,
    borderWidth:     0.5,
    borderColor:     colors.border,
    alignItems:      'center',
  },
  backButtonText: { ...typography.label, fontSize: fontSizes.md, color: colors.textSecondary },
  nextButton:         { flex: 2, borderRadius: radius.md, overflow: 'hidden' },
  nextButtonDisabled: { opacity: 0.35 },
  nextButtonGrad: { paddingVertical: spacing.md, alignItems: 'center' },
  nextButtonText: { ...typography.label, fontSize: fontSizes.md, color: '#FFF' },
})
