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
import { Share } from '@capacitor/share'
import {
  checkLicenseStatus, activateLicense, generateLicenseCode, getMachineId, getDisplayMachineId, startEventSession
} from './license'

const DB_KEY = 'aray_database'

// v4.7.0: Pakai Directory.Documents supaya foto bisa diakses user via file manager.
// Path: /storage/emulated/0/Documents/ARAY/<event_id>/<media_id>.jpg
// User bisa browse dengan app "Files" bawaan Android.
const PUBLIC_STORAGE_DIR = Directory.Documents
const PUBLIC_ROOT_FOLDER = 'ARAY'

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

// ─── Filesystem helpers (v4.6.9 — robust fallback) ──────────────────────────
// Strategy: coba Filesystem dulu. Kalau gagal (plugin not registered, permission
// denied, disk error), fall back ke base64 inline di Preferences (old behavior).
// Untuk acara 5000 peserta, Filesystem WAJIB berfungsi. Fallback hanya safety net.

let _fsAvailable: boolean | null = null  // null = belum di-test

async function isFilesystemAvailable(): Promise<boolean> {
  if (_fsAvailable !== null) return _fsAvailable
  try {
    // Test: write a small file, read it back, delete it
    const testPath = `${PUBLIC_ROOT_FOLDER}/test-${Date.now()}.txt`
    await Filesystem.writeFile({
      path: testPath,
      data: btoa('ARAY-FS-TEST'),
      directory: PUBLIC_STORAGE_DIR
    })
    const result = await Filesystem.readFile({ path: testPath, directory: PUBLIC_STORAGE_DIR })
    await Filesystem.deleteFile({ path: testPath, directory: PUBLIC_STORAGE_DIR })
    _fsAvailable = (typeof result.data === 'string' && atob(result.data) === 'ARAY-FS-TEST')
    console.log(`[ARAY] Filesystem available: ${_fsAvailable} (Documents/ARAY)`)
    return _fsAvailable
  } catch (e) {
    console.error('[ARAY] Filesystem NOT available — falling back to Preferences base64:', e)
    _fsAvailable = false
    return false
  }
}

async function ensureMediaDir(eventId: string): Promise<void> {
  try {
    await Filesystem.mkdir({
      path: `${PUBLIC_ROOT_FOLDER}/${eventId}`,
      directory: PUBLIC_STORAGE_DIR,
      recursive: true
    })
  } catch (e: any) {
    const msg = String(e?.message || '')
    // "already exists" is OK — not an error
    if (!msg.includes('exist') && !msg.includes('EOEXIST')) {
      console.warn('[ARAY] mkdir failed (non-critical):', msg)
    }
  }
}

// Returns: { path, isFilesystem } — path is either FS relative path or data URL
// v4.7.1 P0-1: Guard disk-full — jangan fallback ke inline base64 untuk binary > 100KB.
// Sebelumnya: kalau Filesystem gagal, simpan base64 inline di Preferences JSON.
// Akibat: 3-5 foto composite (3MB each) → JSON Preferences > 5MB → Preferences.set
// throw → SEMUA metadata (events, sessions, settings, semua 5000 media) hilang.
// Fix: kalau Filesystem gagal DAN binary > 100KB, throw error eksplisit supaya
// Booth.tsx bisa surface ke user "Storage penuh" tanpa corrupt database.
const MAX_INLINE_BASE64_BYTES = 100 * 1024 // 100KB — kalau lebih, jangan inline

