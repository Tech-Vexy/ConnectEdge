// biometrics.ts — biometric authentication gate
//
// Wraps expo-local-authentication to gate access to cryptographic key operations.
// The actual keys stay in SecureStore (iOS Keychain / Android Keystore).
// Biometrics adds a second factor: even if the device is unlocked,
// sensitive operations (key load, message send, photo decrypt) require
// Face ID / Touch ID / device PIN confirmation.
//
// Gate levels:
//   HIGH   — key generation / export  (always requires biometrics if available)
//   MEDIUM — app unlock on resume after background  (configurable)
//   LOW    — individual message send  (off by default — too frequent)
//
// Falls back gracefully: if no biometrics enrolled, PIN is accepted.
// If hardware unavailable (simulator), gate is bypassed silently.

import * as LocalAuthentication from 'expo-local-authentication'
import * as SecureStore          from 'expo-secure-store'
import { Platform }              from 'react-native'

const KEY_BIOMETRIC_ENABLED = 'proxim_biometric_enabled_v1'

export type BiometricLevel = 'high' | 'medium' | 'low'

export interface BiometricCapability {
  available:    boolean
  enrolled:     boolean
  types:        LocalAuthentication.AuthenticationType[]
  typeLabel:    string      // "Face ID" | "Touch ID" | "Fingerprint" | "PIN"
}

// ─── Capability check ─────────────────────────────────────────────────────────

export async function getBiometricCapability(): Promise<BiometricCapability> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync()
  const enrolled    = await LocalAuthentication.isEnrolledAsync()
  const types       = await LocalAuthentication.supportedAuthenticationTypesAsync()

  return {
    available:  hasHardware,
    enrolled:   hasHardware && enrolled,
    types,
    typeLabel:  getTypeLabel(types),
  }
}

function getTypeLabel(types: LocalAuthentication.AuthenticationType[]): string {
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return Platform.OS === 'ios' ? 'Face ID' : 'Face Unlock'
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint'
  }
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    return 'Iris scan'
  }
  return 'Device PIN'
}

// ─── Authentication ───────────────────────────────────────────────────────────

const PROMPTS: Record<BiometricLevel, { promptMessage: string; cancelLabel: string }> = {
  high: {
    promptMessage: 'Authenticate to access your secure identity',
    cancelLabel:   'Cancel',
  },
  medium: {
    promptMessage: 'Authenticate to continue',
    cancelLabel:   'Cancel',
  },
  low: {
    promptMessage: 'Confirm to send',
    cancelLabel:   'Cancel',
  },
}

/**
 * Prompt biometric authentication at the given level.
 * Returns true if authenticated (or if biometrics are unavailable — silent pass).
 * Returns false if the user cancels or fails.
 */
export async function authenticate(level: BiometricLevel = 'medium'): Promise<boolean> {
  const cap = await getBiometricCapability()

  // No hardware or not enrolled — bypass silently
  if (!cap.available || !cap.enrolled) return true

  // Check if user has enabled biometrics for this app
  const enabled = await isBiometricEnabled()
  if (!enabled && level !== 'high') return true  // respect user setting for medium/low

  const result = await LocalAuthentication.authenticateAsync({
    ...PROMPTS[level],
    disableDeviceFallback: false,   // allow PIN as fallback
    requireConfirmation:   false,   // don't require extra "confirm" tap on Android
  })

  return result.success
}

/**
 * Authenticate with a specific reason string (for context-sensitive prompts).
 */
export async function authenticateWithReason(reason: string): Promise<boolean> {
  const cap = await getBiometricCapability()
  if (!cap.available || !cap.enrolled) return true

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage:         reason,
    cancelLabel:           'Cancel',
    disableDeviceFallback: false,
    requireConfirmation:   false,
  })

  return result.success
}

// ─── User preference ──────────────────────────────────────────────────────────

export async function isBiometricEnabled(): Promise<boolean> {
  const val = await SecureStore.getItemAsync(KEY_BIOMETRIC_ENABLED)
  return val === 'true'
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    // Verify once before enabling, so they know it works
    const ok = await authenticate('high')
    if (!ok) return
  }
  await SecureStore.setItemAsync(KEY_BIOMETRIC_ENABLED, enabled ? 'true' : 'false')
}

// ─── Gated key operations ─────────────────────────────────────────────────────

/**
 * Load crypto keys from SecureStore, gated behind biometric auth.
 * Use this instead of directly calling loadOrCreateKeyPair() on app resume.
 */
export async function loadKeysWithBiometric(
  loadKeys: () => Promise<unknown>,
): Promise<unknown | null> {
  const authed = await authenticate('high')
  if (!authed) return null
  return loadKeys()
}

/**
 * SecureStore options with biometric requirement baked in.
 * Pass these when storing the most sensitive values.
 *
 * iOS:   kSecAccessControlBiometryCurrentSet — key invalidated if biometrics change
 * Android: setUserAuthenticationRequired(true) equivalent
 */
export const SECURE_STORE_BIOMETRIC_OPTIONS: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  authenticationPrompt:  'Authenticate to access your Proxim identity',
  // keychainService groups keys under a single Keychain service name
  keychainService: 'com.proxim.keys',
}

/**
 * Standard (non-biometric) options — for less sensitive data like blocked list.
 */
export const SECURE_STORE_STANDARD_OPTIONS: SecureStore.SecureStoreOptions = {
  requireAuthentication: false,
  keychainService: 'com.proxim.app',
}
