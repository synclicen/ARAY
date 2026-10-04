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
  try { fs.appendFileSync(getLogPath(), line) } catch {}
  console.log(`[ARAY] ${msg}`)
}

// ─── JSON DATABASE ──────────────────────────────────────────────
function getDbPath(): string {
  const dir = path.join(app.getPath('userData'), 'database')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, 'data.json')
}

function loadDB(): any {
  try {
    const dbPath = getDbPath()
    if (!fs.existsSync(dbPath)) {
      const empty = { events: [], sessions: [], media: [], settings: {} }
      saveDB(empty); return empty
    }
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'))
    return { events: data.events || [], sessions: data.sessions || [], media: data.media || [], settings: data.settings || {} }
  } catch (err: any) { log(`DB load error: ${err.message}`); return { events: [], sessions: [], media: [], settings: {} } }
}

function saveDB(db: any): void {
  try {
    const dbPath = getDbPath()
    const tmpPath = dbPath + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf8')
    fs.renameSync(tmpPath, dbPath)
  } catch (err: any) { log(`DB save error: ${err.message}`) }
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
    // Make sure subdirs exist
    for (const sub of ['Photos/Original', 'Photos/Edited', 'Photos/Prints', 'Photos/Thumbnails',
      'Videos/Original', 'Videos/Edited', 'GIF', 'Boomerang', '360', 'Metadata']) {
      const p = path.join(event.storage_path, sub)
      if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
    }
    return event.storage_path
  }

  // Otherwise compute from storage base + event name
  const base = ensureStoragePath()
  const eventPath = path.join(base, 'Events', buildEventFolderName(event))
  for (const sub of ['Photos/Original', 'Photos/Edited', 'Photos/Prints', 'Photos/Thumbnails',
    'Videos/Original', 'Videos/Edited', 'GIF', 'Boomerang', '360', 'Metadata']) {
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
  const eventDir = path.join(eventPath, 'Photos')
  // Short filename: EventName_001.jpg (event name + shot number)
  const eventName = sanitizeFilename(event.name || 'ARAY')
  const filename = `${eventName}_${String(shotNumber).padStart(2, '0')}`
  return {
    original: path.join(eventDir, 'Original', `${filename}.${ext}`),
    thumbnail: path.join(eventDir, 'Thumbnails', `${filename}_thumb.${ext}`)
  }
}

function getVideoPath(event: any, sessionId: string, ext = 'webm'): string {
  const eventPath = ensureEventStorage(event)
  const eventName = sanitizeFilename(event.name || 'ARAY')
  return path.join(eventPath, 'Videos', 'Original', `${eventName}.webm`)
}

