/**
 * ARAY Main Process — Phase 1 (Pure JS, no native modules)
 */

import { app, BrowserWindow, shell, dialog } from 'electron'
import { join } from 'path'
import { writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs'
import { initDatabase } from './database'
import { ensureStoragePaths } from './storage'
import { ensureValidStoragePath } from './database/repositories/settings'
import { registerAllIPCHandlers } from './ipc'

let mainWindow: BrowserWindow | null = null

function getLogPath(): string {
  try {
    return join(app.getPath('userData'), 'aray-startup.log')
  } catch {
    return join(process.cwd(), 'aray-startup.log')
  }
}

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  try {
    appendFileSync(getLogPath(), line)
  } catch {}
  console.log(`[ARAY] ${msg}`)
}

function createWindow(): void {
  log('Creating main window...')

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
      preload: join(__dirname, '../preload/index.js'),
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

  if (process.env['ELECTRON_RENDERER_URL']) {
    log(`Loading dev URL: ${process.env['ELECTRON_RENDERER_URL']}`)
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    const rendererPath = join(__dirname, '../renderer/index.html')
    log(`Loading renderer file: ${rendererPath}`)
    log(`Renderer exists: ${existsSync(rendererPath)}`)
    mainWindow.loadFile(rendererPath)
  }

  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    log(`Renderer FAILED to load: ${errorCode} ${errorDescription} (URL: ${validatedURL})`)
  })

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log(`Renderer CRASHED: ${details.reason}`)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  log('Main window created')
}

app.whenReady().then(async () => {
  log('========================================')
  log('ARAY starting up (Pure JS mode — no native modules)')
  log(`Version: ${app.getVersion()}`)
  log(`Electron: ${process.versions.electron}`)
  log(`Node: ${process.versions.node}`)
  log(`Platform: ${process.platform} ${process.arch}`)
  log(`__dirname: ${__dirname}`)
  log(`userData: ${app.getPath('userData')}`)
  log(`Log file: ${getLogPath()}`)
  log('========================================')

  try {
    // 1. Open window IMMEDIATELY
    createWindow()

    // 2. Init database (JSON storage — cannot fail)
    initDatabase()
    log('Database initialized (JSON mode)')

    // 3. Init storage paths
    ensureValidStoragePath()
    await ensureStoragePaths()
    log('Storage paths OK')

    // 4. Register IPC handlers
    registerAllIPCHandlers()
    log('IPC handlers registered')

    log('Running in FULL MODE (JSON storage)')
  } catch (err: any) {
    log(`STARTUP ERROR: ${err.message}`)
    log(`Stack: ${err.stack}`)
    try {
      dialog.showErrorBox(
        'ARAY — Error',
        `${err.message}\n\nLog file: ${getLogPath()}`
      )
    } catch {}
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
