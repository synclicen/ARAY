import { ipcMain, IpcMainInvokeEvent, dialog } from 'electron'
import { v4 as uuid } from 'uuid'
import { join } from 'path'
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { createEvent, listEvents, getEventById, updateEvent, deleteEvent, archiveEvent, duplicateEvent } from '../database/repositories/events'
import {
  createSession,
  createMedia,
  listMedia,
  getMediaById,
  deleteMedia,
  getMediaStats,
  updateMediaSyncStatus
} from '../database/repositories/media'
import { getSettings, updateSettings, getDefaultStoragePath } from '../database/repositories/settings'
import {
  getStoragePath,
  setStoragePath,
  ensureStoragePaths,
  ensureEventStorage,
  getStorageInfo,
  openFolder,
  sanitizeFilename
} from '../storage'
import { getPhotoPath, calculateChecksum, getPrintPath } from '../storage/paths'
import { webcamProvider } from '../camera'
import type {
  ArayIPCResult,
  CreateEventInput,
  UpdateEventInput,
  ArayEvent,
  ArayMedia,
  AraySession,
  MediaType,
  StorageInfo,
  CameraDevice
} from '@shared/types'

function ok<T>(data: T): ArayIPCResult<T> {
  return { success: true, data }
}

function err(code: string, message: string, details?: unknown): ArayIPCResult<never> {
  return { success: false, error: { code, message, details } }
}

function wrap<T>(fn: () => T | Promise<T>): Promise<ArayIPCResult<T>> {
  return Promise.resolve()
    .then(() => fn())
    .then((data) => ok<T>(data))
    .catch((e: Error) => {
      console.error('[ARAY IPC ERROR]', e)
      return err('INTERNAL_ERROR', e.message || 'Unknown error')
    })
}

// ==================== EVENTS ====================
function registerEventIPCs() {
  ipcMain.handle('events.create', async (_e, input: CreateEventInput) =>
    wrap(() => {
      const storagePath = getStoragePath()
      const event = createEvent(input, join(storagePath, 'Events'))
      ensureEventStorage(event.code)
      return event
    })
  )

  ipcMain.handle('events.list', async (_e, includeArchived?: boolean) =>
    wrap(() => listEvents(includeArchived ?? false))
  )

  ipcMain.handle('events.get', async (_e, id: string) =>
    wrap(() => getEventById(id))
  )

  ipcMain.handle('events.update', async (_e, input: UpdateEventInput) =>
    wrap(() => updateEvent(input))
  )

  ipcMain.handle('events.delete', async (_e, id: string) =>
    wrap(() => deleteEvent(id))
  )

  ipcMain.handle('events.archive', async (_e, id: string) =>
    wrap(() => archiveEvent(id))
  )

  ipcMain.handle('events.duplicate', async (_e, id: string) =>
    wrap(() => duplicateEvent(id))
  )

  ipcMain.handle('events.openFolder', async (_e, id: string) =>
    wrap(() => {
      const event = getEventById(id)
      if (!event) throw new Error('Event not found')
      if (!existsSync(event.storage_path)) {
        mkdirSync(event.storage_path, { recursive: true })
      }
      openFolder(event.storage_path)
      return { success: true }
    })
  )
}

// ==================== SESSIONS & MEDIA ====================
function registerMediaIPCs() {
  ipcMain.handle('sessions.create', async (_e, eventId: string, type: MediaType, shotCount = 1) =>
    wrap(() => createSession(eventId, type, shotCount))
  )

  ipcMain.handle('media.list', async (_e, filters: Parameters<typeof listMedia>[0]) =>
    wrap(() => listMedia(filters || {}))
  )

  ipcMain.handle('media.get', async (_e, id: string) => wrap(() => getMediaById(id)))

  ipcMain.handle('media.delete', async (_e, id: string) => wrap(() => deleteMedia(id)))

  ipcMain.handle('media.stats', async (_e, eventId?: string) =>
    wrap(() => getMediaStats(eventId))
  )

  /**
   * media.saveCapturedFrame
   * Renderer captures a frame from <canvas> as base64 PNG/JPEG and sends it here.
   * Main process: writes original + thumbnail to disk, registers media row.
   */
  ipcMain.handle(
    'media.saveCapturedFrame',
    async (
      _e,
      payload: {
        event_id: string
        session_id: string
        shot_number: number
        frame_base64: string
        mime_type?: string
        thumbnail_base64?: string
      }
    ) =>
      wrap(async () => {
        const event = getEventById(payload.event_id)
        if (!event) throw new Error('Event not found')

        ensureEventStorage(event.code)

        const ext = payload.mime_type === 'image/png' ? 'png' : 'jpg'
        const paths = getPhotoPath(event.code, payload.session_id, payload.shot_number, ext)

        // Strip data URL prefix if present
        const base64Data = payload.frame_base64.replace(/^data:image\/\w+;base64,/, '')
        const buffer = Buffer.from(base64Data, 'base64')
        writeFileSync(paths.original, buffer)

        // Thumbnail: renderer sends pre-generated thumbnail (canvas resize).
        // Main process just writes it — no sharp dependency needed.
        // If thumbnail_base64 provided, write it; otherwise skip (gallery will
        // load full image and resize on-the-fly via CSS).
        if (payload.thumbnail_base64) {
          try {
            const thumbData = payload.thumbnail_base64.replace(/^data:image\/\w+;base64,/, '')
            writeFileSync(paths.thumbnail, Buffer.from(thumbData, 'base64'))
          } catch (e) {
            console.warn('[ARAY] Thumbnail write failed:', e)
          }
        }

        const checksum = calculateChecksum(paths.original)

        const media = createMedia({
          event_id: payload.event_id,
          session_id: payload.session_id,
          type: 'photo',
          original_path: paths.original,
          thumbnail_path: payload.thumbnail_base64 ? paths.thumbnail : null,
          checksum
        })

        return media
      })
  )

  ipcMain.handle('media.readFile', async (_e, path: string) =>
    wrap(() => {
      if (!existsSync(path)) throw new Error('File not found')
      const buf = readFileSync(path)
      return buf.toString('base64')
    })
  )

  ipcMain.handle('media.updateSyncStatus', async (_e, id: string, status: any, remoteId?: string | null, error?: string | null) =>
    wrap(() => {
      updateMediaSyncStatus(id, status, remoteId, error)
      return { success: true }
    })
  )
}

