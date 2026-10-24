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
// v4.7.15: DocumentsContract API (port Saatiril-Andro) — via DriveBackup plugin
import { Share } from '@capacitor/share'
import {
  checkLicenseStatus, activateLicense, generateLicenseCode, getMachineId, getDisplayMachineId, startEventSession
} from './license'
import { DriveBackup } from './drive-backup'

const DB_KEY = 'aray_database'

// v4.7.19: Synchronous lock untuk prevent double-create race condition.
// Module-level variable — checked BEFORE any async operations.
// Tidak bisa pakai dedup check di async function karena race condition:
// Call 1: loadDB() → no existing → create → saveDB() (async, debounced)
// Call 2: loadDB() → no existing (Call 1 belum save) → create → saveDB()
// Result: 2 events dengan code sama.
// Fix: _createLock synchronous — block Call 2 immediately sebelum loadDB.
let _createEventLock = false

// v4.7.0: Pakai Directory.Documents supaya foto bisa diakses user via file manager.
// Path: /storage/emulated/0/Documents/ARAY/<event_id>/<media_id>.jpg
// User bisa browse dengan app "Files" bawaan Android.
// v4.7.4: Fallback strategy — Documents mungkin gagal di Android 11+ scoped storage.
// Coba Documents → External (app-specific) → Data (app-specific internal).
const PUBLIC_ROOT_FOLDER = 'ARAY'

// v4.7.5: Active directory no longer needed — native DocumentFile API handles it.

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
// v4.7.1 P1-5: Force flush tiap 10 saves supaya metadata tidak hilang saat crash.
let _saveCount = 0
const FORCE_FLUSH_EVERY = 10

async function saveDB(db: any) {
  _dbCache = db
  _dbCacheDirty = true
  _saveCount++
  // v4.7.1 P1-5: Setiap 10 saves, force flush sinkron (tidak debounce)
  // Critical untuk 5000 peserta — kalau app crash mid-burst, max 10 captures hilang.
  if (_saveCount % FORCE_FLUSH_EVERY === 0) {
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null }
    _dbCacheDirty = false
    try {
      await Preferences.set({ key: DB_KEY, value: JSON.stringify(_dbCache) })
    } catch (e) {
      console.error('[ARAY] saveDB force flush failed:', e)
      _dbCacheDirty = true  // retry di debounce berikutnya
    }
    return
  }
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

// ─── Filesystem helpers (v4.7.5 — native DocumentFile API) ──────────────────
// v4.7.5: Switch dari Capacitor Filesystem plugin ke native DocumentFile API
// via DriveBackupPlugin. User pilih folder via SAF picker (ACTION_OPEN_DOCUMENT_TREE)
// → URI persisted → DocumentFile.createFile untuk write.
// Ini approach yang sama dengan Saatiril-Andro, lebih reliable di Android 11+.

const MAX_INLINE_BASE64_BYTES = 100 * 1024 // 100KB — kalau lebih, jangan inline

// v4.7.15: Check if local folder has been picked via SAF
async function isFilesystemAvailable(): Promise<boolean> {
  try {
    const result = await DriveBackup.hasLocalFolder()
    return result.hasFolder
  } catch { return false }
}

// v4.7.15: DocumentsContract API (port Saatiril-Andro PhotoSaver.savePhoto)
// via DriveBackup plugin. User pilih folder via SAF picker (pickLocalFolder).
async function writeFileToFS(filename: string, base64Data: string, subfolder: string): Promise<{ path: string; isFilesystem: boolean }> {
  const cleanBase64 = base64Data.startsWith('data:') ? base64Data.split(',')[1] : base64Data
  const ext = filename.split('.').pop()?.toLowerCase() || 'jpg'
  const mimeType = ext === 'webm' ? 'video/webm' : 'image/jpeg'

  try {
    const result = await DriveBackup.saveLocalFile({
      base64Data: cleanBase64,
      filename: filename,
      subfolder: subfolder,
      mimeType: mimeType
    })
    if (result.success) {
      console.log('[ARAY] writeFileToFS OK:', filename, '→', result.path.substring(0, 60))
      return { path: result.path, isFilesystem: true }
    }
    throw new Error('saveLocalFile returned success=false')
  } catch (e: any) {
    console.error('[ARAY] writeFileToFS FAILED:', e?.message || e)
    throw new Error(`Gagal menyimpan foto: ${e?.message || e}. Pastikan sudah pilih folder di Settings → Change folder.`)
  }
}

