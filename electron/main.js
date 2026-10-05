"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// electron/license.ts
var license_exports = {};
__export(license_exports, {
  activateLicense: () => activateLicense,
  checkLicenseStatus: () => checkLicenseStatus,
  generateExpectedCode: () => generateExpectedCode,
  generateLicenseCode: () => generateLicenseCode,
  getAdminKeyHash: () => getAdminKeyHash,
  getDisplayMachineId: () => getDisplayMachineId,
  getMachineId: () => getMachineId,
  readLicenseFile: () => readLicenseFile,
  verifyActivationCode: () => verifyActivationCode
});
function getHardwareFingerprint() {
  const cpus2 = os.cpus();
  const cpuInfo = cpus2.length > 0 ? cpus2[0].model : "unknown-cpu";
  const cpuCores = String(cpus2.length);
  const nets = os.networkInterfaces();
  let macAddress = "no-mac";
  for (const [, addrs] of Object.entries(nets)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (!addr.internal && addr.family === "IPv4" && addr.mac && addr.mac !== "00:00:00:00:00:00") {
        macAddress = addr.mac;
        break;
      }
    }
    if (macAddress !== "no-mac") break;
  }
  const hostname2 = os.hostname();
  const platform2 = os.platform();
  const arch2 = os.arch();
  const raw = `${cpuInfo}|${cpuCores}|${macAddress}|${hostname2}|${platform2}|${arch2}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}
function getMachineId() {
  return getHardwareFingerprint();
}
function getDisplayMachineId(machineId) {
  const short = machineId.substring(0, 12).toUpperCase();
  return `${short.slice(0, 4)}-${short.slice(4, 8)}-${short.slice(8, 12)}`;
}
function generateExpectedCode(machineId, licenseType, expiresAt) {
  const expiryStr = expiresAt ? new Date(expiresAt).getTime().toString(16) : "0";
  const input = `${machineId}:${licenseType}:${expiryStr}:${LICENSE_SECRET}`;
  const hash = crypto.createHash("sha256").update(input).digest("hex");
  const code = hash.substring(0, 16).toUpperCase();
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}-${code.slice(12, 16)}`;
}
function verifyActivationCode(machineId, activationCode) {
  const normalized = activationCode.replace(/[-\s]/g, "").toUpperCase();
  if (normalized.length !== 16) return null;
  const formatted = `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}`;
  const now = /* @__PURE__ */ new Date();
  for (let dayOffset = 0; dayOffset <= 45; dayOffset++) {
    const date = new Date(now);
    date.setDate(date.getDate() + dayOffset);
    date.setHours(23, 59, 59, 0);
    const monthlyCode = generateExpectedCode(machineId, "monthly", date.toISOString());
    if (formatted === monthlyCode) {
      return { licenseType: "monthly", expiresAt: date.toISOString() };
    }
  }
  return null;
}
function signLicenseData(data) {
  const payload = JSON.stringify({
    machineId: data.machineId,
    activationCode: data.activationCode,
    licenseType: data.licenseType,
    activatedAt: data.activatedAt,
    expiresAt: data.expiresAt
  });
  return crypto.createHmac("sha256", LICENSE_SECRET).update(payload).digest("hex");
}
function verifyLicenseSignature(data) {
  const expectedSig = signLicenseData({
    machineId: data.machineId,
    activationCode: data.activationCode,
    licenseType: data.licenseType,
    activatedAt: data.activatedAt,
    expiresAt: data.expiresAt
  });
  try {
    return crypto.timingSafeEqual(
      Buffer.from(data.signature, "hex"),
      Buffer.from(expectedSig, "hex")
    );
  } catch {
    return false;
  }
}
function getEncryptionKey() {
  const key = crypto.createHash("sha256").update(LICENSE_SECRET).digest();
  const iv = Buffer.alloc(16, 0);
  return { key, iv };
}
function encryptData(plaintext) {
  const { key, iv } = getEncryptionKey();
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(plaintext, "utf-8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}
function decryptData(ciphertext) {
  const { key, iv } = getEncryptionKey();
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(ciphertext, "base64", "utf-8");
  decrypted += decipher.final("utf-8");
  return decrypted;
}
function getLicenseFilePath() {
  return path.join(import_electron.app.getPath("userData"), "license.dat");
}
function getFirstRunFilePath() {
  return path.join(import_electron.app.getPath("userData"), "first-run.dat");
}
function readLicenseFile() {
  try {
    const filePath = getLicenseFilePath();
    if (!fs.existsSync(filePath)) return null;
    const encrypted = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(decryptData(encrypted));
    if (!verifyLicenseSignature(data)) {
      console.warn("[ARAY LICENSE] License file signature invalid \u2014 tampering detected");
      return null;
    }
    return data;
  } catch (e) {
    console.warn("[ARAY LICENSE] Failed to read license file:", e);
    return null;
  }
}
function writeLicenseFile(data) {
  try {
    const filePath = getLicenseFilePath();
    const json = JSON.stringify(data);
    const encrypted = encryptData(json);
    fs.writeFileSync(filePath, encrypted, "utf-8");
    return true;
  } catch (e) {
    console.error("[ARAY LICENSE] Failed to write license file:", e);
    return false;
  }
}
function getFirstRunDate() {
  try {
    const filePath = getFirstRunFilePath();
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, "utf-8").trim();
  } catch {
    return null;
  }
}
function recordFirstRun() {
  try {
    const filePath = getFirstRunFilePath();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    fs.writeFileSync(filePath, now, "utf-8");
    return now;
  } catch {
    return (/* @__PURE__ */ new Date()).toISOString();
  }
}
function checkLicenseStatus() {
  const machineId = getMachineId();
  const displayMachineId = getDisplayMachineId(machineId);
  const licenseData = readLicenseFile();
  if (licenseData) {
    const verification = verifyActivationCode(machineId, licenseData.activationCode);
    if (!verification) {
      return {
        isValid: false,
        isGracePeriod: false,
        isExpired: true,
        daysRemaining: 0,
        graceDaysRemaining: 0,
        licenseType: null,
        expiresAt: null,
        machineId,
        displayMachineId,
        firstRunDate: getFirstRunDate()
      };
    }
    const now = /* @__PURE__ */ new Date();
    const isExpired = licenseData.expiresAt ? new Date(licenseData.expiresAt) < now : true;
    const daysRemaining = licenseData.expiresAt ? Math.max(0, Math.ceil((new Date(licenseData.expiresAt).getTime() - now.getTime()) / (1e3 * 60 * 60 * 24))) : 0;
    return {
      isValid: !isExpired,
      isGracePeriod: false,
      isExpired,
      daysRemaining,
      graceDaysRemaining: 0,
      licenseType: licenseData.licenseType,
      expiresAt: licenseData.expiresAt,
      machineId,
      displayMachineId,
      firstRunDate: getFirstRunDate()
    };
  }
  const firstRunDate = getFirstRunDate() || recordFirstRun();
  return {
    isValid: false,
    isGracePeriod: false,
    isExpired: true,
    daysRemaining: 0,
    graceDaysRemaining: 0,
    licenseType: null,
    expiresAt: null,
    machineId,
    displayMachineId,
    firstRunDate
  };
}
function activateLicense(activationCode) {
  const machineId = getMachineId();
  const verification = verifyActivationCode(machineId, activationCode);
  if (!verification) {
    return { success: false, error: "Kode aktivasi tidak valid untuk perangkat ini." };
  }
  if (new Date(verification.expiresAt) < /* @__PURE__ */ new Date()) {
    return { success: false, error: "Kode aktivasi sudah kadaluarsa. Hubungi pengembang untuk kode baru." };
  }
  const normalized = activationCode.replace(/[-\s]/g, "").toUpperCase();
  const formattedCode = `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}`;
  const licenseData = {
    machineId,
    activationCode: formattedCode,
    licenseType: verification.licenseType,
    activatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    expiresAt: verification.expiresAt,
    signature: ""
  };
  licenseData.signature = signLicenseData(licenseData);
  const written = writeLicenseFile(licenseData);
  if (!written) {
    return { success: false, error: "Gagal menyimpan data lisensi ke disk." };
  }
  console.log(`[ARAY LICENSE] Activated: ${verification.licenseType} (expires: ${verification.expiresAt})`);
  return { success: true, licenseType: verification.licenseType };
}
function generateLicenseCode(machineId, adminKey) {
  const expectedAdminKey = crypto.createHash("sha256").update(`${LICENSE_SECRET}:admin-api-key`).digest("hex").substring(0, 16).toUpperCase();
  if (adminKey.toUpperCase() !== expectedAdminKey) {
    return { success: false, error: "Admin key tidak valid. Akses ditolak." };
  }
  if (!machineId || !/^[a-f0-9]{64}$/i.test(machineId)) {
    return {
      success: false,
      error: `Machine ID tidak valid. Harus 64 karakter hex. Diterima: ${machineId?.length || 0} karakter.`
    };
  }
  const expiresAt = /* @__PURE__ */ new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  expiresAt.setHours(23, 59, 59, 0);
  const code = generateExpectedCode(machineId, "monthly", expiresAt.toISOString());
  const displayMachineId = getDisplayMachineId(machineId);
  const verification = verifyActivationCode(machineId, code);
  return {
    success: true,
    data: {
      machineId,
      displayMachineId,
      licenseType: "monthly",
      activationCode: code,
      expiresAt: expiresAt.toISOString(),
      expiresAtFormatted: expiresAt.toLocaleDateString("id-ID", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      }),
      daysRemaining: 30,
      verified: verification !== null
    }
  };
}
function getAdminKeyHash() {
  return crypto.createHash("sha256").update(`${LICENSE_SECRET}:admin-api-key`).digest("hex").substring(0, 16);
}
var crypto, fs, os, path, import_electron, LICENSE_SECRET;
var init_license = __esm({
  "electron/license.ts"() {
    "use strict";
    crypto = __toESM(require("crypto"));
    fs = __toESM(require("fs"));
    os = __toESM(require("os"));
    path = __toESM(require("path"));
    import_electron = require("electron");
    LICENSE_SECRET = "ARAY-2026-HUMAS-UIN-ANTASARI-BANJARMASIN";
  }
});