function getCompositePath(event: any, sessionId: string): string {
  const eventPath = ensureEventStorage(event)
  const eventName = sanitizeFilename(event.name || 'ARAY')
  // v4.0.5: include sessionId in filename so each session gets a unique file.
  // Before this, all composites in the same event overwrote the same file
  // (`{eventName}_composite.jpg`), causing the Gallery to show N identical
  // thumbnails pointing to 1 file on disk.
  const sid = (sessionId || '').slice(0, 8)
  return path.join(eventPath, 'Photos', 'Prints', `${eventName}_${sid}_composite.jpg`)
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

function backupFile(localPath: string, filename?: string) {
  const f = getBackupFolder()
  if (!f) return { success: false, copied: false, message: 'No backup folder' }
  try {
    if (!fs.existsSync(localPath)) return { success: false, copied: false, message: 'Local not found' }
    if (!fs.existsSync(f)) fs.mkdirSync(f, { recursive: true })
    const dest = path.join(f, filename || path.basename(localPath))
    if (fs.existsSync(dest)) {
      if (fs.statSync(localPath).size === fs.statSync(dest).size) return { success: true, copied: false, message: 'Already' }
    }
    fs.copyFileSync(localPath, dest)
    return { success: true, copied: true, message: 'OK' }
  } catch (e: any) { log(`Backup fail: ${e.message}`); return { success: false, copied: false, message: e.message } }
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
    show: true, autoHideMenuBar: true,
    title: 'ARAY — Are you Ready? and....Yapping!',
    backgroundColor: '#0F0B1A',
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: false, webSecurity: true }
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
    const event = getEventById(payload.event_id); if (!event) throw new Error('Event not found')
    ensureEventStorage(event)
    const ext = payload.mime_type === 'video/mp4' ? 'mp4' : 'webm'
    const videoPath = getVideoPath(event, payload.session_id, ext)
    const base64Data = payload.video_base64.replace(/^data:video\/\w+;base64,/, '')
    fs.writeFileSync(videoPath, Buffer.from(base64Data, 'base64'))
    const checksum = calculateChecksum(videoPath)
    const media = createMedia({
      event_id: payload.event_id, session_id: payload.session_id, type: 'video',
      original_path: videoPath, thumbnail_path: null, checksum
    })
    log(`Video saved: ${path.basename(videoPath)}`)
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
  // List printers pakai Electron's win.webContents.getPrinters()
  // v4.2.4 FIX: Return {success, data} langsung (bukan wrap) untuk eliminasi ambiguity.
  // v4.2.3 bug: wrap(() => result) di async handler — wrap eksekusi fn, return ok(fn()),
  //   tapi kalau fn throw, catch return err. Sebenarnya OK, tapi mari simplify.
  ipcMain.handle('print.listPrinters', async () => {
    try {
      if (!mainWindow) {
        log('[print.listPrinters] No main window')
        return { success: true, data: [] }
      }
      log('[print.listPrinters] Calling mainWindow.webContents.getPrinters()...')
      const printers = await mainWindow.webContents.getPrinters()
      log(`[print.listPrinters] Found ${printers.length} printer(s):`)
      printers.forEach(p => log(`  - ${p.name} (${p.displayName || 'no display name'}) status=${p.status} isDefault=${p.isDefault}`))
      const result = printers.map(p => ({
        id: p.name,
        name: p.displayName || p.name,
        is_default: p.isDefault,
        status: p.status,
        is_connected: p.status === 0  // 0 = ready
      }))
      return { success: true, data: result }
    } catch (e: any) {
      log(`[print.listPrinters] Error: ${e.message}`)
      log(`[print.listPrinters] Stack: ${e.stack}`)
      return { success: false, error: { code: 'PRINTER_DETECT_FAILED', message: e.message } }
    }
  })

  // Print queue — v4.2.2: Actually print the file to the selected printer.
  // Reads the media file, creates a hidden BrowserWindow, loads the image,
  // and calls webContents.print() with the selected printer.
  ipcMain.handle('print.queue', async (_e, mediaId: string, printerName?: string, copies?: number) => {
    try {
      log(`[print.queue] Request: mediaId=${mediaId}, printer=${printerName || 'default'}, copies=${copies || 1}`)

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

      // Create a hidden window for printing
      const { BrowserWindow } = require('electron')
      const printWin = new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: { offscreen: true }
      })

      // Load HTML with the image, sized to fit page
      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { margin: 0; }
  body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
  img { max-width: 100%; max-height: 100vh; object-fit: contain; }
</style>
</head>
<body>
  <img src="${dataUrl}" />
</body>
</html>`

      await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))

      // Print — use silent print if printerName provided, else default
      const printOptions: any = {
        silent: true,
        printBackground: true,
        copies: copies || 1
      }
      if (printerName && printerName !== 'Default') {
        printOptions.deviceName = printerName
      }

      log(`[print.queue] Print options:`, JSON.stringify(printOptions))

      return new Promise((resolve) => {
        printWin.webContents.print(printOptions, (success: boolean, failureReason: string) => {
          log(`[print.queue] Print callback: success=${success}, reason=${failureReason || 'none'}`)
          printWin.close()
          if (success) {
            resolve(wrap(() => ({
              id: crypto.randomUUID(),
              media_id: mediaId,
              printer_name: printerName || 'Default',
              paper_size: '4x6',
              copies: copies || 1,
              status: 'printed',
              created_at: new Date().toISOString(),
              completed_at: new Date().toISOString(),
              error: null
            })))
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
      // Add CORS headers so fetch() from the page works
      const headers = new Headers({
        'Content-Type': mime,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      })
      return new Response(buffer, { status: 200, headers })
    } catch (e: any) {
      log(`[app://] Error serving ${request.url}: ${e.message}`)
      return new Response('Internal Error', { status: 500 })
    }
  })
  log(`app:// protocol registered — serving from ${rendererDir}`)

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
process.on('uncaughtException', (err) => { log(`UNCAUGHT: ${err.message}`); log(`Stack: ${err.stack}`) })
process.on('unhandledRejection', (r) => { log(`UNHANDLED: ${String(r)}`) })
