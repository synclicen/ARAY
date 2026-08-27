/**
 * ARAY Storage — JSON file-based storage (no native modules required)
 *
 * Replaces SQLite with simple JSON files. 100% pure JavaScript, no native
 * binary compilation needed. Works on ANY Windows machine without Visual
 * Studio, without electron-rebuild, without ABI compatibility issues.
 *
 * Trade-off: slower for large datasets, but Phase 1 (events, settings, media
 * records) is well within JSON file performance envelope.
 *
 * File layout in userData/storage/:
 *   - settings.json
 *   - events.json (array of events)
 *   - sessions.json (array of sessions)
 *   - media.json (array of media)
 *   - print_jobs.json
 *   - sync_queue.json
 */

import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'

const STORAGE_DIR = 'storage'

function getStorageDir(): string {
  const dir = join(app.getPath('userData'), STORAGE_DIR)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

function getFilePath(name: string): string {
  return join(getStorageDir(), `${name}.json`)
}

/**
 * Read a JSON file. Returns default value if file doesn't exist or is corrupt.
 */
export function readJSON<T>(name: string, defaultValue: T): T {
  try {
    const filePath = getFilePath(name)
    if (!existsSync(filePath)) {
      return defaultValue
    }
    const content = readFileSync(filePath, 'utf8')
    return JSON.parse(content) as T
  } catch (err: any) {
    console.warn(`[ARAY Storage] Failed to read ${name}.json:`, err.message)
    return defaultValue
  }
}

/**
 * Write JSON file atomically (write to temp, then rename).
 * Prevents corruption if app crashes mid-write.
 */
export function writeJSON<T>(name: string, data: T): boolean {
  try {
    const filePath = getFilePath(name)
    const tempPath = `${filePath}.tmp`
    const content = JSON.stringify(data, null, 2)
    writeFileSync(tempPath, content, 'utf8')
    renameSync(tempPath, filePath)
    return true
  } catch (err: any) {
    console.error(`[ARAY Storage] Failed to write ${name}.json:`, err.message)
    return false
  }
}

/**
 * Append item to a JSON array file.
 */
export function appendToArray<T>(name: string, item: T, idField: keyof T = 'id' as any): T {
  const arr = readJSON<T[]>(name, [])
  arr.unshift(item) // newest first
  writeJSON(name, arr)
  return item
}

/**
 * Update item in a JSON array by ID.
 */
export function updateInArray<T extends { id: string }>(
  name: string,
  id: string,
  updates: Partial<T>
): T | null {
  const arr = readJSON<T[]>(name, [])
  const idx = arr.findIndex((item) => item.id === id)
  if (idx === -1) return null
  arr[idx] = { ...arr[idx], ...updates, updated_at: new Date().toISOString() } as T
  writeJSON(name, arr)
  return arr[idx]
}

/**
 * Get item from JSON array by ID.
 */
export function getFromArray<T extends { id: string }>(name: string, id: string): T | null {
  const arr = readJSON<T[]>(name, [])
  return arr.find((item) => item.id === id) ?? null
}

/**
 * Remove item from JSON array by ID.
 */
export function removeFromArray<T extends { id: string }>(name: string, id: string): boolean {
  const arr = readJSON<T[]>(name, [])
  const filtered = arr.filter((item) => item.id !== id)
  if (filtered.length === arr.length) return false
  writeJSON(name, filtered)
  return true
}

/**
 * List all items in a JSON array, with optional filter.
 */
export function listArray<T>(name: string, filterFn?: (item: T) => boolean): T[] {
  const arr = readJSON<T[]>(name, [])
  if (filterFn) return arr.filter(filterFn)
  return arr
}

/**
 * Count items in a JSON array.
 */
export function countArray<T>(name: string, filterFn?: (item: T) => boolean): number {
  return listArray<T>(name, filterFn).length
}

export function getStorageInfo() {
  return {
    type: 'json',
    path: getStorageDir(),
    available: true
  }
}
