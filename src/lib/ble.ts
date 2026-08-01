// ble.ts — Bluetooth LE peer discovery + advertising
//
// Central mode  (scanning)   — react-native-ble-plx
// Peripheral mode (advertising) — react-native-ble-advertiser
//
// Advertisement payload (11 bytes total):
//   [2 bytes]  UUID prefix  (0x68, 0x65 — "he" for ConnectEdge hello)
//   [8 bytes]  SHA-256(peerId) truncated to 8 bytes
//   [1 byte]   Protocol version (0x01)
//
// This is the minimum surface: identifies the app and the peer,
// nothing else. No name, no location, no capability flags.
//
// Platform behaviour:
//   iOS   — background scanning limited; app must be in foreground
//           for BLE discovery to be reliable. Background: Core Bluetooth
//           state restoration handles brief wakes.
//   Android — BLE scan + advertise work in background via ForegroundService.
//             Requires BLUETOOTH_SCAN, BLUETOOTH_ADVERTISE, BLUETOOTH_CONNECT.

import { BleManager, Device, State } from 'react-native-ble-plx'
import BLEAdvertiser                  from 'react-native-ble-advertiser'
import { Platform, PermissionsAndroid } from 'react-native'
import * as ExpoCrypto                from 'expo-crypto'
import { uint8ArrayToHex }            from './bytes'

export const CONNECTEDGE_SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E'
const CONNECTEDGE_UUID_PREFIX = [0x68, 0x65]      // "he" — ConnectEdge hello marker
const PROTO_VERSION      = 0x01

// RSSI calibration (dBm)
const RSSI_CLOSE = -45   // < 1m  → 1.0
const RSSI_FAR   = -85   // ~10m  → 0.0

export interface BLEPeer {
  peerIdHash:     string   // 8-byte hex hash
  rssi:           number   // raw dBm
  signalStrength: number   // normalised 0–1
  lastSeen:       number   // unix ms
}

export type BLEEventHandler = (peer: BLEPeer) => void

export class ConnectEdgeBLE {
  private manager:      BleManager | null = null
  private scanTimer?:   ReturnType<typeof setInterval>
  private listeners:    BLEEventHandler[] = []
  private knownPeers:   Map<string, BLEPeer> = new Map()
  private myPeerIdHash: string = ''
  private isScanning:   boolean = false
  private isAdvertising:boolean = false

