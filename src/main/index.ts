/**
 * ARAY Main Process — Minimal, no native modules
 */

import { app, BrowserWindow, shell } from 'electron'
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

  const rendererPath = join(__dirname, '..', 'renderer', 'index.html')
  log(`Renderer path: ${rendererPath}`)
  log(`Renderer exists: ${existsSync(rendererPath)}`)

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

  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    log(`Renderer FAILED to load: ${errorCode} ${errorDescription} (URL: ${validatedURL})`)
  })

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log(`Renderer CRASHED: ${details.reason}`)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    log(`Loading dev URL: ${process.env['ELECTRON_RENDERER_URL']}`)
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    log(`Loading renderer file: ${rendererPath}`)
    mainWindow.loadFile(rendererPath)
  }

  log('Main window created')
}

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

  try {
    createWindow()
    log('Window created successfully')
  } catch (err: any) {
    log(`WINDOW CREATION FAILED: ${err.message}`)
    log(`Stack: ${err.stack}`)
    const { dialog } = require('electron')
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
