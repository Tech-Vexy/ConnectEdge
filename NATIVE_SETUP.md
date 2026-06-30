# Proxim — Native Setup Guide

Everything needed to get from source to a running build on physical hardware.
All native features (BLE, biometrics, background fetch, push) require a
**development build** — Expo Go does not support them.

---

## 1. Prerequisites

```bash
node >= 20
npm >= 10
Xcode >= 15        (iOS)
Android Studio     (Android, Flamingo or later)
Ruby >= 3.0        (iOS CocoaPods)
```

Install Expo CLI and EAS CLI:
```bash
npm install -g expo-cli eas-cli
eas login
```

---

## 2. Install dependencies

```bash
npm install
node scripts/generate-assets.js   # generates icon.png, splash.png, etc.
```

---

## 3. Generate native projects

```bash
npx expo prebuild --clean
```

This writes `ios/` and `android/` directories from `app.json` + plugins.
Always re-run after changing `app.json` or adding new native modules.

---

## 4. iOS — manual entitlements

Expo's prebuild doesn't write every entitlement automatically. After `prebuild`:

### 4a. Capabilities in Xcode

Open `ios/proxim.xcworkspace` in Xcode, select the `proxim` target → Signing & Capabilities:

| Capability | Notes |
|---|---|
| **Background Modes** | ✓ Background fetch · ✓ Uses Bluetooth LE accessories · ✓ Acts as a Bluetooth LE accessory |
| **Push Notifications** | Required for local notifications to work in production |

### 4b. Entitlements file

`ios/proxim/proxim.entitlements` should contain:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.developer.bluetooth-always</key>
  <true/>
  <key>aps-environment</key>
  <string>development</string>
  <key>com.apple.security.application-groups</key>
  <array>
    <string>group.com.proxim.app</string>
  </array>
</dict>
</plist>
```

### 4c. Info.plist — verify these keys exist after prebuild

```
NSBluetoothAlwaysUsageDescription
NSBluetoothPeripheralUsageDescription
NSLocalNetworkUsageDescription
NSPhotoLibraryUsageDescription
NSCameraUsageDescription
BGTaskSchedulerPermittedIdentifiers → ["proxim-relay-poll"]
UIBackgroundModes → [fetch, bluetooth-central, bluetooth-peripheral]
```

### 4d. Install pods

```bash
cd ios && pod install && cd ..
```

---

## 5. Android — manifest and Gradle

### 5a. Verify AndroidManifest.xml

After `prebuild`, confirm `android/app/src/main/AndroidManifest.xml` contains:

```xml
<!-- BLE scanning (all API levels) -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />

<!-- BLE Android 12+ (API 31+) — no location needed -->
<uses-permission android:name="android.permission.BLUETOOTH_SCAN"
    android:usesPermissionFlags="neverForLocation" />
<uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />

<!-- Legacy BLE -->
<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />

<!-- Background fetch -->
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />

<!-- Photos -->
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.CAMERA" />

<!-- BLE feature declaration -->
<uses-feature android:name="android.hardware.bluetooth_le" android:required="true" />
```

### 5b. Minimum SDK

In `android/build.gradle`, confirm:
```gradle
minSdkVersion = 26   // required by react-native-ble-plx
targetSdkVersion = 34
```

### 5c. react-native-ble-advertiser

This module needs manual Gradle linking if autolinking misses it:

```gradle
// android/app/build.gradle
dependencies {
    implementation project(':react-native-ble-advertiser')
}
```

```java
// android/app/src/main/java/com/proxim/MainApplication.java — add to packages:
packages.add(new BLEAdvertiserPackage());
```

---

## 6. Building

### Development build (physical device)

```bash
# iOS — requires Apple Developer account
npx expo run:ios --device

# Android
npx expo run:android --device
```

### EAS Build (recommended for sharing)

```bash
eas build --profile development --platform ios
eas build --profile development --platform android
```

`eas.json`:
```json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": false },
      "env": { "EXPO_PUBLIC_RELAY_URL": "https://relay.proxim.workers.dev" }
    },
    "production": {
      "ios": { "buildConfiguration": "Release" },
      "android": { "buildType": "apk" }
    }
  }
}
```

---

## 7. Testing native features

### BLE — requires 2 physical devices

```
Device A → build + run → open Proxim → goes to Radar
Device B → build + run → open Proxim → goes to Radar

Expected within 10–20s:
- Each device appears as a dot on the other's radar
- Signal strength updates as you move closer/further
- Score updates on BLE RSSI change
```

### Biometrics

```
Settings → Data tab → toggle Face ID / Touch ID
Next cold start → Face ID prompt fires before radar loads
```

### Background fetch

```
iOS:  Xcode → Debug → Simulate Background Fetch
Android: adb shell cmd jobscheduler run -f com.proxim.app 999
```

Expected: new relay messages delivered, local notification fires.

### Notifications — iOS production

Local notifications work without APNs in development.
For production push (not currently used — all notifications are local):
```bash
eas credentials   # manage APNs key
```

---

## 8. Common issues

| Problem | Fix |
|---|---|
| BLE state: Unauthorized (iOS) | Check NSBluetooth* keys in Info.plist; re-prebuild |
| BLE advertise fails (Android) | Confirm BLUETOOTH_ADVERTISE in manifest; test on API 31+ |
| Background fetch never fires (iOS) | Confirm BGTaskSchedulerPermittedIdentifiers in Info.plist matches task name exactly: `proxim-relay-poll` |
| Biometric prompt doesn't appear | Check `requireAuthentication: true` in SecureStore options; confirm enrollment in device Settings |
| `libsodium-wrappers` undefined | Add to metro config's `extraNodeModules` or use `libsodium-wrappers-sumo` |
| Photo picker returns null | Permission permanently denied — direct user to Settings → Privacy → Photos |
| Pod install fails | `cd ios && pod repo update && pod install` |

---

## 9. libsodium Metro config

`libsodium-wrappers` uses WebAssembly which needs explicit Metro resolver config:

```js
// metro.config.js
const { getDefaultConfig } = require('expo/metro-config')
const config = getDefaultConfig(__dirname)

config.resolver.assetExts.push('wasm')
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  crypto: require.resolve('expo-crypto'),
}

module.exports = config
```

---

## 10. Environment

```bash
# .env.local (not committed)
EXPO_PUBLIC_RELAY_URL=https://relay.proxim.workers.dev

# Access in code:
const relayUrl = process.env.EXPO_PUBLIC_RELAY_URL
```

Replace the hardcoded relay URL in `src/lib/node.ts` and `src/lib/relay-poll.ts`
with `process.env.EXPO_PUBLIC_RELAY_URL`.