  onPeerDiscovered(handler: BLEEventHandler) {
    this.listeners.push(handler)
  }
  private emit(peer: BLEPeer) {
    this.listeners.forEach(h => h(peer))
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  async init(myPeerId: string): Promise<boolean> {
    if (Platform.OS === 'web') return false

    try {
      // Request Android runtime permissions (API 31+)
      if (Platform.OS === 'android') {
        const granted = await requestAndroidBLEPermissions()
        if (!granted) {
          console.warn('BLE permissions denied')
          return false
        }
      }

      this.manager = new BleManager()

      // Hash our PeerID → 8 byte advertisement payload
      const hashBuf = await ExpoCrypto.digest(
        ExpoCrypto.CryptoDigestAlgorithm.SHA256,
        new TextEncoder().encode(myPeerId),
      )
      this.myPeerIdHash = uint8ArrayToHex(new Uint8Array(hashBuf)).slice(0, 16)

      // Wait for BLE radio to power on
      await waitForBLEPoweredOn(this.manager)
      return true

    } catch (e) {
      console.warn('BLE init failed:', e)
      return false
    }
  }

  // ─── Advertising (peripheral) ─────────────────────────────────────────────

  async startAdvertising() {
    if (this.isAdvertising) return

    try {
      // Manufacturer data: UUID prefix + peerIdHash bytes + version
      const hashBytes = hexToBytes(this.myPeerIdHash)  // 8 bytes
      const mfrData   = new Uint8Array([
        ...CONNECTEDGE_UUID_PREFIX,
        ...hashBytes,
        PROTO_VERSION,
      ])

      await BLEAdvertiser.setCompanyId(0xFFFF)  // Custom test company ID — avoids Apple filtering
      await BLEAdvertiser.broadcast(
        CONNECTEDGE_SERVICE_UUID,
        Array.from(mfrData),
        {
          advertiseMode:   (BLEAdvertiser as any).ADVERTISE_MODE_LOW_LATENCY,
          txPowerLevel:    (BLEAdvertiser as any).ADVERTISE_TX_POWER_MEDIUM,
          connectable:     false,  // discovery only, no GATT needed
          includeDeviceName: false,
          includeTxPowerLevel: false,
        },
      )
      this.isAdvertising = true
    } catch (e) {
      console.warn('BLE advertise failed:', e)
    }
  }

  async stopAdvertising() {
    if (!this.isAdvertising) return
    try {
      await BLEAdvertiser.stopBroadcast()
      this.isAdvertising = false
    } catch (e) {
      console.warn('BLE stop advertise error:', e)
    }
  }

  // ─── Scanning (central) ───────────────────────────────────────────────────

  async startScanning() {
    if (!this.manager || this.isScanning) return
    this.isScanning = true

    const scan = () => {
      this.manager!.startDeviceScan(
        [CONNECTEDGE_SERVICE_UUID],
        { allowDuplicates: true, scanMode: 2 }, // SCAN_MODE_BALANCED on Android
        (error, device) => {
          if (error) { console.warn('BLE scan error:', error); return }
          if (device) this.handleDevice(device)
        },
      )
    }

    scan()
    // iOS BLE scan degrades after ~10min; refresh every 25s to stay fresh
    this.scanTimer = setInterval(() => {
      this.manager?.stopDeviceScan()
      scan()
    }, 25_000)
  }

  stopScanning() {
    this.manager?.stopDeviceScan()
    clearInterval(this.scanTimer)
    this.isScanning = false
  }

  async stopAll() {
    this.stopScanning()
    await this.stopAdvertising()
    this.manager?.destroy()
    this.manager = null
  }

  // ─── Device handling ──────────────────────────────────────────────────────

  private handleDevice(device: Device) {
    // Primary: parse manufacturer data
    let peerIdHash = this.extractFromManufacturerData(device)

    // Fallback: parse service data (some Android devices use this format)
    if (!peerIdHash) {
      peerIdHash = this.extractFromServiceData(device)
    }

    if (!peerIdHash) return
    if (peerIdHash === this.myPeerIdHash) return  // ignore ourselves

    const rssi           = device.rssi ?? -80
    const signalStrength = rssiToSignal(rssi)
    const peer: BLEPeer  = { peerIdHash, rssi, signalStrength, lastSeen: Date.now() }

    const existing = this.knownPeers.get(peerIdHash)
    // Smooth RSSI: exponential moving average to reduce jitter
    if (existing) {
      peer.signalStrength = 0.7 * signalStrength + 0.3 * existing.signalStrength
    }

    this.knownPeers.set(peerIdHash, peer)
    this.emit(peer)
  }

  private extractFromManufacturerData(device: Device): string | null {
    const mfrData = device.manufacturerData
    if (!mfrData) return null
    try {
      const bytes = Buffer.from(mfrData, 'base64')
      // bytes[0..1] = company ID, bytes[2..3] = UUID prefix, bytes[4..11] = hash
      if (bytes.length < 12) return null
      if (bytes[2] !== CONNECTEDGE_UUID_PREFIX[0] || bytes[3] !== CONNECTEDGE_UUID_PREFIX[1]) return null
      return bytes.slice(4, 12).toString('hex')
    } catch (e) { console.warn('BLE mfr parse error:', e); return null }
  }

  private extractFromServiceData(device: Device): string | null {
    const sd = device.serviceData?.[CONNECTEDGE_SERVICE_UUID]
    if (!sd) return null
    try {
      const bytes = Buffer.from(sd, 'base64')
      if (bytes.length < 9) return null
      return bytes.slice(2, 10).toString('hex')
    } catch (e) { console.warn('BLE service data parse error:', e); return null }
  }

  // ─── Signal lookup ────────────────────────────────────────────────────────

  // Cache peerId → hash mappings to avoid recomputing SHA-256 on every call
  private peerIdHashCache = new Map<string, string>()

  async getSignalStrength(peerId: string): Promise<number> {
    let hash = this.peerIdHashCache.get(peerId)
    if (!hash) {
      const hashBuf = await ExpoCrypto.digest(
        ExpoCrypto.CryptoDigestAlgorithm.SHA256,
        new TextEncoder().encode(peerId),
      )
      hash = uint8ArrayToHex(new Uint8Array(hashBuf)).slice(0, 16)
      this.peerIdHashCache.set(peerId, hash)
    }
    return this.knownPeers.get(hash)?.signalStrength ?? 0.5
  }

  getNearbyPeers(): BLEPeer[] {
    const now = Date.now()
    return Array.from(this.knownPeers.values())
      .filter(p => now - p.lastSeen < 30_000)
      .sort((a, b) => b.signalStrength - a.signalStrength)
  }

  evictStale() {
    const now = Date.now()
    for (const [hash, peer] of this.knownPeers) {
      if (now - peer.lastSeen > 30_000) this.knownPeers.delete(hash)
    }
  }

  get scanning()   { return this.isScanning }
  get advertising(){ return this.isAdvertising }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rssiToSignal(rssi: number): number {
  const clamped = Math.max(RSSI_FAR, Math.min(RSSI_CLOSE, rssi))
  return (clamped - RSSI_FAR) / (RSSI_CLOSE - RSSI_FAR)
}

function hexToBytes(hex: string): number[] {
  const result: number[] = []
  for (let i = 0; i < hex.length; i += 2) {
    result.push(parseInt(hex.slice(i, i + 2), 16))
  }
  return result
}

async function waitForBLEPoweredOn(manager: BleManager): Promise<void> {
  const state = await manager.state()
  if (state === State.PoweredOn) return
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('BLE power-on timeout')), 10_000)
    const sub = manager.onStateChange((s) => {
      if (s === State.PoweredOn) {
        clearTimeout(timeout)
        sub.remove()
        resolve()
      }
      if (s === State.PoweredOff || s === State.Unauthorized) {
        clearTimeout(timeout)
        sub.remove()
        reject(new Error(`BLE state: ${s}`))
      }
    }, true)
  })
}

async function requestAndroidBLEPermissions(): Promise<boolean> {
  // Android 12+ (API 31+) requires granular BLE permissions
  const perms = [
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  ]

  // Legacy Android (<12) uses ACCESS_FINE_LOCATION for BLE scan
  const sdkVersion = parseInt(Platform.Version as string, 10)
  if (sdkVersion < 31) {
    perms.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)
  }

  const results = await PermissionsAndroid.requestMultiple(perms)
  return Object.values(results).every(r => r === PermissionsAndroid.RESULTS.GRANTED)
}

export const connectEdgeBLE = new ConnectEdgeBLE()