async function writeFileToFS(filename: string, base64Data: string, eventId: string): Promise<{ path: string; isFilesystem: boolean }> {
  // Try Filesystem first (Directory.Documents — public folder)
  if (await isFilesystemAvailable()) {
    try {
      await ensureMediaDir(eventId)
      const relPath = `${PUBLIC_ROOT_FOLDER}/${eventId}/${filename}`
      await Filesystem.writeFile({
        path: relPath,
        data: base64Data,
        directory: PUBLIC_STORAGE_DIR
      })
      // Store RELATIVE path (relative to Documents/) for consistent reads later
      return { path: relPath, isFilesystem: true }
    } catch (e) {
      console.error('[ARAY] writeFileToFS failed:', e)
      // v4.7.1 P0-1: Kalau binary besar, jangan fallback ke inline — throw error
      const dataBytes = Math.floor(base64Data.length * 0.75)
      if (dataBytes > MAX_INLINE_BASE64_BYTES) {
        throw new Error(`Gagal menyimpan foto (${(dataBytes/1024/1024).toFixed(1)}MB). Storage mungkin penuh. Hapus media lama atau backup ke Drive lalu hapus dari perangkat.`)
      }
      // Binary kecil (< 100KB) — OK untuk fallback inline
      console.warn(`[ARAY] Falling back to inline data URL (${dataBytes} bytes)`)
    }
  } else {
    // Filesystem not available — cek size sebelum inline
    const dataBytes = Math.floor(base64Data.length * 0.75)
    if (dataBytes > MAX_INLINE_BASE64_BYTES) {
      throw new Error(`Filesystem tidak tersedia dan foto terlalu besar (${(dataBytes/1024/1024).toFixed(1)}MB) untuk disimpan inline. Restart app atau hubungi teknisi.`)
    }
  }
  // Fallback: store as data URL inline in Preferences (only for small binaries)
  const ext = filename.split('.').pop()?.toLowerCase() || 'jpg'
  const mime = ext === 'webm' ? 'video/webm' : 'image/jpeg'
  return { path: `data:${mime};base64,${base64Data}`, isFilesystem: false }
}

async function readFileFromFS(path: string): Promise<string | null> {
  // If it's a data URL, extract base64 directly
  if (path.startsWith('data:')) {
    return path.split(',')[1]
  }
  // If Filesystem not available, can't read file
  if (!(await isFilesystemAvailable())) return null
  try {
    const result = await Filesystem.readFile({ path, directory: PUBLIC_STORAGE_DIR })
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
    console.warn('[ARAY] readFileFromFS failed:', path, e)
    return null
  }
}

async function deleteFileFromFS(path: string): Promise<void> {
  if (path.startsWith('data:')) return  // data URL — nothing to delete from FS
  if (!(await isFilesystemAvailable())) return
  try {
    await Filesystem.deleteFile({ path, directory: PUBLIC_STORAGE_DIR })
  } catch (e) {
    console.warn('[ARAY] deleteFileFromFS failed:', path, e)
  }
}

