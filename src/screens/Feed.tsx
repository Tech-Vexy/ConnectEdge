// screens/Feed.tsx — P2P Social Feed Screen ("Pulse") with Rich Media Attachments
import React, { useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, Pressable, TextInput, Modal, RefreshControl, Image, Alert,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { useStore } from '../store'
import { TabBar, type TabId } from '../components/TabBar'
import { PostCard } from '../components/PostCard'
import { ModeSelector } from '../components/ModeSelector'
import { MediaViewerModal } from '../components/MediaViewerModal'
import type { SocialMode } from '../lib/types'
import { colors, typography, fontSizes, spacing, radius, gradients } from '../theme'
import { HapticFeedback } from '../lib/haptics'

export default function Feed({ activeTab, onTabChange }: {
  activeTab: TabId
  onTabChange: (t: TabId) => void
}) {
  const { posts, createPost, likePost, activeSocialMode, setSocialMode, openChat } = useStore()

  const [modalVisible, setModalVisible]       = useState(false)
  const [newContent, setNewContent]           = useState('')
  const [newTagsStr, setNewTagsStr]           = useState('')
  const [postMode, setPostMode]               = useState<SocialMode>('all')
  const [attachedPhoto, setAttachedPhoto]     = useState<string | null>(null)
  const [activeViewerUri, setActiveViewerUri] = useState<string | null>(null)
  const [refreshing, setRefreshing]           = useState(false)

  const postList = Array.from(posts.values())
    .filter(p => activeSocialMode === 'all' || p.mode === 'all' || p.mode === activeSocialMode)
    .sort((a, b) => b.timestamp - a.timestamp)

  const handleReplyPrivate = (authorPeerId: string) => {
    HapticFeedback.light()
    openChat(authorPeerId)
    router.push('/chat')
  }

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please grant photo library permissions to attach images')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    })

    if (!result.canceled && result.assets[0]) {
      HapticFeedback.light()
      setAttachedPhoto(result.assets[0].uri)
    }
  }

  const handleCreate = async () => {
    if (!newContent.trim() && !attachedPhoto) return
    HapticFeedback.success()
    const tags = newTagsStr
      .split(',')
      .map(t => t.trim().toLowerCase().replace(/^#/, ''))
      .filter(Boolean)

    await createPost(newContent, tags, postMode, undefined, attachedPhoto || undefined)
    setNewContent('')
    setNewTagsStr('')
    setAttachedPhoto(null)
    setModalVisible(false)
  }

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    HapticFeedback.light()
    await new Promise(r => setTimeout(r, 600))
    setRefreshing(false)
  }, [])

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <LinearGradient
              colors={gradients.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.logoWrap}
            >
              <Text style={styles.logo}>Pulse Feed</Text>
            </LinearGradient>
            <Text style={styles.headerSubtitle}>P2P Mesh Network</Text>
          </View>

          <Pressable
            style={styles.createBtn}
            onPress={() => {
              HapticFeedback.light()
              setModalVisible(true)
            }}
          >
            <Text style={styles.createBtnText}>+ Post</Text>
          </Pressable>
        </View>

        {/* Mode Filter Selector */}
        <ModeSelector activeMode={activeSocialMode} onSelectMode={setSocialMode} />

        {/* Feed List */}
        <FlatList
          data={postList}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              onLike={likePost}
              onComment={() => handleReplyPrivate(item.authorPeerId)}
              onMediaPress={uri => setActiveViewerUri(uri)}
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.pulse}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📡</Text>
              <Text style={styles.emptyTitle}>No posts in mesh yet</Text>
              <Text style={styles.emptySubtitle}>
                Be the first to share an update, photo, or invite nearby peers!
              </Text>
            </View>
          }
        />
      </SafeAreaView>

      <TabBar active={activeTab} onChange={onTabChange} />

      {/* Lightbox Media Viewer Modal */}
      <MediaViewerModal
        visible={!!activeViewerUri}
        imageUri={activeViewerUri}
        onClose={() => setActiveViewerUri(null)}
      />

      {/* Create Post Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Share to P2P Mesh</Text>
              <Pressable onPress={() => setModalVisible(false)}>
                <Text style={styles.closeBtn}>✕</Text>
              </Pressable>
            </View>

            <TextInput
              style={styles.input}
              placeholder="What's happening nearby? Share an update, photo, or invite peers..."
              placeholderTextColor={colors.textMuted}
              multiline
              value={newContent}
              onChangeText={setNewContent}
            />

            {/* Photo Attachment Preview */}
            {attachedPhoto ? (
              <View style={styles.attachedPreviewWrap}>
                <Image source={{ uri: attachedPhoto }} style={styles.attachedImage} />
                <Pressable
                  style={styles.removePhotoBtn}
                  onPress={() => setAttachedPhoto(null)}
                >
                  <Text style={styles.removePhotoBtnText}>✕ Remove Photo</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.attachMediaBtn} onPress={handlePickPhoto}>
                <Text style={styles.attachMediaBtnText}>📷 Attach Photo / Image</Text>
              </Pressable>
            )}

            <TextInput
              style={styles.tagInput}
              placeholder="Tags (comma separated e.g. tech, coffee, gaming)"
              placeholderTextColor={colors.textMuted}
              value={newTagsStr}
              onChangeText={setNewTagsStr}
            />

            <View style={styles.modePickerRow}>
              <Text style={styles.modePickerLabel}>Target Audience:</Text>
              <View style={styles.modeOptions}>
                {(['all', 'dating', 'friends', 'networking'] as SocialMode[]).map(m => (
                  <Pressable
                    key={m}
                    style={[styles.modeChip, postMode === m && styles.modeChipActive]}
                    onPress={() => setPostMode(m)}
                  >
                    <Text style={[styles.modeChipText, postMode === m && styles.modeChipTextActive]}>
                      {m.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Pressable
              style={[styles.submitBtn, !newContent.trim() && !attachedPhoto && styles.submitBtnDisabled]}
              onPress={handleCreate}
              disabled={!newContent.trim() && !attachedPhoto}
            >
              <Text style={styles.submitBtnText}>Broadcast Post</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitleRow: {},
  logoWrap: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  logo: { ...typography.heading, fontSize: fontSizes.lg, color: '#FFF' },
  headerSubtitle: { ...typography.mono, fontSize: 10, color: colors.textMuted, marginTop: 2 },
  createBtn: {
    backgroundColor: colors.pulse,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  createBtnText: { ...typography.label, fontSize: fontSizes.xs, color: '#FFF' },

  listContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  emptyIcon: { fontSize: 48, marginBottom: spacing.sm },
  emptyTitle: { ...typography.heading, fontSize: fontSizes.lg, color: colors.textPrimary, marginBottom: spacing.xs },
  emptySubtitle: { ...typography.body, fontSize: fontSizes.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: { ...typography.heading, fontSize: fontSizes.lg, color: colors.textPrimary },
  closeBtn: { fontSize: 20, color: colors.textMuted },

  input: {
    ...typography.body,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  attachMediaBtn: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  attachMediaBtnText: {
    ...typography.label,
    fontSize: fontSizes.sm,
    color: colors.pulse,
  },
  attachedPreviewWrap: {
    position: 'relative',
    borderRadius: radius.md,
    overflow: 'hidden',
    height: 120,
    backgroundColor: colors.bg,
  },
  attachedImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  removePhotoBtn: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  removePhotoBtnText: {
    ...typography.label,
    fontSize: 10,
    color: '#FFF',
  },

  tagInput: {
    ...typography.body,
    fontSize: fontSizes.sm,
    color: colors.textPrimary,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  modePickerRow: {
    gap: spacing.xs,
  },
  modePickerLabel: { ...typography.label, fontSize: fontSizes.xs, color: colors.textMuted },
  modeOptions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  modeChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
  },
  modeChipActive: {
    backgroundColor: colors.pulse,
  },
  modeChipText: { ...typography.label, fontSize: 10, color: colors.textMuted },
  modeChipTextActive: { color: '#FFF' },

  submitBtn: {
    backgroundColor: colors.pulse,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { ...typography.heading, fontSize: fontSizes.md, color: '#FFF' },
})
