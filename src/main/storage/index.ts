import { app, shell } from 'electron'
import { join, normalize } from 'path'
import { statfsSync, type StatsFs } from 'fs'
import { mkdirSync, existsSync } from 'fs-extra'
import { getSettings, updateSetting, getDefaultStoragePath } from '../database/repositories/settings'
import type { StorageInfo } from '@shared/types'

export function getStoragePath(): string {
  return getSettings().storage_path || getDefaultStoragePath()
}

export function setStoragePath(path: string): void {
  updateSetting('storage_path', path)
}

export function ensureStoragePaths(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const base = getStoragePath()
      const dirs = [
        base,
        join(base, 'Events'),
        join(base, 'Templates'),
        join(base, 'Backgrounds'),
        join(base, 'Exports')
      ]
      for (const d of dirs) {
        if (!existsSync(d)) mkdirSync(d, { recursive: true })
      }
      resolve()
    } catch (err) {
      reject(err)
    }
  })
}

export function ensureEventStorage(eventCode: string): string {
  const base = getStoragePath()
  const eventPath = join(base, 'Events', eventCode)
  const subdirs = [
    'Photos/Original',
    'Photos/Edited',
    'Photos/Prints',
    'Photos/Thumbnails',
    'Videos/Original',
    'Videos/Edited',
    'GIF',
    'Boomerang',
    '360',
    'Metadata'
  ]
  for (const sub of subdirs) {
    const p = join(eventPath, sub)
    if (!existsSync(p)) mkdirSync(p, { recursive: true })
  }
  return eventPath
}

export function getStorageInfo(): StorageInfo {
  const path = getStoragePath()
  let totalBytes = 0
  let freeBytes = 0

  try {
    // Node 18+ ships fs.statfsSync natively — no extra dep needed
    const stats: StatsFs = statfsSync(path)
    totalBytes = stats.blocks * stats.bsize
    freeBytes = stats.bfree * stats.bsize
  } catch (err) {
    // Fallback: if the path doesn't exist yet or statfs unsupported
    console.warn('[ARAY] statfs failed for', path, err)
    totalBytes = 0
    freeBytes = 0
  }

  const usedBytes = totalBytes - freeBytes
  const usedPercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0
  const freeGb = freeBytes / 1_000_000_000

  return {
    path,
    total_bytes: totalBytes,
    used_bytes: usedBytes,
    free_bytes: freeBytes,
    used_percent: usedPercent,
    warning: freeGb < 50 && freeGb >= 10,
    critical: freeGb < 10
  }
}

export function openFolder(path: string): void {
  shell.openPath(path)
}

export function isPathWithinStorage(targetPath: string): boolean {
  const base = normalize(getStoragePath())
  const target = normalize(targetPath)
  return target.startsWith(base)
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_\.]/g, '_').slice(0, 200)
}
