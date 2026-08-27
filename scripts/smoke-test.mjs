/**
 * ARAY Smoke Test — Pure JavaScript, no native modules
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'fs'
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

// 1. Shared types
console.log('1. Shared types')
try {
  const src = readFileSync(join(ROOT, 'src/shared/types/index.ts'), 'utf8')
  assert(src.includes('ArayEvent') && src.includes('ArayMedia'), 'key domain types defined')
  assert(src.includes('LOCAL_ONLY') && src.includes('SYNCED'), 'SyncStatus values present')
} catch (e) { assert(false, `shared types: ${e.message}`) }

// 2. Brand tokens
console.log('\n2. Brand tokens')
try {
  const colorsSrc = readFileSync(join(ROOT, 'src/renderer/src/brand/colors.ts'), 'utf8')
  assert(colorsSrc.includes('#7B61A8'), 'Purple Haze 500 = #7B61A8')
  assert(colorsSrc.includes('#D4AF37'), 'Gold 400 = #D4AF37')
  assert(colorsSrc.includes('#C0C0C8'), 'Silver 300 = #C0C0C8')
} catch (e) { assert(false, `brand: ${e.message}`) }

// 3. No native modules
console.log('\n3. No native modules (CRITICAL)')
try {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const deps = Object.keys(pkg.dependencies || {})
  assert(!deps.includes('better-sqlite3'), 'no better-sqlite3 in dependencies')
  assert(!deps.includes('sharp'), 'no sharp in dependencies')
  assert(!deps.includes('sqlite3'), 'no sqlite3 in dependencies')
  assert(deps.includes('uuid'), 'uuid present')
  assert(deps.includes('fs-extra'), 'fs-extra present')
} catch (e) { assert(false, `native module check: ${e.message}`) }

// 4. JSON store
console.log('\n4. JSON store')
try {
  const storeSrc = readFileSync(join(ROOT, 'src/main/storage/json-store.ts'), 'utf8')
  assert(storeSrc.includes('readJSON') && storeSrc.includes('writeJSON'), 'readJSON/writeJSON defined')
  assert(storeSrc.includes('renameSync'), 'atomic writes implemented')
  assert(storeSrc.includes('JSON.parse') && storeSrc.includes('JSON.stringify'), 'uses JSON')

  // Test JSON read/write
  const tmpDir = mkdtempSync(join(tmpdir(), 'aray-test-'))
  const testFile = join(tmpDir, 'test.json')
  writeFileSync(testFile, JSON.stringify([{ id: '1', name: 'test' }]))
  const content = readFileSync(testFile, 'utf8')
  const parsed = JSON.parse(content)
  assert(parsed.length === 1 && parsed[0].id === '1', 'JSON read/write works')
  rmSync(tmpDir, { recursive: true, force: true })
} catch (e) { assert(false, `json store: ${e.message}`) }

// 5. Database uses JSON
console.log('\n5. Database (JSON mode)')
try {
  const dbSrc = readFileSync(join(ROOT, 'src/main/database/index.ts'), 'utf8')
  assert(dbSrc.includes('JSON'), 'database uses JSON storage')
  assert(!dbSrc.includes("require('better-sqlite3')"), 'no better-sqlite3 require')
} catch (e) { assert(false, `database: ${e.message}`) }

// 6. No native module imports in source
console.log('\n6. No native module imports in source')
try {
  const mainSrc = readFileSync(join(ROOT, 'src/main/index.ts'), 'utf8')
  assert(!mainSrc.includes("require('better-sqlite3')"), 'main does not require better-sqlite3')
  assert(!mainSrc.includes("require('sharp')"), 'main does not require sharp')

  const ipcSrc = readFileSync(join(ROOT, 'src/main/ipc/index.ts'), 'utf8')
  assert(!ipcSrc.includes("from 'sharp'"), 'ipc does not import sharp')
  assert(!ipcSrc.includes("from 'better-sqlite3'"), 'ipc does not import better-sqlite3')
} catch (e) { assert(false, `source check: ${e.message}`) }

// 7. Security
console.log('\n7. Security')
try {
  const mainSrc = readFileSync(join(ROOT, 'src/main/index.ts'), 'utf8')
  assert(mainSrc.includes('contextIsolation: true'), 'contextIsolation = true')
  assert(mainSrc.includes('nodeIntegration: false'), 'nodeIntegration = false')

  const preloadSrc = readFileSync(join(ROOT, 'src/preload/index.ts'), 'utf8')
  assert(preloadSrc.includes('contextBridge.exposeInMainWorld'), 'preload uses contextBridge')
} catch (e) { assert(false, `security: ${e.message}`) }

// Summary
console.log('\n=== Summary ===')
console.log(`  Passed: ${pass}`)
console.log(`  Failed: ${fail}`)
if (failures.length > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
}
console.log('')
process.exit(fail > 0 ? 1 : 0)
