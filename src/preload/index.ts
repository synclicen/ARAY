import { contextBridge, ipcRenderer } from 'electron'

/**
 * ARAY Preload — Typed IPC Bridge
 *
 * Strict rule: never expose ipcRenderer directly.
 * All operations go through typed window.aray methods.
 */

const invoke = <T>(channel: string, ...args: any[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args)

const api = {
  // ==================== EVENTS ====================
  events: {
    create: (input: any) => invoke('events.create', input),
    list: (includeArchived?: boolean) => invoke('events.list', includeArchived),
    get: (id: string) => invoke('events.get', id),
    update: (input: any) => invoke('events.update', input),
    delete: (id: string) => invoke('events.delete', id),
    archive: (id: string) => invoke('events.archive', id),
    duplicate: (id: string) => invoke('events.duplicate', id),
    openFolder: (id: string) => invoke('events.openFolder', id)
  },

  // ==================== SESSIONS & MEDIA ====================
  sessions: {
    create: (eventId: string, type: string, shotCount?: number) =>
      invoke('sessions.create', eventId, type, shotCount)
  },
  media: {
    list: (filters?: any) => invoke('media.list', filters),
    get: (id: string) => invoke('media.get', id),
    delete: (id: string) => invoke('media.delete', id),
    stats: (eventId?: string) => invoke('media.stats', eventId),
    saveCapturedFrame: (payload: any) => invoke('media.saveCapturedFrame', payload),
    readFile: (path: string) => invoke('media.readFile', path),
    updateSyncStatus: (id: string, status: string, remoteId?: string | null, error?: string | null) =>
      invoke('media.updateSyncStatus', id, status, remoteId, error)
  },

  // ==================== STORAGE ====================
  storage: {
    getInfo: () => invoke('storage.getInfo'),
    getPath: () => invoke('storage.getPath'),
    setPath: (path: string) => invoke('storage.setPath', path),
    chooseFolder: () => invoke('storage.chooseFolder'),
    openFolder: (path: string) => invoke('storage.openFolder', path),
    ensure: () => invoke('storage.ensure')
  },

  // ==================== CAMERA ====================
  camera: {
    list: () => invoke('camera.list'),
    connect: (deviceId: string) => invoke('camera.connect', deviceId),
    disconnect: () => invoke('camera.disconnect')
  },

  // ==================== SETTINGS ====================
  settings: {
    get: () => invoke('settings.get'),
    update: (partial: any) => invoke('settings.update', partial),
    getDefaultStoragePath: () => invoke('settings.getDefaultStoragePath')
  },

  // ==================== PRINT ====================
  print: {
    queue: (mediaId: string, printerName?: string, copies?: number) =>
      invoke('print.queue', mediaId, printerName, copies),
    listPrinters: () => invoke('print.listPrinters')
  },

  // ==================== GOOGLE DRIVE ====================
  googleDrive: {
    connect: () => invoke('googleDrive.connect'),
    disconnect: () => invoke('googleDrive.disconnect'),
    status: () => invoke('googleDrive.status')
  },

  // ==================== SYNC ====================
  sync: {
    start: () => invoke('sync.start'),
    pause: () => invoke('sync.pause'),
    resume: () => invoke('sync.resume'),
    retry: () => invoke('sync.retry'),
    summary: (eventId?: string) => invoke('sync.summary', eventId)
  },

  // ==================== APP ====================
  app: {
    getVersion: () => invoke('app.getVersion'),
    openExternal: (url: string) => invoke('app.openExternal', url)
  },

  // ==================== EVENT LISTENERS ====================
  // For receiving push events from main process
  on: (channel: string, callback: (...args: any[]) => void) => {
    const handler = (_event: any, ...args: any[]) => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

export type ArayAPI = typeof api

// contextIsolation is always true in ARAY — use contextBridge exclusively.
try {
  contextBridge.exposeInMainWorld('aray', api)
  // Also expose a simple electronAPI for backward compat with renderer's
  // direct ipcRenderer.on usage (for startup status notifications)
  contextBridge.exposeInMainWorld('electronAPI', {
    receive: (channel: string, callback: (...args: any[]) => void) => {
      const handler = (_event: any, ...args: any[]) => callback(...args)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    }
  })
} catch (err) {
  console.error('[ARAY Preload] Failed to expose API:', err)
}
