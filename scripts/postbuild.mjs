/**
 * Postbuild script — copies diagnostic.html to renderer output.
 * Vite doesn't process this file (it's loaded directly by Electron in diagnostic mode).
 */
import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const src = resolve(ROOT, 'src/renderer/diagnostic.html')
const dest = resolve(ROOT, 'out/renderer/diagnostic.html')

if (!existsSync(src)) {
  console.error(`[postbuild] Source not found: ${src}`)
  process.exit(1)
}

mkdirSync(dirname(dest), { recursive: true })
copyFileSync(src, dest)
console.log(`[postbuild] Copied diagnostic.html → ${dest}`)
