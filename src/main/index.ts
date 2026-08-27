/**
 * ARAY Main Process — ULTRA MINIMAL diagnostic version
 *
 * This version does ONE thing: open a window with inline HTML.
 * No database, no IPC, no preload, no storage, no external imports.
 *
 * If THIS version opens a window → Electron packaging is fine,
 *   issue was in previous code.
 * If THIS version also fails → issue is in Electron binary itself
 *   or Windows environment (antivirus, missing VC++ runtime, etc.)
 */

import { app, BrowserWindow } from 'electron'
import { join } from 'path'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  console.log('[ARAY] Creating window...')

  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: true,
    title: 'ARAY — Diagnostic',
    backgroundColor: '#0F0B1A',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Load inline HTML via data URL — no external file dependency
  const html = `data:text/html;charset=utf-8,` + encodeURIComponent(`
    <!doctype html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>ARAY Diagnostic</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', system-ui, sans-serif;
          background: linear-gradient(135deg, #0F0B1A 0%, #241A40 100%);
          color: #EDEDF1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 40px;
          text-align: center;
        }
        h1 {
          font-size: 48px;
          font-weight: 800;
          letter-spacing: -0.04em;
          background: linear-gradient(135deg, #CDB8E4 0%, #D4AF37 50%, #C0C0C8 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: 8px;
        }
        .tagline { color: #909099; font-style: italic; margin-bottom: 32px; }
        .ok {
          padding: 16px 32px;
          background: rgba(95, 207, 128, 0.15);
          border: 1px solid rgba(95, 207, 128, 0.3);
          border-radius: 12px;
          color: #5FCF80;
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 24px;
        }
        .info {
          color: #A8A8B2;
          font-size: 14px;
          line-height: 1.6;
          max-width: 400px;
        }
        .info code {
          background: rgba(192, 192, 200, 0.1);
          padding: 2px 6px;
          border-radius: 4px;
          font-family: 'Consolas', monospace;
          color: #CDB8E4;
        }
      </style>
    </head>
    <body>
      <h1>ARAY</h1>
      <p class="tagline">Are you Ready? and....Yapping!</p>
      <div class="ok">✓ App is running successfully!</div>
      <div class="info">
        <p>If you see this window, Electron is working correctly.</p>
        <p style="margin-top: 12px;">Version: 1.3.1-diagnostic</p>
        <p>Electron: <span id="ver">loading...</span></p>
      </div>
      <script>
        // Display Electron version if available
        if (typeof process !== 'undefined') {
          document.getElementById('ver').textContent = process.versions.electron;
        } else {
          document.getElementById('ver').textContent = '(renderer only)';
        }
      </script>
    </body>
    </html>
  `)

  mainWindow.loadURL(html)

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  console.log('[ARAY] Window created successfully')
}

app.whenReady().then(() => {
  console.log('[ARAY] App ready, creating window...')
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Log ANY error to console
process.on('uncaughtException', (err) => {
  console.error('[ARAY] UNCAUGHT:', err.message)
  console.error(err.stack)
})
