// safety.ts — node-level safety controls
//
// This module sits BELOW the store — it operates at the libp2p / node layer,
// not the UI layer. The store's block list feeds into here on startup and
// on every block/unblock action.
//
// Three tiers of response:
//
//   BLOCKED      — full block. No processing at any layer.
//                  Their broadcasts, likes, streams: all silently dropped.
//                  We stop broadcasting to them (can't prevent them seeing
//                  gossipsub, but we never respond).
//
//   NOT_INTERESTED — soft dismiss. Scored below threshold permanently (score
//                  capped at LIKE_THRESHOLD - 1 = 64). They appear on radar
//                  at minimum intensity but we never like them. They can still
//                  like us (commitment arrives but is dropped). No notification.
//
//   REPORTED     — flagged for potential export. Still blocked. Report log
//                  stored in SecureStore: timestamp, peerId hash, user note.
//                  Never sent anywhere automatically — user controls export.
//
// Persistence:
//   blocked set       → SecureStore 'proxim_blocked_v1'      (Set<peerId>)
//   not-interested    → SecureStore 'proxim_dismissed_v1'    (Set<peerId>)
//   report log        → SecureStore 'proxim_reports_v1'      (ReportEntry[])

import * as SecureStore from 'expo-secure-store'
import * as ExpoCrypto  from 'expo-crypto'
import { uint8ArrayToHex } from './bytes'

// Keys
const KEY_BLOCKED    = 'proxim_blocked_v1'
const KEY_DISMISSED  = 'proxim_dismissed_v1'
const KEY_REPORTS    = 'proxim_reports_v1'

export type SafetyLevel = 'blocked' | 'dismissed' | 'clear'

export interface ReportEntry {
  id:          string
  peerIdHash:  string   // SHA-256(peerId) — hashed for local storage
  ts:          number
  note:        string
  category:    ReportCategory
}

export type ReportCategory =
  | 'harassment'
  | 'unwanted_contact'
  | 'inappropriate_content'
  | 'impersonation'
  | 'other'

export const REPORT_CATEGORIES: Record<ReportCategory, string> = {
  harassment:             'Harassment or threatening behaviour',
  unwanted_contact:       'Persistent unwanted contact',
  inappropriate_content:  'Inappropriate photos or messages',
  impersonation:          'Pretending to be someone else',
  other:                  'Something else',
}

// ─── In-memory sets (fast O(1) lookup at node layer) ─────────────────────────

class SafetyRegistry {
  private blocked:   Set<string> = new Set()
  private dismissed: Set<string> = new Set()

  // ─── Load from SecureStore ────────────────────────────────────────────────

  async load(): Promise<void> {
    const [blockedRaw, dismissedRaw] = await Promise.all([
      SecureStore.getItemAsync(KEY_BLOCKED),
      SecureStore.getItemAsync(KEY_DISMISSED),
    ])
    if (blockedRaw)   this.blocked   = new Set(JSON.parse(blockedRaw))
    if (dismissedRaw) this.dismissed = new Set(JSON.parse(dismissedRaw))
  }

  // ─── Query ────────────────────────────────────────────────────────────────

  level(peerId: string): SafetyLevel {
    if (this.blocked.has(peerId))   return 'blocked'
    if (this.dismissed.has(peerId)) return 'dismissed'
    return 'clear'
  }

  isBlocked(peerId: string): boolean {
    return this.blocked.has(peerId)
  }

  isDismissed(peerId: string): boolean {
    return this.dismissed.has(peerId)
  }

  // ─── Block ────────────────────────────────────────────────────────────────

  async block(peerId: string): Promise<void> {
    this.blocked.add(peerId)
    this.dismissed.delete(peerId)   // promoted to full block
    await Promise.all([
      SecureStore.setItemAsync(KEY_BLOCKED,   JSON.stringify([...this.blocked])),
      SecureStore.setItemAsync(KEY_DISMISSED, JSON.stringify([...this.dismissed])),
    ])
  }

  async unblock(peerId: string): Promise<void> {
    this.blocked.delete(peerId)
    await SecureStore.setItemAsync(KEY_BLOCKED, JSON.stringify([...this.blocked]))
  }

  // ─── Dismiss (not interested) ─────────────────────────────────────────────

  async dismiss(peerId: string): Promise<void> {
    if (this.blocked.has(peerId)) return   // already blocked — don't downgrade
    this.dismissed.add(peerId)
    await SecureStore.setItemAsync(KEY_DISMISSED, JSON.stringify([...this.dismissed]))
  }

  async undismiss(peerId: string): Promise<void> {
    this.dismissed.delete(peerId)
    await SecureStore.setItemAsync(KEY_DISMISSED, JSON.stringify([...this.dismissed]))
  }

  // ─── Report ───────────────────────────────────────────────────────────────

  async report(
    peerId:   string,
    category: ReportCategory,
    note:     string,
  ): Promise<ReportEntry> {
    // Hash the peerId for local storage (even reports stay privacy-preserving)
    const hashBuf  = await ExpoCrypto.digest(
      ExpoCrypto.CryptoDigestAlgorithm.SHA256,
      new TextEncoder().encode(peerId),
    )
    const peerIdHash = uint8ArrayToHex(new Uint8Array(hashBuf)).slice(0, 16)

    const entry: ReportEntry = {
      id:         Math.random().toString(36).slice(2),
      peerIdHash,
      ts:         Date.now(),
      note:       note.trim().slice(0, 500),
      category,
    }

    const raw      = await SecureStore.getItemAsync(KEY_REPORTS)
    const existing = raw ? JSON.parse(raw) : []
    existing.push(entry)

    await SecureStore.setItemAsync(KEY_REPORTS, JSON.stringify(existing.slice(-100)))

    // Report implies block
    await this.block(peerId)

    return entry
  }

  async getReports(): Promise<ReportEntry[]> {
    const raw = await SecureStore.getItemAsync(KEY_REPORTS)
    return raw ? JSON.parse(raw) : []
  }

  async deleteReport(id: string): Promise<void> {
    const reports = await this.getReports()
    await SecureStore.setItemAsync(
      KEY_REPORTS,
      JSON.stringify(reports.filter(r => r.id !== id)),
    )
  }

  // ─── Export (user-initiated) ──────────────────────────────────────────────

  /**
   * Generate a plain-text report export for the user to send manually.
   * Contains hashed PeerIDs (not real identities), timestamps, categories, notes.
   * The user decides where to send it — we never transmit automatically.
   */
  async exportReports(): Promise<string> {
    const reports = await this.getReports()
    if (reports.length === 0) return 'No reports on file.'

    const lines = [
      'Proxim Safety Report Export',
      `Generated: ${new Date().toISOString()}`,
      `Total reports: ${reports.length}`,
      '',
      ...reports.map((r, i) => [
        `Report ${i + 1}`,
        `Date:     ${new Date(r.ts).toLocaleString()}`,
        `Category: ${REPORT_CATEGORIES[r.category]}`,
        `Peer ID:  ${r.peerIdHash}… (hashed)`,
        `Note:     ${r.note || '(none)'}`,
        '',
      ].join('\n')),
    ]

    return lines.join('\n')
  }

  // ─── Accessors ────────────────────────────────────────────────────────────

  get blockedSet():   Set<string> { return new Set(this.blocked)   }
  get dismissedSet(): Set<string> { return new Set(this.dismissed) }

  blockedCount():   number { return this.blocked.size   }
  dismissedCount(): number { return this.dismissed.size }
}

// Singleton — imported directly by the node
export const safetyRegistry = new SafetyRegistry()
