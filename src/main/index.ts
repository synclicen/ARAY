/**
 * ARAY Main Process — Phase 1 (Pure JS, no native modules)
 *
 * Loads preload + renderer. No database, no IPC, no storage — just window.
 * Diagnostic mode: proves Electron can open a window with the bundled
 * renderer + preload scripts.
 */

import { app, BrowserWindow, shell, dialog } from 'electron'
import { join } from 'path'
import { existsSync, appendFileSync } from 'fs'

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

  // Determine preload path - check multiple possible locations
  const possiblePreloadPaths = [
    join(__dirname, 'preload', 'index.js'),           // out/main/preload/index.js (rare)
    join(__dirname, '..', 'preload', 'index.js'),     // out/preload/index.js (standard)
    join(__dirname, '..', '..', 'preload', 'index.js') // out/main/../preload/index.js
  ]

  let preloadPath: string | undefined
  for (const p of possiblePreloadPaths) {
    if (existsSync(p)) {
      preloadPath = p
      log(`Preload found at: ${p}`)
      break
    }
  }
  if (!preloadPath) {
    log(`WARNING: Preload not found in any of ${possiblePreloadPaths.length} locations`)
    log(`__dirname = ${__dirname}`)
    log(`Listing __dirname:`)
    try {
      const fs = require('fs')
      const items = fs.readdirSync(__dirname)
      log(`  ${items.join(', ')}`)
    } catch (e: any) {
      log(`  Could not list __dirname: ${e.message}`)
    }
  }

  // Determine renderer path
  const rendererPath = join(__dirname, '..', 'renderer', 'index.html')
  log(`Renderer path: ${rendererPath}`)
  log(`Renderer exists: ${existsSync(rendererPath)}`)

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    show: false,  // Don't show until ready-to-show fires
    autoHideMenuBar: true,
    title: 'ARAY — Are you Ready? and....Yapping!',
    backgroundColor: '#0F0B1A',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false  // Disable for diagnostic — allows file:// loads
    }
  })

  mainWindow.once('ready-to-show', () => {
    log('Window ready-to-show, showing now')
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Log all renderer events
  mainWindow.webContents.on('did-start-loading', () => log('Renderer: did-start-loading'))
  mainWindow.webContents.on('did-stop-loading', () => log('Renderer: did-stop-loading'))
  mainWindow.webContents.on('dom-ready', () => log('Renderer: dom-ready'))
  mainWindow.webContents.on('did-finish-load', () => log('Renderer: did-finish-load'))
  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    log(`Renderer: did-fail-load — code=${errorCode} desc=${errorDescription} url=${validatedURL}`)
  })
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    log(`Renderer console[${level}]: ${message} (${sourceId}:${line})`)
  })
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log(`Renderer CRASHED: reason=${details.reason} exitCode=${details.exitCode}`)
  })

  mainWindow.on('closed', () => {
    log('Window closed')
    mainWindow = null
  })

  // Load renderer
  if (process.env['ELECTRON_RENDERER_URL']) {
    log(`Loading dev URL: ${process.env['ELECTRON_RENDERER_URL']}`)
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    log(`Loading renderer file: ${rendererPath}`)
    mainWindow.loadFile(rendererPath)
  }

  log('Main window created (waiting for ready-to-show)')
}

app.whenReady().then(() => {
  log('========================================')
  log('ARAY starting up')
  log(`Version: ${app.getVersion()}`)
  log(`Electron: ${process.versions.electron}`)
  log(`Node: ${process.versions.node}`)
  log(`Chromium: ${process.versions.chrome}`)
  log(`Platform: ${process.platform} ${process.arch}`)
  log(`__dirname: ${__dirname}`)
  log(`app.getAppPath: ${app.getAppPath()}`)
  log(`userData: ${app.getPath('userData')}`)
  log(`Log file: ${getLogPath()}`)
  log('========================================')

  try {
    createWindow()
  } catch (err: any) {
    log(`WINDOW CREATION FAILED: ${err.message}`)
    log(`Stack: ${err.stack}`)
    dialog.showErrorBox(
      'ARAY — Window Creation Error',
      `${err.message}\n\nLog file: ${getLogPath()}`
    )
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
  try {
    dialog.showErrorBox(
      'ARAY — Uncaught Error',
      `${err.message}\n\nStack:\n${err.stack}\n\nLog: ${getLogPath()}`
    )
  } catch {}
})

process.on('unhandledRejection', (reason) => {
  log(`UNHANDLED REJECTION: ${String(reason)}`)
})
