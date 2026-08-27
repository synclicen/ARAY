/**
 * ARAY Main Process — Phase 1 (Hardened)
 *
 * CRITICAL DESIGN PRINCIPLE:
 * The app MUST open a window, even if everything else fails.
 * Native modules (better-sqlite3) are loaded LAZILY with try-catch.
 * If database fails, app runs in "degraded mode" with JSON file storage.
 *
 * Startup sequence:
 *   1. Open window immediately with loading screen (no native modules)
 *   2. Try to load better-sqlite3 + init database
 *   3. If success: full mode
 *   4. If failure: degraded mode (JSON file storage, limited features)
 *   5. Window ALWAYS shows, user ALWAYS gets feedback
 */

import { app, BrowserWindow, shell, dialog } from 'electron'
import { join } from 'path'
import { writeFileSync, existsSync, mkdirSync, readFileSync, appendFileSync } from 'fs'

let mainWindow: BrowserWindow | null = null

// ============================================================
// LOGGING — write to file BEFORE anything else can fail
// ============================================================
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

// ============================================================
// WINDOW CREATION — opens BEFORE any native module load
// ============================================================
function createWindow(): void {
  log('Creating main window...')

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    show: true,  // Show IMMEDIATELY — no waiting for ready-to-show
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

  // Load renderer
  if (process.env['ELECTRON_RENDERER_URL']) {
    log(`Loading dev URL: ${process.env['ELECTRON_RENDERER_URL']}`)
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    const rendererPath = join(__dirname, '../renderer/index.html')
    log(`Loading renderer file: ${rendererPath}`)
    log(`Renderer exists: ${existsSync(rendererPath)}`)
    mainWindow.loadFile(rendererPath)
  }

  // Log any renderer load errors
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

// ============================================================
// DATABASE INITIALIZATION — lazy, with fallback
// ============================================================
let dbAvailable = false
let dbError: string | null = null

async function tryInitDatabase(): Promise<boolean> {
  try {
    log('Attempting to load better-sqlite3...')
    const Database = require('better-sqlite3')
    log('better-sqlite3 loaded, opening database...')

    const userDataDir = app.getPath('userData')
    const dbDir = join(userDataDir, 'database')
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true })
    }
    const dbPath = join(dbDir, 'aray.db')
    log(`Database path: ${dbPath}`)

    const db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')

    // Test query
    db.exec('CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY)')
    const result = db.prepare('SELECT 1 as v').get() as any
    if (result.v !== 1) throw new Error('Database query returned unexpected result')

    log('Database test query OK')

    // Run migrations
    const { runMigrations } = require('./database/schema')
    runMigrations(db)
    log('Database migrations applied')

    dbAvailable = true
    return true
  } catch (err: any) {
    dbError = err.message
    log(`Database INIT FAILED: ${err.message}`)
    log(`Stack: ${err.stack}`)
    return false
  }
}

async function tryInitStorage(): Promise<void> {
  try {
    log('Initializing storage paths...')
    const { ensureStoragePaths } = require('./storage')
    const { ensureValidStoragePath } = require('./database/repositories/settings')

    ensureValidStoragePath()
    await ensureStoragePaths()
    log('Storage paths OK')
  } catch (err: any) {
    log(`Storage init FAILED: ${err.message}`)
    // Non-fatal — app can still run
  }
}

async function tryRegisterIPC(): Promise<void> {
  try {
    log('Registering IPC handlers...')
    const { registerAllIPCHandlers } = require('./ipc')
    registerAllIPCHandlers()
    log('IPC handlers registered')
  } catch (err: any) {
    log(`IPC registration FAILED: ${err.message}`)
    log(`Stack: ${err.stack}`)
  }
}

// ============================================================
// ERROR DIALOG — shown if window cannot be created
// ============================================================
function showErrorDialog(msg: string): void {
  try {
    dialog.showErrorBox(
      'ARAY — Error',
      `${msg}\n\nLog file: ${getLogPath()}\n\nPlease send this log file to the developer.`
    )
  } catch {}
}

// ============================================================
// APP LIFECYCLE
// ============================================================
app.whenReady().then(async () => {
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

  // STEP 1: Open window IMMEDIATELY (before any native module)
  try {
    createWindow()
  } catch (err: any) {
    log(`FATAL: Window creation failed: ${err.message}`)
    showErrorDialog(`Failed to create window: ${err.message}`)
    app.quit()
    return
  }

  // STEP 2: Initialize database (lazy, with fallback)
  await tryInitDatabase()

  // STEP 3: Initialize storage (non-fatal if fails)
  await tryInitStorage()

  // STEP 4: Register IPC handlers (non-fatal if fails)
  await tryRegisterIPC()

  // STEP 5: Notify renderer of status
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow?.webContents.send('aray:startup-status', {
        database: dbAvailable,
        dbError: dbError,
        logPath: getLogPath()
      })
    })
  }

  if (!dbAvailable) {
    log('Running in DEGRADED MODE (no database)')
  } else {
    log('Running in FULL MODE (database OK)')
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

// Catch uncaught exceptions — log + show dialog, don't crash silently
process.on('uncaughtException', (err) => {
  log(`UNCAUGHT EXCEPTION: ${err.message}`)
  log(`Stack: ${err.stack}`)
  showErrorDialog(`Uncaught error: ${err.message}`)
})

process.on('unhandledRejection', (reason) => {
  log(`UNHANDLED REJECTION: ${String(reason)}`)
})
