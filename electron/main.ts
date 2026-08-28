/**
 * ARAY — Electron Main Process (v1.7.1)
 * Pure JS, no native modules. JSON database, file storage, real IPC.
 */

import { app, BrowserWindow, shell, dialog, ipcMain } from 'electron'
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
  const db = loadDB()
  return db.settings.storage_path || getDefaultStoragePath()
}

function ensureStoragePath(): string {
  const storagePath = getStoragePath()
  try {
    if (!fs.existsSync(storagePath)) fs.mkdirSync(storagePath, { recursive: true })
    const testFile = path.join(storagePath, '.aray-write-test')
    fs.writeFileSync(testFile, 'ok')
    fs.unlinkSync(testFile)
    return storagePath
  } catch (err: any) {
    log(`Storage path invalid: ${err.message}`)
    const fallback = path.join(app.getPath('userData'), 'ARAY-Storage')
    if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true })
    const db = loadDB()
    db.settings.storage_path = fallback
    saveDB(db)
    return fallback
  }
}

function ensureEventStorage(eventCode: string): string {
  const base = ensureStoragePath()
  const eventPath = path.join(base, 'Events', eventCode)
  const subdirs = ['Photos/Original', 'Photos/Edited', 'Photos/Prints', 'Photos/Thumbnails',
    'Videos/Original', 'Videos/Edited', 'GIF', 'Boomerang', '360', 'Metadata']
  for (const sub of subdirs) {
    const p = path.join(eventPath, sub)
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
  }
  return eventPath
}

function getPhotoPaths(eventCode: string, sessionId: string, shotNumber: number, ext: string = 'jpg') {
  const base = ensureStoragePath()
  const eventDir = path.join(base, 'Events', eventCode, 'Photos')
  const filename = `${eventCode}_${sessionId}_${String(shotNumber).padStart(3, '0')}`
  return {
    original: path.join(eventDir, 'Original', `${filename}.${ext}`),
    thumbnail: path.join(eventDir, 'Thumbnails', `${filename}_thumb.${ext}`)
  }
}

