/**
 * ARAY — Electron Preload Script
 */

import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('aray', {
  isElectron: true,

  app: {
    getVersion: () => ipcRenderer.invoke('app.getVersion'),
    openExternal: (url: string) => ipcRenderer.invoke('app.openExternal', url)
  },

  events: {
    create: (input: any) => ipcRenderer.invoke('events.create', input),
    list: (includeArchived?: boolean) => ipcRenderer.invoke('events.list', includeArchived),
    get: (id: string) => ipcRenderer.invoke('events.get', id),
    update: (input: any) => ipcRenderer.invoke('events.update', input),
    delete: (id: string) => ipcRenderer.invoke('events.delete', id),
    archive: (id: string) => ipcRenderer.invoke('events.archive', id),
    duplicate: (id: string) => ipcRenderer.invoke('events.duplicate', id),
    openFolder: (id: string) => ipcRenderer.invoke('events.openFolder', id)
  },

  sessions: {
    create: (eventId: string, type: string, shotCount?: number) =>
      ipcRenderer.invoke('sessions.create', eventId, type, shotCount)
  },

  media: {
    list: (filters?: any) => ipcRenderer.invoke('media.list', filters),
    get: (id: string) => ipcRenderer.invoke('media.get', id),
    delete: (id: string) => ipcRenderer.invoke('media.delete', id),
    stats: (eventId?: string) => ipcRenderer.invoke('media.stats', eventId),
    saveCapturedFrame: (payload: any) => ipcRenderer.invoke('media.saveCapturedFrame', payload),
    readFile: (path: string) => ipcRenderer.invoke('media.readFile', path),
    updateSyncStatus: (id: string, status: string, remoteId?: string | null, error?: string | null) =>
      ipcRenderer.invoke('media.updateSyncStatus', id, status, remoteId, error)
  },

  storage: {
    getInfo: () => ipcRenderer.invoke('storage.getInfo'),
    getPath: () => ipcRenderer.invoke('storage.getPath'),
    setPath: (path: string) => ipcRenderer.invoke('storage.setPath', path),
    chooseFolder: () => ipcRenderer.invoke('storage.chooseFolder'),
    openFolder: (path: string) => ipcRenderer.invoke('storage.openFolder', path),
    ensure: () => ipcRenderer.invoke('storage.ensure')
  },

  camera: {
    list: () => ipcRenderer.invoke('camera.list'),
    connect: (deviceId: string) => ipcRenderer.invoke('camera.connect', deviceId),
    disconnect: () => ipcRenderer.invoke('camera.disconnect')
  },

  settings: {
    get: () => ipcRenderer.invoke('settings.get'),
    update: (partial: any) => ipcRenderer.invoke('settings.update', partial),
    getDefaultStoragePath: () => ipcRenderer.invoke('settings.getDefaultStoragePath')
  },

  print: {
    queue: (mediaId: string, printerName?: string, copies?: number) =>
      ipcRenderer.invoke('print.queue', mediaId, printerName, copies),
    listPrinters: () => ipcRenderer.invoke('print.listPrinters')
  },

  googleDrive: {
    connect: () => ipcRenderer.invoke('googleDrive.connect'),
    disconnect: () => ipcRenderer.invoke('googleDrive.disconnect'),
    status: () => ipcRenderer.invoke('googleDrive.status')
  },

  sync: {
    start: () => ipcRenderer.invoke('sync.start'),
    pause: () => ipcRenderer.invoke('sync.pause'),
    resume: () => ipcRenderer.invoke('sync.resume'),
    retry: () => ipcRenderer.invoke('sync.retry'),
    summary: (eventId?: string) => ipcRenderer.invoke('sync.summary', eventId)
  },

  on: (channel: string, callback: (...args: any[]) => void) => {
    const handler = (_event: any, ...args: any[]) => callback(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
})
