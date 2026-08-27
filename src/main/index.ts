import { app, BrowserWindow, shell, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { writeFileSync, existsSync, mkdirSync } from 'fs'

let mainWindow: BrowserWindow | null = null
let diagnosticWindow: BrowserWindow | null = null
let allChecksPassed = false

function logToFile(msg: string): void {
  try {
    const logPath = join(app.getPath('userData'), 'aray-startup.log')
    const timestamp = new Date().toISOString()
    writeFileSync(logPath, `[${timestamp}] ${msg}\n`, { flag: 'a' })
    console.log(`[ARAY] ${msg}`)
  } catch {}
}

function createDiagnosticWindow(): void {
  diagnosticWindow = new BrowserWindow({
    width: 700,
    height: 600,
    resizable: false,
    minimizable: false,
    title: 'ARAY Diagnostic',
    backgroundColor: '#0F0B1A',
    webPreferences: {
      contextIsolation: false,  // diagnostic only — needs ipcRenderer directly
      nodeIntegration: true
    }
  })

  diagnosticWindow.loadFile(join(__dirname, '../renderer/diagnostic.html'))
  diagnosticWindow.on('closed', () => {
    if (!allChecksPassed) app.quit()
  })
}

async function runDiagnostics(): Promise<boolean> {
  let allOk = true

  // Check 1: app paths
  try {
    const userData = app.getPath('userData')
    const docs = app.getPath('documents')
    logToFile(`userData: ${userData}`)
    logToFile(`documents: ${docs}`)
    diagnosticWindow?.webContents.send('diag:check', {
      name: 'App directories', ok: true, detail: userData
    })
  } catch (e: any) {
    allOk = false
    diagnosticWindow?.webContents.send('diag:check', {
      name: 'App directories', ok: false, detail: e.message
    })
  }

  // Check 2: better-sqlite3
  try {
    const Database = require('better-sqlite3')
    const dbPath = join(app.getPath('userData'), 'diagnostic-test.db')
    const db = new Database(dbPath)
    db.exec('CREATE TABLE IF NOT EXISTS test (id INTEGER)')
    db.prepare('INSERT INTO test VALUES (?)').run(1)
    const row = db.prepare('SELECT COUNT(*) as c FROM test').get() as any
    db.close()
    diagnosticWindow?.webContents.send('diag:check', {
      name: 'better-sqlite3 (native)', ok: true, detail: `v${require('better-sqlite3/package.json').version} — query OK`
    })
  } catch (e: any) {
    allOk = false
    diagnosticWindow?.webContents.send('diag:check', {
      name: 'better-sqlite3 (native)', ok: false, detail: e.message
    })
    logToFile(`better-sqlite3 FAIL: ${e.message}`)
  }

  // Check 3: sharp
  try {
    const sharp = require('sharp')
    const testBuf = await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 255, g: 0, b: 0 } }
    }).jpeg().toBuffer()
    diagnosticWindow?.webContents.send('diag:check', {
      name: 'sharp (native)', ok: true, detail: `v${require('sharp/package.json').version} — ${testBuf.length} bytes`
    })
  } catch (e: any) {
    allOk = false
    diagnosticWindow?.webContents.send('diag:check', {
      name: 'sharp (native)', ok: false, detail: e.message
    })
    logToFile(`sharp FAIL: ${e.message}`)
  }

  // Check 4: storage path
  try {
    const storagePath = join(app.getPath('documents'), 'ARAY')
    if (!existsSync(storagePath)) {
      mkdirSync(storagePath, { recursive: true })
    }
    const testFile = join(storagePath, '.write-test')
    writeFileSync(testFile, 'ok')
    require('fs').unlinkSync(testFile)
    diagnosticWindow?.webContents.send('diag:check', {
      name: 'Storage path', ok: true, detail: storagePath
    })
  } catch (e: any) {
    allOk = false
    diagnosticWindow?.webContents.send('diag:check', {
      name: 'Storage path', ok: false, detail: e.message
    })
  }

  // Check 5: renderer bundle
  try {
    const rendererPath = join(__dirname, '../renderer/index.html')
    const exists = existsSync(rendererPath)
    diagnosticWindow?.webContents.send('diag:check', {
      name: 'Renderer bundle', ok: exists, detail: rendererPath
    })
    if (!exists) logToFile(`Renderer NOT found at ${rendererPath}`)
  } catch (e: any) {
    allOk = false
    diagnosticWindow?.webContents.send('diag:check', {
      name: 'Renderer bundle', ok: false, detail: e.message
    })
  }

  // Check 6: preload
  try {
    const preloadPath = join(__dirname, '../preload/index.js')
    const exists = existsSync(preloadPath)
    diagnosticWindow?.webContents.send('diag:check', {
      name: 'Preload script', ok: exists, detail: preloadPath
    })
  } catch (e: any) {
    allOk = false
    diagnosticWindow?.webContents.send('diag:check', {
      name: 'Preload script', ok: false, detail: e.message
    })
  }

  allChecksPassed = allOk
  diagnosticWindow?.webContents.send('diag:done', allOk)
  return allOk
}

async function initMainApp(): Promise<void> {
  const { initDatabase } = require('./database')
  const { ensureStoragePaths } = require('./storage')
  const { ensureValidStoragePath } = require('./database/repositories/settings')
  const { registerAllIPCHandlers } = require('./ipc')

  initDatabase()
  ensureValidStoragePath()
  await ensureStoragePaths()
  registerAllIPCHandlers()

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
    diagnosticWindow?.close()
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
  logToFile('=== ARAY starting ===')
  logToFile(`__dirname: ${__dirname}`)
  logToFile(`process.platform: ${process.platform}`)
  logToFile(`process.arch: ${process.arch}`)
  logToFile(`electron: ${process.versions.electron}`)
  logToFile(`node: ${process.versions.node}`)

  // Open diagnostic window FIRST — before any native module load
  createDiagnosticWindow()

  // Handle proceed signal from diagnostic window
  ipcMain.handle('diag:proceed', async () => {
    try {
      await initMainApp()
      return { ok: true }
    } catch (err: any) {
      logToFile(`initMainApp FAIL: ${err.message}\n${err.stack}`)
      diagnosticWindow?.webContents.send('diag:error', {
        message: err.message,
        stack: err.stack || ''
      })
      return { ok: false, error: err.message }
    }
  })

  // Run diagnostics automatically
  setTimeout(() => {
    runDiagnostics().catch((err) => {
      logToFile(`runDiagnostics FAIL: ${err.message}`)
      diagnosticWindow?.webContents.send('diag:error', {
        message: err.message,
        stack: err.stack || ''
      })
    })
  }, 500)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createDiagnosticWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