// v4.7.0: Get full file URI (for Share intent). Capacitor returns content:// URI
// which can be shared to other apps (Google Drive, WhatsApp, etc).
async function getFileUri(path: string): Promise<string | null> {
  if (path.startsWith('data:')) return null  // can't share data URL
  if (!(await isFilesystemAvailable())) return null
  try {
    const result = await Filesystem.getUri({ path, directory: PUBLIC_STORAGE_DIR })
    return result.uri  // file:///storage/emulated/0/Documents/ARAY/...
  } catch (e) {
    console.warn('[ARAY] getFileUri failed:', path, e)
    return null
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
  // v4.7.1 P2-9: Inject real storage path supaya Settings page tidak kosong
  if (!s.storage_path) {
    s.storage_path = '/storage/emulated/0/Documents/ARAY'
  }
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
    // v4.7.1 P1-8: Hitung total ukuran semua file di Documents/ARAY/
    let usedBytes = 0
    try {
      const dirResult = await Filesystem.readdir({ path: PUBLIC_ROOT_FOLDER, directory: PUBLIC_STORAGE_DIR })
      for (const entry of dirResult.files) {
        try {
          const subDir = await Filesystem.readdir({ path: `${PUBLIC_ROOT_FOLDER}/${entry.name}`, directory: PUBLIC_STORAGE_DIR })
          for (const sub of subDir.files) {
            try {
              const stat = await Filesystem.stat({ path: `${PUBLIC_ROOT_FOLDER}/${entry.name}/${sub.name}`, directory: PUBLIC_STORAGE_DIR })
              usedBytes += stat.size || 0
            } catch {}
          }
        } catch {}
      }
    } catch {}
    // v4.7.1 P1-8: Display realistis — 32GB reference (typical Android storage).
    // Sebelumnya 8GB → misleading "Critical" setelah 7.6GB used (~1500 peserta).
    // 32GB cukup untuk ~5000 peserta @ 5MB foto, atau ~2500 peserta @ 10MB foto+video.
    // Note: real free space butuh native StatFs plugin — gunakan ini sebagai conservative estimate.
    const TOTAL_BYTES = 32 * 1024 * 1024 * 1024 // 32GB reference
    const freeBytes = Math.max(0, TOTAL_BYTES - usedBytes)
    const usedPct = TOTAL_BYTES > 0 ? (usedBytes / TOTAL_BYTES) * 100 : 0
    return {
      path: '/storage/emulated/0/Documents/ARAY',
      total_bytes: TOTAL_BYTES,
      used_bytes: usedBytes,
      free_bytes: freeBytes,
      used_percent: Math.round(usedPct * 100) / 100,
      warning: usedPct > 80,
      critical: usedPct > 95
    }
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
    // v4.6.9: saveCapturedFrame — simpan ke Filesystem, fallback ke data URL
    saveCapturedFrame: async (p: any) => {
      try {
        const db = await loadDB()
        const mediaId = crypto.randomUUID()
        const filename = `${mediaId}.jpg`
        const { path: filePath } = await writeFileToFS(filename, p.frame_base64, p.event_id)
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
        console.log('[ARAY] saveCapturedFrame OK — media id:', mediaId, 'path:', filePath.substring(0, 60))
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
        const { path: filePath } = await writeFileToFS(filename, p.video_base64, p.event_id)
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
        console.log('[ARAY] saveVideo OK — media id:', mediaId)
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
        const { path: filePath } = await writeFileToFS(filename, p.image_base64, p.event_id)
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
        console.log('[ARAY] saveComposite OK — media id:', mediaId, 'path:', filePath.substring(0, 60))
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
        const stat = await Filesystem.stat({ path, directory: PUBLIC_STORAGE_DIR })
        const size = stat.size || 0
        return { success: true, data: { size, sizeMB: Math.round(size/1048576*100)/100, exists: true }}
      } catch {
        return { success: false, error: { code: 'NOT_FOUND', message: 'File not found' }}
      }
    },
    openInFolder: async (path: string) => {
      // v4.7.0: Share file ke app lain (file manager, Google Drive, dll)
      if (!path || path.startsWith('data:')) return { success: true }
      try {
        const uri = await getFileUri(path)
        if (!uri) return { success: false, error: 'Cannot resolve file URI' }
        await Share.share({
          title: 'ARAY Photo',
          url: uri,
          dialogTitle: 'Buka / share foto via...'
        })
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
    getPath: async () => ({ success: true, data: '/storage/emulated/0/Documents/ARAY' }),
    setPath: async () => ({ success: true, data: await getSettings() }),
    // v4.7.0: Android Documents folder is the storage location. User can't
    // change to arbitrary folder (Android 11+ scoped storage), but path is
    // PUBLIC and accessible via Files app / file manager.
    // v4.7.1 P1-4: Folder URI share tidak reliable — ganti ke instructions-only.
    chooseFolder: async () => ({
      canceled: true,
      path: '/storage/emulated/0/Documents/ARAY',
      message: 'Foto disimpan di: Internal Storage → Documents → ARAY\n\nBuka app "Files" atau "File Manager" di Android Anda untuk melihat folder ini. Anda bisa copy folder ARAY ke Google Drive, PC, atau flashdisk untuk backup.'
    }),
    openFolder: async () => {
      // v4.7.1 P1-4: Share folder URI tidak work (app penerima expect file URI).
      // Ganti dengan share file pertama di folder — minimal user bisa lihat satu file
      // dan dari sana bisa browse folder lainnya.
      try {
        const dirResult = await Filesystem.readdir({ path: PUBLIC_ROOT_FOLDER, directory: PUBLIC_STORAGE_DIR })
        if (dirResult.files.length === 0) {
          return { success: false, error: 'Belum ada foto. Ambil foto pertama di Booth, lalu coba lagi.' }
        }
        // Cari file pertama di subfolder event pertama
        for (const entry of dirResult.files) {
          try {
            const subDir = await Filesystem.readdir({ path: `${PUBLIC_ROOT_FOLDER}/${entry.name}`, directory: PUBLIC_STORAGE_DIR })
            if (subDir.files.length > 0) {
              const firstFile = subDir.files[0]
              const uri = await Filesystem.getUri({
                path: `${PUBLIC_ROOT_FOLDER}/${entry.name}/${firstFile.name}`,
                directory: PUBLIC_STORAGE_DIR
              })
              await Share.share({
                title: 'ARAY Photos',
                text: `Foto ARAY di: Internal Storage → Documents → ARAY → ${entry.name}\n\nBuka app Files untuk melihat semua foto.`,
                url: uri.uri,
                dialogTitle: 'Buka foto / lihat folder ARAY'
              })
              return { success: true }
            }
          } catch {}
        }
        return { success: false, error: 'Tidak ada file ditemukan. Buka manual: Files app → Documents → ARAY' }
      } catch (e: any) {
        return { success: false, error: 'Buka manual: Files app → Documents → ARAY. (' + (e?.message || 'error') + ')' }
      }
    },
    ensure: async () => ({ success: true })
  },
  camera: { list: async () => ({ success: true, data: [] }), connect: async () => ({ success: true }), disconnect: async () => ({ success: true })},
  settings: { get: async () => ({ success: true, data: await getSettings() }), update: async (p: any) => ({ success: true, data: await updateSettings(p) }), getDefaultStoragePath: async () => ({ success: true, data: '/storage/emulated/0/Documents/ARAY' })},
  print: { queue: async () => ({ success: false, error: 'Print not available on Android' }), listPrinters: async () => ({ success: true, data: [] })},
  // v4.7.2: Google Drive TIDAK bisa auto-connect di Android (butuh OAuth native plugin).
  // API googleDrive.connect() tetap ada untuk backward compat, tapi UI label jelas
  // "Share Photos" bukan "Connect Google Drive". Ini adalah SHARE INTENT, bukan connect beneran.
  googleDrive: {
    connect: async () => {
      // v4.7.2: Share intent — user pilih app (Google Drive, WhatsApp, dll) di share sheet
      try {
        const uri = await Filesystem.getUri({ path: PUBLIC_ROOT_FOLDER, directory: PUBLIC_STORAGE_DIR })
        await Share.share({
          title: 'Backup ARAY Photos',
          text: 'Upload folder ARAY ke Google Drive atau app lain untuk backup',
          url: uri.uri,
          dialogTitle: 'Pilih app untuk backup (Google Drive, WhatsApp, dll)'
        })
        return { connected: false, message: 'Pilih app di share sheet untuk backup. Untuk Google Drive: pilih "Google Drive" → upload.' }
      } catch (e: any) {
        return { connected: false, message: 'Tidak bisa membuka share sheet: ' + (e?.message || e) + '. Manual: buka app Files → Documents → ARAY → select all → share.' }
      }
    },
    disconnect: async () => ({ success: true }),
    status: async () => ({
      connected: false,
      folder: null,
      totalFiles: 0,
      message: 'Manual backup via Share. Tap "Share Photos" untuk buka share sheet.'
    })
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
        await Filesystem.stat({ path: p, directory: PUBLIC_STORAGE_DIR })
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
