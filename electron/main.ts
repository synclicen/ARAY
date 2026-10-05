/**
 * ARAY — Electron Main Process (v2.0.0)
 * Photo + Video + Template composite. Pure JS, no native modules.
 */

import { app, BrowserWindow, shell, dialog, ipcMain, globalShortcut, protocol, net } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'
import * as os from 'os'

let mainWindow: BrowserWindow | null = null

function getLogPath(): string {
  try { return path.join(app.getPath('userData'), 'aray-startup.log') }
  catch { return path.join(process.cwd(), 'aray-startup.log') }
}

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  try {
    const logPath = getLogPath()
    // v4.5.1: Log rotation — cap file at 5MB, rotate to .old
    try {
      const stat = fs.statSync(logPath)
      if (stat.size > 5 * 1024 * 1024) {
        // Rotate: rename current to .old, start fresh
        const oldPath = logPath + '.old'
        try { fs.unlinkSync(oldPath) } catch {}
        fs.renameSync(logPath, oldPath)
      }
    } catch {}
    fs.appendFileSync(logPath, line)
  } catch {}
  console.log(`[ARAY] ${msg}`)
}

// ─── JSON DATABASE ──────────────────────────────────────────────
function getDbPath(): string {
  const dir = path.join(app.getPath('userData'), 'database')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'data.json')
}

// v4.5.1: In-memory DB cache — load once, keep in memory, save on change.
// Sebelumnya: loadDB() read+parse JSON file setiap IPC call.
// Dengan 5000 media entries (~10MB file), setiap loadDB = 10MB read + parse = SLOW.
// Sekarang: cache di memory, saveDB write ke disk (debounced).
let dbCache: any = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

function loadDB(): any {
  if (dbCache) return dbCache
  try {
    const dbPath = getDbPath()
    if (!fs.existsSync(dbPath)) {
      const empty = { events: [], sessions: [], media: [], settings: {} }
      dbCache = empty
      saveDB(empty); return empty
    }
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'))
    dbCache = { events: data.events || [], sessions: data.sessions || [], media: data.media || [], settings: data.settings || {} }
    return dbCache
  } catch (err: any) { log(`DB load error: ${err.message}`); dbCache = { events: [], sessions: [], media: [], settings: {} }; return dbCache }
}

function saveDB(db: any): void {
  dbCache = db  // Update cache immediately
  // v4.5.1: Debounce disk writes — batch multiple saves within 500ms.
  // Sebelumnya: setiap saveDB = write 10MB file. Dengan 5000 entries, ini blocking.
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      const dbPath = getDbPath()
      const tmpPath = dbPath + '.tmp'
      fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf8')
      fs.renameSync(tmpPath, dbPath)
    } catch (err: any) { log(`DB save error: ${err.message}`) }
  }, 500)
}

// ─── STORAGE ────────────────────────────────────────────────────
function getDefaultStoragePath(): string {
  try { return path.join(app.getPath('documents'), 'ARAY') }
  catch { return path.join(os.homedir(), 'ARAY') }
}

function getStoragePath(): string {
  return loadDB().settings.storage_path || getDefaultStoragePath()
}

function ensureStoragePath(): string {
  const storagePath = getStoragePath()
  try {
    if (!fs.existsSync(storagePath)) fs.mkdirSync(storagePath, { recursive: true })
    const testFile = path.join(storagePath, '.aray-write-test')
    fs.writeFileSync(testFile, 'ok'); fs.unlinkSync(testFile)
    return storagePath
  } catch (err: any) {
    log(`Storage path invalid: ${err.message}`)
    const fallback = path.join(app.getPath('userData'), 'ARAY-Storage')
    if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true })
    const db = loadDB(); db.settings.storage_path = fallback; saveDB(db)
    return fallback
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'Untitled'
}

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

function ensureEventStorage(event: any): string {
  // If event already has a storage_path and it exists, use it directly
  if (event.storage_path && fs.existsSync(event.storage_path)) {
    // v4.4.8: Simplified — hanya Photos/ dan Videos/ (sama dengan backup structure)
    for (const sub of ['Photos', 'Videos']) {
      const p = path.join(event.storage_path, sub)
      if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
    }
    return event.storage_path
  }

  // Otherwise compute from storage base + event name
  const base = ensureStoragePath()
  const eventPath = path.join(base, 'Events', buildEventFolderName(event))
  // v4.4.8: Simplified — hanya Photos/ dan Videos/
  for (const sub of ['Photos', 'Videos']) {
    const p = path.join(eventPath, sub)
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
  }
  // Persist the path to the event record in DB
  event.storage_path = eventPath
  const db = loadDB()
  const idx = db.events.findIndex((e: any) => e.id === event.id)
  if (idx !== -1) {
    db.events[idx].storage_path = eventPath
    saveDB(db)
  }
  return eventPath
}

function getPhotoPaths(event: any, sessionId: string, shotNumber: number, ext = 'jpg') {
  const eventPath = ensureEventStorage(event)
  // v4.4.8: Langsung ke Photos/ (tidak ada subfolder Original/Thumbnails)
  const eventDir = path.join(eventPath, 'Photos')
  const eventName = sanitizeFilename(event.name || 'ARAY')
  const dateStr = getDateStr(event)
  const seq = getSequenceNumber(eventPath, 'Photos', eventName, dateStr, ext)
  const filename = `${eventName}_${dateStr}_${String(seq).padStart(3, '0')}`
  return {
    original: path.join(eventDir, `${filename}.${ext}`),
    thumbnail: path.join(eventDir, `${filename}.${ext}`)  // v4.4.8: thumbnail = original (sama folder)
  }
}

function getVideoPath(event: any, sessionId: string, ext = 'webm'): string {
  const eventPath = ensureEventStorage(event)
  const eventName = sanitizeFilename(event.name || 'ARAY')
  const dateStr = getDateStr(event)
  // v4.4.8: Langsung ke Videos/ (tidak ada subfolder Original)
  const seq = getSequenceNumber(eventPath, 'Videos', eventName, dateStr, ext)
  return path.join(eventPath, 'Videos', `${eventName}_${dateStr}_${String(seq).padStart(3, '0')}.${ext}`)
}

function getCompositePath(event: any, sessionId: string): string {
  const eventPath = ensureEventStorage(event)
  const eventName = sanitizeFilename(event.name || 'ARAY')
  const dateStr = getDateStr(event)
  // v4.4.8: Langsung ke Photos/ (tidak ada subfolder Prints)
  const seq = getSequenceNumber(eventPath, 'Photos', eventName, dateStr, 'jpg')
  return path.join(eventPath, 'Photos', `${eventName}_${dateStr}_${String(seq).padStart(3, '0')}.jpg`)
}

