/**
 * ARAY — Electron Main Process
 *
 * Adapted from Saatiril-Fullset approach:
 * - Bundled with esbuild (all deps inlined, no node_modules needed at runtime)
 * - Minimal imports (only electron + node builtins)
 * - Loads renderer from out/renderer/index.html
 * - Preload from electron/preload.js
 */

import { app, BrowserWindow, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

let mainWindow: BrowserWindow | null = null

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

function createWindow(): void {
  log('Creating main window...')

  const preloadPath = path.join(__dirname, 'preload.js')
  log(`Preload path: ${preloadPath}`)
  log(`Preload exists: ${fs.existsSync(preloadPath)}`)

  const rendererPath = path.join(__dirname, '..', 'out', 'renderer', 'index.html')
  log(`Renderer path: ${rendererPath}`)
  log(`Renderer exists: ${fs.existsSync(rendererPath)}`)

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
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

// Simple IPC handlers (no external deps, pure electron)
const { ipcMain, dialog } = require('electron')

ipcMain.handle('app.getVersion', () => app.getVersion())
ipcMain.handle('app.openExternal', (_e: any, url: string) => {
  shell.openExternal(url)
  return { success: true }
})

ipcMain.handle('storage.getInfo', () => ({
  success: true,
  data: {
    path: 'Documents/ARAY',
    total_bytes: 1000000000000,
    used_bytes: 500000000000,
    free_bytes: 500000000000,
    used_percent: 50,
    warning: false,
    critical: false
  }
}))

ipcMain.handle('storage.getPath', () => ({ success: true, data: 'Documents/ARAY' }))
ipcMain.handle('storage.chooseFolder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return { success: true, data: { canceled: result.canceled, path: result.filePaths[0] || null } }
})

ipcMain.handle('events.list', () => ({ success: true, data: [] }))
ipcMain.handle('events.create', (_e: any, input: any) => ({
  success: true,
  data: {
    id: 'evt-' + Date.now(),
    code: 'ARAY_EVENT_2026_0001',
    name: input?.name || 'Event',
    client: input?.client || null,
    venue: input?.venue || null,
    event_date: input?.event_date || null,
    operator: input?.operator || null,
    template_id: null,
    storage_path: 'Documents/ARAY',
    google_drive_folder_id: null,
    sync_status: 'LOCAL_ONLY',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
}))
ipcMain.handle('events.get', () => ({ success: true, data: null }))
ipcMain.handle('events.update', () => ({ success: true, data: null }))
ipcMain.handle('events.delete', () => ({ success: true }))
ipcMain.handle('events.archive', () => ({ success: true, data: null }))
ipcMain.handle('events.duplicate', () => ({ success: true, data: null }))
ipcMain.handle('events.openFolder', () => ({ success: true }))

ipcMain.handle('sessions.create', () => ({ success: true, data: { id: 'ses-' + Date.now() } }))

ipcMain.handle('media.list', () => ({ success: true, data: [] }))
ipcMain.handle('media.get', () => ({ success: true, data: null }))
ipcMain.handle('media.delete', () => ({ success: true }))
ipcMain.handle('media.stats', () => ({
  success: true,
  data: { total: 0, synced: 0, pending: 0, failed: 0, uploading: 0 }
}))
ipcMain.handle('media.saveCapturedFrame', () => ({ success: true, data: { id: 'med-' + Date.now() } }))
ipcMain.handle('media.readFile', () => ({ success: true, data: '' }))
ipcMain.handle('media.updateSyncStatus', () => ({ success: true }))

ipcMain.handle('storage.setPath', () => ({ success: true, data: {} }))
ipcMain.handle('storage.openFolder', () => ({ success: true }))
ipcMain.handle('storage.ensure', () => ({ success: true }))

ipcMain.handle('camera.list', () => ({ success: true, data: [] }))
ipcMain.handle('camera.connect', () => ({ success: true, data: true }))
ipcMain.handle('camera.disconnect', () => ({ success: true }))

ipcMain.handle('settings.get', () => ({
  success: true,
  data: {
    storage_path: 'Documents/ARAY',
    first_run_completed: true,
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
}))
ipcMain.handle('settings.update', (_e: any, partial: any) => ({ success: true, data: partial }))
ipcMain.handle('settings.getDefaultStoragePath', () => ({ success: true, data: 'Documents/ARAY' }))

ipcMain.handle('print.queue', () => ({ success: true, data: { id: 'job-' + Date.now() } }))
ipcMain.handle('print.listPrinters', () => ({ success: true, data: [] }))

ipcMain.handle('googleDrive.connect', () => ({ success: true, data: { connected: false } }))
ipcMain.handle('googleDrive.disconnect', () => ({ success: true }))
ipcMain.handle('googleDrive.status', () => ({ success: true, data: { connected: false, email: null } }))

ipcMain.handle('sync.start', () => ({ success: true, data: {} }))
ipcMain.handle('sync.pause', () => ({ success: true, data: {} }))
ipcMain.handle('sync.resume', () => ({ success: true, data: {} }))
ipcMain.handle('sync.retry', () => ({ success: true, data: {} }))
ipcMain.handle('sync.summary', () => ({
  success: true,
  data: { total: 0, synced: 0, pending: 0, failed: 0, uploading: 0 }
}))

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
    createWindow()
    log('Window created successfully')
  } catch (err: any) {
    log(`WINDOW CREATION FAILED: ${err.message}`)
    log(`Stack: ${err.stack}`)
    dialog.showErrorBox('ARAY — Error', `${err.message}\n\nLog: ${getLogPath()}`)
    app.quit()
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
