"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// electron/main.ts
var import_electron = require("electron");
var path = __toESM(require("path"));
var fs = __toESM(require("fs"));
var crypto = __toESM(require("crypto"));
var os = __toESM(require("os"));
var mainWindow = null;
function getLogPath() {
  try {
    return path.join(import_electron.app.getPath("userData"), "aray-startup.log");
  } catch {
    return path.join(process.cwd(), "aray-startup.log");
  }
}
function log(msg) {
  const line = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${msg}
`;
  try {
    fs.appendFileSync(getLogPath(), line);
  } catch {
  }
  console.log(`[ARAY] ${msg}`);
}
function getDbPath() {
  const dir = path.join(import_electron.app.getPath("userData"), "database");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "data.json");
}
function loadDB() {
  try {
    const dbPath = getDbPath();
    if (!fs.existsSync(dbPath)) {
      const empty = { events: [], sessions: [], media: [], settings: {} };
      saveDB(empty);
      return empty;
    }
    const data = JSON.parse(fs.readFileSync(dbPath, "utf8"));
    return { events: data.events || [], sessions: data.sessions || [], media: data.media || [], settings: data.settings || {} };
  } catch (err2) {
    log(`DB load error: ${err2.message}`);
    return { events: [], sessions: [], media: [], settings: {} };
  }
}
function saveDB(db) {
  try {
    const dbPath = getDbPath();
    const tmpPath = dbPath + ".tmp";
    fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), "utf8");
    fs.renameSync(tmpPath, dbPath);
  } catch (err2) {
    log(`DB save error: ${err2.message}`);
  }
}
function getDefaultStoragePath() {
  try {
    return path.join(import_electron.app.getPath("documents"), "ARAY");
  } catch {
    return path.join(os.homedir(), "ARAY");
  }
}
function getStoragePath() {
  const db = loadDB();
  return db.settings.storage_path || getDefaultStoragePath();
}
function ensureStoragePath() {
  const storagePath = getStoragePath();
  try {
    if (!fs.existsSync(storagePath)) fs.mkdirSync(storagePath, { recursive: true });
    const testFile = path.join(storagePath, ".aray-write-test");
    fs.writeFileSync(testFile, "ok");
    fs.unlinkSync(testFile);
    return storagePath;
  } catch (err2) {
    log(`Storage path invalid: ${err2.message}`);
    const fallback = path.join(import_electron.app.getPath("userData"), "ARAY-Storage");
    if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true });
    const db = loadDB();
    db.settings.storage_path = fallback;
    saveDB(db);
    return fallback;
  }
}
function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "Untitled";
}
function buildEventFolderName(event) {
  const parts = [];
  if (event.name) parts.push(sanitizeFilename(event.name));
  else parts.push("Untitled-Event");
  if (event.event_date) {
    const d = new Date(event.event_date);
    if (!isNaN(d.getTime())) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      parts.push(`${yyyy}-${mm}-${dd}`);
    } else if (typeof event.event_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(event.event_date)) {
      parts.push(event.event_date);
    }
  }
  return parts.join("_");
}
function ensureEventStorage(event) {
  const base = ensureStoragePath();
  const folderName = buildEventFolderName(event);
  const eventPath = path.join(base, "Events", folderName);
  for (const sub of [
    "Photos/Original",
    "Photos/Edited",
    "Photos/Prints",
    "Photos/Thumbnails",
    "Videos/Original",
    "Videos/Edited",
    "GIF",
    "Boomerang",
    "360",
    "Metadata"
  ]) {
    const p = path.join(eventPath, sub);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  }
  if (event.storage_path !== eventPath) {
    event.storage_path = eventPath;
  }
  return eventPath;
}
function getPhotoPaths(event, sessionId, shotNumber, ext = "jpg") {
  const eventPath = ensureEventStorage(event);
  const eventDir = path.join(eventPath, "Photos");
  const code = event.code || "ARAY";
  const filename = `${code}_${sessionId}_${String(shotNumber).padStart(3, "0")}`;
  return {
    original: path.join(eventDir, "Original", `${filename}.${ext}`),
    thumbnail: path.join(eventDir, "Thumbnails", `${filename}_thumb.${ext}`)
  };
}
function calculateChecksum(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}
function getStorageInfo() {
  const storagePath = getStoragePath();
  let totalBytes = 0, freeBytes = 0;
  try {
    const stats = fs.statfsSync(storagePath);
    totalBytes = stats.blocks * stats.bsize;
    freeBytes = stats.bfree * stats.bsize;
  } catch {
    totalBytes = 1e12;
    freeBytes = 5e11;
  }
  const usedBytes = totalBytes - freeBytes;
  const freeGb = freeBytes / 1e9;
  return {
    path: storagePath,
    total_bytes: totalBytes,
    used_bytes: usedBytes,
    free_bytes: freeBytes,
    used_percent: totalBytes > 0 ? usedBytes / totalBytes * 100 : 0,
    warning: freeGb < 50 && freeGb >= 10,
    critical: freeGb < 10
  };
}
var DEFAULT_SETTINGS = {
  storage_path: "",
  first_run_completed: false,
  kiosk_mode: false,
  auto_print: false,
  auto_sync: false,
  sync_interval: "immediately",
  delete_local_after_sync: false,
  google_drive_connected: false,
  google_drive_email: null,
  camera_device_id: null,
  printer_name: null,
  booth_countdown_seconds: 3,
  booth_shot_count: 4,
  backup_folder: null,
  auto_backup: false
};
function getSettings() {
  const db = loadDB();
  const settings = { ...DEFAULT_SETTINGS, ...db.settings };
  if (!settings.storage_path) settings.storage_path = getDefaultStoragePath();
  settings.google_drive_connected = !!db.settings.backup_folder;
  return settings;
}
function updateSettings(partial) {
  const db = loadDB();
  db.settings = { ...db.settings, ...partial };
  saveDB(db);
  return getSettings();
}
function getBackupFolder() {
  return loadDB().settings.backup_folder || null;
}
function getBackupStats() {
  const backupFolder = getBackupFolder();
  if (!backupFolder) return { connected: false, totalFiles: 0, folder: null };
  try {
    const files = fs.readdirSync(backupFolder).filter((f) => /\.(jpg|jpeg|png|gif|mp4|mov)$/i.test(f));
    return { connected: true, totalFiles: files.length, folder: backupFolder };
  } catch (err2) {
    return { connected: false, totalFiles: 0, folder: null, error: err2.message };
  }
}
function backupFile(localPath, filename) {
  const backupFolder = getBackupFolder();
  if (!backupFolder) return { success: false, copied: false, message: "Backup folder not configured" };
  try {
    if (!fs.existsSync(localPath)) return { success: false, copied: false, message: "Local file not found" };
    if (!fs.existsSync(backupFolder)) fs.mkdirSync(backupFolder, { recursive: true });
    const destName = filename || path.basename(localPath);
    const destPath = path.join(backupFolder, destName);
    if (fs.existsSync(destPath)) {
      const srcStat = fs.statSync(localPath);
      const destStat = fs.statSync(destPath);
      if (srcStat.size === destStat.size) return { success: true, copied: false, message: "Already backed up" };
    }
    fs.copyFileSync(localPath, destPath);
    log(`Backed up: ${destName}`);
    return { success: true, copied: true, message: "Backed up successfully" };
  } catch (err2) {
    log(`Backup failed: ${err2.message}`);
    return { success: false, copied: false, message: err2.message };
  }
}
function backupAllPendingMedia() {
  const db = loadDB();
  if (!db.settings.auto_backup) return { backed: 0, skipped: 0, failed: 0 };
  if (!db.settings.backup_folder) return { backed: 0, skipped: 0, failed: 0, error: "No backup folder" };
  let backed = 0, skipped = 0, failed = 0;
  for (const media of db.media) {
    if (media.sync_status === "SYNCED") {
      skipped++;
      continue;
    }
    if (!fs.existsSync(media.original_path)) {
      failed++;
      continue;
    }
    const result = backupFile(media.original_path, path.basename(media.original_path));
    if (result.success) {
      media.sync_status = "SYNCED";
      media.uploaded_at = (/* @__PURE__ */ new Date()).toISOString();
      backed++;
    } else {
      failed++;
    }
  }
  saveDB(db);
  return { backed, skipped, failed };
}
function generateEventCode() {
  const year = (/* @__PURE__ */ new Date()).getFullYear();
  const db = loadDB();
  const count = db.events.filter((e) => e.code?.startsWith(`ARAY_EVENT_${year}_`)).length;
  return `ARAY_EVENT_${year}_${String(count + 1).padStart(4, "0")}`;
}
function createEvent(input) {
  const db = loadDB();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const event = {
    id: crypto.randomUUID(),
    code: generateEventCode(),
    name: input.name,
    client: input.client || null,
    venue: input.venue || null,
    event_date: input.event_date || null,
    operator: input.operator || null,
    template_id: input.template_id || null,
    storage_path: "",
    // filled by ensureEventStorage
    google_drive_folder_id: null,
    sync_status: "LOCAL_ONLY",
    status: "active",
    created_at: now,
    updated_at: now
  };
  db.events.unshift(event);
  saveDB(db);
  ensureEventStorage(event);
  saveDB(loadDB());
  return event;
}
function listEvents(includeArchived = false) {
  const db = loadDB();
  return includeArchived ? db.events.filter((e) => e.status !== "deleted") : db.events.filter((e) => e.status === "active");
}
function getEventById(id) {
  return loadDB().events.find((e) => e.id === id) || null;
}
function updateEvent(input) {
  const db = loadDB();
  const idx = db.events.findIndex((e) => e.id === input.id);
  if (idx === -1) return null;
  db.events[idx] = { ...db.events[idx], ...input, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
  saveDB(db);
  return db.events[idx];
}
function deleteEvent(id) {
  const db = loadDB();
  const idx = db.events.findIndex((e) => e.id === id);
  if (idx === -1) return false;
  db.events[idx].status = "deleted";
  saveDB(db);
  return true;
}
function createSession(eventId, type, shotCount = 1) {
  const db = loadDB();
  const session = { id: crypto.randomUUID(), event_id: eventId, type, shot_count: shotCount, created_at: (/* @__PURE__ */ new Date()).toISOString() };
  db.sessions.unshift(session);
  saveDB(db);
  return session;
}
function createMedia(input) {
  const db = loadDB();
  const media = {
    id: crypto.randomUUID(),
    event_id: input.event_id,
    session_id: input.session_id,
    type: input.type,
    original_path: input.original_path,
    processed_path: input.processed_path || null,
    thumbnail_path: input.thumbnail_path || null,
    checksum: input.checksum || null,
    sync_status: "LOCAL_ONLY",
    remote_file_id: null,
    last_error: null,
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    uploaded_at: null
  };
  db.media.unshift(media);
  saveDB(db);
  return media;
}
function listMedia(filters = {}) {
  const db = loadDB();
  let result = db.media;
  if (filters.event_id) result = result.filter((m) => m.event_id === filters.event_id);
  if (filters.type) result = result.filter((m) => m.type === filters.type);
  if (filters.sync_status) result = result.filter((m) => m.sync_status === filters.sync_status);
  return result.slice(filters.offset || 0, (filters.offset || 0) + (filters.limit || 500));
}
function getMediaStats(eventId) {
  const db = loadDB();
  const filtered = eventId ? db.media.filter((m) => m.event_id === eventId) : db.media;
  return {
    total: filtered.length,
    synced: filtered.filter((m) => m.sync_status === "SYNCED").length,
    pending: filtered.filter((m) => ["PENDING", "RETRYING", "OFFLINE", "LOCAL_ONLY"].includes(m.sync_status)).length,
    failed: filtered.filter((m) => m.sync_status === "FAILED").length,
    uploading: filtered.filter((m) => m.sync_status === "UPLOADING").length
  };
}
function createWindow() {
  log("Creating main window...");
  const preloadPath = path.join(__dirname, "preload.js");
  const rendererPath = path.join(__dirname, "..", "out", "renderer", "index.html");
  log(`Preload: ${preloadPath} (exists: ${fs.existsSync(preloadPath)})`);
  log(`Renderer: ${rendererPath} (exists: ${fs.existsSync(rendererPath)})`);
  mainWindow = new import_electron.BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    show: true,
    autoHideMenuBar: true,
    title: "ARAY \u2014 Are you Ready? and....Yapping!",
    backgroundColor: "#0F0B1A",
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: false, webSecurity: true }
  });
  mainWindow.webContents.setWindowOpenHandler((d) => {
    import_electron.shell.openExternal(d.url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("did-fail-load", (_e, c, desc, url) => log(`Renderer FAIL: ${c} ${desc} (${url})`));
  mainWindow.webContents.on("render-process-gone", (_e, d) => log(`Renderer CRASH: ${d.reason}`));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  if (process.env.ELECTRON_RENDERER_URL) mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  else mainWindow.loadFile(rendererPath);
  log("Main window created");
}
function ok(data) {
  return { success: true, data };
}
function err(c, m) {
  return { success: false, error: { code: c, message: m } };
}
function wrap(fn) {
  return Promise.resolve().then(() => fn()).then((d) => ok(d)).catch((e) => {
    log(`IPC error: ${e.message}`);
    return err("INTERNAL_ERROR", e.message);
  });
}
function registerIPC() {
  import_electron.ipcMain.handle("app.getVersion", () => wrap(() => import_electron.app.getVersion()));
  import_electron.ipcMain.handle("app.openExternal", (_e, url) => wrap(() => {
    import_electron.shell.openExternal(url);
    return { success: true };
  }));
  import_electron.ipcMain.handle("events.create", (_e, input) => wrap(() => createEvent(input)));
  import_electron.ipcMain.handle("events.list", (_e, includeArchived) => wrap(() => listEvents(includeArchived)));
  import_electron.ipcMain.handle("events.get", (_e, id) => wrap(() => getEventById(id)));
  import_electron.ipcMain.handle("events.update", (_e, input) => wrap(() => updateEvent(input)));
  import_electron.ipcMain.handle("events.delete", (_e, id) => wrap(() => deleteEvent(id)));
  import_electron.ipcMain.handle("events.archive", (_e, id) => wrap(() => updateEvent({ id, status: "archived" })));
  import_electron.ipcMain.handle("events.duplicate", (_e, id) => wrap(() => {
    const s = getEventById(id);
    if (!s) return null;
    return createEvent({ name: `${s.name} (Copy)`, client: s.client, venue: s.venue, event_date: s.event_date, operator: s.operator });
  }));
  import_electron.ipcMain.handle("events.openFolder", (_e, id) => wrap(() => {
    const event = getEventById(id);
    if (!event) throw new Error("Event not found");
    const eventPath = ensureEventStorage(event);
    import_electron.shell.openPath(eventPath);
    return { success: true };
  }));
  import_electron.ipcMain.handle("sessions.create", (_e, eventId, type, shotCount) => wrap(() => createSession(eventId, type, shotCount)));
  import_electron.ipcMain.handle("media.list", (_e, filters) => wrap(() => listMedia(filters || {})));
  import_electron.ipcMain.handle("media.get", (_e, id) => wrap(() => loadDB().media.find((m) => m.id === id) || null));
  import_electron.ipcMain.handle("media.delete", (_e, id) => wrap(() => {
    const db = loadDB();
    const idx = db.media.findIndex((m) => m.id === id);
    if (idx === -1) return false;
    db.media.splice(idx, 1);
    saveDB(db);
    return true;
  }));
  import_electron.ipcMain.handle("media.stats", (_e, eventId) => wrap(() => getMediaStats(eventId)));
  import_electron.ipcMain.handle("media.saveCapturedFrame", (_e, payload) => wrap(() => {
    const event = getEventById(payload.event_id);
    if (!event) throw new Error("Event not found");
    const ext = payload.mime_type === "image/png" ? "png" : "jpg";
    const paths = getPhotoPaths(event, payload.session_id, payload.shot_number, ext);
    const base64Data = payload.frame_base64.replace(/^data:image\/\w+;base64,/, "");
    fs.writeFileSync(paths.original, Buffer.from(base64Data, "base64"));
    let thumbnailPath = null;
    if (payload.thumbnail_base64) {
      try {
        const thumbData = payload.thumbnail_base64.replace(/^data:image\/\w+;base64,/, "");
        fs.writeFileSync(paths.thumbnail, Buffer.from(thumbData, "base64"));
        thumbnailPath = paths.thumbnail;
      } catch (e) {
        log(`Thumbnail write failed: ${e.message}`);
      }
    }
    const checksum = calculateChecksum(paths.original);
    const media = createMedia({
      event_id: payload.event_id,
      session_id: payload.session_id,
      type: "photo",
      original_path: paths.original,
      thumbnail_path: thumbnailPath,
      checksum
    });
    const settings = getSettings();
    if (settings.auto_backup && settings.backup_folder) {
      const backupResult = backupFile(paths.original, path.basename(paths.original));
      if (backupResult.success) {
        const db = loadDB();
        const idx = db.media.findIndex((m) => m.id === media.id);
        if (idx !== -1) {
          db.media[idx].sync_status = "SYNCED";
          db.media[idx].uploaded_at = (/* @__PURE__ */ new Date()).toISOString();
          saveDB(db);
        }
      }
    }
    return media;
  }));
  import_electron.ipcMain.handle("media.readFile", (_e, filePath) => wrap(() => {
    if (!fs.existsSync(filePath)) throw new Error("File not found");
    return fs.readFileSync(filePath).toString("base64");
  }));
  import_electron.ipcMain.handle("media.updateSyncStatus", (_e, id, status, remoteId, error) => wrap(() => {
    const db = loadDB();
    const idx = db.media.findIndex((m) => m.id === id);
    if (idx === -1) return { success: false };
    db.media[idx].sync_status = status;
    db.media[idx].last_error = error || null;
    if (remoteId) db.media[idx].remote_file_id = remoteId;
    if (status === "SYNCED") db.media[idx].uploaded_at = (/* @__PURE__ */ new Date()).toISOString();
    saveDB(db);
    return { success: true };
  }));
  import_electron.ipcMain.handle("storage.getInfo", () => wrap(() => getStorageInfo()));
  import_electron.ipcMain.handle("storage.getPath", () => wrap(() => getStoragePath()));
  import_electron.ipcMain.handle("storage.setPath", (_e, p) => wrap(() => {
    updateSettings({ storage_path: p });
    ensureStoragePath();
    return getSettings();
  }));
  import_electron.ipcMain.handle("storage.chooseFolder", () => wrap(async () => {
    const r = await import_electron.dialog.showOpenDialog({ title: "Where should ARAY save your memories?", properties: ["openDirectory", "createDirectory"] });
    return r.canceled ? { canceled: true, path: null } : { canceled: false, path: r.filePaths[0] };
  }));
  import_electron.ipcMain.handle("storage.openFolder", (_e, p) => wrap(() => {
    import_electron.shell.openPath(p);
    return { success: true };
  }));
  import_electron.ipcMain.handle("storage.ensure", () => wrap(() => {
    ensureStoragePath();
    return { success: true };
  }));
  import_electron.ipcMain.handle("camera.list", () => wrap(() => []));
  import_electron.ipcMain.handle("camera.connect", () => wrap(() => true));
  import_electron.ipcMain.handle("camera.disconnect", () => wrap(() => void 0));
  import_electron.ipcMain.handle("settings.get", () => wrap(() => getSettings()));
  import_electron.ipcMain.handle("settings.update", (_e, partial) => wrap(() => updateSettings(partial)));
  import_electron.ipcMain.handle("settings.getDefaultStoragePath", () => wrap(() => getDefaultStoragePath()));
  import_electron.ipcMain.handle("print.queue", (_e, mediaId, _pn, copies) => wrap(() => ({
    id: crypto.randomUUID(),
    media_id: mediaId,
    printer_name: _pn || "Default",
    paper_size: "4x6",
    copies: copies || 1,
    status: "queued",
    created_at: (/* @__PURE__ */ new Date()).toISOString(),
    completed_at: null,
    error: null
  })));
  import_electron.ipcMain.handle("print.listPrinters", () => wrap(() => []));
  import_electron.ipcMain.handle("googleDrive.connect", () => wrap(async () => {
    const result = await import_electron.dialog.showOpenDialog({
      title: "Select your Google Drive folder (or any cloud sync folder)",
      properties: ["openDirectory", "createDirectory"],
      buttonLabel: "Set as Cloud Backup Folder"
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { connected: false, message: "No folder selected" };
    }
    const folder = result.filePaths[0];
    updateSettings({ backup_folder: folder });
    log(`Cloud backup folder set: ${folder}`);
    return { connected: true, folder, message: `Connected to ${folder}` };
  }));
  import_electron.ipcMain.handle("googleDrive.disconnect", () => wrap(() => {
    updateSettings({ backup_folder: null, auto_backup: false });
    return { success: true };
  }));
  import_electron.ipcMain.handle("googleDrive.status", () => wrap(() => {
    const stats = getBackupStats();
    return {
      connected: stats.connected,
      folder: stats.folder,
      totalFiles: stats.totalFiles,
      message: stats.connected ? `Backing up to: ${stats.folder}` : "Not connected"
    };
  }));
  import_electron.ipcMain.handle("sync.start", () => wrap(() => {
    const result = backupAllPendingMedia();
    return { started: true, ...result };
  }));
  import_electron.ipcMain.handle("sync.pause", () => wrap(() => ({ paused: true })));
  import_electron.ipcMain.handle("sync.resume", () => wrap(() => {
    const result = backupAllPendingMedia();
    return { resumed: true, ...result };
  }));
  import_electron.ipcMain.handle("sync.retry", () => wrap(() => {
    const result = backupAllPendingMedia();
    return { retrying: true, ...result };
  }));
  import_electron.ipcMain.handle("sync.summary", (_e, eventId) => wrap(() => getMediaStats(eventId)));
  log("All IPC handlers registered");
}
import_electron.app.whenReady().then(() => {
  log("========================================");
  log("ARAY starting up");
  log(`Version: ${import_electron.app.getVersion()}`);
  log(`Electron: ${process.versions.electron}`);
  log(`Node: ${process.versions.node}`);
  log(`Platform: ${process.platform} ${process.arch}`);
  log(`__dirname: ${__dirname}`);
  log(`userData: ${import_electron.app.getPath("userData")}`);
  log("========================================");
  try {
    ensureStoragePath();
    log("Storage path ensured");
    registerIPC();
    createWindow();
    log("Window created successfully");
  } catch (err2) {
    log(`STARTUP ERROR: ${err2.message}`);
    log(`Stack: ${err2.stack}`);
    import_electron.dialog.showErrorBox("ARAY \u2014 Error", `${err2.message}

Log: ${getLogPath()}`);
    import_electron.app.quit();
  }
  import_electron.app.on("activate", () => {
    if (import_electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
import_electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") import_electron.app.quit();
});
process.on("uncaughtException", (err2) => {
  log(`UNCAUGHT: ${err2.message}`);
  log(`Stack: ${err2.stack}`);
});
process.on("unhandledRejection", (r) => {
  log(`UNHANDLED: ${String(r)}`);
});
