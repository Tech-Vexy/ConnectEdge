// screens/Settings.tsx
// Profile editing, preference weight tuning, block list management,
// and nuclear data-clear. All local — nothing synced.

import React, { useState, useEffect } from 'react'
import {
  View, Text, StyleSheet, Pressable, ScrollView,
  TextInput, Switch, Alert, Share,
} from 'react-native'
import { SafeAreaView }   from 'react-native-safe-area-context'
import { router }         from 'expo-router'
import * as SecureStore   from 'expo-secure-store'
import { useStore }       from '../store'
import { clearPhotoCache } from '../lib/photos'
import { getCacheStats, type CacheStats } from '../lib/cache-manager'
import { unregisterBackgroundPoll } from '../lib/relay-poll'
import {
  getBiometricCapability, isBiometricEnabled,
  setBiometricEnabled, type BiometricCapability,
} from '../lib/biometrics'
import { safetyRegistry } from '../lib/safety'
import { proximNode }     from '../lib/node'
import { SCORE_DIMS }     from '../lib/types'
import { colors, typography, spacing, fontSizes, radius } from '../theme'

type TabId = 'profile' | 'weights' | 'blocked' | 'data'

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>
}

function Row({
  label, value, onPress, danger, mono, right,
}: {
  label:    string
  value?:   string
  onPress?: () => void
  danger?:  boolean
  mono?:    boolean
  right?:   React.ReactNode
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && onPress && styles.rowPressed]}
      onPress={onPress}
      disabled={!onPress && !right}
    >
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
      {right ?? (value && (
        <Text style={[styles.rowValue, mono && styles.rowValueMono]} numberOfLines={1}>
          {value}
        </Text>
      ))}
    </Pressable>
  )
}

// ─── Profile tab ────────────────────────────────────────────────────────────

function ProfileTab() {
  const { profile, updateProfile } = useStore()
  const [name, setName] = useState(profile?.displayName ?? '')
  const [bio,  setBio]  = useState(profile?.bio ?? '')
  const [dirty, setDirty] = useState(false)

  const save = async () => {
    await updateProfile({ displayName: name.trim(), bio: bio.trim() })
    setDirty(false)
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} style={styles.tabContent}>
      <SectionHeader title="Identity" />

      <View style={styles.card}>
        <Row
          label="Peer ID"
          value={profile?.peerId ?? '…'}
          mono
        />
        <Row
          label="Age"
          value={profile?.age.toString() ?? '–'}
        />
      </View>

      <SectionHeader title="Display" />

      <View style={styles.card}>
        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>Name</Text>
          <TextInput
            style={styles.inlineInput}
            value={name}
            onChangeText={(v) => { setName(v); setDirty(true) }}
            maxLength={20}
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <View style={[styles.inputRow, { borderBottomWidth: 0 }]}>
          <Text style={styles.inputLabel}>Bio</Text>
          <TextInput
            style={[styles.inlineInput, { flex: 1 }]}
            value={bio}
            onChangeText={(v) => { setBio(v); setDirty(true) }}
            maxLength={120}
            multiline
            placeholderTextColor={colors.textMuted}
            placeholder="Short bio (shared post-match only)"
          />
        </View>
      </View>

      {dirty && (
        <Pressable style={styles.saveBtn} onPress={save}>
          <Text style={styles.saveBtnText}>Save changes</Text>
        </Pressable>
      )}

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          Name and intent are shared with nearby peers. Bio is only shared after a confirmed match.
        </Text>
      </View>
    </ScrollView>
  )
}

// ─── Weights tab ─────────────────────────────────────────────────────────────

