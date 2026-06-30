// permissions.ts — unified runtime permission orchestration
//
// Centralises all permission requests so:
//   1. They're requested in the right order (some permissions depend on others)
//   2. The UI can show a single coherent permission flow, not a barrage of dialogs
//   3. Permission state is cached and checked before each native API call
//   4. Denial is handled gracefully — features degrade, nothing crashes
//
// Permission groups:
//   BLUETOOTH  — BLE scan + advertise + connect (Android 12+ splits these)
//   LOCATION   — ACCESS_FINE_LOCATION (Android <12 BLE scan requirement)
//   PHOTOS     — Media library read (for photo sharing)
//   CAMERA     — Camera capture (optional photo source)
//   NOTIFICATIONS — Local push notifications
//   BACKGROUND — Background app refresh (iOS) / battery optimisation (Android)

import { Platform, PermissionsAndroid, Linking, Alert } from 'react-native'
import * as Notifications  from 'expo-notifications'
import * as ImagePicker    from 'expo-image-picker'
import * as MediaLibrary   from 'expo-media-library'

export type PermissionStatus = 'granted' | 'denied' | 'unavailable' | 'undetermined'

export interface PermissionState {
  bluetooth:     PermissionStatus
  photos:        PermissionStatus
  camera:        PermissionStatus
  notifications: PermissionStatus
  background:    PermissionStatus
}

// ─── Permission check / request ──────────────────────────────────────────────

export async function checkAllPermissions(): Promise<PermissionState> {
  const [photos, camera, notifications] = await Promise.all([
    checkPhotosPermission(),
    checkCameraPermission(),
    checkNotificationPermission(),
  ])

  return {
    bluetooth:     'undetermined',  // checked by BLE manager itself
    photos,
    camera,
    notifications,
    background:    'undetermined',
  }
}

export async function requestBluetoothPermissions(): Promise<PermissionStatus> {
  if (Platform.OS === 'ios') {
    // iOS: BLE usage description in Info.plist is the only gate.
    // The system prompt fires automatically on first BleManager() instantiation.
    // We can't pre-check; assume granted unless we get a State.Unauthorized.
    return 'granted'
  }

  if (Platform.OS === 'android') {
    const sdkInt = typeof Platform.Version === 'string' ? parseInt(Platform.Version, 10) : Platform.Version
    const perms  = sdkInt >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]
      : [
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]

    const results = await PermissionsAndroid.requestMultiple(perms)
    const allGranted = Object.values(results)
      .every(r => r === PermissionsAndroid.RESULTS.GRANTED)

    if (!allGranted) {
      const anyPermanentlyDenied = Object.values(results)
        .some(r => r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)
      if (anyPermanentlyDenied) return 'denied'
    }

    return allGranted ? 'granted' : 'denied'
  }

  return 'unavailable'
}

export async function requestNotificationPermission(): Promise<PermissionStatus> {
  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert:  true,
      allowBadge:  true,
      allowSound:  true,
      allowProvisional: true,  // iOS 12+: deliver quietly without asking
    },
  })
  return status === 'granted' ? 'granted' : 'denied'
}

export async function requestPhotosPermission(): Promise<PermissionStatus> {
  const { status } = await MediaLibrary.requestPermissionsAsync(false)  // readOnly
  return status === 'granted' ? 'granted' : 'denied'
}

export async function requestCameraPermission(): Promise<PermissionStatus> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync()
  return status === 'granted' ? 'granted' : 'denied'
}

// ─── Check without requesting ─────────────────────────────────────────────────

async function checkPhotosPermission(): Promise<PermissionStatus> {
  const { status } = await MediaLibrary.getPermissionsAsync()
  return status === 'granted' ? 'granted' : status === 'undetermined' ? 'undetermined' : 'denied'
}

async function checkCameraPermission(): Promise<PermissionStatus> {
  const { status } = await ImagePicker.getCameraPermissionsAsync()
  return status === 'granted' ? 'granted' : status === 'undetermined' ? 'undetermined' : 'denied'
}

async function checkNotificationPermission(): Promise<PermissionStatus> {
  const { status } = await Notifications.getPermissionsAsync()
  return status === 'granted' ? 'granted' : status === 'undetermined' ? 'undetermined' : 'denied'
}

// ─── Settings deep link ───────────────────────────────────────────────────────

/**
 * Open device Settings app to the app's permission panel.
 * Call when a permission is permanently denied.
 */
export function openAppSettings() {
  if (Platform.OS === 'ios') {
    Linking.openURL('app-settings:')
  } else {
    Linking.openSettings()
  }
}

/**
 * Show a standardised "permission required" alert with a Settings deep link.
 */
export function showPermissionAlert(
  feature:     string,
  description: string,
) {
  Alert.alert(
    `${feature} permission required`,
    `${description}\n\nGo to Settings to enable it.`,
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: openAppSettings },
    ],
  )
}

// ─── Permission-gated wrappers ────────────────────────────────────────────────

/**
 * Pick a photo, requesting permission first if needed.
 * Shows a standardised alert if permanently denied.
 */
export async function pickPhotoWithPermission(
  source: 'library' | 'camera' = 'library',
): Promise<import('expo-image-picker').ImagePickerResult | null> {
  const ImagePicker = await import('expo-image-picker')

  if (source === 'camera') {
    const camStatus = await checkCameraPermission()
    if (camStatus === 'denied') {
      showPermissionAlert('Camera', 'Proxim needs camera access to take a photo to share with your match.')
      return null
    }
    if (camStatus === 'undetermined') {
      const granted = await requestCameraPermission()
      if (granted !== 'granted') return null
    }
    return ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.75,
      allowsEditing: true,
      aspect: [1, 1],
    })
  }

  // Library
  const libStatus = await checkPhotosPermission()
  if (libStatus === 'denied') {
    showPermissionAlert('Photo Library', 'Proxim needs photo library access to share photos with your match.')
    return null
  }
  if (libStatus === 'undetermined') {
    const granted = await requestPhotosPermission()
    if (granted !== 'granted') return null
  }
  return ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.75,
  })
}
