# ConnectEdge

**Privacy-First Peer-to-Peer Social Platform** with multi-mode social connections, decentralized community feed, interest hubs, local meetups, and end-to-end encryption.

![Status](https://img.shields.io/badge/status-production%20ready-success)
![React Native](https://img.shields.io/badge/React%20Native-0.74-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)
![Architecture](https://img.shields.io/badge/Architecture-P2P%20%2B%20gossipsub-violet)

---

## ✨ Key Features

### 🌟 Multi-Mode Social Engine (`SocialMode`)
- 💖 **Dating & Romance:** Compatibility scoring, swipe discovery, and blind like commitments.
- 🤝 **Friendship & Social:** Find local hangout friends, coffee buddies, and activity partners.
- 💼 **Professional & Tech:** Connect with co-founders, tech collaborators, and skill-sharing peers.
- **Mode Selector:** Single-tap top bar selector to switch social discovery context on the fly.

### 📰 P2P Local Community Feed ("Pulse")
- ⚡ **Decentralized Feed:** Micro-posting, questions, and status updates gossiped over `connectedge:posts`.
- 📷 **Rich Media Sharing:** Attach photos from library or camera with instant preview.
- 🔍 **Fullscreen Lightbox:** Tap any post or chat photo for high-resolution full-screen viewing.

### 🏰 Community Hubs & Local Meetups
- 🏰 **Interest Hubs:** Peer-to-peer interest channels (*Campus Tech Builders*, *Weekend Hikers*, *Coffee & Deep Focus*, *Anime & Gaming Lounge*).
- 🎉 **Local Gatherings & Events:** Host local coffee hangouts, game nights, or trail runs with direct RSVP management (*Going ✓*).

### 🔒 Privacy & Encryption
- 🔒 **Zero Server Storage:** Profiles, posts, chats, and keys live 100% locally on your device.
- 🔐 **End-to-End Encryption:** `libsodium` authenticated box and sealed box encryption.
- 📡 **BLE & Wi-Fi Mesh:** Peer discovery via Bluetooth Low Energy and libp2p WebSocket mesh.
- 🛡️ **Zero-Knowledge Verification:** Prove campus credentials without revealing identity or email.

---

## 🚀 Quick Start

### Installation

```bash
# Clone repository
git clone <repo-url>
cd ConnectEdge

# Install dependencies
npm install

# Generate assets & Hyperswarm worklet bundles
npm run generate-assets
npm run generate-hyperswarm-bundle

# Start development server
npm start
```

### Running on Device

```bash
# Android
npm run android

# iOS
npm run ios
```

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    ConnectEdge App                      │
│                                                         │
│  ⚡ Pulse Feed   🎴 Multi-Mode Deck   🏰 Hubs & Events │
└─────────────┬──────────────────────────────┬────────────┘
              │                              │
              ▼                              ▼
    ┌──────────────────┐            ┌──────────────────┐
    │  libp2p Node     │            │  Bluetooth BLE   │
    │  (WebSocket)     │            │  (Scan & Adv)    │
    └─────────┬────────┘            └────────┬─────────┘
              │                              │
              └──────────────┬───────────────┘
                             │
                             ▼
               ┌───────────────────────────┐
               │   Cloudflare Relay        │
               │   (Optional Offline Box)  │
               └───────────────────────────┘
```

---

## 📦 Production Release Build

To build the release APK for Android:

```bash
# Generate native prebuild files
npm run prebuild

# Compile Release APK via Gradle
cd android
./gradlew assembleRelease
```

The compiled release APK will be located at:
`android/app/build/outputs/apk/release/app-release.apk`

---

## 📄 License

Private — All rights reserved.