function WeightsTab() {
  const { profile, updateProfile } = useStore()
  const prefs  = profile?.prefs
  const [weights, setWeights] = useState({
    age:       0.20,
    interests: 0.30,
    intent:    0.25,
    proximity: 0.15,
    values:    0.10,
  })
  const [dirty, setDirty] = useState(false)

  const total = Object.values(weights).reduce((a, b) => a + b, 0)
  const balanced = Math.abs(total - 1.0) < 0.01

  const adjust = (key: string, delta: number) => {
    setWeights(w => {
      const next = { ...w, [key]: Math.max(0, Math.min(0.6, w[key as keyof typeof w] + delta)) }
      setDirty(true)
      return next
    })
  }

  const save = async () => {
    if (!prefs) return
    await updateProfile({ prefs: { ...prefs, proximityWeight: weights.proximity } })
    setDirty(false)
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} style={styles.tabContent}>
      <SectionHeader title="Match scoring weights" />
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          Adjust how much each dimension contributes to your compatibility score. Total must equal 100%.
        </Text>
      </View>

      <View style={styles.card}>
        {SCORE_DIMS.map((dim) => {
          const w = weights[dim.key as keyof typeof weights]
          return (
            <View key={dim.key} style={styles.weightRow}>
              <Text style={styles.weightLabel}>{dim.label}</Text>
              <View style={styles.weightControls}>
                <Pressable style={styles.weightBtn} onPress={() => adjust(dim.key, -0.05)}>
                  <Text style={styles.weightBtnText}>−</Text>
                </Pressable>
                <View style={styles.weightBarWrap}>
                  <View style={[styles.weightBar, { width: `${w * 100}%` }]} />
                </View>
                <Text style={styles.weightPct}>{Math.round(w * 100)}%</Text>
                <Pressable style={styles.weightBtn} onPress={() => adjust(dim.key, +0.05)}>
                  <Text style={styles.weightBtnText}>+</Text>
                </Pressable>
              </View>
            </View>
          )
        })}

        <View style={[styles.weightRow, { borderBottomWidth: 0 }]}>
          <Text style={[styles.weightLabel, { color: balanced ? colors.signalStrong : colors.danger }]}>
            Total
          </Text>
          <Text style={[styles.weightPct, { color: balanced ? colors.signalStrong : colors.danger }]}>
            {Math.round(total * 100)}%
          </Text>
        </View>
      </View>

      {dirty && balanced && (
        <Pressable style={styles.saveBtn} onPress={save}>
          <Text style={styles.saveBtnText}>Apply weights</Text>
        </Pressable>
      )}
      {dirty && !balanced && (
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>Weights must total exactly 100% before saving.</Text>
        </View>
      )}
    </ScrollView>
  )
}

// ─── Block list tab ──────────────────────────────────────────────────────────

