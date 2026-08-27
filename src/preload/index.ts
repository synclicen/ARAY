/**
 * ARAY Preload — Minimal Diagnostic Version
 * Only exposes stub APIs so renderer doesn't crash if it calls them.
 */

import { contextBridge, ipcRenderer } from 'electron'

const api = {
  app: {
    getVersion: () => ipcRenderer.invoke('app.getVersion'),
    openExternal: (url: string) => ipcRenderer.invoke('app.openExternal', url)
  },
  events: { create: () => Promise.resolve({ success: false, error: { code: 'NO_DB', message: 'Diagnostic mode' } }), list: () => Promise.resolve({ success: true, data: [] }), get: () => Promise.resolve({ success: true, data: null }), update: () => Promise.resolve({ success: false, error: {} }), delete: () => Promise.resolve({ success: false, error: {} }), archive: () => Promise.resolve({ success: false, error: {} }), duplicate: () => Promise.resolve({ success: false, error: {} }), openFolder: () => Promise.resolve({ success: true, data: {} }) },
  sessions: { create: () => Promise.resolve({ success: true, data: { id: 'diag' } }) },
  media: { list: () => Promise.resolve({ success: true, data: [] }), get: () => Promise.resolve({ success: true, data: null }), delete: () => Promise.resolve({ success: false, error: {} }), stats: () => Promise.resolve({ success: true, data: { total: 0, synced: 0, pending: 0, failed: 0, uploading: 0 } }), saveCapturedFrame: () => Promise.resolve({ success: false, error: {} }), readFile: () => Promise.resolve({ success: true, data: '' }), updateSyncStatus: () => Promise.resolve({ success: true, data: {} }) },
  storage: { getInfo: () => Promise.resolve({ success: true, data: { path: 'D:\\ARAY', total_bytes: 1000000000000, used_bytes: 500000000000, free_bytes: 500000000000, used_percent: 50, warning: false, critical: false } }), getPath: () => Promise.resolve({ success: true, data: 'D:\\ARAY' }), setPath: () => Promise.resolve({ success: true, data: {} }), chooseFolder: () => Promise.resolve({ success: true, data: { canceled: true, path: null } }), openFolder: () => Promise.resolve({ success: true, data: {} }), ensure: () => Promise.resolve({ success: true, data: {} }) },
  camera: { list: () => Promise.resolve({ success: true, data: [] }), connect: () => Promise.resolve({ success: true, data: true }), disconnect: () => Promise.resolve({ success: true, data: undefined }) },
  settings: { get: () => Promise.resolve({ success: true, data: { storage_path: 'D:\\ARAY', first_run_completed: true, kiosk_mode: false, auto_print: false, auto_sync: false, sync_interval: 'immediately', delete_local_after_sync: false, google_drive_connected: false, google_drive_email: null, camera_device_id: null, printer_name: null, booth_countdown_seconds: 3, booth_shot_count: 4 } }), update: () => Promise.resolve({ success: true, data: {} }), getDefaultStoragePath: () => Promise.resolve({ success: true, data: 'D:\\ARAY' }) },
  print: { queue: () => Promise.resolve({ success: true, data: { id: 'diag' } }), listPrinters: () => Promise.resolve({ success: true, data: [] }) },
  googleDrive: { connect: () => Promise.resolve({ success: true, data: { connected: false } }), disconnect: () => Promise.resolve({ success: true, data: {} }), status: () => Promise.resolve({ success: true, data: { connected: false, email: null } }) },
  sync: { start: () => Promise.resolve({ success: true, data: {} }), pause: () => Promise.resolve({ success: true, data: {} }), resume: () => Promise.resolve({ success: true, data: {} }), retry: () => Promise.resolve({ success: true, data: {} }), summary: () => Promise.resolve({ success: true, data: { total: 0, synced: 0, pending: 0, failed: 0, uploading: 0 } }) },
  on: () => () => {}
}

try {
  contextBridge.exposeInMainWorld('aray', api)
} catch (err) {
  console.error('[ARAY Preload] Failed to expose API:', err)
}