async function readFileFromFS(path: string): Promise<string | null> {
  if (path.startsWith('data:')) return path.split(',')[1]
  try {
    const result = await DriveBackup.readLocalFile({ path })
    return result.success ? result.data : null
  } catch (e) {
    console.warn('[ARAY] readFileFromFS failed:', path, e)
    return null
  }
}

async function deleteFileFromFS(path: string): Promise<void> {
  if (path.startsWith('data:')) return
  try { await DriveBackup.deleteLocalFile({ path }) } catch (e) { console.warn('[ARAY] deleteFileFromFS failed:', path, e) }
}


// v4.7.12: Helper functions — port dari Electron untuk naming consistency
// sanitizeFilename: strip invalid chars, replace spaces with -, max 80 chars
function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'Untitled'
}

// buildEventFolderName: <EventName>_<YYYY-MM-DD>
function buildEventFolderName(event: any): string {
  const parts: string[] = []
  if (event.name) parts.push(sanitizeFilename(event.name))
  else parts.push('Untitled-Event')
  if (event.event_date) {
    const d = new Date(event.event_date)
    if (!isNaN(d.getTime())) {
      parts.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`)
    }
  }
  return parts.join('_')
}

// getDateStr: YYYY-MM-DD dari event atau today
function getDateStr(event: any): string {
  if (event.event_date) {
    const d = new Date(event.event_date)
    if (!isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    }
  }
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
}

// getSequenceNumber: cari nomor urut berikutnya berdasarkan media yang sudah ada
function getSequenceNumber(eventId: string, type: string): number {
  const db = loadDB_cached()
  const eventMedia = db.media.filter((m:any) => m.event_id === eventId && m.type === type)
  return eventMedia.length + 1
}

// Helper: load DB from cache (sync version for getSequenceNumber)
function loadDB_cached(): any {
  return _dbCache || { events: [], sessions: [], media: [], settings: {} }
}

// buildFilename: <EventName>_<DateStr>_<001>.jpg
function buildFilename(event: any, type: 'photo' | 'video', ext: string = 'jpg'): string {
  const eventName = sanitizeFilename(event.name || 'ARAY')
  const dateStr = getDateStr(event)
  const seq = getSequenceNumber(event.id, type)
  const extFinal = type === 'video' ? 'webm' : ext
  return `${eventName}_${dateStr}_${String(seq).padStart(3, '0')}.${extFinal}`
}

// v4.7.15: Auto-upload ke Google Drive via DocumentsContract (port Saatiril)
async function autoUploadToDrive(
  localFilePath: string,
  filename: string,
  eventName: string,
  mimeType: string = 'image/jpeg',
  mediaId: string = ''
): Promise<void> {
  try {
    const db = await loadDB()
    const autoBackup = db.settings?.auto_backup ?? false
    const backupFolder = db.settings?.backup_folder
    if (!autoBackup || !backupFolder) return
    if (localFilePath.startsWith('data:')) return

    if (mediaId) {
      const idx = db.media.findIndex((m:any)=>m.id===mediaId)
      if (idx !== -1) { db.media[idx].sync_status = 'PENDING'; await saveDB(db) }
    }

    console.log('[ARAY] Uploading to Drive:', filename)
    const result = await DriveBackup.uploadFile({
      localPath: localFilePath,
      filename: filename,
      projectName: eventName || 'default',
      mimeType: mimeType
    })

    if (result.success) {
      console.log('[ARAY] Upload SUCCESS:', filename)
      if (mediaId) {
        const db2 = await loadDB()
        const idx2 = db2.media.findIndex((m:any)=>m.id===mediaId)
        if (idx2 !== -1) { db2.media[idx2].sync_status = 'SYNCED'; db2.media[idx2].uploaded_at = new Date().toISOString(); await saveDB(db2) }
      }
    } else {
      console.error('[ARAY] Upload FAILED:', filename, (result as any).error)
      if (mediaId) {
        const db2 = await loadDB()
        const idx2 = db2.media.findIndex((m:any)=>m.id===mediaId)
        if (idx2 !== -1) { db2.media[idx2].sync_status = 'FAILED'; db2.media[idx2].last_error = (result as any).error || 'Upload failed'; await saveDB(db2) }
      }
    }
  } catch (e: any) { console.error('[ARAY] autoUploadToDrive error:', e?.message || e) }
}

// v4.7.15: getFileUri — document URI dari DocumentsContract sudah content://
async function getFileUri(path: string): Promise<string | null> {
  if (path.startsWith('data:')) return null
  if (path.startsWith('content://') || path.startsWith('file://')) return path
  return null
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
  camera_mirror: true,
  // v4.7.7: Photo quality preset
  photo_quality: 'high'
}

async function getSettings() {
  const db = await loadDB()
  const s = { ...DEFAULT_SETTINGS, ...db.settings }
  s.google_drive_connected = !!db.settings.backup_folder
  // v4.7.4: Inject real storage path based on active directory
  s.storage_path = await getStoragePathDisplay()
  return s
}

async function updateSettings(partial: any) {
  const db = await loadDB()
  db.settings = { ...db.settings, ...partial }
  await saveDB(db)
  return getSettings()
}

// ─── Storage info via Filesystem stat ────────────────────────────────────────
// v4.7.4: Get human-readable storage path based on active directory
async function getStoragePathDisplay(): Promise<string> {
  try {
    const result = await DriveBackup.getLocalFolderUri()
    return result.connected ? result.uri : 'Belum dipilih — tap Change folder'
  } catch { return 'Belum dipilih — tap Change folder' }
}

async function getStorageInfo() {
  const displayPath = await getStoragePathDisplay()
  try {
    let usedBytes = 0
    try {
      const result = await DriveBackup.listLocalFiles()
      for (const f of result.files || []) usedBytes += f.size || 0
    } catch {}
    const TOTAL_BYTES = 32 * 1024 * 1024 * 1024
    const freeBytes = Math.max(0, TOTAL_BYTES - usedBytes)
    const usedPct = TOTAL_BYTES > 0 ? (usedBytes / TOTAL_BYTES) * 100 : 0
    return { path: displayPath, total_bytes: TOTAL_BYTES, used_bytes: usedBytes, free_bytes: freeBytes, used_percent: Math.round(usedPct * 100) / 100, warning: usedPct > 80, critical: usedPct > 95 }
  } catch (e) {
    return {
      path: '/storage/emulated/0/Documents/ARAY',
      total_bytes: 0, used_bytes: 0, free_bytes: 0,
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
    // v4.7.1: startEventSession sekarang async (persist ke Preferences)
    startEventSession: async () => { await startEventSession(); return { success: true } }
  },
  events: {
    create: async (input: any) => {
      // v4.7.19: Synchronous lock — block immediately jika sedang creating
      if (_createEventLock) {
        console.log('[ARAY] events.create BLOCKED — another create in progress')
        // Wait sampai lock release, lalu return existing event
        await new Promise(resolve => setTimeout(resolve, 500))
        const db = await loadDB()
        const existing = db.events.find((e:any) =>
          e.name === input.name && e.event_date === (input.event_date||null)
        )
        if (existing) return { success: true, data: existing }
      }
      _createEventLock = true  // LOCK — synchronous, immediate

      try {
        const db = await loadDB()
        // Dedup check — cek event dengan nama + date yang sama
        const now = Date.now()
        const existing = db.events.find((e:any) =>
          e.name === input.name &&
          e.event_date === (input.event_date||null) &&
          (now - new Date(e.created_at).getTime()) < 10000
        )
        if (existing) {
          console.log('[ARAY] events.create DEDUP — returning existing:', existing.id)
          return { success: true, data: existing }
        }
        const ev = { id: crypto.randomUUID(),
          code: `ARAY_EVENT_${new Date().getFullYear()}_${String(db.events.length+1).padStart(4,'0')}`,
          name: input.name, client: input.client||null, venue: input.venue||null,
          event_date: input.event_date||null, operator: input.operator||null,
          template_id: input.template_id||null, storage_path: '',
          google_drive_folder_id: null, sync_status: 'LOCAL_ONLY', status: 'active',
          created_at: new Date().toISOString(), updated_at: new Date().toISOString()
        }
        db.events.unshift(ev)
        // v4.7.19: Force immediate save (tidak debounce) supaya lock release aman
        await Preferences.set({ key: DB_KEY, value: JSON.stringify(db) })
        _dbCache = db
        _dbCacheDirty = false
        console.log('[ARAY] events.create OK:', ev.name, ev.id)
        return { success: true, data: ev }
      } finally {
        _createEventLock = false  // UNLOCK
      }
    },
    list: async () => {
      const db = await loadDB()
      // v4.7.21: Dedup — hapus event duplikat berdasarkan NAMA + DATE (bukan code).
      // 2 event duplikat punya code BERBEDA (0001 vs 0002) karena race condition.
      // Tapi nama + date pasti sama.
      const seen = new Set<string>()
      const deduped = []
      for (const e of db.events) {
        const key = `${e.name}|${e.event_date||''}`
        if (seen.has(key)) {
          console.log('[ARAY] events.list DEDUP — removing duplicate:', e.name, e.id)
          continue
        }
        seen.add(key)
        deduped.push(e)
      }
      if (deduped.length !== db.events.length) {
        console.log('[ARAY] events.list — removed', db.events.length - deduped.length, 'duplicates')
        db.events = deduped
        await Preferences.set({ key: DB_KEY, value: JSON.stringify(db) })
        _dbCache = db
        _dbCacheDirty = false
      }
      return { success: true, data: db.events }
    },
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
    // v4.6.9: saveCapturedFrame — simpan ke Filesystem, fallback ke data URL
    saveCapturedFrame: async (p: any) => {
      try {
        const db = await loadDB()
        const mediaId = crypto.randomUUID()
        const event = db.events.find((e:any)=>e.id===p.event_id)
        // v4.7.12: Electron-style filename
        const filename = buildFilename(event, 'photo')
        const subfolder = buildEventFolderName(event)
        const { path: filePath } = await writeFileToFS(filename, p.frame_base64, subfolder)
        const m = {
          id: mediaId,
          event_id: p.event_id,
          session_id: p.session_id,
          type: 'photo',
          original_path: filePath,
          thumbnail_path: filePath,
          checksum: null,
          sync_status: 'LOCAL_ONLY',
          remote_file_id: null,
          last_error: null,
          created_at: new Date().toISOString(),
          uploaded_at: null
        }
        db.media.unshift(m); await saveDB(db)
        console.log('[ARAY] saveCapturedFrame OK:', filename)
        autoUploadToDrive(filePath, filename, subfolder, 'image/jpeg', mediaId)
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
        const event = db.events.find((e:any)=>e.id===p.event_id)
        // v4.7.12: Electron-style filename
        const filename = buildFilename(event, 'video')
        const subfolder = buildEventFolderName(event)
        const { path: filePath } = await writeFileToFS(filename, p.video_base64, subfolder)
        const m = {
          id: mediaId,
          event_id: p.event_id,
          session_id: p.session_id,
          type: 'video',
          original_path: filePath,
          thumbnail_path: null,
          checksum: null,
          sync_status: 'LOCAL_ONLY',
          remote_file_id: null,
          last_error: null,
          created_at: new Date().toISOString(),
          uploaded_at: null
        }
        db.media.unshift(m); await saveDB(db)
        console.log('[ARAY] saveVideo OK:', filename)
        autoUploadToDrive(filePath, filename, subfolder, 'video/webm', mediaId)
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
        const event = db.events.find((e:any)=>e.id===p.event_id)
        // v4.7.12: Electron-style filename
        const filename = buildFilename(event, 'photo')
        const subfolder = buildEventFolderName(event)
        const { path: filePath } = await writeFileToFS(filename, p.image_base64, subfolder)
        const m = {
          id: mediaId,
          event_id: p.event_id,
          session_id: p.session_id,
          type: 'photo',
          original_path: filePath,
          thumbnail_path: filePath,
          checksum: null,
          sync_status: 'LOCAL_ONLY',
          remote_file_id: null,
          last_error: null,
          created_at: new Date().toISOString(),
          uploaded_at: null,
          processed_path: filePath
        }
        db.media.unshift(m); await saveDB(db)
        console.log('[ARAY] saveComposite OK:', filename)
        autoUploadToDrive(filePath, filename, subfolder, 'image/jpeg', mediaId)
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
        const result = await DriveBackup.listLocalFiles()
        const file = (result.files || []).find((f: any) => f.uri === path)
        if (file) {
          const size = file.size || 0
          return { success: true, data: { size, sizeMB: Math.round(size/1048576*100)/100, exists: true }}
        }
        return { success: false, error: { code: 'NOT_FOUND', message: 'File not found' }}
      } catch {
        return { success: false, error: { code: 'NOT_FOUND', message: 'File not found' }}
      }
    },
    openInFolder: async (path: string) => {
      if (!path || path.startsWith('data:')) return { success: true }
      try {
        const uri = await getFileUri(path)
        if (!uri) return { success: false, error: 'Cannot resolve file URI' }
        await Share.share({ title: 'ARAY Photo', url: uri, dialogTitle: 'Buka / share foto via...' })
        return { success: true }
      } catch (e: any) {
        return { success: false, error: e?.message || 'Share failed' }
      }
    },
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
    getPath: async () => ({ success: true, data: await getStoragePathDisplay() }),
    setPath: async () => ({ success: true, data: await getSettings() }),
    // v4.7.5: Android — SAF folder picker untuk pilih folder penyimpanan LOKAL.
    // User pilih folder di HP (internal storage) → URI persisted → foto disimpan di sana.
    chooseFolder: async () => {
      try {
        const result = await DriveBackup.pickLocalFolder()
        return { success: true, data: { path: result.uri, canceled: false } }
      } catch (e: any) {
        return { success: false, data: { canceled: true }, error: e?.message || 'Gagal' }
      }
    },
    openFolder: async () => {
      // v4.7.1 P1-4: Share folder URI tidak work (app penerima expect file URI).
      // Ganti dengan share file pertama di folder — minimal user bisa lihat satu file
      // dan dari sana bisa browse folder lainnya.
      try {
        // v4.7.5: Use native listLocalFiles
        const result = await DriveBackup.listLocalFiles()
        if (!result.files || result.files.length === 0) {
          return { success: false, error: 'Belum ada foto. Ambil foto pertama di Booth.' }
        }
        const firstFile = result.files[0]
        await Share.share({
          title: 'ARAY Photos',
          text: 'Foto ARAY — buka folder untuk melihat semua foto',
          url: firstFile.uri,
          dialogTitle: 'Buka foto / lihat folder ARAY'
        })
        return { success: true }
      } catch (e: any) {
        return { success: false, error: 'Buka manual via file manager. (' + (e?.message || 'error') + ')' }
      }
    },
    ensure: async () => ({ success: true })
  },
  camera: { list: async () => ({ success: true, data: [] }), connect: async () => ({ success: true }), disconnect: async () => ({ success: true })},
  settings: { get: async () => ({ success: true, data: await getSettings() }), update: async (p: any) => ({ success: true, data: await updateSettings(p) }), getDefaultStoragePath: async () => ({ success: true, data: await getStoragePathDisplay() })},
  print: { queue: async () => ({ success: false, error: 'Print not available on Android' }), listPrinters: async () => ({ success: true, data: [] })},
  // v4.7.3: Google Drive auto-upload via native SAF plugin (DriveBackupPlugin).
  // Port dari Saatiril-Andro DriveBackupManager — pakai Storage Access Framework.
  // User tap "Connect" → SAF folder picker → pilih folder Google Drive →
  // URI persisted → auto-upload setiap foto ke folder tersebut.
  googleDrive: {
    connect: async () => {
      try {
        const result = await DriveBackup.pickFolder()
        // Simpan URI ke settings supaya UI tahu connected
        await updateSettings({
          backup_folder: result.uri,
          google_drive_connected: true,
          google_drive_email: 'Google Drive (SAF)'
        })
        console.log('[ARAY] Google Drive folder connected:', result.uri)
        return { connected: true, message: 'Google Drive folder berhasil dihubungkan. Foto akan auto-upload ke folder tersebut.' }
      } catch (e: any) {
        return { connected: false, message: 'Gagal connect: ' + (e?.message || e) }
      }
    },
    disconnect: async () => {
      try {
        await DriveBackup.clearFolder()
        await updateSettings({
          backup_folder: null,
          google_drive_connected: false,
          google_drive_email: null
        })
        return { success: true }
      } catch (e: any) {
        return { success: false, error: e?.message }
      }
    },
    status: async () => {
      try {
        const result = await DriveBackup.hasFolder()
        return {
          connected: result.hasFolder,
          folder: result.uri || null,
          totalFiles: 0,
          message: result.hasFolder ? 'Google Drive connected — auto-upload aktif' : 'Not connected'
        }
      } catch {
        return { connected: false, folder: null, totalFiles: 0, message: 'Not available' }
      }
    }
  },
  // v4.7.0: Tambah API share untuk share individual media ke app lain
  share: {
    shareFile: async (path: string, title?: string) => {
      try {
        const uri = await getFileUri(path)
        if (!uri) {
          return { success: false, error: 'File tidak ditemukan atau masih dalam format data URL' }
        }
        await Share.share({
          title: title || 'ARAY Photo',
          text: 'Foto dari ARAY Booth',
          url: uri,
          dialogTitle: 'Share foto via...'
        })
        return { success: true }
      } catch (e: any) {
        return { success: false, error: e?.message || 'Share gagal' }
      }
    },
    shareMultiple: async (paths: string[], title?: string) => {
      // Share.share hanya support 1 file at a time di Capacitor v6
      // Untuk multiple files, share pertama, user bisa repeat
      if (paths.length === 0) return { success: false, error: 'Tidak ada file untuk di-share' }
      return arayAPI.share.shareFile(paths[0], title || `${paths.length} photos from ARAY`)
    }
  },
  sync: {
    // v4.7.10: sync.start = direct uploadFile untuk semua LOCAL_ONLY/FAILED
    start: async () => {
      let backed = 0, failed = 0
      try {
        const db = await loadDB()
        const autoBackup = db.settings?.auto_backup ?? false
        const backupFolder = db.settings?.backup_folder
        if (!autoBackup || !backupFolder) {
          return { success: true, data: { started: true, backed: 0, skipped: 0, failed: 0 } }
        }
        const toUpload = db.media.filter((m:any) =>
          (m.sync_status === 'LOCAL_ONLY' || m.sync_status === 'FAILED' || m.sync_status === 'PENDING') &&
          m.original_path && !m.original_path.startsWith('data:')
        )
        console.log('[ARAY] Sync Now — retrying', toUpload.length, 'items')
        for (const m of toUpload) {
          const event = db.events.find((e:any)=>e.id===m.event_id)
          const subfolder = buildEventFolderName(event)
          const mimeType = m.type === 'video' ? 'video/webm' : 'image/jpeg'
          // v4.7.12: Use original filename (already Electron-style from save)
          const filename = m.original_path.split('%2F').pop()?.split('/').pop() || `${m.id}.jpg`
          const result = await DriveBackup.uploadFile({
            localPath: m.original_path,
            filename: filename,
            projectName: subfolder,
            mimeType: mimeType
          })
          if (result.success) {
            m.sync_status = 'SYNCED'
            m.uploaded_at = new Date().toISOString()
            backed++
          } else {
            m.sync_status = 'FAILED'
            m.last_error = (result as any).error || 'Upload failed'
            failed++
            console.error('[ARAY] Sync upload FAILED:', filename, (result as any).step, (result as any).error)
          }
        }
        await saveDB(db)
        console.log('[ARAY] Sync done — backed:', backed, 'failed:', failed)
      } catch (e: any) {
        console.error('[ARAY] sync.start error:', e)
      }
      return { success: true, data: { started: true, backed, skipped: 0, failed } }
    },
    pause: async () => ({ paused: true }),
    resume: async () => arayAPI.sync.start(),
    retry: async () => arayAPI.sync.start(),
    // v4.7.10: summary pakai media.stats() (sync_status based, accurate)
    summary: async (eventId?: string) => {
      return arayAPI.media.stats(eventId)
    }
  },
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
      if (p.startsWith('content://') || p.startsWith('file://')) return { success: true }
      return { success: false }
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

// v4.7.10: Background retry processor — retry FAILED/LOCAL_ONLY via direct uploadFile.
// Simple: cari media LOCAL_ONLY/FAILED, retry upload via DriveBackup.uploadFile.
let _retryProcessorRunning = false
async function startRetryProcessor() {
  if (_retryProcessorRunning) return
  _retryProcessorRunning = true

  async function tick() {
    try {
      const db = await loadDB()
      const autoBackup = db.settings?.auto_backup ?? false
      const backupFolder = db.settings?.backup_folder
      if (autoBackup && backupFolder) {
        const toRetry = db.media.filter((m:any) =>
          (m.sync_status === 'LOCAL_ONLY' || m.sync_status === 'FAILED' || m.sync_status === 'PENDING') &&
          m.original_path && !m.original_path.startsWith('data:')
        ).slice(0, 3)  // max 3 per tick

        for (const m of toRetry) {
          const event = db.events.find((e:any)=>e.id===m.event_id)
          const subfolder = buildEventFolderName(event)
          const mimeType = m.type === 'video' ? 'video/webm' : 'image/jpeg'
          const filename = m.original_path.split('%2F').pop()?.split('/').pop() || `${m.id}.jpg`
          const result = await DriveBackup.uploadFile({
            localPath: m.original_path,
            filename: filename,
            projectName: subfolder,
            mimeType: mimeType
          })
          if (result.success) {
            m.sync_status = 'SYNCED'
            m.uploaded_at = new Date().toISOString()
            console.log('[ARAY] Background retry SUCCESS:', filename)
          } else {
            console.warn('[ARAY] Background retry FAILED:', filename, (result as any).step, (result as any).error)
          }
        }
        if (toRetry.length > 0) await saveDB(db)
      }
    } catch (e) {
      console.error('[ARAY] Retry processor error:', e)
    }
    setTimeout(tick, 5000)  // 5 detik
  }
  tick()
}

if (typeof window !== 'undefined') {
  setTimeout(startRetryProcessor, 3000)
}

export {}
