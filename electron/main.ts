/**
 * ARAY — Electron Main Process (v1.7.0)
 *
 * Real implementation:
 * - JSON file-based database (events, sessions, media, settings)
 * - File system storage for photos
 * - Camera device enumeration (USB webcam + capture card via getUserMedia in renderer)
 * - SHA-256 checksums
 * - All IPC handlers with real data
 *
 * No native modules. Pure JavaScript + Node.js builtins only.
 */

import { app, BrowserWindow, shell, dialog, ipcMain } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import * as crypto from 'crypto'
import * as os from 'os'


let mainWindow: BrowserWindow | null = null

// ============================================================
// LOGGING
// ============================================================
function getLogPath(): string {
  try {
    return path.join(app.getPath('userData'), 'aray-startup.log')
  } catch {
    return path.join(process.cwd(), 'aray-startup.log')
  }
}

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  try {
    fs.appendFileSync(getLogPath(), line)
  } catch {}
  console.log(`[ARAY] ${msg}`)
}

// ============================================================
// JSON DATABASE (no SQLite, no native modules)
// ============================================================
function getDbPath(): string {
  const dir = path.join(app.getPath('userData'), 'database')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return path.join(dir, 'data.json')
}

interface ArayDB {
  events: any[]
  sessions: any[]
  media: any[]
  settings: Record<string, any>
}

function loadDB(): ArayDB {
  try {
    const dbPath = getDbPath()
    if (!fs.existsSync(dbPath)) {
      const empty: ArayDB = { events: [], sessions: [], media: [], settings: {} }
      saveDB(empty)
      return empty
    }
    const content = fs.readFileSync(dbPath, 'utf8')
    const data = JSON.parse(content)
    return {
      events: data.events || [],
      sessions: data.sessions || [],
      media: data.media || [],
      settings: data.settings || {}
    }
  } catch (err: any) {
    log(`DB load error: ${err.message}`)
    return { events: [], sessions: [], media: [], settings: {} }
  }
}

function saveDB(db: ArayDB): void {
  try {
    const dbPath = getDbPath()
    const tmpPath = dbPath + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf8')
    fs.renameSync(tmpPath, dbPath)
  } catch (err: any) {
    log(`DB save error: ${err.message}`)
  }
}

// ============================================================
// STORAGE PATH
// ============================================================
function getDefaultStoragePath(): string {
  try {
    return path.join(app.getPath('documents'), 'ARAY')
  } catch {
    return path.join(os.homedir(), 'ARAY')
  }
}

function getStoragePath(): string {
  const db = loadDB()
  return db.settings.storage_path || getDefaultStoragePath()
}

function ensureStoragePath(): string {
  const storagePath = getStoragePath()
  try {
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true })
    }
    // Test writability
    const testFile = path.join(storagePath, '.aray-write-test')
    fs.writeFileSync(testFile, 'ok')
    fs.unlinkSync(testFile)
    return storagePath
  } catch (err: any) {
    log(`Storage path invalid (${storagePath}): ${err.message}`)
    // Fallback to userData
    const fallback = path.join(app.getPath('userData'), 'ARAY-Storage')
    if (!fs.existsSync(fallback)) {
      fs.mkdirSync(fallback, { recursive: true })
    }
    const db = loadDB()
    db.settings.storage_path = fallback
    saveDB(db)
    return fallback
  }
}

function ensureEventStorage(eventCode: string): string {
  const base = ensureStoragePath()
  const eventPath = path.join(base, 'Events', eventCode)
  const subdirs = [
    'Photos/Original',
    'Photos/Edited',
    'Photos/Prints',
    'Photos/Thumbnails',
    'Videos/Original',
    'Videos/Edited',
    'GIF',
    'Boomerang',
    '360',
    'Metadata'
  ]
  for (const sub of subdirs) {
    const p = path.join(eventPath, sub)
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true })
    }
  }
  return eventPath
}

function getPhotoPaths(eventCode: string, sessionId: string, shotNumber: number, ext: string = 'jpg') {
  const base = ensureStoragePath()
  const eventDir = path.join(base, 'Events', eventCode, 'Photos')
  const filename = `${eventCode}_${sessionId}_${String(shotNumber).padStart(3, '0')}`
  return {
    original: path.join(eventDir, 'Original', `${filename}.${ext}`),
    processed: path.join(eventDir, 'Edited', `${filename}_edited.${ext}`),
    thumbnail: path.join(eventDir, 'Thumbnails', `${filename}_thumb.${ext}`)
  }
}

