export type AppMode = 'p2p' | 'p2p+workers'

const EXPO_PUBLIC_P2P_ONLY = (process.env.EXPO_PUBLIC_P2P_ONLY ?? '').toLowerCase()

const mode: AppMode =
  EXPO_PUBLIC_P2P_ONLY === '1' || EXPO_PUBLIC_P2P_ONLY === 'true'
    ? 'p2p'
    : 'p2p+workers'

const relayBaseUrl = process.env.EXPO_PUBLIC_RELAY_URL ?? 'https://relay.connectedge.workers.dev'
const workersEnabled = mode === 'p2p+workers' && relayBaseUrl.length > 0

export const appConfig = {
  mode,
  relay: {
    enabled: workersEnabled,
    baseUrl: relayBaseUrl,
  },
  verify: {
    enabled: workersEnabled,
    baseUrl: `${relayBaseUrl}/verify`,
    pubkeyUrl: `${relayBaseUrl}/verify/pubkey`,
  },
}
