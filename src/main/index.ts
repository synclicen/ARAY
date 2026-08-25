import { app, BrowserWindow, shell, dialog } from 'electron'
import { join } from 'path'
import { writeFileSync } from 'fs'
import { registerAllIPCHandlers } from './ipc'
import { initDatabase } from './database'
import { ensureStoragePaths } from './storage'
import { ensureValidStoragePath } from './database/repositories/settings'

let mainWindow: BrowserWindow | null = null

function logFatalError(err: unknown): void {
  const msg = err instanceof Error ? `${err.message}\n\n${err.stack ?? ''}` : String(err)
  const logPath = join(app.getPath('userData'), 'aray-error.log')
  const timestamp = new Date().toISOString()
  try {
    writeFileSync(logPath, `[${timestamp}]\n${msg}\n\n`, { flag: 'a' })
  } catch {}
  console.error('[ARAY] Fatal startup error:', msg)
  try {
    dialog.showErrorBox(
      'ARAY — Startup Error',
      `ARAY could not start properly.\n\nError: ${msg}\n\nLog file: ${logPath}\n\nPlease report this issue on GitHub.`
    )
  } catch {}
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    show: false,
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

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  try {
    // 1. Init database (better-sqlite3 native module — must succeed)
    initDatabase()

    // 2. Ensure storage path is valid & writable (falls back to userData if not)
    ensureValidStoragePath()
    await ensureStoragePaths()

    // 3. Register IPC handlers
    registerAllIPCHandlers()

    // 4. Create window
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  } catch (err) {
    logFatalError(err)
    // Still try to create a window with error page if possible
    try {
      createWindow()
    } catch {
      app.quit()
    }
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
