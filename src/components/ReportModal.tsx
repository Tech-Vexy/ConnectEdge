// components/ReportModal.tsx
// Triggered from Chat header or peer detail card.
// Three steps: category → optional note → confirm.
// Submitting always implies block.

import React, { useState } from 'react'
import {
  View, Text, StyleSheet, Pressable, Modal,
  TextInput, ScrollView, Alert,
} from 'react-native'
import { useStore }  from '../store'
import { REPORT_CATEGORIES, type ReportCategory } from '../lib/safety'
import { colors, typography, spacing, fontSizes, radius } from '../theme'

interface Props {
  visible:    boolean
  peerId:     string
  peerName:   string
  onClose:    () => void
  onBlocked:  () => void   // navigate away after block
}

const CATEGORIES = Object.entries(REPORT_CATEGORIES) as [ReportCategory, string][]

export function ReportModal({ visible, peerId, peerName, onClose, onBlocked }: Props) {
  const reportPeer = useStore(s => s.reportPeer)
  const [step,     setStep]     = useState<'category' | 'note' | 'done'>('category')
  const [category, setCategory] = useState<ReportCategory | null>(null)
  const [note,     setNote]     = useState('')
  const [loading,  setLoading]  = useState(false)

  const reset = () => {
    setStep('category')
    setCategory(null)
    setNote('')
    setLoading(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSubmit = async () => {
    if (!category) return
    setLoading(true)
    await reportPeer(peerId, category, note)
    setStep('done')
    setLoading(false)
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Handle bar */}
        <View style={styles.handle} />

        {step !== 'done' && (
          <View style={styles.header}>
            <Pressable style={styles.cancelBtn} onPress={handleClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Text style={styles.title}>Report</Text>
            <View style={{ width: 60 }} />
          </View>
        )}

        {/* Step 1: Category */}
        {step === 'category' && (
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={styles.subtitle}>
              What's the issue with{' '}
              <Text style={styles.peerName}>{peerName}</Text>?
            </Text>

            <View style={styles.categoryList}>
              {CATEGORIES.map(([key, label]) => (
                <Pressable
                  key={key}
                  style={[
                    styles.categoryRow,
                    category === key && styles.categoryRowActive,
                  ]}
                  onPress={() => setCategory(key)}
                >
                  <View style={[
                    styles.radio,
                    category === key && styles.radioActive,
                  ]}>
                    {category === key && <View style={styles.radioDot} />}
                  </View>
                  <Text style={[
                    styles.categoryLabel,
                    category === key && styles.categoryLabelActive,
                  ]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={[styles.nextBtn, !category && styles.nextBtnDisabled]}
              onPress={() => category && setStep('note')}
              disabled={!category}
            >
              <Text style={styles.nextBtnText}>Continue</Text>
            </Pressable>

            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                Reports are stored on your device only. You control if and when you share them. Submitting will also block this person.
              </Text>
            </View>
          </ScrollView>
        )}

        {/* Step 2: Note */}
        {step === 'note' && (
          <View style={styles.content}>
            <Text style={styles.subtitle}>
              Add details{' '}
              <Text style={styles.optionalLabel}>(optional)</Text>
            </Text>
            <Text style={styles.noteHint}>
              Describe what happened. This stays on your device.
            </Text>

            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder="What happened?"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={500}
              autoFocus
              textAlignVertical="top"
            />

            <Text style={styles.charCount}>{note.length}/500</Text>

            <Pressable
              style={[styles.nextBtn, loading && styles.nextBtnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={styles.nextBtnText}>
                {loading ? 'Submitting…' : 'Submit report & block'}
              </Text>
            </Pressable>

            <Pressable style={styles.backBtn} onPress={() => setStep('category')}>
              <Text style={styles.backBtnText}>Back</Text>
            </Pressable>
          </View>
        )}

        {/* Step 3: Done */}
        {step === 'done' && (
          <View style={[styles.content, styles.doneContent]}>
            <Text style={styles.doneGlyph}>⊘</Text>
            <Text style={styles.doneTitle}>Reported & blocked</Text>
            <Text style={styles.doneBody}>
              {peerName} has been blocked. They won't appear on your radar and can't contact you.
              {'\n\n'}
              Your report is saved locally. You can export it from Settings → Data if needed.
            </Text>
            <Pressable
              style={styles.nextBtn}
              onPress={() => {
                handleClose()
                onBlocked()
              }}
            >
              <Text style={styles.nextBtnText}>Done</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    paddingBottom:   spacing.xl,
  },
  handle: {
    width:           40,
    height:          4,
    borderRadius:    2,
    backgroundColor: colors.border,
    alignSelf:       'center',
    marginTop:       spacing.md,
    marginBottom:    spacing.md,
  },
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    marginBottom:   spacing.lg,
  },
  cancelBtn: { width: 60 },
  cancelText: { ...typography.label, fontSize: fontSizes.md, color: colors.textSecondary },
  title: { ...typography.label, fontSize: fontSizes.md, color: colors.textPrimary },

  content: { flex: 1 },

  subtitle: {
    ...typography.display,
    fontSize:     fontSizes.xl,
    color:        colors.textPrimary,
    marginBottom: spacing.lg,
    lineHeight:   28,
  },
  peerName: { color: colors.pulse },
  optionalLabel: {
    ...typography.body,
    fontSize: fontSizes.md,
    color:    colors.textMuted,
  },

  categoryList: {
    backgroundColor: colors.surface,
    borderRadius:    radius.lg,
    borderWidth:     0.5,
    borderColor:     colors.border,
    overflow:        'hidden',
    marginBottom:    spacing.md,
  },
  categoryRow: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  categoryRowActive: { backgroundColor: colors.surfaceHigh },
  radio: {
    width:        20,
    height:       20,
    borderRadius: 10,
    borderWidth:  1.5,
    borderColor:  colors.border,
    alignItems:   'center',
    justifyContent: 'center',
    flexShrink:   0,
  },
  radioActive:  { borderColor: colors.pulse },
  radioDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: colors.pulse,
  },
  categoryLabel: {
    ...typography.body, flex: 1,
    fontSize: fontSizes.md, color: colors.textSecondary,
  },
  categoryLabelActive: { color: colors.textPrimary },

  noteHint: {
    ...typography.body, fontSize: fontSizes.sm, color: colors.textMuted,
    marginBottom: spacing.md,
  },
  noteInput: {
    ...typography.body,
    fontSize:        fontSizes.md,
    color:           colors.textPrimary,
    backgroundColor: colors.surface,
    borderWidth:     0.5,
    borderColor:     colors.border,
    borderRadius:    radius.md,
    padding:         spacing.md,
    height:          140,
    marginBottom:    spacing.xs,
  },
  charCount: {
    ...typography.mono,
    fontSize:  fontSizes.xs,
    color:     colors.textMuted,
    textAlign: 'right',
    marginBottom: spacing.lg,
  },

  nextBtn: {
    backgroundColor: colors.pulse,
    borderRadius:    radius.md,
    paddingVertical: spacing.md,
    alignItems:      'center',
    marginBottom:    spacing.sm,
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { ...typography.label, fontSize: fontSizes.md, color: colors.bg },

  backBtn: {
    paddingVertical: spacing.md,
    alignItems:      'center',
  },
  backBtnText: {
    ...typography.label, fontSize: fontSizes.md, color: colors.textMuted,
  },

  infoBox: {
    marginTop:       spacing.md,
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    borderWidth:     0.5,
    borderColor:     colors.border,
    padding:         spacing.md,
  },
  infoText: {
    ...typography.body, fontSize: fontSizes.sm,
    color: colors.textMuted, lineHeight: 20,
  },

  doneContent: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  doneGlyph:   { fontSize: 44, color: colors.textMuted },
  doneTitle: {
    ...typography.label, fontSize: fontSizes.xl, color: colors.textPrimary,
  },
  doneBody: {
    ...typography.body, fontSize: fontSizes.md, color: colors.textSecondary,
    textAlign: 'center', lineHeight: 22,
  },
})
