// screens/AppShell.tsx — tab-based app shell for P2P Social Platform
// Only the active tab and Discover (which runs the P2P node) are mounted.
// This saves CPU/memory/battery for BLE + mesh networking.

import React, { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { type TabId }  from '../components/TabBar'
import Discover        from './Discover'
import Feed            from './Feed'
import Hubs            from './Hubs'
import Matches         from './Matches'
import Messages        from './Messages'
import ProfileView     from './ProfileView'

export default function AppShell() {
  const [activeTab, setActiveTab] = useState<TabId>('feed')

  return (
    <View style={styles.container}>
      {/* Discover always mounted — runs the P2P node */}
      <View style={[styles.screen, activeTab === 'discover' && styles.visible]}>
        <Discover   activeTab={activeTab} onTabChange={setActiveTab} />
      </View>

      {/* Social Feed / Pulse Tab */}
      {activeTab === 'feed' && (
        <View style={styles.visibleScreen}>
          <Feed       activeTab={activeTab} onTabChange={setActiveTab} />
        </View>
      )}

      {/* Community Hubs & Events Tab */}
      {activeTab === 'hubs' && (
        <View style={styles.visibleScreen}>
          <Hubs       activeTab={activeTab} onTabChange={setActiveTab} />
        </View>
      )}

      {/* Connections / Matches Tab */}
      {activeTab === 'matches' && (
        <View style={styles.visibleScreen}>
          <Matches    activeTab={activeTab} onTabChange={setActiveTab} />
        </View>
      )}

      {/* Messages / Encrypted Chats Tab */}
      {activeTab === 'messages' && (
        <View style={styles.visibleScreen}>
          <Messages   activeTab={activeTab} onTabChange={setActiveTab} />
        </View>
      )}

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <View style={styles.visibleScreen}>
          <ProfileView activeTab={activeTab} onTabChange={setActiveTab} />
        </View>
      )}
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
  visibleScreen: {
    ...StyleSheet.absoluteFillObject,
  },
})
