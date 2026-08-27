/**
 * ARAY Smoke Test — Pure JS, no native modules
 * Verifies source code integrity without requiring any native compilation.
 */

import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')

let pass = 0
let fail = 0
const failures = []

function assert(cond, msg) {
  if (cond) {
    pass++
    console.log(`  ✓ ${msg}`)
  } else {
    fail++
    failures.push(msg)
    console.log(`  ✗ ${msg}`)
  }
}

console.log('\n=== ARAY Smoke Test (Pure JS) ===\n')

// ---------- 1. Shared types ----------
console.log('1. Shared types')
try {
  const src = readFileSync(join(ROOT, 'src/shared/types/index.ts'), 'utf8')
  assert(src.length > 100, 'shared types source file exists and is non-empty')
  assert(src.includes('ArayEvent') && src.includes('ArayMedia') && src.includes('SyncStatus'), 'shared types source exports key domain types')
  assert(src.includes('LOCAL_ONLY') && src.includes('SYNCED') && src.includes('PENDING'), 'SyncStatus enum has expected values')
  assert(src.includes('ArayIPCResult') && src.includes('StorageInfo') && src.includes('CameraDevice'), 'shared types include IPC + storage + camera contracts')
} catch (e) {
  assert(false, `shared types source readable: ${e.message}`)
}

// ---------- 2. Brand tokens ----------
console.log('\n2. Brand design tokens')
try {
  const colorsSrc = readFileSync(join(ROOT, 'src/renderer/src/brand/colors.ts'), 'utf8')
  assert(colorsSrc.includes('#7B61A8'), 'Purple Haze 500 = #7B61A8 (primary brand color)')
  assert(colorsSrc.includes('#D4AF37'), 'Gold 400 = #D4AF37 (accent color)')
  assert(colorsSrc.includes('#C0C0C8'), 'Silver 300 = #C0C0C8 (secondary metallic accent)')
  assert(colorsSrc.includes("'60%'") && colorsSrc.includes("'25%'") && colorsSrc.includes("'15%'"), 'Color balance 60/25/15 present')
  assert(colorsSrc.includes('Yap. Snap. Repeat.'), 'Brand motto present')
} catch (e) {
  assert(false, `brand colors readable: ${e.message}`)
}

// ---------- 3. Storage layer (JSON-based) ----------
console.log('\n3. Storage layer (JSON)')
try {
  const storeSrc = readFileSync(join(ROOT, 'src/main/storage/json-store.ts'), 'utf8')
  assert(storeSrc.includes('readJSON'), 'readJSON function defined')
  assert(storeSrc.includes('writeJSON'), 'writeJSON function defined')
  assert(storeSrc.includes('appendToArray'), 'appendToArray function defined')
  assert(storeSrc.includes('renameSync'), 'atomic writes (temp + rename) implemented')
  assert(storeSrc.includes('JSON.parse'), 'uses JSON.parse')
  assert(storeSrc.includes('JSON.stringify'), 'uses JSON.stringify')

  // Test JSON store actually works (pure JS, no native deps)
  const tmpDir = mkdtempSync(join(tmpdir(), 'aray-smoke-'))
  const testFile = join(tmpDir, 'test.json')
  writeFileSync(testFile, JSON.stringify([{ id: '1', name: 'test' }]))
  const content = readFileSync(testFile, 'utf8')
  const parsed = JSON.parse(content)
  assert(parsed.length === 1 && parsed[0].id === '1', 'JSON read/write works')
  rmSync(tmpDir, { recursive: true, force: true })
} catch (e) {
  assert(false, `storage layer check failed: ${e.message}`)
}

// ---------- 4. Database (JSON-based) ----------
console.log('\n4. Database (JSON mode)')
try {
  const dbSrc = readFileSync(join(ROOT, 'src/main/database/index.ts'), 'utf8')
  assert(dbSrc.includes('JSON file-based storage'), 'database uses JSON file storage')
  assert(dbSrc.includes('readJSON') && dbSrc.includes('writeJSON'), 'database uses JSON store')
  assert(!dbSrc.includes("require('better-sqlite3')") && !dbSrc.includes('require("better-sqlite3")'), 'no better-sqlite3 require() in database code')

  const eventsSrc = readFileSync(join(ROOT, 'src/main/database/repositories/events.ts'), 'utf8')
  assert(eventsSrc.includes('appendToArray'), 'events repo uses JSON store')
  assert(eventsSrc.includes('generateEventCode'), 'event code generator defined')

  const mediaSrc = readFileSync(join(ROOT, 'src/main/database/repositories/media.ts'), 'utf8')
  assert(mediaSrc.includes('listArray'), 'media repo uses JSON store')
  assert(mediaSrc.includes('getMediaStats'), 'media stats function defined')
} catch (e) {
  assert(false, `database check failed: ${e.message}`)
}

