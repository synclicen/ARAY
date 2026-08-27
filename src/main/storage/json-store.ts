/**
 * ARAY Storage — JSON file-based storage (no native modules required)
 *
 * Replaces SQLite with simple JSON files. 100% pure JavaScript.
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

export function appendToArray<T>(name: string, item: T): T {
  const arr = readJSON<T[]>(name, [])
  arr.unshift(item)
  writeJSON(name, arr)
  return item
}

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

export function getFromArray<T extends { id: string }>(name: string, id: string): T | null {
  const arr = readJSON<T[]>(name, [])
  return arr.find((item) => item.id === id) ?? null
}

export function removeFromArray<T extends { id: string }>(name: string, id: string): boolean {
  const arr = readJSON<T[]>(name, [])
  const filtered = arr.filter((item) => item.id !== id)
  if (filtered.length === arr.length) return false
  writeJSON(name, filtered)
  return true
}

export function listArray<T>(name: string, filterFn?: (item: T) => boolean): T[] {
  const arr = readJSON<T[]>(name, [])
  if (filterFn) return arr.filter(filterFn)
  return arr
}

export function getStorageInfo() {
  return {
    type: 'json',
    path: getStorageDir(),
    available: true
  }
}