// v4.3.4: Helper — dapatkan date string YYYY-MM-DD dari event atau today
function getDateStr(event: any): string {
  if (event.event_date) {
    const d = new Date(event.event_date)
    if (!isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
  }
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// v4.3.4: Helper — dapatkan sequence number berikutnya berdasarkan file yang
// sudah ada di folder. Cari file dengan prefix EventName_DateStr_*, ambil
// nomor urut terbesar, +1.
function getSequenceNumber(eventPath: string, subDir: string, eventName: string, dateStr: string, ext: string): number {
  try {
    const dir = path.join(eventPath, subDir)
    if (!fs.existsSync(dir)) return 1
    const prefix = `${eventName}_${dateStr}_`
    const files = fs.readdirSync(dir)
    let maxSeq = 0
    for (const f of files) {
      if (f.startsWith(prefix) && f.endsWith('.' + ext)) {
        // Extract seq number: EventName_DateStr_001.ext
        const middle = f.slice(prefix.length, f.length - ext.length - 1)
        const seq = parseInt(middle)
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq
        }
      }
    }
    return maxSeq + 1
  } catch {
    return 1
  }
}

function calculateChecksum(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function getStorageInfo() {
  const storagePath = getStoragePath()
  let totalBytes = 0, freeBytes = 0
  try {
    const stats = fs.statfsSync(storagePath)
    totalBytes = stats.blocks * stats.bsize; freeBytes = stats.bfree * stats.bsize
  } catch { totalBytes = 1e12; freeBytes = 5e11 }
  const usedBytes = totalBytes - freeBytes
  const freeGb = freeBytes / 1e9
  return {
    path: storagePath, total_bytes: totalBytes, used_bytes: usedBytes,
    free_bytes: freeBytes, used_percent: totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0,
    warning: freeGb < 50 && freeGb >= 10, critical: freeGb < 10
  }
}

// ─── SETTINGS ───────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  storage_path: '', first_run_completed: false, kiosk_mode: false,
  auto_print: false, auto_sync: false, sync_interval: 'immediately',
  delete_local_after_sync: false, google_drive_connected: false,
  google_drive_email: null, camera_device_id: null, printer_name: null,
  booth_countdown_seconds: 3, booth_shot_count: 4,
  backup_folder: null, auto_backup: false,
  selected_template_id: 'classic-strip-4',
  booth_mode: 'photo' // 'photo' | 'video'
}

function getSettings() {
  const db = loadDB()
  const settings = { ...DEFAULT_SETTINGS, ...db.settings }
  if (!settings.storage_path) settings.storage_path = getDefaultStoragePath()
  settings.google_drive_connected = !!db.settings.backup_folder
  return settings
}

function updateSettings(partial: any) {
  const db = loadDB()
  db.settings = { ...db.settings, ...partial }
  saveDB(db)
  return getSettings()
}

// ─── CLOUD BACKUP ───────────────────────────────────────────────
function getBackupFolder(): string | null { return loadDB().settings.backup_folder || null }

function getBackupStats() {
  const f = getBackupFolder()
  if (!f) return { connected: false, totalFiles: 0, folder: null }
  try {
    const files = fs.readdirSync(f).filter(x => /\.(jpg|jpeg|png|gif|mp4|mov|webm)$/i.test(x))
    return { connected: true, totalFiles: files.length, folder: f }
  } catch (e: any) { return { connected: false, totalFiles: 0, folder: null } }
}

// v4.4.8: Backup struktur sama dengan local storage — hanya Photos/ dan Videos/
// {backupFolder}/Events/{EventName}/Photos/  → semua file foto
// {backupFolder}/Events/{EventName}/Videos/  → semua file video
function backupFile(localPath: string, filename?: string) {
  const f = getBackupFolder()
  if (!f) return { success: false, copied: false, message: 'No backup folder' }
  try {
    if (!fs.existsSync(localPath)) return { success: false, copied: false, message: 'Local not found' }

    const basename = path.basename(localPath)
    const ext = path.extname(localPath).toLowerCase()

    // v4.4.8: Cari nama event di path
    const normalizedLocal = localPath.replace(/\//g, path.sep)
    let eventName = 'Unknown-Event'
    const eventsIdx = normalizedLocal.indexOf(path.sep + 'Events' + path.sep)
    if (eventsIdx !== -1) {
      const afterEvents = normalizedLocal.substring(eventsIdx + path.sep.length + 'Events'.length + path.sep.length)
      const nextSep = afterEvents.indexOf(path.sep)
      if (nextSep !== -1) {
        eventName = afterEvents.substring(0, nextSep)
      }
    }

    // v4.4.8: Tentukan folder berdasarkan extension (bukan path)
    const isVideo = ['.webm', '.mp4', '.mov', '.avi'].includes(ext)
    const subFolder = isVideo ? 'Videos' : 'Photos'

    const dest = path.join(f, 'Events', eventName, subFolder, basename)
    const destDir = path.dirname(dest)

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true })
    }

    if (fs.existsSync(dest)) {
      if (fs.statSync(localPath).size === fs.statSync(dest).size) {
        return { success: true, copied: false, message: 'Already backed up' }
      }
    }

    fs.copyFileSync(localPath, dest)
    return { success: true, copied: true, message: 'OK' }
  } catch (e: any) {
    log(`Backup fail: ${e.message}`)
    return { success: false, copied: false, message: e.message }
  }
}

function backupAllPendingMedia() {
  const db = loadDB()
  if (!db.settings.auto_backup || !db.settings.backup_folder) return { backed: 0, skipped: 0, failed: 0 }
  let backed = 0, skipped = 0, failed = 0
  for (const m of db.media) {
    if (m.sync_status === 'SYNCED') { skipped++; continue }
    if (!fs.existsSync(m.original_path)) { failed++; continue }
    const r = backupFile(m.original_path, path.basename(m.original_path))
    if (r.success) { m.sync_status = 'SYNCED'; m.uploaded_at = new Date().toISOString(); backed++ }
    else failed++
  }
  saveDB(db)
  return { backed, skipped, failed }
}

