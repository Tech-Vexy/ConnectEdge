// components/MediaViewerModal.tsx — Fullscreen Photo Lightbox Modal
import React from 'react'
import {
  Modal, View, Image, StyleSheet, Pressable, Text, SafeAreaView,
} from 'react-native'
import { colors, typography, fontSizes, spacing } from '../theme'

interface Props {
  visible: boolean
  imageUri: string | null
  caption?: string
  onClose: () => void
}

export function MediaViewerModal({ visible, imageUri, caption, onClose }: Props) {
  if (!imageUri) return null

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header Bar */}
        <View style={styles.header}>
          <Pressable style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close photo viewer">
            <Text style={styles.closeBtnText}>✕ Close</Text>
          </Pressable>
        </View>

        {/* Media Canvas */}
        <View style={styles.imageWrap}>
          <Image
            source={{ uri: imageUri }}
            style={styles.image}
            resizeMode="contain"
          />
        </View>

        {/* Caption */}
        {caption ? (
          <View style={styles.captionWrap}>
            <Text style={styles.captionText}>{caption}</Text>
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    zIndex: 10,
  },
  closeBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  closeBtnText: {
    ...typography.label,
    fontSize: fontSizes.sm,
    color: '#FFFFFF',
  },
  imageWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  captionWrap: {
    padding: spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  captionText: {
    ...typography.body,
    fontSize: fontSizes.md,
    color: '#FFFFFF',
    textAlign: 'center',
  },
})
