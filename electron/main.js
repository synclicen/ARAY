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
  return loadDB().settings.storage_path || getDefaultStoragePath();
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
      parts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
  }
  return parts.join("_");
}
function ensureEventStorage(event) {
  if (event.storage_path && fs.existsSync(event.storage_path)) {
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
      const p = path.join(event.storage_path, sub);
      if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    }
    return event.storage_path;
  }
  const base = ensureStoragePath();
  const eventPath = path.join(base, "Events", buildEventFolderName(event));
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
  event.storage_path = eventPath;
  const db = loadDB();
  const idx = db.events.findIndex((e) => e.id === event.id);
  if (idx !== -1) {
    db.events[idx].storage_path = eventPath;
    saveDB(db);
  }
  return eventPath;
}
function getPhotoPaths(event, sessionId, shotNumber, ext = "jpg") {
  const eventPath = ensureEventStorage(event);
  const eventDir = path.join(eventPath, "Photos");
  const eventName = sanitizeFilename(event.name || "ARAY");
  const filename = `${eventName}_${String(shotNumber).padStart(2, "0")}`;
  return {
    original: path.join(eventDir, "Original", `${filename}.${ext}`),
    thumbnail: path.join(eventDir, "Thumbnails", `${filename}_thumb.${ext}`)
  };
}
function getVideoPath(event, sessionId, ext = "webm") {
  const eventPath = ensureEventStorage(event);
  const eventName = sanitizeFilename(event.name || "ARAY");
  return path.join(eventPath, "Videos", "Original", `${eventName}.webm`);
}
function getCompositePath(event, sessionId) {
  const eventPath = ensureEventStorage(event);
  const eventName = sanitizeFilename(event.name || "ARAY");
  const sid = (sessionId || "").slice(0, 8);
  return path.join(eventPath, "Photos", "Prints", `${eventName}_${sid}_composite.jpg`);
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
  auto_backup: false,
  selected_template_id: "classic-strip-4",
  booth_mode: "photo"
  // 'photo' | 'video'
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
  const f = getBackupFolder();
  if (!f) return { connected: false, totalFiles: 0, folder: null };
  try {
    const files = fs.readdirSync(f).filter((x) => /\.(jpg|jpeg|png|gif|mp4|mov|webm)$/i.test(x));
    return { connected: true, totalFiles: files.length, folder: f };
  } catch (e) {
    return { connected: false, totalFiles: 0, folder: null };
  }
}
function backupFile(localPath, filename) {
  const f = getBackupFolder();
  if (!f) return { success: false, copied: false, message: "No backup folder" };
  try {
    if (!fs.existsSync(localPath)) return { success: false, copied: false, message: "Local not found" };
    if (!fs.existsSync(f)) fs.mkdirSync(f, { recursive: true });
    const dest = path.join(f, filename || path.basename(localPath));
    if (fs.existsSync(dest)) {
      if (fs.statSync(localPath).size === fs.statSync(dest).size) return { success: true, copied: false, message: "Already" };
    }
    fs.copyFileSync(localPath, dest);
    return { success: true, copied: true, message: "OK" };
  } catch (e) {
    log(`Backup fail: ${e.message}`);
    return { success: false, copied: false, message: e.message };
  }
}
function backupAllPendingMedia() {
  const db = loadDB();
  if (!db.settings.auto_backup || !db.settings.backup_folder) return { backed: 0, skipped: 0, failed: 0 };
  let backed = 0, skipped = 0, failed = 0;
  for (const m of db.media) {
    if (m.sync_status === "SYNCED") {
      skipped++;
      continue;
    }
    if (!fs.existsSync(m.original_path)) {
      failed++;
      continue;
    }
    const r = backupFile(m.original_path, path.basename(m.original_path));
    if (r.success) {
      m.sync_status = "SYNCED";
      m.uploaded_at = (/* @__PURE__ */ new Date()).toISOString();
      backed++;
    } else failed++;
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
  const s = { id: crypto.randomUUID(), event_id: eventId, type, shot_count: shotCount, created_at: (/* @__PURE__ */ new Date()).toISOString() };
  db.sessions.unshift(s);
  saveDB(db);
  return s;
}
function createMedia(input) {
  const db = loadDB();
  const m = {
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
  db.media.unshift(m);
  saveDB(db);
  return m;
}
function listMedia(filters = {}) {
  const db = loadDB();
  let r = db.media;
  if (filters.event_id) r = r.filter((m) => m.event_id === filters.event_id);
  if (filters.type) r = r.filter((m) => m.type === filters.type);
  if (filters.sync_status) r = r.filter((m) => m.sync_status === filters.sync_status);
  return r.slice(filters.offset || 0, (filters.offset || 0) + (filters.limit || 500));
}
function getMediaStats(eventId) {
  const db = loadDB();
  const f = eventId ? db.media.filter((m) => m.event_id === eventId) : db.media;
  return {
    total: f.length,
    synced: f.filter((m) => m.sync_status === "SYNCED").length,
    pending: f.filter((m) => ["PENDING", "RETRYING", "OFFLINE", "LOCAL_ONLY"].includes(m.sync_status)).length,
    failed: f.filter((m) => m.sync_status === "FAILED").length,
    uploading: f.filter((m) => m.sync_status === "UPLOADING").length
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
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadURL("app://./index.html");
  }
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
    let folderPath = event.storage_path;
    if (!folderPath || !fs.existsSync(folderPath)) {
      folderPath = ensureEventStorage(event);
    }
    console.log("[ARAY] Opening event folder:", folderPath);
    console.log("[ARAY] Event name:", event.name);
    console.log("[ARAY] Event storage_path:", event.storage_path);
    import_electron.shell.openPath(folderPath);
    return { success: true, path: folderPath };
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
    ensureEventStorage(event);
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
        log(`Thumb fail: ${e.message}`);
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
      const r = backupFile(paths.original, path.basename(paths.original));
      if (r.success) {
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
  import_electron.ipcMain.handle("media.saveVideo", (_e, payload) => wrap(() => {
    const event = getEventById(payload.event_id);
    if (!event) throw new Error("Event not found");
    ensureEventStorage(event);
    const ext = payload.mime_type === "video/mp4" ? "mp4" : "webm";
    const videoPath = getVideoPath(event, payload.session_id, ext);
    const base64Data = payload.video_base64.replace(/^data:video\/\w+;base64,/, "");
    fs.writeFileSync(videoPath, Buffer.from(base64Data, "base64"));
    const checksum = calculateChecksum(videoPath);
    const media = createMedia({
      event_id: payload.event_id,
      session_id: payload.session_id,
      type: "video",
      original_path: videoPath,
      thumbnail_path: null,
      checksum
    });
    log(`Video saved: ${path.basename(videoPath)}`);
    const settings = getSettings();
    if (settings.auto_backup && settings.backup_folder) {
      const r = backupFile(videoPath, path.basename(videoPath));
      if (r.success) {
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
  import_electron.ipcMain.handle("media.saveComposite", (_e, payload) => wrap(() => {
    const event = getEventById(payload.event_id);
    if (!event) throw new Error("Event not found");
    ensureEventStorage(event);
    const compositePath = getCompositePath(event, payload.session_id);
    const base64Data = payload.image_base64.replace(/^data:image\/\w+;base64,/, "");
    fs.writeFileSync(compositePath, Buffer.from(base64Data, "base64"));
    const checksum = calculateChecksum(compositePath);
    const media = createMedia({
      event_id: payload.event_id,
      session_id: payload.session_id,
      type: "photo",
      original_path: compositePath,
      thumbnail_path: compositePath,
      checksum,
      processed_path: compositePath
    });
    log(`Composite saved: ${path.basename(compositePath)}`);
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
  import_electron.ipcMain.handle("print.listPrinters", () => {
    try {
      if (!mainWindow) {
        log("[print.listPrinters] No main window");
        return wrap(() => []);
      }
      const printers = mainWindow.webContents.getPrinters();
      log(`[print.listPrinters] Found ${printers.length} printer(s):`);
      printers.forEach((p) => log(`  - ${p.name} (${p.displayName || "no display name"}) status=${p.status} isDefault=${p.isDefault}`));
      const result = printers.map((p) => ({
        id: p.name,
        name: p.displayName || p.name,
        is_default: p.isDefault,
        status: p.status,
        is_connected: p.status === 0
        // 0 = ready
      }));
      return wrap(() => result);
    } catch (e) {
      log(`[print.listPrinters] Error: ${e.message}`);
      return wrap(() => []);
    }
  });
  import_electron.ipcMain.handle("print.queue", async (_e, mediaId, printerName, copies) => {
    try {
      log(`[print.queue] Request: mediaId=${mediaId}, printer=${printerName || "default"}, copies=${copies || 1}`);
      const db = loadDB();
      const media = db.media.find((m) => m.id === mediaId);
      if (!media) {
        log(`[print.queue] Media not found: ${mediaId}`);
        return { success: false, error: "Media not found" };
      }
      const filePath = media.processed_path || media.original_path;
      if (!filePath || !fs.existsSync(filePath)) {
        log(`[print.queue] File not found: ${filePath}`);
        return { success: false, error: "File not found: " + filePath };
      }
      log(`[print.queue] Printing file: ${filePath}`);
      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase().slice(1);
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      const base64 = buffer.toString("base64");
      const dataUrl = `data:${mime};base64,${base64}`;
      const { BrowserWindow: BrowserWindow2 } = require("electron");
      const printWin = new BrowserWindow2({
        show: false,
        width: 800,
        height: 600,
        webPreferences: { offscreen: true }
      });
      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { margin: 0; }
  body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
  img { max-width: 100%; max-height: 100vh; object-fit: contain; }
</style>
</head>
<body>
  <img src="${dataUrl}" />
</body>
</html>`;
      await printWin.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
      const printOptions = {
        silent: true,
        printBackground: true,
        copies: copies || 1
      };
      if (printerName && printerName !== "Default") {
        printOptions.deviceName = printerName;
      }
      log(`[print.queue] Print options:`, JSON.stringify(printOptions));
      return new Promise((resolve2) => {
        printWin.webContents.print(printOptions, (success, failureReason) => {
          log(`[print.queue] Print callback: success=${success}, reason=${failureReason || "none"}`);
          printWin.close();
          if (success) {
            resolve2(wrap(() => ({
              id: crypto.randomUUID(),
              media_id: mediaId,
              printer_name: printerName || "Default",
              paper_size: "4x6",
              copies: copies || 1,
              status: "printed",
              created_at: (/* @__PURE__ */ new Date()).toISOString(),
              completed_at: (/* @__PURE__ */ new Date()).toISOString(),
              error: null
            })));
          } else {
            resolve2({ success: false, error: failureReason || "Print failed" });
          }
        });
      });
    } catch (e) {
      log(`[print.queue] Error: ${e.message}`);
      return { success: false, error: e.message };
    }
  });
  import_electron.ipcMain.handle("googleDrive.connect", () => wrap(async () => {
    const result = await import_electron.dialog.showOpenDialog({
      title: "Select your Google Drive folder (or any cloud sync folder)",
      properties: ["openDirectory", "createDirectory"],
      buttonLabel: "Set as Cloud Backup Folder"
    });
    if (result.canceled || result.filePaths.length === 0) return { connected: false, message: "No folder selected" };
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
    return { started: true, ...backupAllPendingMedia() };
  }));
  import_electron.ipcMain.handle("sync.pause", () => wrap(() => ({ paused: true })));
  import_electron.ipcMain.handle("sync.resume", () => wrap(() => {
    return { resumed: true, ...backupAllPendingMedia() };
  }));
  import_electron.ipcMain.handle("sync.retry", () => wrap(() => {
    return { retrying: true, ...backupAllPendingMedia() };
  }));
  import_electron.ipcMain.handle("sync.summary", (_e, eventId) => wrap(() => getMediaStats(eventId)));
  log("All IPC handlers registered");
}
import_electron.protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);
import_electron.app.whenReady().then(() => {
  log("========================================");
  log("ARAY starting up (v2.0.0 \u2014 Photo + Video + Templates)");
  log(`Version: ${import_electron.app.getVersion()}`);
  log(`Electron: ${process.versions.electron}`);
  log(`Node: ${process.versions.node}`);
  log(`Platform: ${process.platform} ${process.arch}`);
  log(`__dirname: ${__dirname}`);
  log(`userData: ${import_electron.app.getPath("userData")}`);
  log("========================================");
  const rendererDir = path.join(__dirname, "..", "out", "renderer");
  import_electron.protocol.handle("app", (request) => {
    try {
      let urlPath = request.url.replace(/^app:\/\/\.?\//, "");
      urlPath = decodeURIComponent(urlPath);
      const filePath = path.resolve(rendererDir, urlPath);
      if (!filePath.startsWith(path.resolve(rendererDir))) {
        return new Response("Forbidden", { status: 403 });
      }
      if (!fs.existsSync(filePath)) {
        log(`[app://] 404: ${urlPath}`);
        return new Response("Not Found", { status: 404 });
      }
      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        ".html": "text/html",
        ".js": "application/javascript",
        ".mjs": "application/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
        ".ttf": "font/ttf",
        ".wasm": "application/wasm",
        ".data": "application/octet-stream",
        ".tflite": "application/octet-stream",
        ".binarypb": "application/octet-stream"
      };
      const mime = mimeTypes[ext] || "application/octet-stream";
      const headers = new Headers({
        "Content-Type": mime,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache"
      });
      return new Response(buffer, { status: 200, headers });
    } catch (e) {
      log(`[app://] Error serving ${request.url}: ${e.message}`);
      return new Response("Internal Error", { status: 500 });
    }
  });
  log(`app:// protocol registered \u2014 serving from ${rendererDir}`);
  try {
    ensureStoragePath();
    log("Storage path ensured");
    registerIPC();
    createWindow();
    log("Window created successfully");
    try {
      const registered = import_electron.globalShortcut.register("Ctrl+Shift+Alt+Q", () => {
        log("Kiosk exit shortcut pressed: Ctrl+Shift+Alt+Q");
        const db = loadDB();
        if (db.settings.kiosk_mode) {
          db.settings.kiosk_mode = false;
          saveDB(db);
          log("Kiosk mode disabled via shortcut \u2014 reloading window");
          if (mainWindow) {
            mainWindow.reload();
          }
        } else {
          log("Kiosk mode not active \u2014 shortcut ignored");
        }
      });
      if (registered) {
        log("Kiosk exit shortcut registered: Ctrl+Shift+Alt+Q");
      } else {
        log("WARNING: Failed to register kiosk exit shortcut (Ctrl+Shift+Alt+Q)");
      }
    } catch (e) {
      log(`ERROR registering kiosk shortcut: ${e.message}`);
    }
    try {
      const registered2 = import_electron.globalShortcut.register("Ctrl+Shift+Q", () => {
        log("Kiosk exit shortcut pressed: Ctrl+Shift+Q (backup)");
        const db = loadDB();
        if (db.settings.kiosk_mode) {
          db.settings.kiosk_mode = false;
          saveDB(db);
          log("Kiosk mode disabled via backup shortcut \u2014 reloading window");
          if (mainWindow) {
            mainWindow.reload();
          }
        }
      });
      if (registered2) {
        log("Backup kiosk shortcut registered: Ctrl+Shift+Q");
      }
    } catch (e) {
      log(`ERROR registering backup kiosk shortcut: ${e.message}`);
    }
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