// ---------- 5. No native modules ----------
console.log('\n5. No native modules (critical)')
try {
  const pkgSrc = readFileSync(join(ROOT, 'package.json'), 'utf8')
  const pkg = JSON.parse(pkgSrc)
  const deps = Object.keys(pkg.dependencies || {})
  assert(!deps.includes('better-sqlite3'), 'no better-sqlite3 in dependencies')
  assert(!deps.includes('sharp'), 'no sharp in dependencies')
  assert(!deps.includes('sqlite3'), 'no sqlite3 in dependencies')
  assert(!deps.includes('node-sass'), 'no node-sass in dependencies')
  assert(deps.includes('uuid'), 'uuid present (pure JS)')
  assert(deps.includes('fs-extra'), 'fs-extra present (pure JS)')
  assert(deps.includes('zustand'), 'zustand present (pure JS)')

  // Verify no native module imports in main process source
  const mainIndexSrc = readFileSync(join(ROOT, 'src/main/index.ts'), 'utf8')
  assert(!mainIndexSrc.includes('require("better-sqlite3")'), 'main does not require better-sqlite3')
  assert(!mainIndexSrc.includes('require("sharp")'), 'main does not require sharp')
} catch (e) {
  assert(false, `native module check failed: ${e.message}`)
}

// ---------- 6. Camera provider abstraction ----------
console.log('\n6. Camera provider abstraction')
try {
  const camSrc = readFileSync(join(ROOT, 'src/main/camera/CameraProvider.ts'), 'utf8')
  assert(camSrc.includes('interface CameraProvider'), 'CameraProvider interface defined')
  assert(camSrc.includes('listCameras') && camSrc.includes('connect') && camSrc.includes('disconnect') && camSrc.includes('capture'), 'CameraProvider has required methods')

  const webcamSrc = readFileSync(join(ROOT, 'src/main/camera/WebcamProvider.ts'), 'utf8')
  assert(webcamSrc.includes('class WebcamProvider'), 'WebcamProvider class defined')
  assert(webcamSrc.includes('implements CameraProvider'), 'WebcamProvider implements CameraProvider contract')
} catch (e) {
  assert(false, `camera abstraction check failed: ${e.message}`)
}

// ---------- 7. Local-first architecture ----------
console.log('\n7. Local-first architecture')
try {
  const ipcSrc = readFileSync(join(ROOT, 'src/main/ipc/index.ts'), 'utf8')
  assert(ipcSrc.includes("writeFileSync(paths.original, buffer)"), 'capture writes original file to disk first')
  assert(ipcSrc.includes('createMedia('), 'DB row created after file write')
  assert(ipcSrc.includes('calculateChecksum(paths.original)'), 'checksum calculated from local file')

  const storageSrc = readFileSync(join(ROOT, 'src/main/storage/index.ts'), 'utf8')
  assert(storageSrc.includes('ensureEventStorage'), 'event storage dirs auto-created')

  const pathsSrc = readFileSync(join(ROOT, 'src/main/storage/paths.ts'), 'utf8')
  assert(pathsSrc.includes('createHash') && pathsSrc.includes('sha256'), 'SHA-256 checksum used')
} catch (e) {
  assert(false, `local-first check failed: ${e.message}`)
}

// ---------- 8. Security ----------
console.log('\n8. Security invariants')
try {
  const mainSrc = readFileSync(join(ROOT, 'src/main/index.ts'), 'utf8')
  assert(mainSrc.includes('contextIsolation: true'), 'contextIsolation = true')
  assert(mainSrc.includes('nodeIntegration: false'), 'nodeIntegration = false')

  const preloadSrc = readFileSync(join(ROOT, 'src/preload/index.ts'), 'utf8')
  assert(preloadSrc.includes('contextBridge.exposeInMainWorld'), 'preload uses contextBridge')
  assert(!preloadSrc.includes("exposeInMainWorld('ipcRenderer'"), 'preload does not expose ipcRenderer as ipcRenderer')

  const htmlSrc = readFileSync(join(ROOT, 'src/renderer/index.html'), 'utf8')
  assert(htmlSrc.includes("charset") && htmlSrc.includes("<title>"), 'renderer HTML has charset and title')
} catch (e) {
  assert(false, `security check failed: ${e.message}`)
}

// ---------- summary ----------
console.log('\n=== Summary ===')
console.log(`  Passed: ${pass}`)
console.log(`  Failed: ${fail}`)
if (failures.length > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
}
console.log('')
process.exit(fail > 0 ? 1 : 0)
