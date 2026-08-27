import { app } from 'electron'
import { readJSON, writeJSON } from '../../storage/json-store'
import type { AraySettings } from '@shared/types'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

function getDefaultStoragePathSync(): string {
  try {
    return join(app.getPath('documents'), 'ARAY')
  } catch {
    try {
      return join(app.getPath('home'), 'ARAY')
    } catch {
      return join(app.getPath('userData'), 'ARAY-Storage')
    }
  }
}

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

export function getSettings(): AraySettings {
  const stored = readJSON<Partial<AraySettings> | null>('settings', null)
  const settings = { ...DEFAULT_SETTINGS, ...(stored || {}) }
  if (!settings.storage_path) {
    settings.storage_path = getDefaultStoragePathSync()
  }
  return settings
}

export function updateSetting(key: keyof AraySettings, value: any): void {
  const settings = getSettings()
  ;(settings as any)[key] = value
  writeJSON('settings', settings)
}

export function updateSettings(partial: Partial<AraySettings>): AraySettings {
  const settings = getSettings()
  const updated = { ...settings, ...partial }
  writeJSON('settings', updated)
  return updated
}

export function getDefaultStoragePath(): string {
  return getDefaultStoragePathSync()
}

export function ensureValidStoragePath(): string {
  const settings = getSettings()
  let path = settings.storage_path || getDefaultStoragePathSync()

  try {
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true })
    }
    const testFile = join(path, '.aray-write-test')
    require('fs').writeFileSync(testFile, 'ok')
    require('fs').unlinkSync(testFile)
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
