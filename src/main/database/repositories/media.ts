import { v4 as uuid } from 'uuid'
import { readJSON, writeJSON, appendToArray, getFromArray, listArray, removeFromArray, updateInArray } from '../../storage/json-store'
import type { ArayMedia, AraySession, MediaType, SyncStatus } from '@shared/types'

export function createSession(eventId: string, type: MediaType, shotCount = 1): AraySession {
  const session: AraySession = {
    id: uuid(),
    event_id: eventId,
    type,
    shot_count: shotCount,
    created_at: new Date().toISOString()
  }
  appendToArray<AraySession>('sessions', session)
  return session
}

export interface CreateMediaInput {
  event_id: string
  session_id: string
  type: MediaType
  original_path: string
  processed_path?: string | null
  thumbnail_path?: string | null
  checksum?: string | null
}

export function createMedia(input: CreateMediaInput): ArayMedia {
  const media: ArayMedia = {
    id: uuid(),
    event_id: input.event_id,
    session_id: input.session_id,
    type: input.type,
    original_path: input.original_path,
    processed_path: input.processed_path ?? null,
    thumbnail_path: input.thumbnail_path ?? null,
    checksum: input.checksum ?? null,
    sync_status: 'LOCAL_ONLY',
    remote_file_id: null,
    last_error: null,
    created_at: new Date().toISOString(),
    uploaded_at: null
  }
  appendToArray<ArayMedia>('media', media)
  return media
}

export function getMediaById(id: string): ArayMedia | null {
  return getFromArray<ArayMedia>('media', id)
}

export function listMedia(filters: {
  event_id?: string
  type?: MediaType
  sync_status?: SyncStatus
  limit?: number
  offset?: number
} = {}): ArayMedia[] {
  let result = listArray<ArayMedia>('media')
  if (filters.event_id) result = result.filter((m) => m.event_id === filters.event_id)
  if (filters.type) result = result.filter((m) => m.type === filters.type)
  if (filters.sync_status) result = result.filter((m) => m.sync_status === filters.sync_status)
  const limit = filters.limit ?? 500
  const offset = filters.offset ?? 0
  return result.slice(offset, offset + limit)
}

export function updateMediaSyncStatus(
  id: string,
  syncStatus: SyncStatus,
  remoteFileId?: string | null,
  error?: string | null
): void {
  const updates: Partial<ArayMedia> = {
    sync_status: syncStatus,
    last_error: error ?? null
  }
  if (syncStatus === 'SYNCED') {
    updates.uploaded_at = new Date().toISOString()
  }
  if (remoteFileId) {
    updates.remote_file_id = remoteFileId
  }
  updateInArray<ArayMedia>('media', id, updates)
}

export function deleteMedia(id: string): boolean {
  return removeFromArray<ArayMedia>('media', id)
}

export function getMediaStats(eventId?: string) {
  const media = listArray<ArayMedia>('media')
  const filtered = eventId ? media.filter((m) => m.event_id === eventId) : media
  return {
    total: filtered.length,
    synced: filtered.filter((m) => m.sync_status === 'SYNCED').length,
    pending: filtered.filter((m) => ['PENDING', 'RETRYING', 'OFFLINE'].includes(m.sync_status)).length,
    failed: filtered.filter((m) => m.sync_status === 'FAILED').length,
    uploading: filtered.filter((m) => m.sync_status === 'UPLOADING').length
  }
}
