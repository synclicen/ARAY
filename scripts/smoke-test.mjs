/**
 * ARAY Smoke Test — verify build artifacts
 */

import { readFileSync, existsSync } from 'fs'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

let pass = 0
let fail = 0
const failures = []

function assert(cond, msg) {
  if (cond) { pass++; console.log(`  ✓ ${msg}`) }
  else { fail++; failures.push(msg); console.log(`  ✗ ${msg}`) }
}

console.log('\n=== ARAY Smoke Test ===\n')

// 1. package.json — no native modules
console.log('1. package.json — no native modules')
try {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  const deps = Object.keys(pkg.dependencies || {})
  assert(!deps.includes('better-sqlite3'), 'no better-sqlite3')
  assert(!deps.includes('sharp'), 'no sharp')
  assert(!deps.includes('sqlite3'), 'no sqlite3')
  assert(pkg.main === 'electron/main.js', 'main = electron/main.js')
} catch (e) { assert(false, `package.json: ${e.message}`) }

// 2. Electron files exist
console.log('\n2. Build artifacts exist')
try {
  assert(existsSync(join(ROOT, 'electron/main.js')), 'electron/main.js exists')
  assert(existsSync(join(ROOT, 'electron/preload.js')), 'electron/preload.js exists')
  assert(existsSync(join(ROOT, 'out/renderer/index.html')), 'out/renderer/index.html exists')
} catch (e) { assert(false, `artifacts: ${e.message}`) }

// 3. No native module references in bundles
console.log('\n3. No native module references in bundles')
try {
  const mainJs = readFileSync(join(ROOT, 'electron/main.js'), 'utf8')
  const preloadJs = readFileSync(join(ROOT, 'electron/preload.js'), 'utf8')
  assert(!mainJs.includes('better-sqlite3'), 'main.js: no better-sqlite3')
  assert(!mainJs.includes('require("sharp")'), 'main.js: no sharp require')
  assert(!preloadJs.includes('better-sqlite3'), 'preload.js: no better-sqlite3')
  assert(mainJs.includes('BrowserWindow'), 'main.js: creates BrowserWindow')
  assert(preloadJs.includes('exposeInMainWorld'), 'preload.js: uses contextBridge')
} catch (e) { assert(false, `bundle check: ${e.message}`) }

// 4. Security
console.log('\n4. Security')
try {
  const mainTs = readFileSync(join(ROOT, 'electron/main.ts'), 'utf8')
  assert(mainTs.includes('contextIsolation: true'), 'contextIsolation = true')
  assert(mainTs.includes('nodeIntegration: false'), 'nodeIntegration = false')
} catch (e) { assert(false, `security: ${e.message}`) }

// 5. Brand tokens
console.log('\n5. Brand tokens')
try {
  const colorsSrc = readFileSync(join(ROOT, 'src/renderer/src/brand/colors.ts'), 'utf8')
  assert(colorsSrc.includes('#7B61A8'), 'Purple Haze 500')
  assert(colorsSrc.includes('#D4AF37'), 'Gold 400')
  assert(colorsSrc.includes('#C0C0C8'), 'Silver 300')
} catch (e) { assert(false, `brand: ${e.message}`) }

console.log('\n=== Summary ===')
console.log(`  Passed: ${pass}`)
console.log(`  Failed: ${fail}`)
if (failures.length > 0) {
  console.log('\nFailures:')
  for (const f of failures) console.log(`  - ${f}`)
}
process.exit(fail > 0 ? 1 : 0)
