// components/EventCard.tsx — Local Event / Meetup Card
import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { SocialEvent } from '../lib/types'
import { colors, typography, fontSizes, spacing, radius, cardShadow } from '../theme'
import { HapticFeedback } from '../lib/haptics'

interface Props {
  event: SocialEvent
  onToggleRSVP: (eventId: string) => void
}

export function EventCard({ event, onToggleRSVP }: Props) {
  const handleRSVP = () => {
    HapticFeedback.success()
    onToggleRSVP(event.id)
  }

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={event.gradient || ['#667eea', '#764ba2']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.banner}
      >
        <Text style={styles.category}>{event.category}</Text>
        <Text style={styles.title}>{event.title}</Text>
      </LinearGradient>

      <View style={styles.body}>
        <View style={styles.detailRow}>
          <Text style={styles.detailIcon}>📅</Text>
          <Text style={styles.detailText}>{event.dateStr}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailIcon}>📍</Text>
          <Text style={styles.detailText}>{event.location}</Text>
        </View>

        <Text style={styles.description}>{event.description}</Text>

        <View style={styles.footer}>
          <Text style={styles.organizer}>Organized by {event.organizerName}</Text>
          <Pressable
            style={[styles.rsvpBtn, event.isRSVPed && styles.rsvpedBtn]}
            onPress={handleRSVP}
          >
            <Text style={[styles.rsvpBtnText, event.isRSVPed && styles.rsvpedBtnText]}>
              {event.isRSVPed ? 'Going ✓' : 'RSVP'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow,
  },
  banner: {
    padding: spacing.md,
  },
  category: {
    ...typography.label,
    fontSize: 10,
    color: 'rgba(255,255,255,0.8)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    ...typography.heading,
    fontSize: fontSizes.lg,
    color: '#FFF',
    marginTop: 2,
  },
  body: {
    padding: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  detailIcon: {
    fontSize: 14,
    marginRight: spacing.xs,
  },
  detailText: {
    ...typography.body,
    fontSize: fontSizes.xs,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  description: {
    ...typography.body,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
    lineHeight: 20,
    marginVertical: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  organizer: {
    ...typography.body,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  rsvpBtn: {
    backgroundColor: colors.pulse,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  rsvpedBtn: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rsvpBtnText: {
    ...typography.label,
    fontSize: fontSizes.xs,
    color: '#FFF',
  },
  rsvpedBtnText: {
    color: colors.pulse,
  },
})
