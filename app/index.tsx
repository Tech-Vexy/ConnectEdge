import { useEffect }  from 'react'
import { router }     from 'expo-router'
import { View }       from 'react-native'
import { useStore }   from '../src/store'
import { colors }     from '../src/theme'

export default function Index() {
  const { loadProfile } = useStore()
  useEffect(() => {
    loadProfile().then(() => {
      const onboarded = useStore.getState().isOnboarded
      router.replace(onboarded ? '/app' : '/onboarding')
    })
  }, [])
  return <View style={{ flex: 1, backgroundColor: colors.bg }} />
}
