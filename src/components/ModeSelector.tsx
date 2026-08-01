// components/ModeSelector.tsx — Top Bar Social Mode Selector
import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import type { SocialMode } from '../lib/types'
import { colors, typography, fontSizes, spacing, radius } from '../theme'
import { HapticFeedback } from '../lib/haptics'

interface Props {
  activeMode: SocialMode
  onSelectMode: (mode: SocialMode) => void
}

const MODES: Array<{ id: SocialMode; label: string; icon: string; accent: string }> = [
  { id: 'all',        label: 'All',        icon: '✨', accent: colors.pulse },
  { id: 'dating',     label: 'Dating',     icon: '💕', accent: '#FF4B72' },
  { id: 'friends',    label: 'Friends',    icon: '🤝', accent: '#00D2FF' },
  { id: 'networking', label: 'Networking', icon: '💼', accent: '#7F00FF' },
]

export function ModeSelector({ activeMode, onSelectMode }: Props) {
  const handlePress = (mode: SocialMode) => {
    HapticFeedback.light()
    onSelectMode(mode)
  }

  return (
    <View style={styles.container}>
      {MODES.map(m => {
        const isActive = activeMode === m.id
        return (
          <Pressable
            key={m.id}
            style={[
              styles.pill,
              isActive && { backgroundColor: m.accent, borderColor: m.accent },
            ]}
            onPress={() => handlePress(m.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <Text style={styles.icon}>{m.icon}</Text>
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {m.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  icon: {
    fontSize: 14,
  },
  label: {
    ...typography.label,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  labelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
})