function BlockedTab() {
  const unblockPeer = useStore(s => s.unblockPeer)
  const [blockedList, setBlockedList] = useState<string[]>(() => [...safetyRegistry.blockedSet])

  const handleUnblock = async (peerId: string) => {
    await unblockPeer(peerId)
    setBlockedList([...safetyRegistry.blockedSet])
  }

  if (blockedList.length === 0) {
    return (
      <View style={[styles.tabContent, styles.emptyTab]}>
        <Text style={styles.emptyGlyph}>⊘</Text>
        <Text style={styles.emptyTitle}>No blocked peers</Text>
        <Text style={styles.emptyBody}>
          Block someone from their profile in the radar or chat screens.
        </Text>
      </View>
    )
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} style={styles.tabContent}>
      <SectionHeader title={`${blockedList.length} blocked`} />
      <View style={styles.card}>
        {blockedList.map((peerId, i) => (
          <View
            key={peerId}
            style={[styles.row, i === blockedList.length - 1 && { borderBottomWidth: 0 }]}
          >
            <Text style={[styles.rowValue, styles.rowValueMono, { flex: 1 }]} numberOfLines={1}>
              {peerId.slice(0, 24)}…
            </Text>
            <Pressable
              style={styles.unblockBtn}
              onPress={() => handleUnblock(peerId)}
            >
              <Text style={styles.unblockBtnText}>Unblock</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

// ─── Data tab ────────────────────────────────────────────────────────────────

function DataTab() {
  const { profile } = useStore()
  const [cacheStats,  setCacheStats]  = useState<CacheStats | null>(null)
  const [bioCap,      setBioCap]      = useState<BiometricCapability | null>(null)
  const [bioEnabled,  setBioEnabled]  = useState(false)
  const [bioLoading,  setBioLoading]  = useState(false)
  const [extendedRangeOn, setExtendedRangeOn] = useState(false)
  const [extendedRangeLoading, setExtendedRangeLoading] = useState(false)

  useEffect(() => {
    getCacheStats().then(setCacheStats)
    getBiometricCapability().then(cap => {
      setBioCap(cap)
      if (cap.enrolled) isBiometricEnabled().then(setBioEnabled)
    })
    setExtendedRangeOn(proximNode.hyperswarmEnabled)
  }, [])

  const handleExtendedRangeToggle = async (value: boolean) => {
    setExtendedRangeLoading(true)
    if (value) {
      const ok = await proximNode.enableHyperswarmDiscovery()
      setExtendedRangeOn(ok)
      if (!ok) {
        Alert.alert(
          'Could not enable',
          'Extended range discovery needs location access to find your general area. Check Settings → Privacy → Location.',
        )
      }
    } else {
      await proximNode.disableHyperswarmDiscovery()
      setExtendedRangeOn(false)
    }
    setExtendedRangeLoading(false)
  }

  const handleBioToggle = async (value: boolean) => {
    setBioLoading(true)
    await setBiometricEnabled(value)
    setBioEnabled(await isBiometricEnabled())
    setBioLoading(false)
  }

  const clearPhotos = async () => {
    Alert.alert('Clear photo cache', 'Delete all locally cached photos?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clearPhotoCache()
          setCacheStats(await getCacheStats())
          Alert.alert('Done', 'Photo cache cleared.')
        },
      },
    ])
  }

  const deleteEverything = () => {
    Alert.alert(
      'Delete all data',
      'This will delete your profile, identity keys, and all local data. You will need to create a new identity. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            await unregisterBackgroundPoll()
            await clearPhotoCache()
            const keys = [
              'proxim_profile_v1',    'proxim_blocked_v1',
              'proxim_ed_secret_v1',  'proxim_ed_public_v1',
              'proxim_x_secret_v1',   'proxim_x_public_v1',
              'proxim_relay_hash_v1', 'proxim_relay_queue_v1',
              'proxim_biometric_enabled_v1', 'proxim_photo_manifest_v1',
            ]
            await Promise.all(keys.map(k => SecureStore.deleteItemAsync(k).catch(() => {})))
            router.replace('/onboarding')
          },
        },
      ]
    )
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false} style={styles.tabContent}>

      {/* Extended range discovery */}
      <SectionHeader title="Discovery range" />
      <View style={styles.card}>
        <View style={[styles.row, { borderBottomWidth: 0 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Extended range</Text>
            <Text style={[styles.rowValue, { textAlign: 'left', marginTop: 2 }]}>
              Find people on different Wi-Fi networks in your area, even when the app is backgrounded. Uses your approximate area (~500m), never exact location.
            </Text>
          </View>
          <Switch
            value={extendedRangeOn}
            onValueChange={handleExtendedRangeToggle}
            disabled={extendedRangeLoading}
            trackColor={{ false: colors.border, true: colors.signalStrong }}
            thumbColor={colors.textPrimary}
          />
        </View>
      </View>

      {/* Biometrics */}
      {bioCap && (
        <>
          <SectionHeader title="Security" />
          <View style={styles.card}>
            <View style={[styles.row, { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>
                  {bioCap.enrolled ? bioCap.typeLabel : 'Biometrics'}
                </Text>
                <Text style={[styles.rowValue, { textAlign: 'left', marginTop: 2 }]}>
                  {!bioCap.available
                    ? 'Not available on this device'
                    : !bioCap.enrolled
                    ? `No ${bioCap.typeLabel} enrolled in device settings`
                    : 'Require authentication to access identity keys'}
                </Text>
              </View>
              {bioCap.available && bioCap.enrolled && (
                <Switch
                  value={bioEnabled}
                  onValueChange={handleBioToggle}
                  disabled={bioLoading}
                  trackColor={{ false: colors.border, true: colors.signalStrong }}
                  thumbColor={colors.textPrimary}
                />
              )}
            </View>
          </View>
        </>
      )}

      {/* Cache stats */}
      <SectionHeader title="Photo cache" />
      <View style={styles.card}>
        {cacheStats ? (
          <>
            <Row label="Files cached"  value={`${cacheStats.fileCount} photos`} />
            <Row label="Cache size"    value={`${cacheStats.totalMB} MB / ${cacheStats.limitMB} MB`} />
            <View style={[styles.row, { borderBottomWidth: 0 }]}>
              <Text style={styles.rowLabel}>Usage</Text>
              <View style={{ flex: 1, paddingLeft: spacing.lg }}>
                <View style={styles.cacheBar}>
                  <View style={[
                    styles.cacheFill,
                    {
                      width: `${Math.min(cacheStats.usagePct, 100)}%` as any,
                      backgroundColor: cacheStats.usagePct > 80 ? colors.danger : colors.signalStrong,
                    },
                  ]} />
                </View>
                <Text style={[styles.rowValue, { textAlign: 'right', marginTop: 4 }]}>
                  {cacheStats.usagePct}%
                </Text>
              </View>
            </View>
          </>
        ) : (
          <Row label="Loading…" />
        )}
      </View>

      <SectionHeader title="Safety reports" />
      <View style={styles.card}>
        <Row
          label="Saved reports"
          value={`${safetyRegistry.blockedCount()} blocked · ${safetyRegistry.dismissedCount()} dismissed`}
        />
        <Row
          label="Export report log"
          onPress={async () => {
            const text = await safetyRegistry.exportReports()
            await Share.share({ message: text, title: 'Proxim Safety Report' })
          }}
        />
      </View>

      <SectionHeader title="Actions" />
      <View style={styles.card}>
        <Row label="Clear photo cache" onPress={clearPhotos} />
      </View>

      <SectionHeader title="Storage model" />
      <View style={styles.card}>
        <Row label="Profile"      value="Device Keychain" />
        <Row label="Crypto keys"  value={`Keychain${bioEnabled ? ' + biometrics' : ''}`} />
        <Row label="Chat history" value="Session memory only" />
        <Row label="Photos"       value="Cache dir — not photo library" />
      </View>

      <View style={[styles.card, { marginTop: spacing.lg }]}>
        <Row label="Delete all data & start over" onPress={deleteEverything} danger />
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          No data is stored on any server. Deleting local data is permanent — there is no account to recover.
        </Text>
      </View>
    </ScrollView>
  )
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function Settings() {
  const [tab, setTab] = useState<TabId>('profile')

  const TABS: { id: TabId; label: string }[] = [
    { id: 'profile', label: 'Profile' },
    { id: 'weights', label: 'Weights' },
    { id: 'blocked', label: 'Blocked' },
    { id: 'data',    label: 'Data'    },
  ]

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Settings</Text>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {TABS.map(t => (
          <Pressable
            key={t.id}
            style={[styles.tabItem, tab === t.id && styles.tabItemActive]}
            onPress={() => setTab(t.id)}
          >
            <Text style={[styles.tabItemText, tab === t.id && styles.tabItemTextActive]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'profile' && <ProfileTab />}
      {tab === 'weights' && <WeightsTab />}
      {tab === 'blocked' && <BlockedTab />}
      {tab === 'data'    && <DataTab />}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.border, gap: spacing.sm,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { fontSize: 24, color: colors.textSecondary, lineHeight: 28 },
  title: { ...typography.display, flex: 1, fontSize: fontSizes.xl, color: colors.textPrimary },

  tabBar: {
    flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  tabItem: { flex: 1, paddingVertical: spacing.md, alignItems: 'center' },
  tabItemActive: { borderBottomWidth: 1.5, borderBottomColor: colors.textPrimary },
  tabItemText: { ...typography.label, fontSize: fontSizes.sm, color: colors.textMuted },
  tabItemTextActive: { color: colors.textPrimary },

  tabContent: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md },

  sectionHeader: {
    ...typography.label, fontSize: fontSizes.xs, color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: spacing.lg, marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 0.5, borderColor: colors.border, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.border,
    gap: spacing.md, minHeight: 48,
  },
  rowPressed: { opacity: 0.65 },
  rowLabel:  { ...typography.body, fontSize: fontSizes.md, color: colors.textPrimary, flex: 1 },
  rowLabelDanger: { color: colors.danger },
  rowValue:  { ...typography.body, fontSize: fontSizes.sm, color: colors.textMuted, maxWidth: '55%', textAlign: 'right' },
  rowValueMono: { ...typography.mono, fontSize: fontSizes.xs },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: spacing.md,
    paddingVertical: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.border,
    gap: spacing.md,
  },
  inputLabel: { ...typography.label, fontSize: fontSizes.sm, color: colors.textMuted, width: 48, paddingTop: 2 },
  inlineInput: {
    ...typography.body, fontSize: fontSizes.md, color: colors.textPrimary,
    flex: 1, padding: 0,
  },

  saveBtn: {
    marginTop: spacing.md, backgroundColor: colors.textPrimary,
    borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center',
  },
  saveBtnText: { ...typography.label, fontSize: fontSizes.md, color: colors.bg },

  infoBox: {
    marginTop: spacing.md, marginBottom: spacing.xl,
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 0.5, borderColor: colors.border, padding: spacing.md,
  },
  infoText: { ...typography.body, fontSize: fontSizes.sm, color: colors.textMuted, lineHeight: 20 },

  warningBox: {
    marginTop: spacing.md, backgroundColor: colors.pulseLight,
    borderRadius: radius.md, borderWidth: 0.5, borderColor: colors.pulseMid,
    padding: spacing.md,
  },
  warningText: { ...typography.body, fontSize: fontSizes.sm, color: colors.pulse },

  weightRow: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: 0.5, borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  weightLabel: { ...typography.label, fontSize: fontSizes.sm, color: colors.textSecondary, marginBottom: 6 },
  weightControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  weightBtn: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceHigh,
    borderWidth: 0.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  weightBtnText: { fontSize: 16, color: colors.textSecondary, lineHeight: 20 },
  weightBarWrap: {
    flex: 1, height: 4, backgroundColor: colors.surfaceHigh,
    borderRadius: 2, overflow: 'hidden',
  },
  weightBar: { height: 4, backgroundColor: colors.signalStrong, borderRadius: 2 },
  weightPct: { ...typography.mono, fontSize: fontSizes.sm, color: colors.textSecondary, width: 36, textAlign: 'right' },

  cacheBar: {
    height: 4, flex: 1, backgroundColor: colors.surfaceHigh,
    borderRadius: 2, overflow: 'hidden',
  },
  cacheFill: { height: 4, borderRadius: 2 },
  unblockBtn: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: radius.sm, borderWidth: 0.5, borderColor: colors.border,
  },
  unblockBtnText: { ...typography.label, fontSize: fontSizes.xs, color: colors.textMuted },

  emptyTab: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  emptyGlyph: { fontSize: 36, color: colors.textMuted },
  emptyTitle: { ...typography.label, fontSize: fontSizes.md, color: colors.textSecondary },
  emptyBody:  { ...typography.body, fontSize: fontSizes.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
})