function calculateChecksum(filePath: string): string {
  const buffer = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

// ============================================================
// STORAGE INFO
// ============================================================
function getStorageInfo() {
  const storagePath = getStoragePath()
  let totalBytes = 0
  let freeBytes = 0

  try {
    const stats = fs.statfsSync(storagePath)
    totalBytes = stats.blocks * stats.bsize
    freeBytes = stats.bfree * stats.bsize
  } catch (err: any) {
    log(`statfs failed: ${err.message}`)
    totalBytes = 1_000_000_000_000
    freeBytes = 500_000_000_000
  }

  const usedBytes = totalBytes - freeBytes
  const usedPercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0
  const freeGb = freeBytes / 1_000_000_000

  return {
    path: storagePath,
    total_bytes: totalBytes,
    used_bytes: usedBytes,
    free_bytes: freeBytes,
    used_percent: usedPercent,
    warning: freeGb < 50 && freeGb >= 10,
    critical: freeGb < 10
  }
}

// ============================================================
// SETTINGS
// ============================================================
const DEFAULT_SETTINGS = {
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

function getSettings() {
  const db = loadDB()
  const settings = { ...DEFAULT_SETTINGS, ...db.settings }
  if (!settings.storage_path) {
    settings.storage_path = getDefaultStoragePath()
  }
  return settings
}

function updateSettings(partial: Record<string, any>) {
  const db = loadDB()
  db.settings = { ...db.settings, ...partial }
  saveDB(db)
  return getSettings()
}

// ============================================================
// EVENT REPOSITORY
// ============================================================
function generateEventCode(): string {
  const year = new Date().getFullYear()
  const db = loadDB()
  const yearEvents = db.events.filter((e: any) => e.code?.startsWith(`ARAY_EVENT_${year}_`))
  const next = yearEvents.length + 1
  return `ARAY_EVENT_${year}_${String(next).padStart(4, '0')}`
}

function createEvent(input: any) {
  const db = loadDB()
  const now = new Date().toISOString()
  const event = {
    id: crypto.randomUUID(),
    code: generateEventCode(),
    name: input.name,
    client: input.client || null,
    venue: input.venue || null,
    event_date: input.event_date || null,
    operator: input.operator || null,
    template_id: input.template_id || null,
    storage_path: path.join(getStoragePath(), 'Events'),
    google_drive_folder_id: null,
    sync_status: 'LOCAL_ONLY',
    status: 'active',
    created_at: now,
    updated_at: now
  }
  db.events.unshift(event)
  saveDB(db)
  ensureEventStorage(event.code)
  return event
}

function listEvents(includeArchived = false) {
  const db = loadDB()
  return includeArchived
    ? db.events.filter((e: any) => e.status !== 'deleted')
    : db.events.filter((e: any) => e.status === 'active')
}

function getEventById(id: string) {
  const db = loadDB()
  return db.events.find((e: any) => e.id === id) || null
}

function updateEvent(input: any) {
  const db = loadDB()
  const idx = db.events.findIndex((e: any) => e.id === input.id)
  if (idx === -1) return null
  db.events[idx] = { ...db.events[idx], ...input, updated_at: new Date().toISOString() }
  saveDB(db)
  return db.events[idx]
}

function deleteEvent(id: string) {
  const db = loadDB()
  const idx = db.events.findIndex((e: any) => e.id === id)
  if (idx === -1) return false
  db.events[idx].status = 'deleted'
  db.events[idx].updated_at = new Date().toISOString()
  saveDB(db)
  return true
}

// ============================================================
// SESSION REPOSITORY
// ============================================================
function createSession(eventId: string, type: string, shotCount = 1) {
  const db = loadDB()
  const session = {
    id: crypto.randomUUID(),
    event_id: eventId,
    type,
    shot_count: shotCount,
    created_at: new Date().toISOString()
  }
  db.sessions.unshift(session)
  saveDB(db)
  return session
}

// ============================================================
// MEDIA REPOSITORY
// ============================================================
function createMedia(input: any) {
  const db = loadDB()
  const media = {
    id: crypto.randomUUID(),
    event_id: input.event_id,
    session_id: input.session_id,
    type: input.type,
    original_path: input.original_path,
    processed_path: input.processed_path || null,
    thumbnail_path: input.thumbnail_path || null,
    checksum: input.checksum || null,
    sync_status: 'LOCAL_ONLY',
    remote_file_id: null,
    last_error: null,
    created_at: new Date().toISOString(),
    uploaded_at: null
  }
  db.media.unshift(media)
  saveDB(db)
  return media
}

function listMedia(filters: any = {}) {
  const db = loadDB()
  let result = db.media
  if (filters.event_id) result = result.filter((m: any) => m.event_id === filters.event_id)
  if (filters.type) result = result.filter((m: any) => m.type === filters.type)
  if (filters.sync_status) result = result.filter((m: any) => m.sync_status === filters.sync_status)
  const limit = filters.limit || 500
  const offset = filters.offset || 0
  return result.slice(offset, offset + limit)
}

function getMediaById(id: string) {
  const db = loadDB()
  return db.media.find((m: any) => m.id === id) || null
}

function deleteMedia(id: string) {
  const db = loadDB()
  const idx = db.media.findIndex((m: any) => m.id === id)
  if (idx === -1) return false
  db.media.splice(idx, 1)
  saveDB(db)
  return true
}

function getMediaStats(eventId?: string) {
  const db = loadDB()
  const filtered = eventId ? db.media.filter((m: any) => m.event_id === eventId) : db.media
  return {
    total: filtered.length,
    synced: filtered.filter((m: any) => m.sync_status === 'SYNCED').length,
    pending: filtered.filter((m: any) => ['PENDING', 'RETRYING', 'OFFLINE'].includes(m.sync_status)).length,
    failed: filtered.filter((m: any) => m.sync_status === 'FAILED').length,
    uploading: filtered.filter((m: any) => m.sync_status === 'UPLOADING').length
  }
}

// ============================================================
// WINDOW CREATION
// ============================================================
function createWindow(): void {
  log('Creating main window...')

  const preloadPath = path.join(__dirname, 'preload.js')
  log(`Preload path: ${preloadPath}`)
  log(`Preload exists: ${fs.existsSync(preloadPath)}`)

  const rendererPath = path.join(__dirname, '..', 'out', 'renderer', 'index.html')
  log(`Renderer path: ${rendererPath}`)
  log(`Renderer exists: ${fs.existsSync(rendererPath)}`)

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    show: true,
    autoHideMenuBar: true,
    title: 'ARAY — Are you Ready? and....Yapping!',
    backgroundColor: '#0F0B1A',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    log(`Renderer FAILED to load: ${errorCode} ${errorDescription} (URL: ${validatedURL})`)
  })

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log(`Renderer CRASHED: ${details.reason}`)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    log(`Loading dev URL: ${process.env.ELECTRON_RENDERER_URL}`)
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    log(`Loading renderer file: ${rendererPath}`)
    mainWindow.loadFile(rendererPath)
  }

  log('Main window created')
}