// ─── EVENTS ─────────────────────────────────────────────────────
function generateEventCode(): string {
  const year = new Date().getFullYear()
  const db = loadDB()
  const count = db.events.filter((e: any) => e.code?.startsWith(`ARAY_EVENT_${year}_`)).length
  return `ARAY_EVENT_${year}_${String(count + 1).padStart(4, '0')}`
}

function createEvent(input: any) {
  const db = loadDB()
  const now = new Date().toISOString()
  const event = {
    id: crypto.randomUUID(), code: generateEventCode(), name: input.name,
    client: input.client || null, venue: input.venue || null,
    event_date: input.event_date || null, operator: input.operator || null,
    template_id: input.template_id || null,
    storage_path: '', google_drive_folder_id: null, sync_status: 'LOCAL_ONLY',
    status: 'active', created_at: now, updated_at: now
  }
  db.events.unshift(event); saveDB(db)
  ensureEventStorage(event); saveDB(loadDB())
  return event
}

function listEvents(includeArchived = false) {
  const db = loadDB()
  return includeArchived ? db.events.filter((e: any) => e.status !== 'deleted') : db.events.filter((e: any) => e.status === 'active')
}

function getEventById(id: string) { return loadDB().events.find((e: any) => e.id === id) || null }

function updateEvent(input: any) {
  const db = loadDB()
  const idx = db.events.findIndex((e: any) => e.id === input.id)
  if (idx === -1) return null
  db.events[idx] = { ...db.events[idx], ...input, updated_at: new Date().toISOString() }
  saveDB(db); return db.events[idx]
}

function deleteEvent(id: string) {
  const db = loadDB()
  const idx = db.events.findIndex((e: any) => e.id === id)
  if (idx === -1) return false
  db.events[idx].status = 'deleted'; saveDB(db); return true
}

// ─── SESSIONS & MEDIA ───────────────────────────────────────────
function createSession(eventId: string, type: string, shotCount = 1) {
  const db = loadDB()
  const s = { id: crypto.randomUUID(), event_id: eventId, type, shot_count: shotCount, created_at: new Date().toISOString() }
  db.sessions.unshift(s); saveDB(db); return s
}

function createMedia(input: any) {
  const db = loadDB()
  const m = {
    id: crypto.randomUUID(), event_id: input.event_id, session_id: input.session_id,
    type: input.type, original_path: input.original_path,
    processed_path: input.processed_path || null, thumbnail_path: input.thumbnail_path || null,
    checksum: input.checksum || null, sync_status: 'LOCAL_ONLY',
    remote_file_id: null, last_error: null,
    created_at: new Date().toISOString(), uploaded_at: null
  }
  db.media.unshift(m); saveDB(db); return m
}

function listMedia(filters: any = {}) {
  const db = loadDB()
  let r = db.media
  if (filters.event_id) r = r.filter((m: any) => m.event_id === filters.event_id)
  if (filters.type) r = r.filter((m: any) => m.type === filters.type)
  if (filters.sync_status) r = r.filter((m: any) => m.sync_status === filters.sync_status)
  return r.slice(filters.offset || 0, (filters.offset || 0) + (filters.limit || 500))
}

function getMediaStats(eventId?: string) {
  const db = loadDB()
  const f = eventId ? db.media.filter((m: any) => m.event_id === eventId) : db.media
  return {
    total: f.length,
    synced: f.filter((m: any) => m.sync_status === 'SYNCED').length,
    pending: f.filter((m: any) => ['PENDING','RETRYING','OFFLINE','LOCAL_ONLY'].includes(m.sync_status)).length,
    failed: f.filter((m: any) => m.sync_status === 'FAILED').length,
    uploading: f.filter((m: any) => m.sync_status === 'UPLOADING').length
  }
}

