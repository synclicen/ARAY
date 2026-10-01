import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { join } from 'path'
import { getStoragePath } from './index'

export function calculateChecksum(filePath: string): string {
  const buffer = readFileSync(filePath)
  return createHash('sha256').update(buffer).digest('hex')
}

export function getPhotoPath(
  eventCode: string,
  sessionId: string,
  shotNumber: number,
  extension = 'jpg'
): { original: string; thumbnail: string; processed: string } {
  const base = getStoragePath()
  const eventDir = join(base, 'Events', eventCode, 'Photos')
  const filename = `${eventCode}_${sessionId}_${String(shotNumber).padStart(3, '0')}`
  return {
    original: join(eventDir, 'Original', `${filename}.${extension}`),
    processed: join(eventDir, 'Edited', `${filename}_edited.${extension}`),
    thumbnail: join(eventDir, 'Thumbnails', `${filename}_thumb.${extension}`)
  }
}

export function getVideoPath(eventCode: string, sessionId: string, extension = 'mp4'): string {
  const base = getStoragePath()
  return join(base, 'Events', eventCode, 'Videos', 'Original', `${eventCode}_${sessionId}.${extension}`)
}

export function getGifPath(eventCode: string, sessionId: string): string {
  const base = getStoragePath()
  return join(base, 'Events', eventCode, 'GIF', `${eventCode}_${sessionId}.gif`)
}

export function getPrintPath(eventCode: string, sessionId: string): string {
  const base = getStoragePath()
  return join(base, 'Events', eventCode, 'Photos', 'Prints', `${eventCode}_${sessionId}_print.jpg`)
}
