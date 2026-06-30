// screens/ProfileView.tsx — your own profile card + edit shortcut
// Shows your card exactly as others see it, plus quick-edit for name/bio.

import React, { useState } from 'react'
import {
  View, Text, StyleSheet, Pressable,
  ScrollView, Dimensions,
} from 'react-native'
import { SafeAreaView }   from 'react-native-safe-area-context'
import { router }         from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { useStore }       from '../store'
import { TIER_LABELS, TIER_ICONS } from '../lib/zk-identity'
import { TabBar, type TabId } from '../components/TabBar'
import {
  colors, typography, fontSizes,
  spacing, radius, cardShadow, gradients,
} from '../theme'

const { width: W } = Dimensions.get('window')
const CARD_W = W - spacing.lg * 2
const CARD_H = CARD_W * 1.32

export default function ProfileView({ activeTab, onTabChange }: {
  activeTab: TabId
  onTabChange: (t: TabId) => void
}) {
  const profile  = useStore(s => s.profile)
  const myPeerId = useStore(s => s.myPeerId)
  const myBadge  = useStore(s => s.myBadge)

  if (!profile) return null

  const initials = profile.displayName.slice(0, 1).toUpperCase()
  const intentStr = profile.prefs.intentScore < 0.33 ? 'Casual'
    : profile.prefs.intentScore < 0.66 ? 'Open to both' : 'Serious'

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
          <Pressable
            style={styles.editBtn}
            onPress={() => router.push('/settings')}
          >
            <Text style={styles.editBtnText}>Edit</Text>
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          {/* Card preview */}
          <View style={[styles.card, cardShadow]}>
            <LinearGradient
              colors={gradients.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardGradient}
            >
              <Text style={styles.cardInitial}>{initials}</Text>
            </LinearGradient>

            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.88)']}
              style={styles.cardOverlay}
            >
              <View style={styles.cardInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.cardName}>{profile.displayName}</Text>
                  <Text style={styles.cardAge}>{profile.age}</Text>
                </View>
                <Text style={styles.cardIntent}>{intentStr}</Text>
                <View style={styles.tags}>
                  {profile.prefs.interestTags.slice(0, 5).map(tag => (
                    <View key={tag} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </LinearGradient>

            {/* "This is you" badge */}
            <View style={styles.youBadge}>
              <Text style={styles.youBadgeText}>This is how you appear nearby</Text>
            </View>
          </View>

          {/* Verification status */}
          <Pressable
            style={styles.verifyCard}
            onPress={() => router.push('/verify')}
          >
            {myBadge ? (
              <View style={styles.verifyCardInner}>
                <View style={styles.verifyBadgeRow}>
                  <Text style={styles.verifyIcon}>
                    {TIER_ICONS[myBadge.tier as keyof typeof TIER_ICONS]}
                  </Text>
                  <View style={styles.verifyInfo}>
                    <Text style={styles.verifyTitle}>
                      {TIER_LABELS[myBadge.tier as keyof typeof TIER_LABELS]}
                    </Text>
                    <Text style={styles.verifyInstitution}>{myBadge.institution}</Text>
                  </View>
                  <View style={styles.verifiedPill}>
                    <Text style={styles.verifiedPillText}>Verified</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.verifyCardInner}>
                <View style={styles.verifyBadgeRow}>
                  <View style={styles.verifyIconUnverified}>
                    <Text style={{ fontSize: 20 }}>✓</Text>
                  </View>
                  <View style={styles.verifyInfo}>
                    <Text style={styles.verifyTitle}>Get verified</Text>
                    <Text style={styles.verifyInstitution}>
                      Prove you're a real student — privately
                    </Text>
                  </View>
                  <Text style={styles.verifyChevron}>›</Text>
                </View>
              </View>
            )}
          </Pressable>

          {/* Stats */}
          <View style={styles.statsRow}>
            <StatCard label="Nearby peers" value={useStore(s => s.peers.size).toString()} />
            <StatCard label="Matches"       value={useStore(s => s.matches.size).toString()} />
            <StatCard label="Messages"      value={
              useStore(s => Array.from(s.messages.values()).reduce((t, ms) => t + ms.length, 0)).toString()
            } />
          </View>

          {/* Identity */}
          <View style={styles.identityCard}>
            <Text style={styles.identityLabel}>Peer Identity</Text>
            <Text style={styles.identityPeerId} numberOfLines={2}>
              {myPeerId || '…'}
            </Text>
            <Text style={styles.identityNote}>
              Generated on your device. Never uploaded anywhere.
            </Text>
          </View>

          {/* Settings shortcut rows */}
          <View style={styles.settingsRows}>
            {[
              { label: '⚙  Settings & privacy',  onPress: () => router.push('/settings') },
              { label: '⊘  Blocked & reports',   onPress: () => router.push('/settings') },
              { label: '?  How Proxim works',     onPress: () => {} },
            ].map((row, i) => (
              <Pressable
                key={i}
                style={({ pressed }) => [styles.settingsRow, pressed && { opacity: 0.65 }]}
                onPress={row.onPress}
              >
                <Text style={styles.settingsRowText}>{row.label}</Text>
                <Text style={styles.settingsRowChevron}>›</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
      <TabBar active={activeTab} onChange={onTabChange} />
    </View>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safeArea:  { flex: 1 },
  header: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    paddingHorizontal: spacing.lg,
    paddingTop:      spacing.md,
    paddingBottom:   spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    ...typography.display,
    fontSize: fontSizes.xl,
    color:    colors.textPrimary,
  },
  editBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.xs,
    borderRadius:      radius.full,
    borderWidth:       1.5,
    borderColor:       colors.pulse,
  },
  editBtnText: {
    ...typography.label,
    fontSize: fontSizes.sm,
    color:    colors.pulse,
  },

  content: {
    paddingHorizontal: spacing.lg,
    paddingTop:        spacing.lg,
    paddingBottom:     spacing.xl,
    gap:               spacing.lg,
    alignItems:        'center',
  },

  card: {
    width:        CARD_W,
    height:       CARD_H,
    borderRadius: radius.card,
    overflow:     'hidden',
    position:     'relative',
  },
  cardGradient: {
    ...StyleSheet.absoluteFillObject,
    alignItems:     'center',
    justifyContent: 'center',
  },
  cardInitial: {
    fontSize:   CARD_W * 0.32,
    color:      'rgba(255,255,255,0.22)',
    fontWeight: '800',
    letterSpacing: -4,
  },
  cardOverlay: {
    position: 'absolute',
    bottom:   0,
    left:     0,
    right:    0,
    paddingTop: 80,
  },
  cardInfo: {
    paddingHorizontal: spacing.lg,
    paddingBottom:     spacing.lg,
    gap:               spacing.sm,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems:    'baseline',
    gap:           spacing.sm,
  },
  cardName: { ...typography.display, fontSize: fontSizes.xxl, color: '#FFF' },
  cardAge:  { ...typography.heading, fontSize: fontSizes.xl,  color: 'rgba(255,255,255,0.85)' },
  cardIntent: { ...typography.label, fontSize: fontSizes.sm,  color: 'rgba(255,255,255,0.7)' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical:   3,
    borderRadius:      radius.full,
    backgroundColor:   'rgba(255,255,255,0.18)',
    borderWidth:       0.5,
    borderColor:       'rgba(255,255,255,0.3)',
  },
  tagText: { ...typography.label, fontSize: fontSizes.xs, color: '#FFF' },

  youBadge: {
    position:          'absolute',
    top:               spacing.md,
    alignSelf:         'center',
    left:              spacing.lg,
    right:             spacing.lg,
    backgroundColor:   'rgba(0,0,0,0.55)',
    borderRadius:      radius.full,
    paddingVertical:   spacing.xs,
    paddingHorizontal: spacing.md,
    alignItems:        'center',
  },
  youBadgeText: {
    ...typography.label,
    fontSize: fontSizes.xs,
    color:    'rgba(255,255,255,0.7)',
  },

  verifyCard: {
    width:           '100%',
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    borderWidth:     0.5,
    borderColor:     colors.border,
    overflow:        'hidden',
  },
  verifyCardInner: { padding: spacing.md },
  verifyBadgeRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            spacing.md,
  },
  verifyIcon: { fontSize: 28 },
  verifyIconUnverified: {
    width:           40,
    height:          40,
    borderRadius:    20,
    backgroundColor: colors.surfaceHigh,
    borderWidth:     1,
    borderColor:     colors.border,
    alignItems:      'center',
    justifyContent:  'center',
  },
  verifyInfo:        { flex: 1 },
  verifyTitle: {
    ...typography.label,
    fontSize:     fontSizes.md,
    color:        colors.textPrimary,
    marginBottom: 2,
  },
  verifyInstitution: {
    ...typography.body,
    fontSize: fontSizes.sm,
    color:    colors.textSecondary,
  },
  verifiedPill: {
    backgroundColor: colors.like + '22',
    borderRadius:    radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical:   3,
    borderWidth:     1,
    borderColor:     colors.like + '55',
  },
  verifiedPillText: {
    ...typography.label,
    fontSize: fontSizes.xs,
    color:    colors.like,
  },
  verifyChevron: { fontSize: 22, color: colors.textMuted, lineHeight: 26 },
  statsRow: {
    flexDirection: 'row',
    gap:           spacing.sm,
    width:         '100%',
  },
  statCard: {
    flex:            1,
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    borderWidth:     0.5,
    borderColor:     colors.border,
    paddingVertical: spacing.md,
    alignItems:      'center',
    gap:             4,
  },
  statValue: { ...typography.display, fontSize: fontSizes.xl, color: colors.textPrimary },
  statLabel: { ...typography.body,    fontSize: fontSizes.xs, color: colors.textMuted },

  identityCard: {
    width:           '100%',
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    borderWidth:     0.5,
    borderColor:     colors.border,
    padding:         spacing.md,
    gap:             spacing.xs,
  },
  identityLabel: { ...typography.label, fontSize: fontSizes.sm, color: colors.textMuted },
  identityPeerId: {
    ...typography.mono,
    fontSize:   fontSizes.xs,
    color:      colors.textSecondary,
    lineHeight: 18,
  },
  identityNote: { ...typography.body, fontSize: fontSizes.xs, color: colors.textMuted },

  settingsRows: {
    width:           '100%',
    backgroundColor: colors.surface,
    borderRadius:    radius.md,
    borderWidth:     0.5,
    borderColor:     colors.border,
    overflow:        'hidden',
  },
  settingsRow: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  settingsRowText:    { ...typography.body, fontSize: fontSizes.md, color: colors.textSecondary },
  settingsRowChevron: { fontSize: 20, color: colors.textMuted, lineHeight: 24 },
})
