# ConnectEdge — P2P Dating MVP

A privacy-first, serverless dating app built on libp2p. No central server holds
your data, your likes, or your conversations. Everything runs on-device.

## Structure

```
connectedge/
├── app/                    # Expo Router screens (thin wrappers)
│   ├── _layout.tsx         # Root layout, status bar, gesture handler
│   ├── index.tsx           # Boot router → onboarding or radar
│   ├── onboarding.tsx
│   ├── profile-setup.tsx
│   ├── radar.tsx
│   ├── matches.tsx
│   └── chat.tsx
│
├── src/
│   ├── theme/index.ts      # Design tokens — palette, typography, spacing
│   ├── lib/
│   │   ├── types.ts        # All data types, constants, taxonomy
│   │   ├── matching.ts     # O(d) scoring engine — pure, sync, no I/O
│   │   ├── commitment.ts   # Blind like commitment (SHA-256 scheme)
│   │   ├── bytes.ts        # Byte utilities
│   │   └── node.ts         # libp2p node — discovery, gossipsub, streams
│   ├── store/index.ts      # Zustand global state
│   └── screens/
│       ├── Onboarding.tsx  # Key gen, privacy promises
│       ├── ProfileSetup.tsx# 4-step profile creation
│       ├── Radar.tsx       # Live peer discovery — THE main screen
│       ├── Matches.tsx     # Confirmed mutual matches list
│       └── Chat.tsx        # E2E encrypted direct messages
│
└── worker/
    ├── relay.ts            # Cloudflare Worker — blind offline relay
    └── wrangler.toml       # Worker config
```

## Getting started

```bash
cd connectedge
npm install
npx expo start
```

### Deploy the relay worker

```bash
cd worker
npm install -g wrangler
wrangler kv:namespace create RELAY_STORE
# paste the returned id into wrangler.toml
wrangler deploy
```

Update the relay URL in `src/lib/node.ts`:
```ts
await fetch('https://relay.YOUR_SUBDOMAIN.workers.dev/envelope', ...)
```

## Architecture decisions

### Matching — O(d) weighted squared distance
Each incoming peer broadcast is scored synchronously against local preferences.
5 dimensions (age, interests, intent, proximity, values) with fixed weights.
Total: 5 multiplies, 5 adds, 1 divide — sub-microsecond on any device.
Crypto only fires when score ≥ 65 (LIKE_THRESHOLD) — keeps battery cost near zero.

### Blind commitment scheme
When you like someone: `SHA256(yourPeerID ‖ theirPeerID ‖ nonce)` is published
to the GossipSub mesh. The nonce is never broadcast. Only the recipient can
check if there's a mutual like by revealing their nonce.
Nobody else on the mesh learns who liked whom.

### Session-only memory
All peer scores, like commitments, and incoming likes live in `Map<>` objects
cleared when the app closes. ~20KB peak for 100 peers. No disk writes.

### Cloudflare Worker relay
The only infrastructure. Stores base64 ciphertext envelopes, keyed by
`SHA256(recipientPeerID)` — the worker never sees PeerIDs or plaintext.
TTL: 24h max. Per-recipient cap: 50 envelopes. ~50ms CPU budget.

### Transport stack
- **mDNS + WebSocket** — LAN discovery (same Wi-Fi network)
- **WebRTC** — NAT traversal, direct peer streams
- **Noise XX** — mutual authentication + forward secrecy on all streams
- **GossipSub** — profile and like broadcasts across the mesh
- **BLE** — Bluetooth Low Energy for venue/proximity discovery (requires
  native module in Expo development build — see expo-bluetooth or react-native-ble-plx)

## Known MVP gaps (next iteration)

- [ ] Photo sharing — encrypted IPFS CIDs, delivered post-match only
- [ ] BLE native module — swap `signalStrength: 0.5` default for real RSSI
- [ ] Signed like messages — currently likes can't be attributed to a sender
      without a signed wrapper; prevents targeted spoofing
- [ ] Message encryption — currently relay payload is base64, not properly
      encrypted with recipient's public key (needs libsodium box)
- [ ] Push notifications via relay poll — background task to fetch relay
      envelopes periodically
- [ ] Profile photo — local URI only, shown only after match confirms
- [ ] Block / report — session-local block list