// ─── WINDOW ─────────────────────────────────────────────────────
function createWindow(): void {
  log('Creating main window...')
  const preloadPath = path.join(__dirname, 'preload.js')
  const rendererPath = path.join(__dirname, '..', 'out', 'renderer', 'index.html')
  log(`Preload: ${preloadPath} (exists: ${fs.existsSync(preloadPath)})`)
  log(`Renderer: ${rendererPath} (exists: ${fs.existsSync(rendererPath)})`)

  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1280, minHeight: 720,
    show: false,  // v4.4.2: Don't show until ready (fix blank screen on startup)
    autoHideMenuBar: true,
    title: 'ARAY — Are you Ready? and....Yapping!',
    backgroundColor: '#0F0B1A',
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: false, webSecurity: true }
  })

  // v4.4.2: Show window only when content is loaded — no blank screen
  mainWindow.once('ready-to-show', () => {
    log('Window ready-to-show — showing now')
    if (mainWindow) {
      mainWindow.show()
      // Optional: focus the window
      mainWindow.focus()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((d) => { shell.openExternal(d.url); return { action: 'deny' } })
  mainWindow.webContents.on('did-fail-load', (_e, c, desc, url) => log(`Renderer FAIL: ${c} ${desc} (${url})`))
  mainWindow.webContents.on('render-process-gone', (_e, d) => log(`Renderer CRASH: ${d.reason}`))
  mainWindow.on('closed', () => { mainWindow = null })

  if (process.env.ELECTRON_RENDERER_URL) {
    // Dev mode: Vite dev server (http://localhost:5173)
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    // Production: load via custom `app://` protocol (NOT file://).
    // This is critical — MediaPipe Hands uses fetch() to load WASM/data files,
    // and fetch() is blocked on file:// protocol. app:// supports fetch.
    mainWindow.loadURL('app://./index.html')
  }
  log('Main window created')
}

// ─── IPC ────────────────────────────────────────────────────────
function ok<T>(data: T) { return { success: true as const, data } }
function err(c: string, m: string) { return { success: false as const, error: { code: c, message: m } } }
function wrap<T>(fn: () => T | Promise<T>): Promise<any> {
  return Promise.resolve().then(() => fn()).then((d) => ok(d))
    .catch((e: Error) => { log(`IPC error: ${e.message}`); return err('INTERNAL_ERROR', e.message) })
}

function registerIPC() {
  ipcMain.handle('app.getVersion', () => wrap(() => app.getVersion()))
  ipcMain.handle('app.openExternal', (_e, url: string) => wrap(() => { shell.openExternal(url); return { success: true } }))

  // LICENSE — v4.4.0: Monthly license system (adaptasi dari Saatiril)
  const { checkLicenseStatus, activateLicense, getMachineId, getDisplayMachineId, generateLicenseCode } = require('./license')

  ipcMain.handle('license.status', () => {
    try {
      const status = checkLicenseStatus()
      log(`[license.status] isValid=${status.isValid}, expired=${status.isExpired}, daysRemaining=${status.daysRemaining}`)
      return { success: true, data: status }
    } catch (e: any) {
      log(`[license.status] Error: ${e.message}`)
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('license.activate', (_e, activationCode: string) => {
    try {
      log(`[license.activate] Attempting activation...`)
      const result = activateLicense(activationCode)
      if (result.success) {
        log(`[license.activate] Success: ${result.licenseType}`)
      } else {
        log(`[license.activate] Failed: ${result.error}`)
      }
      return result
    } catch (e: any) {
      log(`[license.activate] Error: ${e.message}`)
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('license.generate', (_e, machineId: string, adminKey: string) => {
    try {
      log(`[license.generate] Generating code for machine: ${machineId.substring(0, 12)}...`)
      const result = generateLicenseCode(machineId, adminKey)
      if (result.success) {
        log(`[license.generate] Success: code=${result.data?.activationCode}`)
      } else {
        log(`[license.generate] Failed: ${result.error}`)
      }
      return result
    } catch (e: any) {
      log(`[license.generate] Error: ${e.message}`)
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('license.getMachineId', () => {
    try {
      const mid = getMachineId()
      const display = getDisplayMachineId(mid)
      return { success: true, data: { machineId: mid, displayMachineId: display } }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // EVENTS
  ipcMain.handle('events.create', (_e, input: any) => wrap(() => createEvent(input)))
  ipcMain.handle('events.list', (_e, includeArchived?: boolean) => wrap(() => listEvents(includeArchived)))
  ipcMain.handle('events.get', (_e, id: string) => wrap(() => getEventById(id)))
  ipcMain.handle('events.update', (_e, input: any) => wrap(() => updateEvent(input)))
  ipcMain.handle('events.delete', (_e, id: string) => wrap(() => deleteEvent(id)))
  ipcMain.handle('events.archive', (_e, id: string) => wrap(() => updateEvent({ id, status: 'archived' })))
  ipcMain.handle('events.duplicate', (_e, id: string) => wrap(() => {
    const s = getEventById(id); if (!s) return null
    return createEvent({ name: `${s.name} (Copy)`, client: s.client, venue: s.venue, event_date: s.event_date, operator: s.operator })
  }))
  ipcMain.handle('events.openFolder', (_e, id: string) => wrap(() => {
    const event = getEventById(id); if (!event) throw new Error('Event not found')
    
    // Use stored storage_path if it exists
    let folderPath = event.storage_path
    if (!folderPath || !fs.existsSync(folderPath)) {
      // Re-compute and create if missing
      folderPath = ensureEventStorage(event)
    }
    
    console.log('[ARAY] Opening event folder:', folderPath)
    console.log('[ARAY] Event name:', event.name)
    console.log('[ARAY] Event storage_path:', event.storage_path)
    
    shell.openPath(folderPath)
    return { success: true, path: folderPath }
  }))

  // SESSIONS & MEDIA
  ipcMain.handle('sessions.create', (_e, eventId: string, type: string, shotCount?: number) => wrap(() => createSession(eventId, type, shotCount)))
  ipcMain.handle('media.list', (_e, filters?: any) => wrap(() => listMedia(filters || {})))
  ipcMain.handle('media.get', (_e, id: string) => wrap(() => loadDB().media.find((m: any) => m.id === id) || null))
  ipcMain.handle('media.delete', (_e, id: string) => wrap(() => {
    const db = loadDB(); const idx = db.media.findIndex((m: any) => m.id === id)
    if (idx === -1) return false
    db.media.splice(idx, 1); saveDB(db); return true
  }))
  ipcMain.handle('media.stats', (_e, eventId?: string) => wrap(() => getMediaStats(eventId)))

  // PHOTO CAPTURE
  ipcMain.handle('media.saveCapturedFrame', (_e, payload: any) => wrap(() => {
    const event = getEventById(payload.event_id); if (!event) throw new Error('Event not found')
    ensureEventStorage(event)
    const ext = payload.mime_type === 'image/png' ? 'png' : 'jpg'
    const paths = getPhotoPaths(event, payload.session_id, payload.shot_number, ext)
    const base64Data = payload.frame_base64.replace(/^data:image\/\w+;base64,/, '')
    fs.writeFileSync(paths.original, Buffer.from(base64Data, 'base64'))
    let thumbnailPath = null
    if (payload.thumbnail_base64) {
      try {
        const thumbData = payload.thumbnail_base64.replace(/^data:image\/\w+;base64,/, '')
        fs.writeFileSync(paths.thumbnail, Buffer.from(thumbData, 'base64'))
        thumbnailPath = paths.thumbnail
      } catch (e: any) { log(`Thumb fail: ${e.message}`) }
    }
    const checksum = calculateChecksum(paths.original)
    const media = createMedia({
      event_id: payload.event_id, session_id: payload.session_id, type: 'photo',
      original_path: paths.original, thumbnail_path: thumbnailPath, checksum
    })
    // Auto-backup
    const settings = getSettings()
    if (settings.auto_backup && settings.backup_folder) {
      const r = backupFile(paths.original, path.basename(paths.original))
      if (r.success) {
        const db = loadDB(); const idx = db.media.findIndex((m: any) => m.id === media.id)
        if (idx !== -1) { db.media[idx].sync_status = 'SYNCED'; db.media[idx].uploaded_at = new Date().toISOString(); saveDB(db) }
      }
    }
    return media
  }))

  // VIDEO CAPTURE (NEW)
  ipcMain.handle('media.saveVideo', (_e, payload: any) => wrap(() => {
    log(`[media.saveVideo] Request: event=${payload.event_id}, session=${payload.session_id}, mime=${payload.mime_type}, style=${payload.video_style}`)
    const event = getEventById(payload.event_id); if (!event) {
      log(`[media.saveVideo] Event not found: ${payload.event_id}`)
      throw new Error('Event not found')
    }
    ensureEventStorage(event)
    // v4.3.0: Validate session_id — harus ada, kalau tidak save akan fail
    if (!payload.session_id) {
      log(`[media.saveVideo] ERROR: session_id is missing`)
      throw new Error('session_id is required for video save')
    }
    const ext = payload.mime_type === 'video/mp4' ? 'mp4' : 'webm'
    const videoPath = getVideoPath(event, payload.session_id, ext)
    log(`[media.saveVideo] Saving to: ${videoPath}`)
    const base64Data = payload.video_base64.replace(/^data:video\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')
    log(`[media.saveVideo] Video buffer: ${buffer.length} bytes`)
    if (buffer.length === 0) {
      log(`[media.saveVideo] ERROR: video buffer is empty`)
      throw new Error('Video buffer is empty')
    }
    fs.writeFileSync(videoPath, buffer)
    const checksum = calculateChecksum(videoPath)
    const media = createMedia({
      event_id: payload.event_id, session_id: payload.session_id, type: 'video',
      original_path: videoPath, thumbnail_path: null, checksum
    })
    log(`[media.saveVideo] Video saved: ${path.basename(videoPath)} (media id: ${media.id})`)
    const settings = getSettings()
    if (settings.auto_backup && settings.backup_folder) {
      const r = backupFile(videoPath, path.basename(videoPath))
      if (r.success) {
        const db = loadDB(); const idx = db.media.findIndex((m: any) => m.id === media.id)
        if (idx !== -1) { db.media[idx].sync_status = 'SYNCED'; db.media[idx].uploaded_at = new Date().toISOString(); saveDB(db) }
      }
    }
    return media
  }))

  // COMPOSITE IMAGE (template result)
  ipcMain.handle('media.saveComposite', (_e, payload: any) => wrap(() => {
    const event = getEventById(payload.event_id); if (!event) throw new Error('Event not found')
    ensureEventStorage(event)
    const compositePath = getCompositePath(event, payload.session_id)
    const base64Data = payload.image_base64.replace(/^data:image\/\w+;base64,/, '')
    fs.writeFileSync(compositePath, Buffer.from(base64Data, 'base64'))
    const checksum = calculateChecksum(compositePath)
    const media = createMedia({
      event_id: payload.event_id, session_id: payload.session_id, type: 'photo',
      original_path: compositePath, thumbnail_path: compositePath, checksum,
      processed_path: compositePath
    })
    log(`Composite saved: ${path.basename(compositePath)}`)
    return media
  }))

  ipcMain.handle('media.readFile', (_e, filePath: string) => wrap(() => {
    if (!fs.existsSync(filePath)) throw new Error('File not found')
    return fs.readFileSync(filePath).toString('base64')
  }))

  // v4.3.5: New IPC — return file size info (untuk debug + check besar/kecil)
  ipcMain.handle('media.getFileInfo', (_e, filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' }
      }
      const stat = fs.statSync(filePath)
      return {
        success: true,
        data: {
          size: stat.size,
          sizeMB: Math.round(stat.size / 1024 / 1024 * 100) / 100,
          exists: true
        }
      }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // v4.3.5: Open folder + select file di Windows Explorer
  // Sebelumnya hanya buka event folder. Sekarang buka folder yang contain
  // file lalu select file tsb.
  ipcMain.handle('media.openInFolder', (_e, filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) {
        log(`[media.openInFolder] File not found: ${filePath}`)
        return { success: false, error: 'File not found' }
      }
      const { shell } = require('electron')
      // shell.showItemInFolder buka Explorer + select file
      shell.showItemInFolder(filePath)
      log(`[media.openInFolder] Opened: ${filePath}`)
      return { success: true }
    } catch (e: any) {
      log(`[media.openInFolder] Error: ${e.message}`)
      return { success: false, error: e.message }
    }
  })
  ipcMain.handle('media.updateSyncStatus', (_e, id: string, status: string, remoteId?: string, error?: string) => wrap(() => {
    const db = loadDB(); const idx = db.media.findIndex((m: any) => m.id === id)
    if (idx === -1) return { success: false }
    db.media[idx].sync_status = status; db.media[idx].last_error = error || null
    if (remoteId) db.media[idx].remote_file_id = remoteId
    if (status === 'SYNCED') db.media[idx].uploaded_at = new Date().toISOString()
    saveDB(db); return { success: true }
  }))

  // STORAGE
  ipcMain.handle('storage.getInfo', () => wrap(() => getStorageInfo()))
  ipcMain.handle('storage.getPath', () => wrap(() => getStoragePath()))
  ipcMain.handle('storage.setPath', (_e, p: string) => wrap(() => { updateSettings({ storage_path: p }); ensureStoragePath(); return getSettings() }))
  ipcMain.handle('storage.chooseFolder', () => wrap(async () => {
    const r = await dialog.showOpenDialog({ title: 'Where should ARAY save your memories?', properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? { canceled: true, path: null } : { canceled: false, path: r.filePaths[0] }
  }))
  ipcMain.handle('storage.openFolder', (_e, p: string) => wrap(() => { shell.openPath(p); return { success: true } }))
  ipcMain.handle('storage.ensure', () => wrap(() => { ensureStoragePath(); return { success: true } }))

  // CAMERA
  ipcMain.handle('camera.list', () => wrap(() => []))
  ipcMain.handle('camera.connect', () => wrap(() => true))
  ipcMain.handle('camera.disconnect', () => wrap(() => undefined))

  // SETTINGS
  ipcMain.handle('settings.get', () => wrap(() => getSettings()))
  ipcMain.handle('settings.update', (_e, partial: any) => wrap(() => updateSettings(partial)))
  ipcMain.handle('settings.getDefaultStoragePath', () => wrap(() => getDefaultStoragePath()))

  // PRINT — v4.2.4: Real printer detection + actual printing
  // List printers — v4.3.1: Multi-strategy detection.
  // Strategy 1: Electron's win.webContents.getPrinters()
  // Strategy 2: Windows PowerShell Get-Printer (fallback)
  // Strategy 3: wmic printer get (legacy fallback)
  ipcMain.handle('print.listPrinters', async () => {
    try {
      log('[print.listPrinters] Starting printer detection...')

      // ─── Strategy 1: Electron getPrinters() ───────────────────
      let printers: any[] = []
      if (mainWindow) {
        try {
          log('[print.listPrinters] Strategy 1: Electron getPrinters()...')
          printers = await mainWindow.webContents.getPrinters()
          log(`[print.listPrinters] Strategy 1 found ${printers.length} printer(s)`)
          printers.forEach(p => log(`  - ${p.name} (${p.displayName || 'no display name'}) status=${p.status} isDefault=${p.isDefault}`))
        } catch (e: any) {
          log(`[print.listPrinters] Strategy 1 failed: ${e.message}`)
        }
      }

      // ─── Strategy 2: PowerShell Get-Printer (fallback) ────────
      if (printers.length === 0 && process.platform === 'win32') {
        try {
          log('[print.listPrinters] Strategy 2: PowerShell Get-Printer...')
          const { execSync } = require('child_process')
          const output = execSync(
            'powershell -Command "Get-Printer | Select-Object Name, Shared, PortName | ConvertTo-Json"',
            { timeout: 10000, encoding: 'utf8', windowsHide: true }
          )
          log(`[print.listPrinters] PowerShell output: ${output.substring(0, 500)}`)
          const parsed = JSON.parse(output)
          const psPrinters = Array.isArray(parsed) ? parsed : [parsed]
          printers = psPrinters.map((p: any) => ({
            name: p.Name,
            displayName: p.Name,
            isDefault: false,
            status: 0,
            isDefault: false
          }))
          log(`[print.listPrinters] Strategy 2 found ${printers.length} printer(s)`)
        } catch (e: any) {
          log(`[print.listPrinters] Strategy 2 failed: ${e.message}`)
        }
      }

      // ─── Strategy 3: wmic (legacy fallback) ───────────────────
      if (printers.length === 0 && process.platform === 'win32') {
        try {
          log('[print.listPrinters] Strategy 3: wmic printer get...')
          const { execSync } = require('child_process')
          const output = execSync(
            'wmic printer get Name,Default /format:csv',
            { timeout: 10000, encoding: 'utf8', windowsHide: true }
          )
          log(`[print.listPrinters] wmic output: ${output.substring(0, 500)}`)
          const lines = output.split('\n').filter((l: string) => l.trim() && !l.includes('Node,'))
          printers = lines.map((line: string) => {
            const parts = line.split(',').map((s: string) => s.trim()).filter(Boolean)
            if (parts.length >= 2) {
              return { name: parts[1], displayName: parts[1], isDefault: parts[0] === 'TRUE', status: 0 }
            }
            return null
          }).filter(Boolean)
          log(`[print.listPrinters] Strategy 3 found ${printers.length} printer(s)`)
        } catch (e: any) {
          log(`[print.listPrinters] Strategy 3 failed: ${e.message}`)
        }
      }

      const result = printers.map(p => ({
        id: p.name,
        name: p.displayName || p.name,
        is_default: p.isDefault || false,
        status: p.status || 0,
        is_connected: (p.status || 0) === 0
      }))

      log(`[print.listPrinters] Final result: ${result.length} printer(s)`)
      return { success: true, data: result }
    } catch (e: any) {
      log(`[print.listPrinters] Fatal error: ${e.message}`)
      log(`[print.listPrinters] Stack: ${e.stack}`)
      return { success: false, error: { code: 'PRINTER_DETECT_FAILED', message: e.message } }
    }
  })

  // Print queue — v4.3.3: Apply print settings (paper size, color, copies, dll)
  // Reads the media file, creates a hidden BrowserWindow, loads the image with
  // CSS berdasarkan settings, and calls webContents.print() dengan options.
  ipcMain.handle('print.queue', async (_e, mediaId: string, printerName?: string, copies?: number, printSettings?: any) => {
    try {
      log(`[print.queue] Request: mediaId=${mediaId}, printer=${printerName || 'default'}, copies=${copies || 1}`)
      log(`[print.queue] Print settings:`, JSON.stringify(printSettings || {}))

      // Find media in DB to get file path
      const db = loadDB()
      const media = db.media.find((m: any) => m.id === mediaId)
      if (!media) {
        log(`[print.queue] Media not found: ${mediaId}`)
        return { success: false, error: 'Media not found' }
      }

      const filePath = media.processed_path || media.original_path
      if (!filePath || !fs.existsSync(filePath)) {
        log(`[print.queue] File not found: ${filePath}`)
        return { success: false, error: 'File not found: ' + filePath }
      }

      log(`[print.queue] Printing file: ${filePath}`)

      // Read file as base64
      const buffer = fs.readFileSync(filePath)
      const ext = path.extname(filePath).toLowerCase().slice(1)
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
      const base64 = buffer.toString('base64')
      const dataUrl = `data:${mime};base64,${base64}`

      // v4.3.3: Apply print settings to HTML CSS
      const paperSize = printSettings?.paper_size || '4x6'
      const orientation = printSettings?.orientation || 'portrait'
      const fit = printSettings?.fit || 'contain'
      const color = printSettings?.color !== false  // default true
      const quality = printSettings?.quality || 'normal'

      // Paper dimensions in mm (for @page size)
      const paperDims: Record<string, { w: number; h: number }> = {
        '4x6': { w: 102, h: 152 },    // 4×6 inch
        '5x7': { w: 127, h: 178 },    // 5×7 inch
        'A6': { w: 105, h: 148 },
        'A4': { w: 210, h: 297 },
        'Letter': { w: 216, h: 279 }  // 8.5×11 inch
      }
      // v4.3.6: Support custom paper size
      let dims: { w: number; h: number }
      if (paperSize === 'custom') {
        const customW = parseInt(printSettings?.custom_width) || 100
        const customH = parseInt(printSettings?.custom_height) || 150
        dims = { w: customW, h: customH }
        log(`[print.queue] Custom paper size: ${customW}x${customH}mm`)
      } else {
        dims = paperDims[paperSize] || paperDims['4x6']
      }
      // Swap if landscape
      const pageW = orientation === 'landscape' ? dims.h : dims.w
      const pageH = orientation === 'landscape' ? dims.w : dims.h

      // CSS filter for grayscale
      const grayscaleFilter = color ? '' : 'filter: grayscale(100%);'

      // object-fit: contain (utuh) atau cover (penuh)
      const objectFit = fit === 'cover' ? 'cover' : 'contain'

      // Create a hidden window for printing
      const { BrowserWindow } = require('electron')
      const printWin = new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: { offscreen: true }
      })

      // Load HTML with image + print settings applied via CSS
      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page {
    size: ${pageW}mm ${pageH}mm;
    margin: 0;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: ${pageW}mm;
    height: ${pageH}mm;
    overflow: hidden;
  }
  body {
    display: flex;
    justify-content: center;
    align-items: center;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: ${objectFit};
    ${grayscaleFilter}
  }
</style>
</head>
<body>
  <img src="${dataUrl}" />
</body>
</html>`

      await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))

      // Print options — apply settings
      const printOptions: any = {
        silent: true,
        printBackground: true,
        copies: copies || parseInt(printSettings?.copies) || 1,
        // v4.3.3: paperSize di-set via @page CSS di HTML (lebih reliable)
        // deviceName untuk pilih printer
      }
      if (printerName && printerName !== 'Default') {
        printOptions.deviceName = printerName
      }

      // Quality — set DPI berdasarkan quality
      if (quality === 'high') {
        printOptions.dpi = [600, 600]
      } else if (quality === 'draft') {
        printOptions.dpi = [150, 150]
      }
      // normal = default (300dpi)

      log(`[print.queue] Print options:`, JSON.stringify(printOptions))

      return new Promise((resolve) => {
        printWin.webContents.print(printOptions, (success: boolean, failureReason: string) => {
          log(`[print.queue] Print callback: success=${success}, reason=${failureReason || 'none'}`)
          printWin.close()
          if (success) {
            resolve({
              success: true,
              data: {
                id: crypto.randomUUID(),
                media_id: mediaId,
                printer_name: printerName || 'Default',
                paper_size: paperSize,
                copies: printOptions.copies,
                status: 'printed',
                created_at: new Date().toISOString(),
                completed_at: new Date().toISOString(),
                error: null
              }
            })
          } else {
            resolve({ success: false, error: failureReason || 'Print failed' })
          }
        })
      })
    } catch (e: any) {
      log(`[print.queue] Error: ${e.message}`)
      return { success: false, error: e.message }
    }
  })

  // GOOGLE DRIVE
  ipcMain.handle('googleDrive.connect', () => wrap(async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select your Google Drive folder (or any cloud sync folder)',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Set as Cloud Backup Folder'
    })
    if (result.canceled || result.filePaths.length === 0) return { connected: false, message: 'No folder selected' }
    const folder = result.filePaths[0]
    updateSettings({ backup_folder: folder })
    log(`Cloud backup folder set: ${folder}`)
    return { connected: true, folder, message: `Connected to ${folder}` }
  }))
  ipcMain.handle('googleDrive.disconnect', () => wrap(() => {
    updateSettings({ backup_folder: null, auto_backup: false })
    return { success: true }
  }))
  ipcMain.handle('googleDrive.status', () => wrap(() => {
    const stats = getBackupStats()
    return { connected: stats.connected, folder: stats.folder, totalFiles: stats.totalFiles,
      message: stats.connected ? `Backing up to: ${stats.folder}` : 'Not connected' }
  }))

  // SYNC
  ipcMain.handle('sync.start', () => wrap(() => { return { started: true, ...backupAllPendingMedia() } }))
  ipcMain.handle('sync.pause', () => wrap(() => ({ paused: true })))
  ipcMain.handle('sync.resume', () => wrap(() => { return { resumed: true, ...backupAllPendingMedia() } }))
  ipcMain.handle('sync.retry', () => wrap(() => { return { retrying: true, ...backupAllPendingMedia() } }))
  ipcMain.handle('sync.summary', (_e, eventId?: string) => wrap(() => getMediaStats(eventId)))

  log('All IPC handlers registered')
}

// ─── APP LIFECYCLE ──────────────────────────────────────────────

// v4.0.9: Register custom `app://` protocol BEFORE app is ready.
// This is critical for MediaPipe Hands (palm trigger) to work in production.
//
// WHY: In production, Electron loads the renderer via `file://` protocol
// (loadFile). MediaPipe's WASM loader uses `fetch()` internally to load
// `.wasm` and `.data` files. `fetch()` on `file://` is blocked/restricted
// in Chromium, so MediaPipe fails silently — palm trigger never starts.
//
// Saatiril (web app) works because it serves via `http://`, where fetch
// works fine. We replicate that by registering `app://` with:
//   - supportFetchAPI: true  → fetch() works
//   - corsEnabled: true      → no CORS errors
//   - secure: true           → treated as secure origin (no mixed-content)
//   - standard: true         → behaves like https:// for relative URLs
//
// Then we load the renderer via `app://./index.html` instead of `loadFile()`.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  },
  // v4.3.5: aray-file:// protocol untuk stream video/media langsung dari disk.
  // Ini menghindari base64 data URL yang bisa choke Chromium pada file besar.
  // Renderer pakai: <video src="aray-file:///C:/Users/.../video.webm">
  {
    scheme: 'aray-file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: true
    }
  }
])

app.whenReady().then(() => {
  log('========================================')
  log('ARAY starting up (v2.0.0 — Photo + Video + Templates)')
  log(`Version: ${app.getVersion()}`)
  log(`Electron: ${process.versions.electron}`)
  log(`Node: ${process.versions.node}`)
  log(`Platform: ${process.platform} ${process.arch}`)
  log(`__dirname: ${__dirname}`)
  log(`userData: ${app.getPath('userData')}`)
  log('========================================')

  // v4.0.9: Register `app://` protocol handler — serves renderer files
  // with proper fetch/CORS support so MediaPipe WASM can load.
  const rendererDir = path.join(__dirname, '..', 'out', 'renderer')
  protocol.handle('app', (request) => {
    try {
      // Parse the URL: app://./index.html → path = index.html
      // app://./mediapipe/hands.js → path = mediapipe/hands.js
      let urlPath = request.url.replace(/^app:\/\/\.?\//, '')
      // Decode URI component for filenames with spaces
      urlPath = decodeURIComponent(urlPath)
      // Resolve against renderer dir, prevent path traversal
      const filePath = path.resolve(rendererDir, urlPath)
      if (!filePath.startsWith(path.resolve(rendererDir))) {
        return new Response('Forbidden', { status: 403 })
      }
      // Read file and return with correct MIME type
      if (!fs.existsSync(filePath)) {
        log(`[app://] 404: ${urlPath}`)
        return new Response('Not Found', { status: 404 })
      }
      const buffer = fs.readFileSync(filePath)
      const ext = path.extname(filePath).toLowerCase()
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.mjs': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.wasm': 'application/wasm',
        '.data': 'application/octet-stream',
        '.tflite': 'application/octet-stream',
        '.binarypb': 'application/octet-stream'
      }
      const mime = mimeTypes[ext] || 'application/octet-stream'
      // v4.4.2: Cache static assets (JS, CSS, fonts) for faster startup.
      // Only no-cache for HTML (so updates take effect).
      const isHtml = ext === '.html'
      const headers = new Headers({
        'Content-Type': mime,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=86400'
      })
      return new Response(buffer, { status: 200, headers })
    } catch (e: any) {
      log(`[app://] Error serving ${request.url}: ${e.message}`)
      return new Response('Internal Error', { status: 500 })
    }
  })
  log(`app:// protocol registered — serving from ${rendererDir}`)

  // v4.3.6: Register aray-file:// protocol — serve media files from disk.
  // v4.3.6 FIX: Pakai buffer langsung (bukan stream) untuk reliability.
  // Stream (Readable.toWeb) bisa fail di beberapa Node version.
  // Buffer lebih reliable untuk video playback.
  protocol.handle('aray-file', (request) => {
    try {
      // Parse URL: aray-file:///C%3A%2FUsers%2F...%2Ffile.webm
      // atau: aray-file:///C:/Users/.../file.webm
      let urlPath = request.url.replace(/^aray-file:\/\/\/?/, '')
      // Decode URI component (handle spaces, special chars)
      urlPath = decodeURIComponent(urlPath)
      // Fix Windows path: /C:/Users -> C:\Users
      const filePath = process.platform === 'win32'
        ? urlPath.replace(/\//g, '\\')
        : urlPath

      log(`[aray-file://] Request: ${request.url.substring(0, 100)}... -> ${filePath}`)

      if (!fs.existsSync(filePath)) {
        log(`[aray-file://] 404: ${filePath}`)
        return new Response('Not Found', { status: 404 })
      }

      const stat = fs.statSync(filePath)
      log(`[aray-file://] File size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`)

      const ext = path.extname(filePath).toLowerCase()
      const mimeTypes: Record<string, string> = {
        '.webm': 'video/webm',
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif'
      }
      const mime = mimeTypes[ext] || 'application/octet-stream'

      // v4.3.6: Read file ke buffer langsung (bukan stream) — lebih reliable.
      // Untuk video besar (20-50MB), buffer OK di Electron.
      const buffer = fs.readFileSync(filePath)

      const headers = new Headers({
        'Content-Type': mime,
        'Access-Control-Allow-Origin': '*',
        'Accept-Ranges': 'bytes',
        'Content-Length': stat.size.toString()
      })

      // Support Range requests untuk video seek
      const range = request.headers.get('range')
      if (range) {
        // Parse: bytes=start-end
        const match = range.match(/bytes=(\d+)-(\d*)/)
        if (match) {
          const start = parseInt(match[1])
          const end = match[2] ? parseInt(match[2]) : stat.size - 1
          const chunkSize = end - start + 1
          const chunk = buffer.subarray(start, end + 1)
          log(`[aray-file://] Range: ${start}-${end} (${chunkSize} bytes)`)
          return new Response(chunk as any, {
            status: 206,
            headers: new Headers({
              'Content-Type': mime,
              'Content-Range': `bytes ${start}-${end}/${stat.size}`,
              'Content-Length': chunkSize.toString(),
              'Accept-Ranges': 'bytes',
              'Access-Control-Allow-Origin': '*'
            })
          })
        }
      }

      return new Response(buffer as any, { status: 200, headers })
    } catch (e: any) {
      log(`[aray-file://] Error: ${e.message}`)
      log(`[aray-file://] Stack: ${e.stack}`)
      return new Response('Internal Error', { status: 500 })
    }
  })
  log(`aray-file:// protocol registered — streaming media from disk`)

  try {
    ensureStoragePath(); log('Storage path ensured')
    registerIPC()
    createWindow(); log('Window created successfully')

    // Register kiosk exit shortcut: Ctrl+Shift+Alt+Q
    // v4.1.5: Pastikan shortcut ter-register dengan logging yang jelas.
    // Shortcut ini toggle kiosk_mode OFF (jika sedang ON).
    try {
      const registered = globalShortcut.register('Ctrl+Shift+Alt+Q', () => {
        log('Kiosk exit shortcut pressed: Ctrl+Shift+Alt+Q')
        const db = loadDB()
        if (db.settings.kiosk_mode) {
          db.settings.kiosk_mode = false
          saveDB(db)
          log('Kiosk mode disabled via shortcut — reloading window')
          if (mainWindow) {
            mainWindow.reload()
          }
        } else {
          log('Kiosk mode not active — shortcut ignored')
        }
      })
      if (registered) {
        log('Kiosk exit shortcut registered: Ctrl+Shift+Alt+Q')
      } else {
        log('WARNING: Failed to register kiosk exit shortcut (Ctrl+Shift+Alt+Q)')
      }
    } catch (e: any) {
      log(`ERROR registering kiosk shortcut: ${e.message}`)
    }

    // v4.1.5: Juga register shortcut yang lebih mudah: Ctrl+Shift+Q (tanpa Alt)
    // sebagai backup kalau Ctrl+Shift+Alt+Q susah ditekan bersamaan.
    try {
      const registered2 = globalShortcut.register('Ctrl+Shift+Q', () => {
        log('Kiosk exit shortcut pressed: Ctrl+Shift+Q (backup)')
        const db = loadDB()
        if (db.settings.kiosk_mode) {
          db.settings.kiosk_mode = false
          saveDB(db)
          log('Kiosk mode disabled via backup shortcut — reloading window')
          if (mainWindow) {
            mainWindow.reload()
          }
        }
      })
      if (registered2) {
        log('Backup kiosk shortcut registered: Ctrl+Shift+Q')
      }
    } catch (e: any) {
      log(`ERROR registering backup kiosk shortcut: ${e.message}`)
    }
  } catch (err: any) {
    log(`STARTUP ERROR: ${err.message}`); log(`Stack: ${err.stack}`)
    dialog.showErrorBox('ARAY — Error', `${err.message}\n\nLog: ${getLogPath()}`)
    app.quit()
  }

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// v4.5.1: Flush DB cache to disk on quit (saveDB is debounced, need to force write)
app.on('before-quit', () => {
  log('[App] before-quit — flushing DB to disk')
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (dbCache) {
    try {
      const dbPath = getDbPath()
      const tmpPath = dbPath + '.tmp'
      fs.writeFileSync(tmpPath, JSON.stringify(dbCache, null, 2), 'utf8')
      fs.renameSync(tmpPath, dbPath)
      log('[App] DB flushed successfully')
    } catch (e: any) {
      log(`[App] DB flush error: ${e.message}`)
    }
  }
})

process.on('uncaughtException', (err) => { log(`UNCAUGHT: ${err.message}`); log(`Stack: ${err.stack}`) })
process.on('unhandledRejection', (r) => { log(`UNHANDLED: ${String(r)}`) })
