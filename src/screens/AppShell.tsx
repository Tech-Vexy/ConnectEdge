// screens/AppShell.tsx — tab-based app shell
// Owns the active tab state and mounts all four tab screens.
// Screens remain mounted when switching tabs (no unmount/remount).
// Chat and Settings are pushed modally on top via router.push().

import React, { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { type TabId }  from '../components/TabBar'
import Discover        from './Discover'
import Matches         from './Matches'
import Chat            from './Chat'
import ProfileView     from './ProfileView'

export default function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>('discover')

  return (
    <View style={styles.container}>
      <View style={[styles.screen, activeTab === 'discover'  && styles.visible]}>
        <Discover   activeTab={activeTab} onTabChange={setActiveTab} />
      </View>
      <View style={[styles.screen, activeTab === 'matches'   && styles.visible]}>
        <Matches    activeTab={activeTab} onTabChange={setActiveTab} />
      </View>
      <View style={[styles.screen, activeTab === 'messages'  && styles.visible]}>
        {/* Messages tab opens the matches screen filtered to conversations */}
        <Matches    activeTab={activeTab} onTabChange={setActiveTab} />
      </View>
      <View style={[styles.screen, activeTab === 'profile'   && styles.visible]}>
        <ProfileView activeTab={activeTab} onTabChange={setActiveTab} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  screen: {
    ...StyleSheet.absoluteFillObject,
    opacity:          0,
    pointerEvents:    'none' as any,
  },
  visible: {
    opacity:          1,
    pointerEvents:    'auto' as any,
  },
})
