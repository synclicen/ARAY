/**
 * ARAY Android — IPC Shim Layer (v4.6.8 — Production-Ready for 5000 peserta)
 *
 * Architecture change dari versi sebelumnya:
 * - Sebelumnya: SEMUA data (events, sessions, media + BASE64 INLINE) di 1 JSON blob
 *   di Capacitor Preferences. Crash pasti pada ~1MB (sekitar peserta ke-3-10).
 * - Sekarang: Preferences hanya simpan METADATA (id, paths, timestamps, settings).
 *   File binary (foto/video) ditulis ke Filesystem (Directory.Data, app sandbox,
 *   unlimited quota). Path file disimpan di metadata.
 *
 * Layout storage Android:
 *   Preferences[aray_database] = JSON { events, sessions, media (metadata only), settings }
 *   Filesystem:Directory.Data/media/<event_id>/<media_id>.jpg|webm
 *
 * backward-compat: data lama (base64 inline di original_path) tetap dibaca
 * oleh readFile/getFileInfo (fallback ke data URL).
 */

import { Preferences } from '@capacitor/preferences'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import {
  checkLicenseStatus, activateLicense, generateLicenseCode, getMachineId, getDisplayMachineId, startEventSession
} from './license'

const DB_KEY = 'aray_database'

// In-memory cache untuk avoid parse JSON berkali-kali per call (perf critical untuk 5000 peserta)
let _dbCache: any = null
let _dbCacheDirty = false
let _saveTimer: any = null

async function loadDB() {
  if (_dbCache) return _dbCache
  const { value } = await Preferences.get({ key: DB_KEY })
  if (value) {
    try {
      _dbCache = JSON.parse(value)
    } catch {
      _dbCache = { events: [], sessions: [], media: [], settings: {} }
    }
  } else {
    _dbCache = { events: [], sessions: [], media: [], settings: {} }
  }
  return _dbCache
}

// Debounced save — 100ms (turun dari 500ms default) untuk minimize data loss
// saat crash. Untuk acara 5000 peserta, max 100ms window acceptable.
async function saveDB(db: any) {
  _dbCache = db
  _dbCacheDirty = true
  if (_saveTimer) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(async () => {
    if (!_dbCacheDirty) return
    _dbCacheDirty = false
    try {
      await Preferences.set({ key: DB_KEY, value: JSON.stringify(_dbCache) })
    } catch (e) {
      console.error('[ARAY] saveDB failed:', e)
      // Retry sekali setelah 200ms
      setTimeout(async () => {
        try {
          await Preferences.set({ key: DB_KEY, value: JSON.stringify(_dbCache) })
          _dbCacheDirty = false
        } catch (e2) {
          console.error('[ARAY] saveDB retry failed:', e2)
        }
      }, 200)
    }
  }, 100)
}

// Force flush — dipanggil saat app pause/quit (via visibilitychange listener)
async function flushDB() {
  if (_saveTimer) {
    clearTimeout(_saveTimer)
    _saveTimer = null
  }
  if (_dbCacheDirty && _dbCache) {
    try {
      await Preferences.set({ key: DB_KEY, value: JSON.stringify(_dbCache) })
      _dbCacheDirty = false
    } catch (e) {
      console.error('[ARAY] flushDB failed:', e)
    }
  }
}

// ─── Filesystem helpers ─────────────────────────────────────────────────────
async function ensureMediaDir(eventId: string): Promise<void> {
  try {
    await Filesystem.mkdir({
      path: `media/${eventId}`,
      directory: Directory.Data,
      recursive: true
    })
  } catch (e: any) {
    // Ignore if already exists
    if (!String(e?.message || '').includes('exist')) {
      console.warn('[ARAY] mkdir failed:', e)
    }
  }
}

async function writeFileToFS(filename: string, base64Data: string, eventId: string): Promise<string> {
  await ensureMediaDir(eventId)
  const result = await Filesystem.writeFile({
    path: `media/${eventId}/${filename}`,
    data: base64Data,
    directory: Directory.Data
  })
  // Return URI yang bisa di-resolve oleh Filesystem.readFile
  return result.uri || `media/${eventId}/${filename}`
}

