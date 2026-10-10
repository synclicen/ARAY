"use strict";

// electron/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("aray", {
  isElectron: true,
  app: {
    getVersion: () => import_electron.ipcRenderer.invoke("app.getVersion"),
    openExternal: (url) => import_electron.ipcRenderer.invoke("app.openExternal", url)
  },
  // v4.4.0: Monthly license system
  license: {
    status: () => import_electron.ipcRenderer.invoke("license.status"),
    activate: (activationCode) => import_electron.ipcRenderer.invoke("license.activate", activationCode),
    generate: (machineId, adminKey) => import_electron.ipcRenderer.invoke("license.generate", machineId, adminKey),
    getMachineId: () => import_electron.ipcRenderer.invoke("license.getMachineId")
  },
  events: {
    create: (input) => import_electron.ipcRenderer.invoke("events.create", input),
    list: (includeArchived) => import_electron.ipcRenderer.invoke("events.list", includeArchived),
    get: (id) => import_electron.ipcRenderer.invoke("events.get", id),
    update: (input) => import_electron.ipcRenderer.invoke("events.update", input),
    delete: (id) => import_electron.ipcRenderer.invoke("events.delete", id),
    archive: (id) => import_electron.ipcRenderer.invoke("events.archive", id),
    duplicate: (id) => import_electron.ipcRenderer.invoke("events.duplicate", id),
    openFolder: (id) => import_electron.ipcRenderer.invoke("events.openFolder", id)
  },
  sessions: {
    create: (eventId, type, shotCount) => import_electron.ipcRenderer.invoke("sessions.create", eventId, type, shotCount)
  },
  media: {
    list: (filters) => import_electron.ipcRenderer.invoke("media.list", filters),
    get: (id) => import_electron.ipcRenderer.invoke("media.get", id),
    delete: (id) => import_electron.ipcRenderer.invoke("media.delete", id),
    stats: (eventId) => import_electron.ipcRenderer.invoke("media.stats", eventId),
    saveCapturedFrame: (payload) => import_electron.ipcRenderer.invoke("media.saveCapturedFrame", payload),
    saveVideo: (payload) => import_electron.ipcRenderer.invoke("media.saveVideo", payload),
    saveComposite: (payload) => import_electron.ipcRenderer.invoke("media.saveComposite", payload),
    readFile: (path) => import_electron.ipcRenderer.invoke("media.readFile", path),
    getFileInfo: (path) => import_electron.ipcRenderer.invoke("media.getFileInfo", path),
    openInFolder: (path) => import_electron.ipcRenderer.invoke("media.openInFolder", path),
    updateSyncStatus: (id, status, remoteId, error) => import_electron.ipcRenderer.invoke("media.updateSyncStatus", id, status, remoteId, error)
  },
  storage: {
    getInfo: () => import_electron.ipcRenderer.invoke("storage.getInfo"),
    getPath: () => import_electron.ipcRenderer.invoke("storage.getPath"),
    setPath: (path) => import_electron.ipcRenderer.invoke("storage.setPath", path),
    chooseFolder: () => import_electron.ipcRenderer.invoke("storage.chooseFolder"),
    openFolder: (path) => import_electron.ipcRenderer.invoke("storage.openFolder", path),
    ensure: () => import_electron.ipcRenderer.invoke("storage.ensure")
  },
  camera: {
    list: () => import_electron.ipcRenderer.invoke("camera.list"),
    connect: (deviceId) => import_electron.ipcRenderer.invoke("camera.connect", deviceId),
    disconnect: () => import_electron.ipcRenderer.invoke("camera.disconnect")
  },
  settings: {
    get: () => import_electron.ipcRenderer.invoke("settings.get"),
    update: (partial) => import_electron.ipcRenderer.invoke("settings.update", partial),
    getDefaultStoragePath: () => import_electron.ipcRenderer.invoke("settings.getDefaultStoragePath")
  },
  print: {
    queue: (mediaId, printerName, copies, printSettings) => import_electron.ipcRenderer.invoke("print.queue", mediaId, printerName, copies, printSettings),
    listPrinters: () => import_electron.ipcRenderer.invoke("print.listPrinters")
  },
  googleDrive: {
    connect: () => import_electron.ipcRenderer.invoke("googleDrive.connect"),
    disconnect: () => import_electron.ipcRenderer.invoke("googleDrive.disconnect"),
    status: () => import_electron.ipcRenderer.invoke("googleDrive.status")
  },
  sync: {
    start: () => import_electron.ipcRenderer.invoke("sync.start"),
    pause: () => import_electron.ipcRenderer.invoke("sync.pause"),
    resume: () => import_electron.ipcRenderer.invoke("sync.resume"),
    retry: () => import_electron.ipcRenderer.invoke("sync.retry"),
    summary: (eventId) => import_electron.ipcRenderer.invoke("sync.summary", eventId)
  },
  on: (channel, callback) => {
    const handler = (_event, ...args) => callback(...args);
    import_electron.ipcRenderer.on(channel, handler);
    return () => import_electron.ipcRenderer.removeListener(channel, handler);
  }
});
