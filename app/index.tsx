import React, { useEffect, useState } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useStore } from '../src/store'
import { colors } from '../src/theme'

export default function Index() {
  const loadProfile = useStore(s => s.loadProfile)
  const [navigated, setNavigated] = useState(false)

  useEffect(() => {
    let active = true

    const doNavigate = () => {
      if (!active || navigated) return
      setNavigated(true)
      const onboarded = useStore.getState().isOnboarded
      if (onboarded) {
        router.replace('/app')
      } else {
        router.replace('/onboarding')
      }
    }

    // Attempt profile load then navigate
    loadProfile()
      .then(() => {
        if (active) doNavigate()
      })
      .catch((err) => {
        console.warn('Profile load error:', err)
        if (active) doNavigate()
      })

    // Safety timeout to prevent white screen if SecureStore delays
    const timer = setTimeout(() => {
      if (active) doNavigate()
    }, 150)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [loadProfile, navigated])

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.pulse} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