function calculateChecksum(filePath: string): string {
  const buffer = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function getStorageInfo() {
  const storagePath = getStoragePath()
  let totalBytes = 0, freeBytes = 0
  try {
    const stats = fs.statfsSync(storagePath)
    totalBytes = stats.blocks * stats.bsize
    freeBytes = stats.bfree * stats.bsize
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
  booth_countdown_seconds: 3, booth_shot_count: 4
}

function getSettings() {
  const db = loadDB()
  const settings = { ...DEFAULT_SETTINGS, ...db.settings }
  if (!settings.storage_path) settings.storage_path = getDefaultStoragePath()
  return settings
}

function updateSettings(partial: any) {
  const db = loadDB()
  db.settings = { ...db.settings, ...partial }
  saveDB(db)
  return getSettings()
}

// ─── EVENTS ─────────────────────────────────────────────────────
function generateEventCode(): string {
  const year = new Date().getFullYear()
  const db = loadDB()
  const yearEvents = db.events.filter((e: any) => e.code?.startsWith(`ARAY_EVENT_${year}_`))
  return `ARAY_EVENT_${year}_${String(yearEvents.length + 1).padStart(4, '0')}`
}

function createEvent(input: any) {
  const db = loadDB()
  const now = new Date().toISOString()
  const event = {
    id: crypto.randomUUID(), code: generateEventCode(), name: input.name,
    client: input.client || null, venue: input.venue || null,
    event_date: input.event_date || null, operator: input.operator || null,
    template_id: input.template_id || null,
    storage_path: path.join(getStoragePath(), 'Events'),
    google_drive_folder_id: null, sync_status: 'LOCAL_ONLY',
    status: 'active', created_at: now, updated_at: now
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
  saveDB(db)
  return true
}

// ─── SESSIONS & MEDIA ───────────────────────────────────────────
function createSession(eventId: string, type: string, shotCount = 1) {
  const db = loadDB()
  const session = {
    id: crypto.randomUUID(), event_id: eventId, type,
    shot_count: shotCount, created_at: new Date().toISOString()
  }
  db.sessions.unshift(session)
  saveDB(db)
  return session
}

function createMedia(input: any) {
  const db = loadDB()
  const media = {
    id: crypto.randomUUID(), event_id: input.event_id, session_id: input.session_id,
    type: input.type, original_path: input.original_path,
    processed_path: input.processed_path || null, thumbnail_path: input.thumbnail_path || null,
    checksum: input.checksum || null, sync_status: 'LOCAL_ONLY',
    remote_file_id: null, last_error: null,
    created_at: new Date().toISOString(), uploaded_at: null
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
  return result.slice(filters.offset || 0, (filters.offset || 0) + (filters.limit || 500))
}

function getMediaStats(eventId?: string) {
  const db = loadDB()
  const filtered = eventId ? db.media.filter((m: any) => m.event_id === eventId) : db.media
  return {
    total: filtered.length,
    synced: filtered.filter((m: any) => m.sync_status === 'SYNCED').length,
    pending: filtered.filter((m: any) => ['PENDING','RETRYING','OFFLINE'].includes(m.sync_status)).length,
    failed: filtered.filter((m: any) => m.sync_status === 'FAILED').length,
    uploading: filtered.filter((m: any) => m.sync_status === 'UPLOADING').length
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
    webPreferences: {
      preload: preloadPath, contextIsolation: true,
      nodeIntegration: false, sandbox: false, webSecurity: true
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    log(`Renderer FAILED: ${errorCode} ${errorDescription} (${validatedURL})`)
  })

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log(`Renderer CRASHED: ${details.reason}`)
  })

  mainWindow.on('closed', () => { mainWindow = null })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(rendererPath)
  }
  log('Main window created')
}

// ─── IPC ────────────────────────────────────────────────────────
function ok<T>(data: T) { return { success: true as const, data } }
function err(code: string, message: string) { return { success: false as const, error: { code, message } } }
function wrap<T>(fn: () => T | Promise<T>): Promise<any> {
  return Promise.resolve().then(() => fn()).then((data) => ok(data))
    .catch((e: Error) => { log(`IPC error: ${e.message}`); return err('INTERNAL_ERROR', e.message) })
}

function registerIPC() {
  ipcMain.handle('app.getVersion', () => wrap(() => app.getVersion()))
  ipcMain.handle('app.openExternal', (_e, url: string) => wrap(() => { shell.openExternal(url); return { success: true } }))

  ipcMain.handle('events.create', (_e, input: any) => wrap(() => createEvent(input)))
  ipcMain.handle('events.list', (_e, includeArchived?: boolean) => wrap(() => listEvents(includeArchived)))
  ipcMain.handle('events.get', (_e, id: string) => wrap(() => getEventById(id)))
  ipcMain.handle('events.update', (_e, input: any) => wrap(() => updateEvent(input)))
  ipcMain.handle('events.delete', (_e, id: string) => wrap(() => deleteEvent(id)))
  ipcMain.handle('events.archive', (_e, id: string) => wrap(() => updateEvent({ id, status: 'archived' })))
  ipcMain.handle('events.duplicate', (_e, id: string) => wrap(() => {
    const source = getEventById(id)
    if (!source) return null
    return createEvent({ name: `${source.name} (Copy)`, client: source.client, venue: source.venue, event_date: source.event_date, operator: source.operator })
  }))
  ipcMain.handle('events.openFolder', (_e, id: string) => wrap(() => {
    const event = getEventById(id)
    if (!event) throw new Error('Event not found')
    ensureEventStorage(event.code)
    shell.openPath(path.join(getStoragePath(), 'Events', event.code))
    return { success: true }
  }))

  ipcMain.handle('sessions.create', (_e, eventId: string, type: string, shotCount?: number) => wrap(() => createSession(eventId, type, shotCount)))

  ipcMain.handle('media.list', (_e, filters?: any) => wrap(() => listMedia(filters || {})))
  ipcMain.handle('media.get', (_e, id: string) => wrap(() => {
    const db = loadDB()
    return db.media.find((m: any) => m.id === id) || null
  }))
  ipcMain.handle('media.delete', (_e, id: string) => wrap(() => {
    const db = loadDB()
    const idx = db.media.findIndex((m: any) => m.id === id)
    if (idx === -1) return false
    db.media.splice(idx, 1)
    saveDB(db)
    return true
  }))
  ipcMain.handle('media.stats', (_e, eventId?: string) => wrap(() => getMediaStats(eventId)))

  ipcMain.handle('media.saveCapturedFrame', (_e, payload: any) => wrap(() => {
    const event = getEventById(payload.event_id)
    if (!event) throw new Error('Event not found')
    ensureEventStorage(event.code)
    const ext = payload.mime_type === 'image/png' ? 'png' : 'jpg'
    const paths = getPhotoPaths(event.code, payload.session_id, payload.shot_number, ext)
    const base64Data = payload.frame_base64.replace(/^data:image\/\w+;base64,/, '')
    fs.writeFileSync(paths.original, Buffer.from(base64Data, 'base64'))
    let thumbnailPath = null
    if (payload.thumbnail_base64) {
      try {
        const thumbData = payload.thumbnail_base64.replace(/^data:image\/\w+;base64,/, '')
        fs.writeFileSync(paths.thumbnail, Buffer.from(thumbData, 'base64'))
        thumbnailPath = paths.thumbnail
      } catch (e: any) { log(`Thumbnail write failed: ${e.message}`) }
    }
    const checksum = calculateChecksum(paths.original)
    return createMedia({
      event_id: payload.event_id, session_id: payload.session_id, type: 'photo',
      original_path: paths.original, thumbnail_path: thumbnailPath, checksum
    })
  }))

  ipcMain.handle('media.readFile', (_e, filePath: string) => wrap(() => {
    if (!fs.existsSync(filePath)) throw new Error('File not found')
    return fs.readFileSync(filePath).toString('base64')
  }))

  ipcMain.handle('media.updateSyncStatus', (_e, id: string, status: string, remoteId?: string, error?: string) => wrap(() => {
    const db = loadDB()
    const idx = db.media.findIndex((m: any) => m.id === id)
    if (idx === -1) return { success: false }
    db.media[idx].sync_status = status
    db.media[idx].last_error = error || null
    if (remoteId) db.media[idx].remote_file_id = remoteId
    if (status === 'SYNCED') db.media[idx].uploaded_at = new Date().toISOString()
    saveDB(db)
    return { success: true }
  }))

  ipcMain.handle('storage.getInfo', () => wrap(() => getStorageInfo()))
  ipcMain.handle('storage.getPath', () => wrap(() => getStoragePath()))
  ipcMain.handle('storage.setPath', (_e, newPath: string) => wrap(() => { updateSettings({ storage_path: newPath }); ensureStoragePath(); return getSettings() }))
  ipcMain.handle('storage.chooseFolder', () => wrap(async () => {
    const result = await dialog.showOpenDialog({ title: 'Where should ARAY save your memories?', properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return { canceled: true, path: null }
    return { canceled: false, path: result.filePaths[0] }
  }))
  ipcMain.handle('storage.openFolder', (_e, folderPath: string) => wrap(() => { shell.openPath(folderPath); return { success: true } }))
  ipcMain.handle('storage.ensure', () => wrap(() => { ensureStoragePath(); return { success: true } }))

  ipcMain.handle('camera.list', () => wrap(() => []))
  ipcMain.handle('camera.connect', () => wrap(() => true))
  ipcMain.handle('camera.disconnect', () => wrap(() => undefined))

  ipcMain.handle('settings.get', () => wrap(() => getSettings()))
  ipcMain.handle('settings.update', (_e, partial: any) => wrap(() => updateSettings(partial)))
  ipcMain.handle('settings.getDefaultStoragePath', () => wrap(() => getDefaultStoragePath()))

  ipcMain.handle('print.queue', (_e, mediaId: string, _pn?: string, copies?: number) => wrap(() => ({
    id: crypto.randomUUID(), media_id: mediaId, printer_name: _pn || 'Default',
    paper_size: '4x6', copies: copies || 1, status: 'queued',
    created_at: new Date().toISOString(), completed_at: null, error: null
  })))
  ipcMain.handle('print.listPrinters', () => wrap(() => []))

  ipcMain.handle('googleDrive.connect', () => wrap(() => ({ connected: false, message: 'Phase 3 feature' })))
  ipcMain.handle('googleDrive.disconnect', () => wrap(() => ({ success: true })))
  ipcMain.handle('googleDrive.status', () => wrap(() => ({ connected: false, email: null, message: 'Not connected' })))

  ipcMain.handle('sync.start', () => wrap(() => ({ started: true })))
  ipcMain.handle('sync.pause', () => wrap(() => ({ paused: true })))
  ipcMain.handle('sync.resume', () => wrap(() => ({ resumed: true })))
  ipcMain.handle('sync.retry', () => wrap(() => ({ retrying: true })))
  ipcMain.handle('sync.summary', (_e, eventId?: string) => wrap(() => getMediaStats(eventId)))

  log('All IPC handlers registered')
}

// ─── APP LIFECYCLE ──────────────────────────────────────────────
app.whenReady().then(() => {
  log('========================================')
  log('ARAY starting up')
  log(`Version: ${app.getVersion()}`)
  log(`Electron: ${process.versions.electron}`)
  log(`Node: ${process.versions.node}`)
  log(`Platform: ${process.platform} ${process.arch}`)
  log(`__dirname: ${__dirname}`)
  log(`userData: ${app.getPath('userData')}`)
  log('========================================')

  try {
    ensureStoragePath()
    log('Storage path ensured')
    registerIPC()
    createWindow()
    log('Window created successfully')
  } catch (err: any) {
    log(`STARTUP ERROR: ${err.message}`)
    log(`Stack: ${err.stack}`)
    dialog.showErrorBox('ARAY — Error', `${err.message}\n\nLog: ${getLogPath()}`)
    app.quit()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

process.on('uncaughtException', (err) => {
  log(`UNCAUGHT EXCEPTION: ${err.message}`)
  log(`Stack: ${err.stack}`)
})

process.on('unhandledRejection', (reason) => {
  log(`UNHANDLED REJECTION: ${String(reason)}`)
})