async function readFileFromFS(uri: string): Promise<string | null> {
  try {
    const result = await Filesystem.readFile({ path: uri, directory: Directory.Data })
    // result.data adalah base64 string (untuk non-text) atau Blob
    if (typeof result.data === 'string') return result.data
    // Blob → convert to base64
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const str = reader.result as string
        resolve(str.split(',')[1])
      }
      reader.onerror = reject
      reader.readAsDataURL(result.data as Blob)
    })
  } catch (e) {
    console.warn('[ARAY] readFileFromFS failed:', uri, e)
    return null
  }
}

async function deleteFileFromFS(uri: string): Promise<void> {
  try {
    await Filesystem.deleteFile({ path: uri, directory: Directory.Data })
  } catch (e) {
    console.warn('[ARAY] deleteFileFromFS failed:', uri, e)
  }
}

// ─── Settings ───────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  storage_path: '', first_run_completed: false, kiosk_mode: false,
  auto_print: false, auto_sync: false, sync_interval: 'immediately',
  delete_local_after_sync: false, google_drive_connected: false,
  google_drive_email: null, camera_device_id: null, printer_name: null,
  booth_countdown_seconds: 3, booth_shot_count: 4,
  selected_template_id: 'classic-strip-4', booth_mode: 'combined',
  backup_folder: null, auto_backup: false,
  camera_effect: 'original', camera_effect_video: 'original',
  aspect_ratio: '9:16', aspect_ratio_video: '9:16',
  video_template: 'viral-bounce-10', palm_trigger: false,
  palm_trigger_sensitivity: 0.6, booth_fullscreen_password: 'aray',
  share_qr_enabled: false, share_qr_link: '',
  show_print_button: true, show_share_button: true,
  print_paper_size: '4x6', print_copies: 1, print_color: true,
  print_orientation: 'portrait', print_quality: 'normal', print_fit: 'contain',
  camera_facing: 'user',
  camera_mirror: true
}

async function getSettings() {
  const db = await loadDB()
  const s = { ...DEFAULT_SETTINGS, ...db.settings }
  s.google_drive_connected = !!db.settings.backup_folder
  return s
}

async function updateSettings(partial: any) {
  const db = await loadDB()
  db.settings = { ...db.settings, ...partial }
  await saveDB(db)
  return getSettings()
}

// ─── Storage info via Filesystem stat ────────────────────────────────────────
async function getStorageInfo() {
  try {
    const stat = await Filesystem.stat({ path: '', directory: Directory.Data })
    // Capacitor Filesystem.stat returns { type, size, mtime, uri }
    // Note: size is bytes used by app sandbox
    const usedBytes = stat.size || 0
    // Android typically has 32-128GB free; we report a synthetic total
    // since native Android StorageManager isn't accessible from WebView
    // without extra plugin. Use a conservative 1GB cap for warning purposes.
    const TOTAL_BYTES = 1024 * 1024 * 1024 // 1GB synthetic cap for UI
    const freeBytes = Math.max(0, TOTAL_BYTES - usedBytes)
    const usedPct = TOTAL_BYTES > 0 ? (usedBytes / TOTAL_BYTES) * 100 : 0
    return {
      path: '/android/data/com.aray.booth/files',
      total_bytes: TOTAL_BYTES,
      used_bytes: usedBytes,
      free_bytes: freeBytes,
      used_percent: Math.round(usedPct * 10) / 10,
      warning: usedPct > 80,
      critical: usedPct > 95
    }
  } catch (e) {
    return {
      path: '/android', total_bytes: 0, used_bytes: 0, free_bytes: 0,
      used_percent: 0, warning: false, critical: false
    }
  }
}

