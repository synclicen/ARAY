import { app } from 'electron'
import { getDatabase } from '../index'
import type { AraySettings } from '@shared/types'
import { join } from 'path'

const DEFAULT_STORAGE_PATH = join('D:', 'ARAY')

const DEFAULT_SETTINGS: AraySettings = {
  storage_path: DEFAULT_STORAGE_PATH,
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
  // On non-Windows dev environments, fall back to user data dir
  if (process.platform === 'win32') {
    return DEFAULT_STORAGE_PATH
  }
  return join(app.getPath('home'), 'ARAY')
}
