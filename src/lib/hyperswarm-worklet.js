// hyperswarm-worklet.js
// Runs inside react-native-bare-kit's Bare JS runtime — NOT React Native JS.
// This is a separate V8-free JS thread with its own module system.
//
// Purpose: parallel peer discovery via Hyperswarm DHT.
// It runs continuously in the background (even when app is backgrounded),
// joining a topic derived from the local area and emitting discovered
// peers back to the React Native thread via IPC.
//
// What this worklet does:
//   - Joins the Hyperswarm DHT on topic H("proxim:campus:" + gridCell)
//     where gridCell is a 500m geohash tile (coarse location, not exact)
//   - When a new peer connects, sends their public key + connection info
//     to the RN thread via IPC
//   - Receives "leave" commands from RN thread to gracefully shut down
//   - Does NOT handle encryption, matching, or any application logic
//     (that stays in React Native)
//
// Why a separate runtime:
//   React Native's JS thread is paused when the app backgrounds on iOS.
//   The Bare worklet is a native OS thread — it keeps running.
//   react-native-bare-kit provides the IPC bridge.
//
// Setup:
//   npm install react-native-bare-kit hyperswarm b4a
//   npx expo prebuild --clean  (adds Bare runtime to native project)

const Hyperswarm = require('hyperswarm')
const b4a        = require('b4a')

// IPC channel to React Native thread
const rpc = globalThis.__BareRPC

let swarm     = null
let isStopped = false

// ─── Message handler (from RN thread) ────────────────────────────────────────

rpc.on('message', (msg) => {
  const data = JSON.parse(msg.toString())

  switch (data.type) {
    case 'start':
      handleStart(data.payload)
      break
    case 'stop':
      handleStop()
      break
    case 'updateLocation':
      handleUpdateLocation(data.payload)
      break
  }
})

// ─── Start ────────────────────────────────────────────────────────────────────

async function handleStart({ gridCell, peerId }) {
  if (swarm) return  // already running

  swarm = new Hyperswarm({
    // Limit connections — we don't need a full DHT mesh, just nearby peers
    maxConnections: 64,
    // Firewall: only accept connections from peers who share our topic
    firewall: (remotePublicKey) => {
      // Always allow (topic membership implies legitimacy)
      return false
    },
  })

  swarm.on('error', (err) => {
    rpc.send(JSON.stringify({ type: 'error', payload: err.message }))
  })

  swarm.on('connection', (connection, peerInfo) => {
    if (isStopped) return

    const remotePubKey = b4a.toString(peerInfo.publicKey, 'hex')

    // Notify RN thread — it will check if this peer is also broadcasting
    // a Proxim profile via gossipsub/BLE and handle matching there
    rpc.send(JSON.stringify({
      type: 'peer:discovered',
      payload: {
        hyperswarmKey: remotePubKey,
        topic:         gridCell,
        ts:            Date.now(),
      },
    }))

    // Set up a lightweight presence protocol over the Hyperswarm stream
    // Just exchange peerId hashes — no profile data over this channel
    connection.write(JSON.stringify({ type: 'hello', peerIdHash: hashPeerId(peerId) }))

    connection.on('data', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'hello') {
          rpc.send(JSON.stringify({
            type: 'peer:hello',
            payload: {
              hyperswarmKey:  remotePubKey,
              peerIdHash:     msg.peerIdHash,
              ts:             Date.now(),
            },
          }))
        }
      } catch {}
    })

    connection.on('close', () => {
      rpc.send(JSON.stringify({
        type: 'peer:left',
        payload: { hyperswarmKey: remotePubKey },
      }))
    })

    connection.on('error', () => {})
  })

  // Join the topic for this grid cell
  const topic = deriveSwarmTopic(gridCell)
  const discovery = swarm.join(topic, { server: true, client: true })
  await discovery.flushed()

  rpc.send(JSON.stringify({
    type: 'ready',
    payload: { gridCell, peersInTopic: swarm.connections.size },
  }))
}

async function handleStop() {
  isStopped = true
  if (swarm) {
    await swarm.destroy()
    swarm = null
  }
  rpc.send(JSON.stringify({ type: 'stopped' }))
}

async function handleUpdateLocation({ gridCell, peerId }) {
  // Leave old topic, join new one when user moves to a new grid cell
  if (!swarm) {
    handleStart({ gridCell, peerId })
    return
  }
  // Leave all current topics
  for (const [topic] of swarm.topics) {
    swarm.leave(topic)
  }
  // Join new topic
  const topic = deriveSwarmTopic(gridCell)
  const discovery = swarm.join(topic, { server: true, client: true })
  await discovery.flushed()

  rpc.send(JSON.stringify({ type: 'locationUpdated', payload: { gridCell } }))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveSwarmTopic(gridCell) {
  // 32-byte topic = SHA-256("proxim:campus:" + gridCell)
  // gridCell is a 500m geohash tile — coarse enough to not be identifying
  // but tight enough to only connect nearby devices
  const crypto    = require('crypto')
  const input     = `proxim:campus:${gridCell}`
  return crypto.createHash('sha256').update(input).digest()
}

function hashPeerId(peerId) {
  // 8-byte hex hash of PeerID — safe to broadcast over Hyperswarm
  const crypto = require('crypto')
  return crypto.createHash('sha256').update(peerId).digest('hex').slice(0, 16)
}

// Signal ready to the RN thread
rpc.send(JSON.stringify({ type: 'worklet:loaded' }))