const arayAPI = {
  isElectron: false, isAndroid: true,
  app: {
    getVersion: async () => ({ success: true, data: '4.6.8' }),
    openExternal: async (url: string) => { window.open(url, '_blank'); return { success: true } }
  },
  license: {
    status: async () => ({ success: true, data: await checkLicenseStatus() }),
    activate: async (code: string) => activateLicense(code),
    generate: async (machineId: string, adminKey: string) => generateLicenseCode(machineId, adminKey),
    getMachineId: async () => {
      const machineId = await getMachineId()
      return { success: true, data: { machineId, displayMachineId: getDisplayMachineId(machineId) }}
    },
    // v4.6.8: Trigger event session lock — 72h grace period aktif
    startEventSession: async () => { startEventSession(); return { success: true } }
  },
  events: {
    create: async (input: any) => {
      const db = await loadDB()
      const ev = { id: crypto.randomUUID(),
        code: `ARAY_EVENT_${new Date().getFullYear()}_${String(db.events.length+1).padStart(4,'0')}`,
        name: input.name, client: input.client||null, venue: input.venue||null,
        event_date: input.event_date||null, operator: input.operator||null,
        template_id: input.template_id||null, storage_path: '',
        google_drive_folder_id: null, sync_status: 'LOCAL_ONLY', status: 'active',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }
      db.events.unshift(ev); await saveDB(db)
      return { success: true, data: ev }
    },
    list: async () => { const db = await loadDB(); return { success: true, data: db.events }},
    get: async (id: string) => { const db = await loadDB(); return { success: true, data: db.events.find((e:any)=>e.id===id)||null }},
    update: async (input: any) => {
      const db = await loadDB()
      const idx = db.events.findIndex((e:any)=>e.id===input.id)
      if (idx!==-1) { db.events[idx] = {...db.events[idx], ...input, updated_at: new Date().toISOString()}; await saveDB(db); return { success: true, data: db.events[idx] }}
      return { success: false, error: { code: 'NOT_FOUND', message: 'Not found' }}
    },
    delete: async (id: string) => {
      const db = await loadDB()
      // v4.6.8: juga delete semua media milik event ini dari Filesystem
      const eventMedia = db.media.filter((m:any)=>m.event_id===id)
      for (const m of eventMedia) {
        if (m.original_path && !m.original_path.startsWith('data:')) {
          await deleteFileFromFS(m.original_path)
        }
        if (m.processed_path && !m.processed_path.startsWith('data:')) {
          await deleteFileFromFS(m.processed_path)
        }
      }
      db.events = db.events.filter((e:any)=>e.id!==id)
      db.media = db.media.filter((m:any)=>m.event_id!==id)
      await saveDB(db)
      return { success: true, data: true }
    },
    archive: async (id: string) => arayAPI.events.update({ id, status: 'archived' }),
    duplicate: async (id: string) => {
      const db = await loadDB()
      const ev = db.events.find((e:any)=>e.id===id)
      if (!ev) return { success: false, error: { code: 'NOT_FOUND', message: 'Not found' }}
      const copy = {...ev, id: crypto.randomUUID(), name: ev.name+' (Copy)', created_at: new Date().toISOString()}
      db.events.unshift(copy); await saveDB(db)
      return { success: true, data: copy }
    },
    openFolder: async () => ({ success: true })
  },
  sessions: {
    create: async (eventId: string, type: string, shotCount?: number) => {
      const db = await loadDB()
      const s = { id: crypto.randomUUID(), event_id: eventId, type, shot_count: shotCount||1, created_at: new Date().toISOString() }
      db.sessions.push(s); await saveDB(db)
      return { success: true, data: s }
    }
  },
  media: {
    list: async (filters: any = {}) => {
      const db = await loadDB()
      let r = db.media
      if (filters.event_id) r = r.filter((m:any)=>m.event_id===filters.event_id)
      if (filters.type) r = r.filter((m:any)=>m.type===filters.type)
      // v4.6.8: paginate — return max 200 per call (sebelumnya 500, terlalu berat untuk UI)
      const limit = filters.limit || 200
      const offset = filters.offset || 0
      return { success: true, data: r.slice(offset, offset + limit) }
    },
    get: async (id: string) => { const db = await loadDB(); return { success: true, data: db.media.find((m:any)=>m.id===id)||null }},
    delete: async (id: string) => {
      const db = await loadDB()
      const m = db.media.find((x:any)=>x.id===id)
      if (m) {
        // Delete file binary dari Filesystem
        if (m.original_path && !m.original_path.startsWith('data:')) {
          await deleteFileFromFS(m.original_path)
        }
        if (m.processed_path && !m.processed_path.startsWith('data:')) {
          await deleteFileFromFS(m.processed_path)
        }
        if (m.thumbnail_path && !m.thumbnail_path.startsWith('data:')) {
          await deleteFileFromFS(m.thumbnail_path)
        }
      }
      db.media = db.media.filter((x:any)=>x.id!==id); await saveDB(db)
      return { success: true, data: true }
    },
    stats: async (eventId?: string) => {
      const db = await loadDB()
      const f = eventId ? db.media.filter((m:any)=>m.event_id===eventId) : db.media
      return { success: true, data: { total: f.length, synced: f.filter((m:any)=>m.sync_status==='SYNCED').length, pending: f.filter((m:any)=>m.sync_status==='PENDING').length, failed: 0, uploading: 0 }}
    },
    // v4.6.8: saveCapturedFrame — simpan ke Filesystem, path disimpan di metadata
    saveCapturedFrame: async (p: any) => {
      try {
        const db = await loadDB()
        const mediaId = crypto.randomUUID()
        const filename = `${mediaId}.jpg`
        const fileUri = await writeFileToFS(filename, p.frame_base64, p.event_id)
        const m = {
          id: mediaId,
          event_id: p.event_id,
          session_id: p.session_id,
          type: 'photo',
          original_path: fileUri,
          thumbnail_path: fileUri, // same file (small enough)
          checksum: null,
          sync_status: 'LOCAL_ONLY',
          remote_file_id: null,
          last_error: null,
          created_at: new Date().toISOString(),
          uploaded_at: null
        }
        db.media.unshift(m); await saveDB(db)
        return { success: true, data: m }
      } catch (e: any) {
        console.error('[ARAY] saveCapturedFrame failed:', e)
        return { success: false, error: { code: 'SAVE_FAILED', message: e?.message || 'Failed to save frame' }}
      }
    },
    saveVideo: async (p: any) => {
      try {
        const db = await loadDB()
        const mediaId = crypto.randomUUID()
        const filename = `${mediaId}.webm`
        const fileUri = await writeFileToFS(filename, p.video_base64, p.event_id)
        const m = {
          id: mediaId,
          event_id: p.event_id,
          session_id: p.session_id,
          type: 'video',
          original_path: fileUri,
          thumbnail_path: null,
          checksum: null,
          sync_status: 'LOCAL_ONLY',
          remote_file_id: null,
          last_error: null,
          created_at: new Date().toISOString(),
          uploaded_at: null
        }
        db.media.unshift(m); await saveDB(db)
        return { success: true, data: m }
      } catch (e: any) {
        console.error('[ARAY] saveVideo failed:', e)
        return { success: false, error: { code: 'SAVE_FAILED', message: e?.message || 'Failed to save video' }}
      }
    },
    saveComposite: async (p: any) => {
      try {
        const db = await loadDB()
        const mediaId = crypto.randomUUID()
        const filename = `${mediaId}.jpg`
        const fileUri = await writeFileToFS(filename, p.image_base64, p.event_id)
        const m = {
          id: mediaId,
          event_id: p.event_id,
          session_id: p.session_id,
          type: 'photo',
          original_path: fileUri,
          thumbnail_path: fileUri,
          checksum: null,
          sync_status: 'LOCAL_ONLY',
          remote_file_id: null,
          last_error: null,
          created_at: new Date().toISOString(),
          uploaded_at: null,
          processed_path: fileUri
        }
        db.media.unshift(m); await saveDB(db)
        return { success: true, data: m }
      } catch (e: any) {
        console.error('[ARAY] saveComposite failed:', e)
        return { success: false, error: { code: 'SAVE_FAILED', message: e?.message || 'Failed to save composite' }}
      }
    },
    // v4.6.8: readFile — baca dari Filesystem, fallback ke data URL (backward compat)
    readFile: async (path: string) => {
      if (path.startsWith('data:')) return { success: true, data: path.split(',')[1] }
      const data = await readFileFromFS(path)
      if (data !== null) return { success: true, data }
      return { success: false, error: { code: 'NOT_FOUND', message: 'File not found' }}
    },
    getFileInfo: async (path: string) => {
      if (path.startsWith('data:')) {
        const b = path.split(',')[1]
        const s = Math.floor(b.length*0.75)
        return { success: true, data: { size: s, sizeMB: Math.round(s/1048576*100)/100, exists: true }}
      }
      try {
        const stat = await Filesystem.stat({ path, directory: Directory.Data })
        const size = stat.size || 0
        return { success: true, data: { size, sizeMB: Math.round(size/1048576*100)/100, exists: true }}
      } catch {
        return { success: false, error: { code: 'NOT_FOUND', message: 'File not found' }}
      }
    },
    openInFolder: async () => ({ success: true }),
    updateSyncStatus: async (id: string, status: string) => {
      const db = await loadDB()
      const idx = db.media.findIndex((m:any)=>m.id===id)
      if (idx!==-1) {
        db.media[idx].sync_status = status
        if (status==='SYNCED') db.media[idx].uploaded_at = new Date().toISOString()
        await saveDB(db)
      }
      return { success: true }
    }
  },
  storage: {
    getInfo: async () => ({ success: true, data: await getStorageInfo() }),
    getPath: async () => ({ success: true, data: '/android/data/com.aray.booth/files' }),
    setPath: async () => ({ success: true, data: await getSettings() }),
    chooseFolder: async () => ({ canceled: true, path: null }),
    openFolder: async () => ({ success: true }),
    ensure: async () => ({ success: true })
  },
  camera: { list: async () => ({ success: true, data: [] }), connect: async () => ({ success: true }), disconnect: async () => ({ success: true })},
  settings: { get: async () => ({ success: true, data: await getSettings() }), update: async (p: any) => ({ success: true, data: await updateSettings(p) }), getDefaultStoragePath: async () => ({ success: true, data: '/android/data/com.aray.booth/files' })},
  print: { queue: async () => ({ success: false, error: 'Print not available on Android' }), listPrinters: async () => ({ success: true, data: [] })},
  googleDrive: { connect: async () => ({ connected: false, message: 'Not available' }), disconnect: async () => ({ success: true }), status: async () => ({ connected: false, folder: null, totalFiles: 0, message: 'Not available' })},
  sync: { start: async () => ({ success: true, data: { started: true, backed: 0, skipped: 0, failed: 0 }}), pause: async () => ({ paused: true }), resume: async () => ({ resumed: true, backed: 0, skipped: 0, failed: 0 }), retry: async () => ({ retrying: true, backed: 0, skipped: 0, failed: 0 }), summary: async (eventId?: string) => arayAPI.media.stats(eventId) },
  fs: {
    readAsDataURL: async (p: string) => {
      if (p.startsWith('data:')) return { success: true, data: p }
      const data = await readFileFromFS(p)
      if (data !== null) {
        // Determine mime from extension
        const ext = p.split('.').pop()?.toLowerCase() || 'jpg'
        const mime = ext === 'webm' ? 'video/webm' : 'image/jpeg'
        return { success: true, data: `data:${mime};base64,${data}` }
      }
      return { success: false, error: 'Not found' }
    },
    exists: async (p: string) => {
      if (p.startsWith('data:')) return { success: true }
      try {
        await Filesystem.stat({ path: p, directory: Directory.Data })
        return { success: true }
      } catch {
        return { success: false }
      }
    },
    showOpenDialog: async () => ({ success: false, data: null })
  },
  // v4.6.8: flush — untuk dipanggil saat app pause/quit
  _flush: flushDB
}

;(window as any).aray = arayAPI

// v4.6.8: Auto-flush saat app pause/background (visibilitychange)
// Critical untuk acara 5000 peserta — pastikan metadata tersimpan saat user
// minimize app atau device sleep. Tanpa ini, capture terakhir bisa hilang.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushDB()
    }
  })
  // Also flush on page unload (kalau app di-kill)
  window.addEventListener('pagehide', () => {
    flushDB()
  })
}

export {}