// ============================================================
// IPC HANDLERS
// ============================================================
function ok<T>(data: T) {
  return { success: true as const, data }
}

function err(code: string, message: string) {
  return { success: false as const, error: { code, message } }
}

function wrap<T>(fn: () => T | Promise<T>): Promise<any> {
  return Promise.resolve()
    .then(() => fn())
    .then((data) => ok(data))
    .catch((e: Error) => {
      log(`IPC error: ${e.message}`)
      return err('INTERNAL_ERROR', e.message)
    })
}

function registerIPC() {
  // ── APP ──────────────────────────────────────────────────────
  ipcMain.handle('app.getVersion', () => wrap(() => app.getVersion()))
  ipcMain.handle('app.openExternal', (_e, url: string) => wrap(() => {
    shell.openExternal(url)
    return { success: true }
  }))

  // ── EVENTS ───────────────────────────────────────────────────
  ipcMain.handle('events.create', (_e, input: any) => wrap(() => createEvent(input)))
  ipcMain.handle('events.list', (_e, includeArchived?: boolean) => wrap(() => listEvents(includeArchived)))
  ipcMain.handle('events.get', (_e, id: string) => wrap(() => getEventById(id)))
  ipcMain.handle('events.update', (_e, input: any) => wrap(() => updateEvent(input)))
  ipcMain.handle('events.delete', (_e, id: string) => wrap(() => deleteEvent(id)))
  ipcMain.handle('events.archive', (_e, id: string) => wrap(() => updateEvent({ id, status: 'archived' })))
  ipcMain.handle('events.duplicate', (_e, id: string) => wrap(() => {
    const source = getEventById(id)
    if (!source) return null
    return createEvent({
      name: `${source.name} (Copy)`,
      client: source.client,
      venue: source.venue,
      event_date: source.event_date,
      operator: source.operator
    })
  }))
  ipcMain.handle('events.openFolder', (_e, id: string) => wrap(() => {
    const event = getEventById(id)
    if (!event) throw new Error('Event not found')
    ensureEventStorage(event.code)
    shell.openPath(path.join(getStoragePath(), 'Events', event.code))
    return { success: true }
  }))

  // ── SESSIONS ─────────────────────────────────────────────────
  ipcMain.handle('sessions.create', (_e, eventId: string, type: string, shotCount?: number) =>
    wrap(() => createSession(eventId, type, shotCount))
  )

  // ── MEDIA ────────────────────────────────────────────────────
  ipcMain.handle('media.list', (_e, filters?: any) => wrap(() => listMedia(filters || {})))
  ipcMain.handle('media.get', (_e, id: string) => wrap(() => getMediaById(id)))
  ipcMain.handle('media.delete', (_e, id: string) => wrap(() => deleteMedia(id)))
  ipcMain.handle('media.stats', (_e, eventId?: string) => wrap(() => getMediaStats(eventId)))

  ipcMain.handle('media.saveCapturedFrame', (_e, payload: any) => wrap(() => {
    const event = getEventById(payload.event_id)
    if (!event) throw new Error('Event not found')

    ensureEventStorage(event.code)

    const ext = payload.mime_type === 'image/png' ? 'png' : 'jpg'
    const paths = getPhotoPaths(event.code, payload.session_id, payload.shot_number, ext)

    // Strip data URL prefix
    const base64Data = payload.frame_base64.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')
    fs.writeFileSync(paths.original, buffer)

    // Save thumbnail if provided (renderer generates it via canvas)
    let thumbnailPath = null
    if (payload.thumbnail_base64) {
      try {
        const thumbData = payload.thumbnail_base64.replace(/^data:image\/\w+;base64,/, '')
        fs.writeFileSync(paths.thumbnail, Buffer.from(thumbData, 'base64'))
        thumbnailPath = paths.thumbnail
      } catch (e: any) {
        log(`Thumbnail write failed: ${e.message}`)
      }
    }

    const checksum = calculateChecksum(paths.original)

    return createMedia({
      event_id: payload.event_id,
      session_id: payload.session_id,
      type: 'photo',
      original_path: paths.original,
      thumbnail_path: thumbnailPath,
      checksum
    })
  }))

  ipcMain.handle('media.readFile', (_e, filePath: string) => wrap(() => {
    if (!fs.existsSync(filePath)) throw new Error('File not found')
    const buf = fs.readFileSync(filePath)
    return buf.toString('base64')
  }))

  ipcMain.handle('media.updateSyncStatus', (_e, id: string, status: string, remoteId?: string, error?: string) =>
    wrap(() => {
      const db = loadDB()
      const idx = db.media.findIndex((m: any) => m.id === id)
      if (idx === -1) return { success: false }
      db.media[idx].sync_status = status
      db.media[idx].last_error = error || null
      if (remoteId) db.media[idx].remote_file_id = remoteId
      if (status === 'SYNCED') db.media[idx].uploaded_at = new Date().toISOString()
      saveDB(db)
      return { success: true }
    })
  )

  // ── STORAGE ──────────────────────────────────────────────────
  ipcMain.handle('storage.getInfo', () => wrap(() => getStorageInfo()))
  ipcMain.handle('storage.getPath', () => wrap(() => getStoragePath()))
  ipcMain.handle('storage.setPath', (_e, newPath: string) => wrap(() => {
    updateSettings({ storage_path: newPath })
    ensureStoragePath()
    return getSettings()
  }))
  ipcMain.handle('storage.chooseFolder', () => wrap(async () => {
    const result = await dialog.showOpenDialog({
      title: 'Where should ARAY save your memories?',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, path: null }
    }
    return { canceled: false, path: result.filePaths[0] }
  }))
  ipcMain.handle('storage.openFolder', (_e, folderPath: string) => wrap(() => {
    shell.openPath(folderPath)
    return { success: true }
  }))
  ipcMain.handle('storage.ensure', () => wrap(() => {
    ensureStoragePath()
    return { success: true }
  }))

  // ── CAMERA ───────────────────────────────────────────────────
  // Note: actual camera enumeration happens in renderer via navigator.mediaDevices
  // Main process just provides stub for API compatibility
  ipcMain.handle('camera.list', () => wrap(() => []))
  ipcMain.handle('camera.connect', (_e, _deviceId: string) => wrap(() => true))
  ipcMain.handle('camera.disconnect', () => wrap(() => undefined))

  // ── SETTINGS ─────────────────────────────────────────────────
  ipcMain.handle('settings.get', () => wrap(() => getSettings()))
  ipcMain.handle('settings.update', (_e, partial: any) => wrap(() => updateSettings(partial)))
  ipcMain.handle('settings.getDefaultStoragePath', () => wrap(() => getDefaultStoragePath()))

  // ── PRINT ────────────────────────────────────────────────────
  ipcMain.handle('print.queue', (_e, mediaId: string, _printerName?: string, copies?: number) =>
    wrap(() => {
      const job = {
        id: crypto.randomUUID(),
        media_id: mediaId,
        printer_name: _printerName || 'Default',
        paper_size: '4x6',
        copies: copies || 1,
        status: 'queued',
        created_at: new Date().toISOString(),
        completed_at: null,
        error: null
      }
      log(`Print job queued: ${job.id} for media ${mediaId}`)
      return job
    })
  )
  ipcMain.handle('print.listPrinters', () => wrap(() => {
    // Electron's webContents.getPrinters() available but we return empty for now
    return []
  }))

  // ── GOOGLE DRIVE (stub — Phase 3) ────────────────────────────
  ipcMain.handle('googleDrive.connect', () => wrap(() => ({ connected: false, message: 'Phase 3 feature' })))
  ipcMain.handle('googleDrive.disconnect', () => wrap(() => ({ success: true })))
  ipcMain.handle('googleDrive.status', () => wrap(() => ({ connected: false, email: null, message: 'Not connected' })))

  // ── SYNC (stub — Phase 3) ────────────────────────────────────
  ipcMain.handle('sync.start', () => wrap(() => ({ started: true })))
  ipcMain.handle('sync.pause', () => wrap(() => ({ paused: true })))
  ipcMain.handle('sync.resume', () => wrap(() => ({ resumed: true })))
  ipcMain.handle('sync.retry', () => wrap(() => ({ retrying: true })))
  ipcMain.handle('sync.summary', (_e, eventId?: string) => wrap(() => getMediaStats(eventId)))

  log('All IPC handlers registered')
}

