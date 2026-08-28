import { app } from 'electron'
import { getDatabase } from '../index'
import type { AraySettings } from '@shared/types'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

// Default storage path: use user Documents folder so it works on ANY Windows
// machine regardless of how many drives they have. D:\ is only suggested in
// the first-run wizard UI — the actual default must be guaranteed to exist.
function getDefaultStoragePathSync(): string {
  try {
    const docs = app.getPath('documents')
    return join(docs, 'ARAY')
  } catch {
    try {
      return join(app.getPath('home'), 'ARAY')
    } catch {
      return join(app.getPath('userData'), 'ARAY-Storage')
    }
  }
}

// Lazy-evaluated default — computed at first call (after app.whenReady)
let _defaultStoragePath: string | null = null
function defaultStoragePath(): string {
  if (!_defaultStoragePath) {
    _defaultStoragePath = getDefaultStoragePathSync()
  }
  return _defaultStoragePath
}

const DEFAULT_SETTINGS: AraySettings = {
  storage_path: '',  // filled lazily by getSettings() if empty
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

export function getSettings(): AraySettings {
  const db = getDatabase()
  const rows = db.prepare('SELECT key, value FROM settings').all() as {
    key: string
    value: string
  }[]

  const settings = { ...DEFAULT_SETTINGS }
  for (const row of rows) {
    try {
      ;(settings as any)[row.key] = JSON.parse(row.value)
    } catch {
      ;(settings as any)[row.key] = row.value
    }
  }
  // Guarantee a valid storage path
  if (!settings.storage_path) {
    settings.storage_path = defaultStoragePath()
  }
  return settings
}

export function updateSetting(key: keyof AraySettings, value: any): void {
  const db = getDatabase()
  const serialized = typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value)
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, serialized, new Date().toISOString())
}

export function updateSettings(partial: Partial<AraySettings>): AraySettings {
  for (const [key, value] of Object.entries(partial)) {
    if (value !== undefined) {
      updateSetting(key as keyof AraySettings, value)
    }
  }
  return getSettings()
}

export function getDefaultStoragePath(): string {
  return defaultStoragePath()
}

/**
 * Ensure the storage path exists and is writable. If it cannot be created,
 * fall back to userData/ARAY-Storage (guaranteed writable by Electron).
 * Returns the path that was actually used.
 */
export function ensureValidStoragePath(): string {
  const settings = getSettings()
  let path = settings.storage_path || defaultStoragePath()

  try {
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true })
    }
    // Test writability by creating a temp file
    const testFile = join(path, '.aray-write-test')
    try {
      require('fs').writeFileSync(testFile, 'ok')
      require('fs').unlinkSync(testFile)
    } catch {
      throw new Error('Storage path not writable')
    }
    return path
  } catch (err) {
    console.warn('[ARAY] Storage path invalid, falling back to userData:', err)
    const fallback = join(app.getPath('userData'), 'ARAY-Storage')
    if (!existsSync(fallback)) {
      mkdirSync(fallback, { recursive: true })
    }
    updateSetting('storage_path', fallback)
    return fallback
  }
}