// ==================== STORAGE ====================
function registerStorageIPCs() {
  ipcMain.handle('storage.getInfo', async () => wrap<StorageInfo>(() => getStorageInfo()))

  ipcMain.handle('storage.getPath', async () => wrap(() => getStoragePath()))

  ipcMain.handle('storage.setPath', async (_e, path: string) =>
    wrap(() => {
      setStoragePath(path)
      ensureStoragePaths()
      return getSettings()
    })
  )

  ipcMain.handle('storage.chooseFolder', async () =>
    wrap(async () => {
      const result = await dialog.showOpenDialog({
        title: 'Where should ARAY save your memories?',
        properties: ['openDirectory', 'createDirectory']
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true, path: null }
      }
      return { canceled: false, path: result.filePaths[0] }
    })
  )

  ipcMain.handle('storage.openFolder', async (_e, path: string) =>
    wrap(() => {
      openFolder(path)
      return { success: true }
    })
  )

  ipcMain.handle('storage.ensure', async () => wrap(async () => {
    await ensureStoragePaths()
    return { success: true }
  }))
}

// ==================== CAMERA ====================
function registerCameraIPCs() {
  ipcMain.handle('camera.list', async () =>
    wrap<CameraDevice[]>(async () => {
      const cams = await webcamProvider.listCameras()
      return cams.map((c) => ({
        id: c.id,
        name: c.name,
        is_connected: c.is_default,
        capabilities: Object.keys(c.capabilities).filter((k) => (c.capabilities as any)[k])
      }))
    })
  )

  ipcMain.handle('camera.connect', async (_e, _deviceId: string) =>
    wrap(() => webcamProvider.connect(_deviceId))
  )

  ipcMain.handle('camera.disconnect', async () => wrap(() => webcamProvider.disconnect()))
}

// ==================== SETTINGS ====================
function registerSettingsIPCs() {
  ipcMain.handle('settings.get', async () => wrap(() => getSettings()))

  ipcMain.handle('settings.update', async (_e, partial: any) =>
    wrap(() => updateSettings(partial))
  )

  ipcMain.handle('settings.getDefaultStoragePath', async () =>
    wrap(() => getDefaultStoragePath())
  )
}

// ==================== PRINT ====================
function registerPrintIPCs() {
  ipcMain.handle('print.queue', async (_e, mediaId: string, printerName?: string, copies = 1) =>
    wrap(() => {
      // Stub: actual print queue logic added in Phase 2
      return {
        id: uuid(),
        media_id: mediaId,
        printer_name: printerName ?? 'Default',
        paper_size: '4x6',
        copies,
        status: 'queued' as const,
        created_at: new Date().toISOString(),
        completed_at: null,
        error: null
      }
    })
  )

  ipcMain.handle('print.listPrinters', async () =>
    wrap(() => {
      // List available Windows printers (stub for Phase 1)
      return []
    })
  )
}

// ==================== GOOGLE DRIVE (stub) ====================
function registerGoogleDriveIPCs() {
  ipcMain.handle('googleDrive.connect', async () =>
    wrap(() => {
      // OAuth flow implemented in Phase 3
      return { connected: false, message: 'Google Drive integration arrives in Phase 3.' }
    })
  )

  ipcMain.handle('googleDrive.disconnect', async () =>
    wrap(() => ({ success: true }))
  )

  ipcMain.handle('googleDrive.status', async () =>
    wrap(() => ({
      connected: false,
      email: null,
      message: 'Not connected'
    }))
  )
}

// ==================== SYNC (stub) ====================
function registerSyncIPCs() {
  ipcMain.handle('sync.start', async () => wrap(() => ({ started: true })))
  ipcMain.handle('sync.pause', async () => wrap(() => ({ paused: true })))
  ipcMain.handle('sync.resume', async () => wrap(() => ({ resumed: true })))
  ipcMain.handle('sync.retry', async () => wrap(() => ({ retrying: true })))
  ipcMain.handle('sync.summary', async (_e, eventId?: string) =>
    wrap(() => {
      const stats = getMediaStats(eventId)
      return {
        total: stats.total,
        synced: stats.synced,
        pending: stats.pending,
        failed: stats.failed,
        uploading: stats.uploading
      }
    })
  )
}

// ==================== APP ====================
function registerAppIPCs() {
  ipcMain.handle('app.getVersion', async () => wrap(() => '1.0.0'))

  ipcMain.handle('app.openExternal', async (_e, url: string) =>
    wrap(() => {
      const { shell } = require('electron')
      shell.openExternal(url)
      return { success: true }
    })
  )
}

export function registerAllIPCHandlers(): void {
  registerEventIPCs()
  registerMediaIPCs()
  registerStorageIPCs()
  registerCameraIPCs()
  registerSettingsIPCs()
  registerPrintIPCs()
  registerGoogleDriveIPCs()
  registerSyncIPCs()
  registerAppIPCs()

  console.log('[ARAY] All IPC handlers registered')
}