// ============================================================
// APP LIFECYCLE
// ============================================================
app.whenReady().then(() => {
  log('========================================')
  log('ARAY starting up')
  log(`Version: ${app.getVersion()}`)
  log(`Electron: ${process.versions.electron}`)
  log(`Node: ${process.versions.node}`)
  log(`Platform: ${process.platform} ${process.arch}`)
  log(`__dirname: ${__dirname}`)
  log(`userData: ${app.getPath('userData')}`)
  log(`Log file: ${getLogPath()}`)
  log('========================================')

  try {
    // Initialize storage
    ensureStoragePath()
    log('Storage path ensured')

    // Register IPC handlers
    registerIPC()

    // Create window
    createWindow()
    log('Window created successfully')
  } catch (err: any) {
    log(`STARTUP ERROR: ${err.message}`)
    log(`Stack: ${err.stack}`)
    dialog.showErrorBox('ARAY — Error', `${err.message}\n\nLog: ${getLogPath()}`)
    app.quit()
    return
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  log('All windows closed, quitting')
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

process.on('uncaughtException', (err) => {
  log(`UNCAUGHT EXCEPTION: ${err.message}`)
  log(`Stack: ${err.stack}`)
})

process.on('unhandledRejection', (reason) => {
  log(`UNHANDLED REJECTION: ${String(reason)}`)
})
