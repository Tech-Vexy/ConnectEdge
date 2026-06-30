// components/TabBar.tsx
// Persistent bottom tab bar — Discover · Matches · Messages · Profile
// Styled after Tinder: icon + label, gradient active state, unread badge

import React from 'react'
import {
  View, Text, StyleSheet, Pressable, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useStore }          from '../store'
import { colors, typography, fontSizes, spacing } from '../theme'

export type TabId = 'discover' | 'matches' | 'messages' | 'profile'

interface Tab {
  id:     TabId
  label:  string
  icon:   (active: boolean) => string
}

const TABS: Tab[] = [
  { id: 'discover',  label: 'Discover', icon: (a) => a ? '◈' : '◇' },
  { id: 'matches',   label: 'Matches',  icon: (a) => a ? '♥' : '♡' },
  { id: 'messages',  label: 'Messages', icon: (a) => a ? '💬' : '💬' },
  { id: 'profile',   label: 'Profile',  icon: (a) => a ? '●' : '○' },
]

interface Props {
  active:   TabId
  onChange: (tab: TabId) => void
}

export function TabBar({ active, onChange }: Props) {
  const insets       = useSafeAreaInsets()
  const unreadMatches = useStore(s => s.unreadMatches)
  const matches       = useStore(s => s.matches)
  const messages      = useStore(s => s.messages)

  // Count unread messages across all threads
  const unreadMessages = Array.from(messages.entries()).reduce((total, [peerId, msgs]) => {
    // Unread = last message is from the other person
    const last = msgs[msgs.length - 1]
    return last && last.from !== '' ? total + 1 : total
  }, 0)

  const badges: Partial<Record<TabId, number>> = {
    matches:  unreadMatches,
    messages: unreadMessages,
  }

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      <View style={styles.inner}>
        {TABS.map(tab => {
          const isActive = active === tab.id
          const badge    = badges[tab.id] ?? 0
          return (
            <Pressable
              key={tab.id}
              style={styles.tab}
              onPress={() => onChange(tab.id)}
              accessibilityLabel={tab.label}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <View style={styles.iconWrap}>
                <Text style={[styles.icon, isActive && styles.iconActive]}>
                  {tab.icon(isActive)}
                </Text>
                {badge > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {badge > 9 ? '9+' : badge}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[styles.label, isActive && styles.labelActive]}>
                {tab.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderTopWidth:  0.5,
    borderTopColor:  colors.border,
  },
  inner: {
    flexDirection: 'row',
    paddingTop:    spacing.sm,
  },
  tab: {
    flex:           1,
    alignItems:     'center',
    gap:            3,
    paddingVertical: spacing.xs,
  },
  iconWrap: {
    position: 'relative',
    width:    32,
    height:   28,
    alignItems:     'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 22,
    color:    colors.textMuted,
  },
  iconActive: {
    color: colors.pulse,
  },
  badge: {
    position:        'absolute',
    top:             -4,
    right:           -4,
    minWidth:        16,
    height:          16,
    borderRadius:    8,
    backgroundColor: colors.pulse,
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: 3,
    borderWidth:     1.5,
    borderColor:     colors.surface,
  },
  badgeText: {
    ...typography.label,
    fontSize:  9,
    color:     '#FFF',
    lineHeight: 12,
  },
  label: {
    ...typography.label,
    fontSize: fontSizes.xs,
    color:    colors.textMuted,
  },
  labelActive: {
    color: colors.pulse,
  },
})