// electron/main.ts
var import_electron2 = require("electron");
var path2 = __toESM(require("path"));
var fs2 = __toESM(require("fs"));
var crypto2 = __toESM(require("crypto"));
var os2 = __toESM(require("os"));
var mainWindow = null;
function getLogPath() {
  try {
    return path2.join(import_electron2.app.getPath("userData"), "aray-startup.log");
  } catch {
    return path2.join(process.cwd(), "aray-startup.log");
  }
}
function log(msg) {
  const line = `[${(/* @__PURE__ */ new Date()).toISOString()}] ${msg}
`;
  try {
    const logPath = getLogPath();
    try {
      const stat = fs2.statSync(logPath);
      if (stat.size > 5 * 1024 * 1024) {
        const oldPath = logPath + ".old";
        try {
          fs2.unlinkSync(oldPath);
        } catch {
        }
        fs2.renameSync(logPath, oldPath);
      }
    } catch {
    }
    fs2.appendFileSync(logPath, line);
  } catch {
  }
  console.log(`[ARAY] ${msg}`);
}
function getDbPath() {
  const dir = path2.join(import_electron2.app.getPath("userData"), "database");
  if (!fs2.existsSync(dir)) fs2.mkdirSync(dir, { recursive: true });
  return path2.join(dir, "data.json");
}
var dbCache = null;
var saveTimer = null;
function loadDB() {
  if (dbCache) return dbCache;
  try {
    const dbPath = getDbPath();
    if (!fs2.existsSync(dbPath)) {
      const empty = { events: [], sessions: [], media: [], settings: {} };
      dbCache = empty;
      saveDB(empty);
      return empty;
    }
    const data = JSON.parse(fs2.readFileSync(dbPath, "utf8"));
    dbCache = { events: data.events || [], sessions: data.sessions || [], media: data.media || [], settings: data.settings || {} };
    return dbCache;
  } catch (err2) {
    log(`DB load error: ${err2.message}`);
    dbCache = { events: [], sessions: [], media: [], settings: {} };
    return dbCache;
  }
}
function saveDB(db) {
  dbCache = db;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const dbPath = getDbPath();
      const tmpPath = dbPath + ".tmp";
      fs2.writeFileSync(tmpPath, JSON.stringify(db, null, 2), "utf8");
      fs2.renameSync(tmpPath, dbPath);
    } catch (err2) {
      log(`DB save error: ${err2.message}`);
    }
  }, 500);
}
function getDefaultStoragePath() {
  try {
    return path2.join(import_electron2.app.getPath("documents"), "ARAY");
  } catch {
    return path2.join(os2.homedir(), "ARAY");
  }
}
function getStoragePath() {
  return loadDB().settings.storage_path || getDefaultStoragePath();
}
function ensureStoragePath() {
  const storagePath = getStoragePath();
  try {
    if (!fs2.existsSync(storagePath)) fs2.mkdirSync(storagePath, { recursive: true });
    const testFile = path2.join(storagePath, ".aray-write-test");
    fs2.writeFileSync(testFile, "ok");
    fs2.unlinkSync(testFile);
    return storagePath;
  } catch (err2) {
    log(`Storage path invalid: ${err2.message}`);
    const fallback = path2.join(import_electron2.app.getPath("userData"), "ARAY-Storage");
    if (!fs2.existsSync(fallback)) fs2.mkdirSync(fallback, { recursive: true });
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
  if (event.storage_path && fs2.existsSync(event.storage_path)) {
    for (const sub of ["Photos", "Videos"]) {
      const p = path2.join(event.storage_path, sub);
      if (!fs2.existsSync(p)) fs2.mkdirSync(p, { recursive: true });
    }
    return event.storage_path;
  }
  const base = ensureStoragePath();
  const eventPath = path2.join(base, "Events", buildEventFolderName(event));
  for (const sub of ["Photos", "Videos"]) {
    const p = path2.join(eventPath, sub);
    if (!fs2.existsSync(p)) fs2.mkdirSync(p, { recursive: true });
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
  const eventDir = path2.join(eventPath, "Photos");
  const eventName = sanitizeFilename(event.name || "ARAY");
  const dateStr = getDateStr(event);
  const seq = getSequenceNumber(eventPath, "Photos", eventName, dateStr, ext);
  const filename = `${eventName}_${dateStr}_${String(seq).padStart(3, "0")}`;
  return {
    original: path2.join(eventDir, `${filename}.${ext}`),
    thumbnail: path2.join(eventDir, `${filename}.${ext}`)
    // v4.4.8: thumbnail = original (sama folder)
  };
}
function getVideoPath(event, sessionId, ext = "webm") {
  const eventPath = ensureEventStorage(event);
  const eventName = sanitizeFilename(event.name || "ARAY");
  const dateStr = getDateStr(event);
  const seq = getSequenceNumber(eventPath, "Videos", eventName, dateStr, ext);
  return path2.join(eventPath, "Videos", `${eventName}_${dateStr}_${String(seq).padStart(3, "0")}.${ext}`);
}
function getCompositePath(event, sessionId) {
  const eventPath = ensureEventStorage(event);
  const eventName = sanitizeFilename(event.name || "ARAY");
  const dateStr = getDateStr(event);
  const seq = getSequenceNumber(eventPath, "Photos", eventName, dateStr, "jpg");
  return path2.join(eventPath, "Photos", `${eventName}_${dateStr}_${String(seq).padStart(3, "0")}.jpg`);
}
function getDateStr(event) {
  if (event.event_date) {
    const d = new Date(event.event_date);
    if (!isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  }
  const now = /* @__PURE__ */ new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function getSequenceNumber(eventPath, subDir, eventName, dateStr, ext) {
  try {
    const dir = path2.join(eventPath, subDir);
    if (!fs2.existsSync(dir)) return 1;
    const prefix = `${eventName}_${dateStr}_`;
    const files = fs2.readdirSync(dir);
    let maxSeq = 0;
    for (const f of files) {
      if (f.startsWith(prefix) && f.endsWith("." + ext)) {
        const middle = f.slice(prefix.length, f.length - ext.length - 1);
        const seq = parseInt(middle);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
    }
    return maxSeq + 1;
  } catch {
    return 1;
  }
}
function calculateChecksum(filePath) {
  return crypto2.createHash("sha256").update(fs2.readFileSync(filePath)).digest("hex");
}
function getStorageInfo() {
  const storagePath = getStoragePath();
  let totalBytes = 0, freeBytes = 0;
  try {
    const stats = fs2.statfsSync(storagePath);
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
    const files = fs2.readdirSync(f).filter((x) => /\.(jpg|jpeg|png|gif|mp4|mov|webm)$/i.test(x));
    return { connected: true, totalFiles: files.length, folder: f };
  } catch (e) {
    return { connected: false, totalFiles: 0, folder: null };
  }
}
function backupFile(localPath, filename) {
  const f = getBackupFolder();
  if (!f) return { success: false, copied: false, message: "No backup folder" };
  try {
    if (!fs2.existsSync(localPath)) return { success: false, copied: false, message: "Local not found" };
    const basename2 = path2.basename(localPath);
    const ext = path2.extname(localPath).toLowerCase();
    const normalizedLocal = localPath.replace(/\//g, path2.sep);
    let eventName = "Unknown-Event";
    const eventsIdx = normalizedLocal.indexOf(path2.sep + "Events" + path2.sep);
    if (eventsIdx !== -1) {
      const afterEvents = normalizedLocal.substring(eventsIdx + path2.sep.length + "Events".length + path2.sep.length);
      const nextSep = afterEvents.indexOf(path2.sep);
      if (nextSep !== -1) {
        eventName = afterEvents.substring(0, nextSep);
      }
    }
    const isVideo = [".webm", ".mp4", ".mov", ".avi"].includes(ext);
    const subFolder = isVideo ? "Videos" : "Photos";
    const dest = path2.join(f, "Events", eventName, subFolder, basename2);
    const destDir = path2.dirname(dest);
    if (!fs2.existsSync(destDir)) {
      fs2.mkdirSync(destDir, { recursive: true });
    }
    if (fs2.existsSync(dest)) {
      if (fs2.statSync(localPath).size === fs2.statSync(dest).size) {
        return { success: true, copied: false, message: "Already backed up" };
      }
    }
    fs2.copyFileSync(localPath, dest);
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
    if (!fs2.existsSync(m.original_path)) {
      failed++;
      continue;
    }
    const r = backupFile(m.original_path, path2.basename(m.original_path));
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
    id: crypto2.randomUUID(),
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
  const s = { id: crypto2.randomUUID(), event_id: eventId, type, shot_count: shotCount, created_at: (/* @__PURE__ */ new Date()).toISOString() };
  db.sessions.unshift(s);
  saveDB(db);
  return s;
}
function createMedia(input) {
  const db = loadDB();
  const m = {
    id: crypto2.randomUUID(),
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
  const preloadPath = path2.join(__dirname, "preload.js");
  const rendererPath = path2.join(__dirname, "..", "out", "renderer", "index.html");
  log(`Preload: ${preloadPath} (exists: ${fs2.existsSync(preloadPath)})`);
  log(`Renderer: ${rendererPath} (exists: ${fs2.existsSync(rendererPath)})`);
  mainWindow = new import_electron2.BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    show: false,
    // v4.4.2: Don't show until ready (fix blank screen on startup)
    autoHideMenuBar: true,
    title: "ARAY \u2014 Are you Ready? and....Yapping!",
    backgroundColor: "#0F0B1A",
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false, sandbox: false, webSecurity: true }
  });
  mainWindow.once("ready-to-show", () => {
    log("Window ready-to-show \u2014 showing now");
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  mainWindow.webContents.setWindowOpenHandler((d) => {
    import_electron2.shell.openExternal(d.url);
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
  import_electron2.ipcMain.handle("app.getVersion", () => wrap(() => import_electron2.app.getVersion()));
  import_electron2.ipcMain.handle("app.openExternal", (_e, url) => wrap(() => {
    import_electron2.shell.openExternal(url);
    return { success: true };
  }));
  const { checkLicenseStatus: checkLicenseStatus2, activateLicense: activateLicense2, getMachineId: getMachineId2, getDisplayMachineId: getDisplayMachineId2, generateLicenseCode: generateLicenseCode2 } = (init_license(), __toCommonJS(license_exports));
  import_electron2.ipcMain.handle("license.status", () => {
    try {
      const status = checkLicenseStatus2();
      log(`[license.status] isValid=${status.isValid}, expired=${status.isExpired}, daysRemaining=${status.daysRemaining}`);
      return { success: true, data: status };
    } catch (e) {
      log(`[license.status] Error: ${e.message}`);
      return { success: false, error: e.message };
    }
  });
  import_electron2.ipcMain.handle("license.activate", (_e, activationCode) => {
    try {
      log(`[license.activate] Attempting activation...`);
      const result = activateLicense2(activationCode);
      if (result.success) {
        log(`[license.activate] Success: ${result.licenseType}`);
      } else {
        log(`[license.activate] Failed: ${result.error}`);
      }
      return result;
    } catch (e) {
      log(`[license.activate] Error: ${e.message}`);
      return { success: false, error: e.message };
    }
  });
  import_electron2.ipcMain.handle("license.generate", (_e, machineId, adminKey) => {
    try {
      log(`[license.generate] Generating code for machine: ${machineId.substring(0, 12)}...`);
      const result = generateLicenseCode2(machineId, adminKey);
      if (result.success) {
        log(`[license.generate] Success: code=${result.data?.activationCode}`);
      } else {
        log(`[license.generate] Failed: ${result.error}`);
      }
      return result;
    } catch (e) {
      log(`[license.generate] Error: ${e.message}`);
      return { success: false, error: e.message };
    }
  });
  import_electron2.ipcMain.handle("license.getMachineId", () => {
    try {
      const mid = getMachineId2();
      const display = getDisplayMachineId2(mid);
      return { success: true, data: { machineId: mid, displayMachineId: display } };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  import_electron2.ipcMain.handle("events.create", (_e, input) => wrap(() => createEvent(input)));
  import_electron2.ipcMain.handle("events.list", (_e, includeArchived) => wrap(() => listEvents(includeArchived)));
  import_electron2.ipcMain.handle("events.get", (_e, id) => wrap(() => getEventById(id)));
  import_electron2.ipcMain.handle("events.update", (_e, input) => wrap(() => updateEvent(input)));
  import_electron2.ipcMain.handle("events.delete", (_e, id) => wrap(() => deleteEvent(id)));
  import_electron2.ipcMain.handle("events.archive", (_e, id) => wrap(() => updateEvent({ id, status: "archived" })));
  import_electron2.ipcMain.handle("events.duplicate", (_e, id) => wrap(() => {
    const s = getEventById(id);
    if (!s) return null;
    return createEvent({ name: `${s.name} (Copy)`, client: s.client, venue: s.venue, event_date: s.event_date, operator: s.operator });
  }));
  import_electron2.ipcMain.handle("events.openFolder", (_e, id) => wrap(() => {
    const event = getEventById(id);
    if (!event) throw new Error("Event not found");
    let folderPath = event.storage_path;
    if (!folderPath || !fs2.existsSync(folderPath)) {
      folderPath = ensureEventStorage(event);
    }
    console.log("[ARAY] Opening event folder:", folderPath);
    console.log("[ARAY] Event name:", event.name);
    console.log("[ARAY] Event storage_path:", event.storage_path);
    import_electron2.shell.openPath(folderPath);
    return { success: true, path: folderPath };
  }));
  import_electron2.ipcMain.handle("sessions.create", (_e, eventId, type, shotCount) => wrap(() => createSession(eventId, type, shotCount)));
  import_electron2.ipcMain.handle("media.list", (_e, filters) => wrap(() => listMedia(filters || {})));
  import_electron2.ipcMain.handle("media.get", (_e, id) => wrap(() => loadDB().media.find((m) => m.id === id) || null));
  import_electron2.ipcMain.handle("media.delete", (_e, id) => wrap(() => {
    const db = loadDB();
    const idx = db.media.findIndex((m) => m.id === id);
    if (idx === -1) return false;
    db.media.splice(idx, 1);
    saveDB(db);
    return true;
  }));
  import_electron2.ipcMain.handle("media.stats", (_e, eventId) => wrap(() => getMediaStats(eventId)));
  import_electron2.ipcMain.handle("media.saveCapturedFrame", (_e, payload) => wrap(() => {
    const event = getEventById(payload.event_id);
    if (!event) throw new Error("Event not found");
    ensureEventStorage(event);
    const ext = payload.mime_type === "image/png" ? "png" : "jpg";
    const paths = getPhotoPaths(event, payload.session_id, payload.shot_number, ext);
    const base64Data = payload.frame_base64.replace(/^data:image\/\w+;base64,/, "");
    fs2.writeFileSync(paths.original, Buffer.from(base64Data, "base64"));
    let thumbnailPath = null;
    if (payload.thumbnail_base64) {
      try {
        const thumbData = payload.thumbnail_base64.replace(/^data:image\/\w+;base64,/, "");
        fs2.writeFileSync(paths.thumbnail, Buffer.from(thumbData, "base64"));
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
      const r = backupFile(paths.original, path2.basename(paths.original));
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
  import_electron2.ipcMain.handle("media.saveVideo", (_e, payload) => wrap(() => {
    log(`[media.saveVideo] Request: event=${payload.event_id}, session=${payload.session_id}, mime=${payload.mime_type}, style=${payload.video_style}`);
    const event = getEventById(payload.event_id);
    if (!event) {
      log(`[media.saveVideo] Event not found: ${payload.event_id}`);
      throw new Error("Event not found");
    }
    ensureEventStorage(event);
    if (!payload.session_id) {
      log(`[media.saveVideo] ERROR: session_id is missing`);
      throw new Error("session_id is required for video save");
    }
    const ext = payload.mime_type === "video/mp4" ? "mp4" : "webm";
    const videoPath = getVideoPath(event, payload.session_id, ext);
    log(`[media.saveVideo] Saving to: ${videoPath}`);
    const base64Data = payload.video_base64.replace(/^data:video\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    log(`[media.saveVideo] Video buffer: ${buffer.length} bytes`);
    if (buffer.length === 0) {
      log(`[media.saveVideo] ERROR: video buffer is empty`);
      throw new Error("Video buffer is empty");
    }
    fs2.writeFileSync(videoPath, buffer);
    const checksum = calculateChecksum(videoPath);
    const media = createMedia({
      event_id: payload.event_id,
      session_id: payload.session_id,
      type: "video",
      original_path: videoPath,
      thumbnail_path: null,
      checksum
    });
    log(`[media.saveVideo] Video saved: ${path2.basename(videoPath)} (media id: ${media.id})`);
    const settings = getSettings();
    if (settings.auto_backup && settings.backup_folder) {
      const r = backupFile(videoPath, path2.basename(videoPath));
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
  import_electron2.ipcMain.handle("media.saveComposite", (_e, payload) => wrap(() => {
    const event = getEventById(payload.event_id);
    if (!event) throw new Error("Event not found");
    ensureEventStorage(event);
    const compositePath = getCompositePath(event, payload.session_id);
    const base64Data = payload.image_base64.replace(/^data:image\/\w+;base64,/, "");
    fs2.writeFileSync(compositePath, Buffer.from(base64Data, "base64"));
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
    log(`Composite saved: ${path2.basename(compositePath)}`);
    return media;
  }));
  import_electron2.ipcMain.handle("media.readFile", (_e, filePath) => wrap(() => {
    if (!fs2.existsSync(filePath)) throw new Error("File not found");
    return fs2.readFileSync(filePath).toString("base64");
  }));
  import_electron2.ipcMain.handle("media.getFileInfo", (_e, filePath) => {
    try {
      if (!fs2.existsSync(filePath)) {
        return { success: false, error: "File not found" };
      }
      const stat = fs2.statSync(filePath);
      return {
        success: true,
        data: {
          size: stat.size,
          sizeMB: Math.round(stat.size / 1024 / 1024 * 100) / 100,
          exists: true
        }
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  import_electron2.ipcMain.handle("media.openInFolder", (_e, filePath) => {
    try {
      if (!fs2.existsSync(filePath)) {
        log(`[media.openInFolder] File not found: ${filePath}`);
        return { success: false, error: "File not found" };
      }
      const { shell: shell2 } = require("electron");
      shell2.showItemInFolder(filePath);
      log(`[media.openInFolder] Opened: ${filePath}`);
      return { success: true };
    } catch (e) {
      log(`[media.openInFolder] Error: ${e.message}`);
      return { success: false, error: e.message };
    }
  });
  import_electron2.ipcMain.handle("media.updateSyncStatus", (_e, id, status, remoteId, error) => wrap(() => {
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
  import_electron2.ipcMain.handle("storage.getInfo", () => wrap(() => getStorageInfo()));
  import_electron2.ipcMain.handle("storage.getPath", () => wrap(() => getStoragePath()));
  import_electron2.ipcMain.handle("storage.setPath", (_e, p) => wrap(() => {
    updateSettings({ storage_path: p });
    ensureStoragePath();
    return getSettings();
  }));
  import_electron2.ipcMain.handle("storage.chooseFolder", () => wrap(async () => {
    const r = await import_electron2.dialog.showOpenDialog({ title: "Where should ARAY save your memories?", properties: ["openDirectory", "createDirectory"] });
    return r.canceled ? { canceled: true, path: null } : { canceled: false, path: r.filePaths[0] };
  }));
  import_electron2.ipcMain.handle("storage.openFolder", (_e, p) => wrap(() => {
    import_electron2.shell.openPath(p);
    return { success: true };
  }));
  import_electron2.ipcMain.handle("storage.ensure", () => wrap(() => {
    ensureStoragePath();
    return { success: true };
  }));
  import_electron2.ipcMain.handle("camera.list", () => wrap(() => []));
  import_electron2.ipcMain.handle("camera.connect", () => wrap(() => true));
  import_electron2.ipcMain.handle("camera.disconnect", () => wrap(() => void 0));
  import_electron2.ipcMain.handle("settings.get", () => wrap(() => getSettings()));
  import_electron2.ipcMain.handle("settings.update", (_e, partial) => wrap(() => updateSettings(partial)));
  import_electron2.ipcMain.handle("settings.getDefaultStoragePath", () => wrap(() => getDefaultStoragePath()));
  import_electron2.ipcMain.handle("print.listPrinters", async () => {
    try {
      log("[print.listPrinters] Starting printer detection...");
      let printers = [];
      if (mainWindow) {
        try {
          log("[print.listPrinters] Strategy 1: Electron getPrinters()...");
          printers = await mainWindow.webContents.getPrinters();
          log(`[print.listPrinters] Strategy 1 found ${printers.length} printer(s)`);
          printers.forEach((p) => log(`  - ${p.name} (${p.displayName || "no display name"}) status=${p.status} isDefault=${p.isDefault}`));
        } catch (e) {
          log(`[print.listPrinters] Strategy 1 failed: ${e.message}`);
        }
      }
      if (printers.length === 0 && process.platform === "win32") {
        try {
          log("[print.listPrinters] Strategy 2: PowerShell Get-Printer...");
          const { execSync } = require("child_process");
          const output = execSync(
            'powershell -Command "Get-Printer | Select-Object Name, Shared, PortName | ConvertTo-Json"',
            { timeout: 1e4, encoding: "utf8", windowsHide: true }
          );
          log(`[print.listPrinters] PowerShell output: ${output.substring(0, 500)}`);
          const parsed = JSON.parse(output);
          const psPrinters = Array.isArray(parsed) ? parsed : [parsed];
          printers = psPrinters.map((p) => ({
            name: p.Name,
            displayName: p.Name,
            isDefault: false,
            status: 0,
            isDefault: false
          }));
          log(`[print.listPrinters] Strategy 2 found ${printers.length} printer(s)`);
        } catch (e) {
          log(`[print.listPrinters] Strategy 2 failed: ${e.message}`);
        }
      }
      if (printers.length === 0 && process.platform === "win32") {
        try {
          log("[print.listPrinters] Strategy 3: wmic printer get...");
          const { execSync } = require("child_process");
          const output = execSync(
            "wmic printer get Name,Default /format:csv",
            { timeout: 1e4, encoding: "utf8", windowsHide: true }
          );
          log(`[print.listPrinters] wmic output: ${output.substring(0, 500)}`);
          const lines = output.split("\n").filter((l) => l.trim() && !l.includes("Node,"));
          printers = lines.map((line) => {
            const parts = line.split(",").map((s) => s.trim()).filter(Boolean);
            if (parts.length >= 2) {
              return { name: parts[1], displayName: parts[1], isDefault: parts[0] === "TRUE", status: 0 };
            }
            return null;
          }).filter(Boolean);
          log(`[print.listPrinters] Strategy 3 found ${printers.length} printer(s)`);
        } catch (e) {
          log(`[print.listPrinters] Strategy 3 failed: ${e.message}`);
        }
      }
      const result = printers.map((p) => ({
        id: p.name,
        name: p.displayName || p.name,
        is_default: p.isDefault || false,
        status: p.status || 0,
        is_connected: (p.status || 0) === 0
      }));
      log(`[print.listPrinters] Final result: ${result.length} printer(s)`);
      return { success: true, data: result };
    } catch (e) {
      log(`[print.listPrinters] Fatal error: ${e.message}`);
      log(`[print.listPrinters] Stack: ${e.stack}`);
      return { success: false, error: { code: "PRINTER_DETECT_FAILED", message: e.message } };
    }
  });
  import_electron2.ipcMain.handle("print.queue", async (_e, mediaId, printerName, copies, printSettings) => {
    try {
      log(`[print.queue] Request: mediaId=${mediaId}, printer=${printerName || "default"}, copies=${copies || 1}`);
      log(`[print.queue] Print settings:`, JSON.stringify(printSettings || {}));
      const db = loadDB();
      const media = db.media.find((m) => m.id === mediaId);
      if (!media) {
        log(`[print.queue] Media not found: ${mediaId}`);
        return { success: false, error: "Media not found" };
      }
      const filePath = media.processed_path || media.original_path;
      if (!filePath || !fs2.existsSync(filePath)) {
        log(`[print.queue] File not found: ${filePath}`);
        return { success: false, error: "File not found: " + filePath };
      }
      log(`[print.queue] Printing file: ${filePath}`);
      const buffer = fs2.readFileSync(filePath);
      const ext = path2.extname(filePath).toLowerCase().slice(1);
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      const base64 = buffer.toString("base64");
      const dataUrl = `data:${mime};base64,${base64}`;
      const paperSize = printSettings?.paper_size || "4x6";
      const orientation = printSettings?.orientation || "portrait";
      const fit = printSettings?.fit || "contain";
      const color = printSettings?.color !== false;
      const quality = printSettings?.quality || "normal";
      const paperDims = {
        "4x6": { w: 102, h: 152 },
        // 4×6 inch
        "5x7": { w: 127, h: 178 },
        // 5×7 inch
        "A6": { w: 105, h: 148 },
        "A4": { w: 210, h: 297 },
        "Letter": { w: 216, h: 279 }
        // 8.5×11 inch
      };
      let dims;
      if (paperSize === "custom") {
        const customW = parseInt(printSettings?.custom_width) || 100;
        const customH = parseInt(printSettings?.custom_height) || 150;
        dims = { w: customW, h: customH };
        log(`[print.queue] Custom paper size: ${customW}x${customH}mm`);
      } else {
        dims = paperDims[paperSize] || paperDims["4x6"];
      }
      const pageW = orientation === "landscape" ? dims.h : dims.w;
      const pageH = orientation === "landscape" ? dims.w : dims.h;
      const grayscaleFilter = color ? "" : "filter: grayscale(100%);";
      const objectFit = fit === "cover" ? "cover" : "contain";
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
  @page {
    size: ${pageW}mm ${pageH}mm;
    margin: 0;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: ${pageW}mm;
    height: ${pageH}mm;
    overflow: hidden;
  }
  body {
    display: flex;
    justify-content: center;
    align-items: center;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: ${objectFit};
    ${grayscaleFilter}
  }
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
        copies: copies || parseInt(printSettings?.copies) || 1
        // v4.3.3: paperSize di-set via @page CSS di HTML (lebih reliable)
        // deviceName untuk pilih printer
      };
      if (printerName && printerName !== "Default") {
        printOptions.deviceName = printerName;
      }
      if (quality === "high") {
        printOptions.dpi = [600, 600];
      } else if (quality === "draft") {
        printOptions.dpi = [150, 150];
      }
      log(`[print.queue] Print options:`, JSON.stringify(printOptions));
      return new Promise((resolve2) => {
        printWin.webContents.print(printOptions, (success, failureReason) => {
          log(`[print.queue] Print callback: success=${success}, reason=${failureReason || "none"}`);
          printWin.close();
          if (success) {
            resolve2({
              success: true,
              data: {
                id: crypto2.randomUUID(),
                media_id: mediaId,
                printer_name: printerName || "Default",
                paper_size: paperSize,
                copies: printOptions.copies,
                status: "printed",
                created_at: (/* @__PURE__ */ new Date()).toISOString(),
                completed_at: (/* @__PURE__ */ new Date()).toISOString(),
                error: null
              }
            });
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
  import_electron2.ipcMain.handle("googleDrive.connect", () => wrap(async () => {
    const result = await import_electron2.dialog.showOpenDialog({
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
  import_electron2.ipcMain.handle("googleDrive.disconnect", () => wrap(() => {
    updateSettings({ backup_folder: null, auto_backup: false });
    return { success: true };
  }));
  import_electron2.ipcMain.handle("googleDrive.status", () => wrap(() => {
    const stats = getBackupStats();
    return {
      connected: stats.connected,
      folder: stats.folder,
      totalFiles: stats.totalFiles,
      message: stats.connected ? `Backing up to: ${stats.folder}` : "Not connected"
    };
  }));
  import_electron2.ipcMain.handle("sync.start", () => wrap(() => {
    return { started: true, ...backupAllPendingMedia() };
  }));
  import_electron2.ipcMain.handle("sync.pause", () => wrap(() => ({ paused: true })));
  import_electron2.ipcMain.handle("sync.resume", () => wrap(() => {
    return { resumed: true, ...backupAllPendingMedia() };
  }));
  import_electron2.ipcMain.handle("sync.retry", () => wrap(() => {
    return { retrying: true, ...backupAllPendingMedia() };
  }));
  import_electron2.ipcMain.handle("sync.summary", (_e, eventId) => wrap(() => getMediaStats(eventId)));
  log("All IPC handlers registered");
}
import_electron2.protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  },
  // v4.3.5: aray-file:// protocol untuk stream video/media langsung dari disk.
  // Ini menghindari base64 data URL yang bisa choke Chromium pada file besar.
  // Renderer pakai: <video src="aray-file:///C:/Users/.../video.webm">
  {
    scheme: "aray-file",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: true
    }
  }
]);
import_electron2.app.whenReady().then(() => {
  log("========================================");
  log("ARAY starting up (v2.0.0 \u2014 Photo + Video + Templates)");
  log(`Version: ${import_electron2.app.getVersion()}`);
  log(`Electron: ${process.versions.electron}`);
  log(`Node: ${process.versions.node}`);
  log(`Platform: ${process.platform} ${process.arch}`);
  log(`__dirname: ${__dirname}`);
  log(`userData: ${import_electron2.app.getPath("userData")}`);
  log("========================================");
  const rendererDir = path2.join(__dirname, "..", "out", "renderer");
  import_electron2.protocol.handle("app", (request) => {
    try {
      let urlPath = request.url.replace(/^app:\/\/\.?\//, "");
      urlPath = decodeURIComponent(urlPath);
      const filePath = path2.resolve(rendererDir, urlPath);
      if (!filePath.startsWith(path2.resolve(rendererDir))) {
        return new Response("Forbidden", { status: 403 });
      }
      if (!fs2.existsSync(filePath)) {
        log(`[app://] 404: ${urlPath}`);
        return new Response("Not Found", { status: 404 });
      }
      const buffer = fs2.readFileSync(filePath);
      const ext = path2.extname(filePath).toLowerCase();
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
      const isHtml = ext === ".html";
      const headers = new Headers({
        "Content-Type": mime,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": isHtml ? "no-cache" : "public, max-age=86400"
      });
      return new Response(buffer, { status: 200, headers });
    } catch (e) {
      log(`[app://] Error serving ${request.url}: ${e.message}`);
      return new Response("Internal Error", { status: 500 });
    }
  });
  log(`app:// protocol registered \u2014 serving from ${rendererDir}`);
  import_electron2.protocol.handle("aray-file", (request) => {
    try {
      let urlPath = request.url.replace(/^aray-file:\/\/\/?/, "");
      urlPath = decodeURIComponent(urlPath);
      const filePath = process.platform === "win32" ? urlPath.replace(/\//g, "\\") : urlPath;
      log(`[aray-file://] Request: ${request.url.substring(0, 100)}... -> ${filePath}`);
      if (!fs2.existsSync(filePath)) {
        log(`[aray-file://] 404: ${filePath}`);
        return new Response("Not Found", { status: 404 });
      }
      const stat = fs2.statSync(filePath);
      log(`[aray-file://] File size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
      const ext = path2.extname(filePath).toLowerCase();
      const mimeTypes = {
        ".webm": "video/webm",
        ".mp4": "video/mp4",
        ".mov": "video/quicktime",
        ".avi": "video/x-msvideo",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif"
      };
      const mime = mimeTypes[ext] || "application/octet-stream";
      const buffer = fs2.readFileSync(filePath);
      const headers = new Headers({
        "Content-Type": mime,
        "Access-Control-Allow-Origin": "*",
        "Accept-Ranges": "bytes",
        "Content-Length": stat.size.toString()
      });
      const range = request.headers.get("range");
      if (range) {
        const match = range.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          const start = parseInt(match[1]);
          const end = match[2] ? parseInt(match[2]) : stat.size - 1;
          const chunkSize = end - start + 1;
          const chunk = buffer.subarray(start, end + 1);
          log(`[aray-file://] Range: ${start}-${end} (${chunkSize} bytes)`);
          return new Response(chunk, {
            status: 206,
            headers: new Headers({
              "Content-Type": mime,
              "Content-Range": `bytes ${start}-${end}/${stat.size}`,
              "Content-Length": chunkSize.toString(),
              "Accept-Ranges": "bytes",
              "Access-Control-Allow-Origin": "*"
            })
          });
        }
      }
      return new Response(buffer, { status: 200, headers });
    } catch (e) {
      log(`[aray-file://] Error: ${e.message}`);
      log(`[aray-file://] Stack: ${e.stack}`);
      return new Response("Internal Error", { status: 500 });
    }
  });
  log(`aray-file:// protocol registered \u2014 streaming media from disk`);
  try {
    ensureStoragePath();
    log("Storage path ensured");
    registerIPC();
    createWindow();
    log("Window created successfully");
    try {
      const registered = import_electron2.globalShortcut.register("Ctrl+Shift+Alt+Q", () => {
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
      const registered2 = import_electron2.globalShortcut.register("Ctrl+Shift+Q", () => {
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
    import_electron2.dialog.showErrorBox("ARAY \u2014 Error", `${err2.message}

Log: ${getLogPath()}`);
    import_electron2.app.quit();
  }
  import_electron2.app.on("activate", () => {
    if (import_electron2.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
import_electron2.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") import_electron2.app.quit();
});
import_electron2.app.on("before-quit", () => {
  log("[App] before-quit \u2014 flushing DB to disk");
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (dbCache) {
    try {
      const dbPath = getDbPath();
      const tmpPath = dbPath + ".tmp";
      fs2.writeFileSync(tmpPath, JSON.stringify(dbCache, null, 2), "utf8");
      fs2.renameSync(tmpPath, dbPath);
      log("[App] DB flushed successfully");
    } catch (e) {
      log(`[App] DB flush error: ${e.message}`);
    }
  }
});
process.on("uncaughtException", (err2) => {
  log(`UNCAUGHT: ${err2.message}`);
  log(`Stack: ${err2.stack}`);
});
process.on("unhandledRejection", (r) => {
  log(`UNHANDLED: ${String(r)}`);
});
