// hyperswarm-bridge.ts — RN ↔ Bare worklet IPC
//
// Manages the react-native-bare-kit worklet lifecycle and exposes
// a clean event emitter API to the rest of the app.
//
// The worklet runs Hyperswarm for background global peer discovery.
// BLE handles physical proximity; Hyperswarm handles peers on different
// Wi-Fi networks on the same campus (different SSIDs, same physical area).
//
// Grid cell derivation:
//   We use a 500m geohash tile as the swarm topic — coarse enough that
//   exact location is not inferable, fine enough to group a campus.
//   Location is only used to derive the topic; it's never stored or sent.
//
// IPC message types (worklet → RN):
//   worklet:loaded    — worklet JS has been evaluated
//   ready             — joined DHT topic, ready for connections
//   peer:discovered   — new Hyperswarm connection (by public key)
//   peer:hello        — peer sent their peerIdHash over the stream
//   peer:left         — peer disconnected
//   locationUpdated   — topic switched after location change
//   error             — worklet error
//   stopped           — worklet shut down cleanly
//
// IPC message types (RN → worklet):
//   start             — { gridCell, peerId }
//   stop              — {}
//   updateLocation    — { gridCell, peerId }

import { Worklet as BareWorklet } from 'react-native-bare-kit'
import * as Location   from 'expo-location'

export type HyperswarmEvent =
  | { type: 'peer:discovered'; hyperswarmKey: string; topic: string; ts: number }
  | { type: 'peer:hello';      hyperswarmKey: string; peerIdHash: string; ts: number }
  | { type: 'peer:left';       hyperswarmKey: string }
  | { type: 'ready';           gridCell: string; peersInTopic: number }
  | { type: 'error';           message: string }

type HyperswarmEventHandler = (event: HyperswarmEvent) => void

class HyperswarmBridge {
  private worklet:    BareWorklet | null = null
  private listeners:  HyperswarmEventHandler[] = []
  private isRunning   = false
  private lastGridCell = ''

  on(handler: HyperswarmEventHandler) {
    this.listeners.push(handler)
  }

  off(handler: HyperswarmEventHandler) {
    this.listeners = this.listeners.filter(h => h !== handler)
  }

  private emit(event: HyperswarmEvent) {
    this.listeners.forEach(h => h(event))
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  async start(peerId: string): Promise<boolean> {
    if (this.isRunning) return true

    try {
      // Request location permission (coarse only — for grid cell)
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        console.warn('HyperswarmBridge: location permission denied, using global topic')
      }

      const gridCell = status === 'granted'
        ? await this.getGridCell()
        : 'global'

      // Load worklet
      this.worklet = new BareWorklet()
      this.worklet.IPC.on('data', (msg: any) => {
        try {
          const data = JSON.parse(msg.toString())
          this.handleWorkletMessage(data)
        } catch {}
      })

      // Load the worklet script (bundled with the app)
      await this.worklet.start(require('./hyperswarm-worklet.js'))

      // Start the swarm
      this.send({ type: 'start', payload: { gridCell, peerId } })
      this.isRunning   = true
      this.lastGridCell = gridCell

      // Watch for significant location changes to update the swarm topic
      await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Low, distanceInterval: 400 },
        async (loc) => {
          const newCell = geohashApprox(loc.coords.latitude, loc.coords.longitude)
          if (newCell !== this.lastGridCell) {
            this.lastGridCell = newCell
            this.send({ type: 'updateLocation', payload: { gridCell: newCell, peerId } })
          }
        },
      )

      return true
    } catch (e) {
      console.warn('HyperswarmBridge start failed:', e)
      return false
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning || !this.worklet) return
    this.send({ type: 'stop', payload: {} })
    this.isRunning = false
    // Give worklet 2s to clean up before destroying
    await new Promise(r => setTimeout(r, 2000))
    await this.worklet.terminate()
    this.worklet = null
  }

  private send(msg: object) {
    this.worklet?.IPC.write(Buffer.from(JSON.stringify(msg)))
  }

  // ─── Message handling ───────────────────────────────────────────────────────

  private handleWorkletMessage(data: { type: string; payload?: any }) {
    switch (data.type) {
      case 'peer:discovered':
        this.emit({ type: 'peer:discovered', ...data.payload })
        break
      case 'peer:hello':
        this.emit({ type: 'peer:hello', ...data.payload })
        break
      case 'peer:left':
        this.emit({ type: 'peer:left', ...data.payload })
        break
      case 'ready':
        this.emit({ type: 'ready', ...data.payload })
        break
      case 'error':
        this.emit({ type: 'error', message: data.payload })
        break
      case 'worklet:loaded':
        // No-op — worklet has loaded, waiting for 'start' command
        break
    }
  }

  // ─── Grid cell ──────────────────────────────────────────────────────────────

  private async getGridCell(): Promise<string> {
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low,
      })
      return geohashApprox(loc.coords.latitude, loc.coords.longitude)
    } catch {
      return 'global'
    }
  }

  get running() { return this.isRunning }
  get gridCell() { return this.lastGridCell }
}

/**
 * Approximate 500m grid cell from lat/lng.
 * Not a real geohash — just quantises to 2 decimal places (~1km precision).
 * Good enough for topic derivation; not useful for exact location inference.
 */
function geohashApprox(lat: number, lng: number): string {
  // Quantise to ~500m (0.005 degrees ≈ 550m)
  const qLat = Math.round(lat / 0.005) * 0.005
  const qLng = Math.round(lng / 0.005) * 0.005
  return `${qLat.toFixed(3)},${qLng.toFixed(3)}`
}

export const hyperswarmBridge = new HyperswarmBridge()
