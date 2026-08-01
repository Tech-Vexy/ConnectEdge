import * as Location from 'expo-location'
import hyperswarmBundle from '../../assets/hyperswarm.bundle.mjs'

export type HyperswarmEvent =
  | { type: 'peer:discovered'; hyperswarmKey: string; topic: string; ts: number }
  | { type: 'peer:hello'; hyperswarmKey: string; peerIdHash: string; ts: number }
  | { type: 'peer:left'; hyperswarmKey: string }
  | { type: 'ready'; gridCell: string; peersInTopic: number }
  | { type: 'error'; message: string }

type HyperswarmEventHandler = (event: HyperswarmEvent) => void

type WorkletLike = {
  start: (filename: string, source: string) => void
  terminate?: () => void
  IPC: {
    on: (event: 'data', handler: (data: any) => void) => void
    off?: (event: 'data', handler: (data: any) => void) => void
    write: (data: Uint8Array) => number
  }
}

class HyperswarmBridge {
  private listeners: HyperswarmEventHandler[] = []
  private worklet: WorkletLike | null = null
  private isRunning = false
  private lastGridCell = ''
  private peerId = ''
  private rx = ''
  private locationTimer?: ReturnType<typeof setInterval>

  on(handler: HyperswarmEventHandler) {
    this.listeners.push(handler)
  }

  off(handler: HyperswarmEventHandler) {
    this.listeners = this.listeners.filter(h => h !== handler)
  }

  private emit(event: HyperswarmEvent) {
    this.listeners.forEach(h => h(event))
  }

  async start(peerId: string): Promise<boolean> {
    if (this.isRunning) return true
    if (!hyperswarmBundle) return false

    const gridCell = await this.getGridCellWithPermission()
    if (!gridCell) return false

    try {
      const mod = await import('react-native-bare-kit')
      const Worklet = (mod as any).Worklet as new () => WorkletLike
      const worklet = new Worklet()
      worklet.start('/hyperswarm.bundle', hyperswarmBundle)
      worklet.IPC.on('data', this.handleIPCData)

      this.worklet = worklet
      this.peerId = peerId
      this.lastGridCell = gridCell
      this.isRunning = true

      this.sendToWorklet({ type: 'start', payload: { gridCell, peerId } })
      this.locationTimer = setInterval(() => this.refreshGridCell(), 60_000)

      return true
    } catch {
      this.worklet = null
      this.isRunning = false
      return false
    }
  }

  async stop(): Promise<void> {
    clearInterval(this.locationTimer)

    const w = this.worklet
    this.worklet = null
    this.isRunning = false
    this.rx = ''

    if (!w) return

    try { w.IPC.off?.('data', this.handleIPCData) } catch {}
    try { this.sendToWorklet({ type: 'stop' }) } catch {}
    try { w.terminate?.() } catch {}
  }

  private sendToWorklet(msg: { type: string; payload?: unknown }) {
    if (!this.worklet) return
    const line = JSON.stringify(msg) + '\n'
    const bytes = new TextEncoder().encode(line)
    this.worklet.IPC.write(bytes)
  }

  private handleIPCData = (data: any) => {
    const chunk = typeof data === 'string'
      ? data
      : typeof data?.toString === 'function'
        ? data.toString()
        : new TextDecoder().decode(data as Uint8Array)

    this.rx += chunk
    let idx = this.rx.indexOf('\n')
    while (idx !== -1) {
      const line = this.rx.slice(0, idx)
      this.rx = this.rx.slice(idx + 1)
      if (line.length > 0) this.handleMessageLine(line)
      idx = this.rx.indexOf('\n')
    }
  }

  private handleMessageLine(line: string) {
    let msg: { type: string; payload?: any }
    try { msg = JSON.parse(line) } catch { return }

    switch (msg.type) {
      case 'peer:discovered':
        this.emit({ type: 'peer:discovered', ...msg.payload })
        break
      case 'peer:hello':
        this.emit({ type: 'peer:hello', ...msg.payload })
        break
      case 'peer:left':
        this.emit({ type: 'peer:left', ...msg.payload })
        break
      case 'ready':
        this.emit({ type: 'ready', ...msg.payload })
        break
      case 'error':
        this.emit({ type: 'error', message: msg.payload?.message ?? 'Unknown error' })
        break
    }
  }

  private async refreshGridCell() {
    if (!this.worklet || !this.peerId) return
    const cell = await this.getGridCellSilently()
    if (!cell || cell === this.lastGridCell) return
    this.lastGridCell = cell
    this.sendToWorklet({ type: 'updateLocation', payload: { gridCell: cell, peerId: this.peerId } })
  }

  private async getGridCellWithPermission(): Promise<string | null> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') return null
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low })
      return geohashApprox(loc.coords.latitude, loc.coords.longitude)
    } catch {
      return null
    }
  }

  private async getGridCellSilently(): Promise<string | null> {
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low })
      return geohashApprox(loc.coords.latitude, loc.coords.longitude)
    } catch {
      return null
    }
  }

  get running() { return this.isRunning }
  get gridCell() { return this.lastGridCell }
}

function geohashApprox(lat: number, lng: number): string {
  const qLat = Math.round(lat / 0.005) * 0.005
  const qLng = Math.round(lng / 0.005) * 0.005
  return `${qLat.toFixed(3)},${qLng.toFixed(3)}`
}

export const hyperswarmBridge = new HyperswarmBridge()
