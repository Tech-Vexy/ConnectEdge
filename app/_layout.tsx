// app/_layout.tsx
import { useEffect }    from 'react'
import { Stack }        from 'expo-router'
import { StatusBar }    from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { useStore }     from '../src/store'
import { ErrorBoundary } from '../src/components/ErrorBoundary'
import { colors }       from '../src/theme'

export default function RootLayout() {
  const loadProfile = useStore(s => s.loadProfile)
  useEffect(() => { loadProfile() }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <StatusBar style="light" {...({ backgroundColor: colors.bg } as any)} />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade' }}>
          <Stack.Screen name="index"         options={{ animation: 'none' }} />
          <Stack.Screen name="onboarding"    />
          <Stack.Screen name="profile-setup" />
          <Stack.Screen name="app"           options={{ animation: 'none' }} />
          <Stack.Screen name="verify"        options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="chat"          options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
          <Stack.Screen name="settings"      options={{ animation: 'slide_from_right' }} />
        </Stack>
      </ErrorBoundary>
    </GestureHandlerRootView>
  )
}
