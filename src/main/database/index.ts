/**
 * ARAY Database — JSON file-based storage (no native modules)
 *
 * Replaces better-sqlite3 with pure JavaScript JSON file storage.
 * 100% portable, no compilation, no ABI issues.
 */

import { readJSON, writeJSON, getStorageInfo } from '../storage/json-store'
import type { AraySettings, ArayEvent, ArayMedia, AraySession } from '@shared/types'

const DEFAULT_SETTINGS: AraySettings = {
  storage_path: '',
  first_run_completed: false,
  kiosk_mode: false,
  auto_print: false,
  auto_sync: false,
  sync_interval: 'immediately',
  delete_local_after_sync: false,
  google_drive_connected: false,
  google_drive_email: null,
  camera_device_id: null,
  printer_name: null,
  booth_countdown_seconds: 3,
  booth_shot_count: 4
}

export function getDatabase() {
  return {
    prepare: () => ({
      get: () => null,
      all: () => [],
      run: () => ({ changes: 0 })
    }),
    exec: () => {},
    pragma: () => {},
    close: () => {}
  }
}

export function initDatabase(): void {
  console.log('[ARAY] Database initialized (JSON file storage mode)')
  // Initialize default settings if not exist
  const settings = readJSON<AraySettings | null>('settings', null)
  if (!settings) {
    writeJSON('settings', DEFAULT_SETTINGS)
  }
  // Initialize empty arrays
  readJSON<ArayEvent[]>('events', [])
  readJSON<AraySession[]>('sessions', [])
  readJSON<ArayMedia[]>('media', [])
}

export function closeDatabase(): void {
  // No-op for JSON storage
}

export { getStorageInfo }
