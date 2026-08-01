// components/HubCard.tsx — Community Hub Card
import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import type { SocialHub } from '../lib/types'
import { colors, typography, fontSizes, spacing, radius, cardShadow } from '../theme'
import { HapticFeedback } from '../lib/haptics'

interface Props {
  hub: SocialHub
  onToggleJoin: (hubId: string) => void
}

export function HubCard({ hub, onToggleJoin }: Props) {
  const handleToggle = () => {
    HapticFeedback.medium()
    onToggleJoin(hub.id)
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>{hub.icon}</Text>
        </View>
        <View style={styles.meta}>
          <Text style={styles.category}>{hub.category}</Text>
          <Text style={styles.name}>{hub.name}</Text>
        </View>
      </View>

      <Text style={styles.description}>{hub.description}</Text>

      <View style={styles.footer}>
        <Text style={styles.members}>👥 {hub.memberCount} members nearby</Text>
        <Pressable
          style={[styles.joinBtn, hub.isJoined && styles.joinedBtn]}
          onPress={handleToggle}
        >
          <Text style={[styles.joinBtnText, hub.isJoined && styles.joinedBtnText]}>
            {hub.isJoined ? 'Joined ✓' : '+ Join Hub'}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  icon: {
    fontSize: 24,
  },
  meta: {
    flex: 1,
  },
  category: {
    ...typography.label,
    fontSize: fontSizes.xs,
    color: colors.pulse,
    textTransform: 'uppercase',
  },
  name: {
    ...typography.heading,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },
  description: {
    ...typography.body,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  members: {
    ...typography.body,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  joinBtn: {
    backgroundColor: colors.pulse,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  joinedBtn: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  joinBtnText: {
    ...typography.label,
    fontSize: fontSizes.xs,
    color: '#FFF',
  },
  joinedBtnText: {
    color: colors.textMuted,
  },
})
