// components/PostCard.tsx — P2P Social Feed Post Card
import React from 'react'
import { View, Text, StyleSheet, Pressable, Image } from 'react-native'
import type { SocialPost } from '../lib/types'
import { colors, typography, fontSizes, spacing, radius, cardShadow } from '../theme'
import { HapticFeedback } from '../lib/haptics'

interface Props {
  post: SocialPost
  onLike: (postId: string) => void
  onComment?: (postId: string) => void
  onMediaPress?: (uri: string) => void
}

export function PostCard({ post, onLike, onComment, onMediaPress }: Props) {
  const timeAgo = formatTimeAgo(post.timestamp)

  const handleLike = () => {
    HapticFeedback.light()
    onLike(post.id)
  }

  const getModeBadge = () => {
    switch (post.mode) {
      case 'dating': return { label: '💕 Dating', bg: '#FF4B7222', color: '#FF4B72' }
      case 'friends': return { label: '🤝 Friend', bg: '#00D2FF22', color: '#00D2FF' }
      case 'networking': return { label: '💼 Tech/Network', bg: '#7F00FF22', color: '#B87DFF' }
      default: return null
    }
  }

  const badge = getModeBadge()

  return (
    <View style={styles.card}>
      {/* Author Header */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {post.authorName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.authorMeta}>
          <View style={styles.nameRow}>
            <Text style={styles.authorName}>{post.authorName}</Text>
            {badge && (
              <View style={[styles.modeBadge, { backgroundColor: badge.bg }]}>
                <Text style={[styles.modeBadgeText, { color: badge.color }]}>
                  {badge.label}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.timeText}>{timeAgo} · P2P Mesh</Text>
        </View>
      </View>

      {/* Content */}
      <Text style={styles.content}>{post.content}</Text>

      {/* Media Attachment */}
      {post.photoUri ? (
        <Pressable
          style={styles.mediaWrap}
          onPress={() => {
            HapticFeedback.light()
            onMediaPress?.(post.photoUri!)
          }}
        >
          <Image source={{ uri: post.photoUri }} style={styles.mediaImage} />
        </Pressable>
      ) : null}

      {/* Tags */}
      {post.tags && post.tags.length > 0 && (
        <View style={styles.tagRow}>
          {post.tags.map(t => (
            <View key={t} style={styles.tag}>
              <Text style={styles.tagText}>#{t}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Actions / Footer */}
      <View style={styles.footer}>
        <Pressable
          style={[styles.actionBtn, post.likedByMe && styles.actionBtnActive]}
          onPress={handleLike}
        >
          <Text style={styles.actionIcon}>{post.likedByMe ? '❤️' : '🤍'}</Text>
          <Text style={[styles.actionText, post.likedByMe && styles.actionTextActive]}>
            {post.likesCount}
          </Text>
        </Pressable>

        <Pressable style={styles.actionBtn} onPress={() => onComment?.(post.id)}>
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionText}>Reply</Text>
        </Pressable>

        <View style={styles.encryptedIndicator}>
          <Text style={styles.encryptedText}>🔒 Direct P2P</Text>
        </View>
      </View>
    </View>
  )
}

function formatTimeAgo(ts: number): string {
  const diffSec = Math.floor((Date.now() - ts) / 1000)
  if (diffSec < 60) return 'Just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
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
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.pulse,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  avatarText: {
    ...typography.heading,
    color: '#FFF',
    fontSize: fontSizes.md,
  },
  authorMeta: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  authorName: {
    ...typography.heading,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },
  modeBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  modeBadgeText: {
    ...typography.label,
    fontSize: 10,
  },
  timeText: {
    ...typography.body,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  content: {
    ...typography.body,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  mediaWrap: {
    width: '100%',
    height: 200,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: spacing.sm,
    backgroundColor: colors.bg,
  },
  mediaImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  tag: {
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  tagText: {
    ...typography.label,
    fontSize: fontSizes.xs,
    color: colors.pulse,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.xs,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    gap: spacing.lg,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  actionBtnActive: {
    opacity: 1,
  },
  actionIcon: {
    fontSize: 16,
  },
  actionText: {
    ...typography.label,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },
  actionTextActive: {
    color: '#FF4B72',
  },
  encryptedIndicator: {
    marginLeft: 'auto',
  },
  encryptedText: {
    ...typography.mono,
    fontSize: 10,
    color: colors.textMuted,
  },
})
