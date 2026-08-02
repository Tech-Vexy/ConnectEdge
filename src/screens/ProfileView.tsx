// screens/ProfileView.tsx — your own profile card + edit shortcut
// Shows your card exactly as others see it, plus quick-edit for name/bio.

import React, { useState } from 'react'
import {
  View, Text, StyleSheet, Pressable,
  ScrollView, Image, Alert, TextInput,
  useWindowDimensions,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { SafeAreaView }   from 'react-native-safe-area-context'
import { router }         from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { useStore }       from '../store'
import { TIER_LABELS, TIER_ICONS } from '../lib/zk-identity'
import { appConfig } from '../lib/config'
import { TabBar, type TabId } from '../components/TabBar'
import {
  colors, typography, fontSizes,
  spacing, radius, cardShadow, gradients,
} from '../theme'

export default function ProfileView({ activeTab, onTabChange }: {
  activeTab: TabId
  onTabChange: (t: TabId) => void
}) {
  const { width } = useWindowDimensions()
  const cardW = width - spacing.lg * 2
  const cardH = cardW * 1.32
  const profile          = useStore(s => s.profile)
  const setProfile       = useStore(s => s.setProfile)
  const statusMessage    = useStore(s => s.statusMessage)
  const setStatusMessage = useStore(s => s.setStatusMessage)
  const myPeerId    = useStore(s => s.myPeerId)
  const myBadge     = useStore(s => s.myBadge)
  const peerCount   = useStore(s => s.peers.size)
  const matchCount  = useStore(s => s.matches.size)
  const msgCount    = useStore(s => Array.from(s.messages.values()).reduce((t, ms) => t + ms.length, 0))
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName]   = useState('')
  const [editBio, setEditBio]     = useState('')
  const [statusInput, setStatusInput] = useState(statusMessage || '')

  if (!profile) return null

  const handleEditPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant photo library permissions')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })

    if (!result.canceled && result.assets[0]) {
      await setProfile({ ...profile, photoUri: result.assets[0].uri })
    }
  }

  const handleSaveEdit = async () => {
    if (!editName.trim()) {
      Alert.alert('Error', 'Name cannot be empty')
      return
    }
    await setProfile({ ...profile, displayName: editName.trim(), bio: editBio.trim() })
    setIsEditing(false)
  }

  const startEdit = () => {
    setEditName(profile.displayName)
    setEditBio(profile.bio)
    setIsEditing(true)
  }

  const initials = profile.displayName.slice(0, 1).toUpperCase()
  const intentStr = profile.prefs.intentScore < 0.33 ? 'Casual'
    : profile.prefs.intentScore < 0.66 ? 'Open to both' : 'Serious'

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
          {!isEditing ? (
            <Pressable style={styles.editBtn} onPress={startEdit} accessibilityLabel="Edit profile">
              <Text style={styles.editBtnText}>Edit</Text>
            </Pressable>
          ) : (
            <View style={styles.editActions}>
              <Pressable style={[styles.editBtn, styles.editBtnCancel]} onPress={() => setIsEditing(false)} accessibilityLabel="Cancel editing">
                <Text style={styles.editBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.editBtn, styles.editBtnSave]} onPress={handleSaveEdit} accessibilityLabel="Save changes">
                <Text style={[styles.editBtnText, styles.editBtnSaveText]}>Save</Text>
              </Pressable>
            </View>
          )}
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          {/* Card preview */}
          <View style={[styles.card, { width: cardW, height: cardH }, cardShadow]}>
            {profile.photoUri ? (
              <Image source={{ uri: profile.photoUri }} style={styles.cardImage} />
            ) : (
              <LinearGradient
                colors={gradients.brand}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cardGradient}
              >
                <Text style={[styles.cardInitial, { fontSize: cardW * 0.32 }]}>{initials}</Text>
              </LinearGradient>
            )}

            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.88)']}
              style={styles.cardOverlay}
            >
              <View style={styles.cardInfo}>
                {isEditing ? (
                  <View style={styles.editField}>
                    <Text style={styles.editLabel}>Name</Text>
                    <TextInput
                      style={styles.editInput}
                      value={editName}
                      onChangeText={setEditName}
                      placeholder="Your name"
                      placeholderTextColor="rgba(255,255,255,0.5)"
                      maxLength={20}
                    />
                  </View>
                ) : (
                  <View style={styles.nameRow}>
                    <Text style={styles.cardName}>{profile.displayName}</Text>
                    <Text style={styles.cardAge}>{profile.age}</Text>
                  </View>
                )}
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

            {/* Photo edit button */}
            <Pressable style={styles.photoEditBtn} onPress={handleEditPhoto} accessibilityLabel="Change profile photo">
              <Text style={styles.photoEditBtnText}>📷 Change Photo</Text>
            </Pressable>
          </View>

          {/* Social Status Broadcast Card */}
          <View style={styles.statusCard}>
            <Text style={styles.statusCardTitle}>💬 Social Status Broadcast</Text>
            <TextInput
              style={styles.statusInput}
              placeholder="What are you up to? (e.g. Looking for tennis buddy, hacking on code...)"
              placeholderTextColor={colors.textMuted}
              value={statusInput}
              onChangeText={setStatusInput}
              onEndEditing={() => setStatusMessage(statusInput)}
            />
            <Text style={styles.statusHint}>Gossiped to nearby peers over Bluetooth & Wi-Fi</Text>
          </View>

          {/* Stats */}
          <View style={styles.statsRow}>
            <StatCard label="Nearby peers" value={peerCount.toString()} />
            <StatCard label="Matches"       value={matchCount.toString()} />
            <StatCard label="Messages"      value={msgCount.toString()} />
          </View>

          {/* Bio section */}
          <View style={styles.bioCard}>
            <Text style={styles.bioLabel}>About you</Text>
            {isEditing ? (
              <TextInput
                style={styles.bioInput}
                value={editBio}
                onChangeText={setEditBio}
                placeholder="Tell others about yourself..."
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={300}
                textAlignVertical="top"
              />
            ) : (
              <Text style={styles.bioText}>{profile.bio || 'No bio added yet'}</Text>
            )}
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
              { label: '?  How ConnectEdge works', onPress: () => {} },
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
  editActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  editBtnCancel: {
    borderColor: colors.border,
  },
  editBtnSave: {
    backgroundColor: colors.pulse,
    borderColor: colors.pulse,
  },
  editBtnText: {
    ...typography.label,
    fontSize: fontSizes.sm,
    color:    colors.pulse,
  },
  editBtnSaveText: {
    color: '#FFF',
  },

  content: {
    paddingHorizontal: spacing.lg,
    paddingTop:        spacing.lg,
    paddingBottom:     spacing.xl,
    gap:               spacing.lg,
    alignItems:        'center',
  },

  card: {
    borderRadius: radius.card,
    overflow:     'hidden',
    position:     'relative',
  },
  cardGradient: {
    ...StyleSheet.absoluteFillObject,
    alignItems:     'center',
    justifyContent: 'center',
  },
  cardImage: {
    ...StyleSheet.absoluteFillObject,
  },
  cardInitial: {
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
  editField: {
    gap: spacing.xs,
  },
  editLabel: {
    ...typography.label,
    fontSize: fontSizes.xs,
    color: 'rgba(255,255,255,0.7)',
  },
  editInput: {
    ...typography.heading,
    fontSize: fontSizes.xl,
    color: '#FFF',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
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
  photoEditBtn: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  photoEditBtnText: {
    ...typography.label,
    fontSize: fontSizes.sm,
    color: '#FFF',
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
    backgroundColor: colors.likeAlpha22,
    borderRadius:    radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical:   3,
    borderWidth:     1,
    borderColor:     colors.likeAlpha55,
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
  bioCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  statusCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.pulse,
    padding: spacing.md,
    gap: spacing.xs,
    marginVertical: spacing.sm,
  },
  statusCardTitle: {
    ...typography.heading,
    fontSize: fontSizes.xs,
    color: colors.pulse,
    textTransform: 'uppercase',
  },
  statusInput: {
    ...typography.body,
    fontSize: fontSizes.sm,
    color: colors.textPrimary,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  statusHint: {
    ...typography.mono,
    fontSize: 10,
    color: colors.textMuted,
  },
  bioLabel: {
    ...typography.label,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  bioText: {
    ...typography.body,
    fontSize: fontSizes.md,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  bioInput: {
    ...typography.body,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 80,
    textAlignVertical: 'top',
  },

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
