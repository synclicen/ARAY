import { v4 as uuid } from 'uuid'
import { getDatabase } from '../index'
import type { ArayMedia, AraySession, MediaType, SyncStatus } from '@shared/types'

export function createSession(eventId: string, type: MediaType, shotCount = 1): AraySession {
  const db = getDatabase()
  const session: AraySession = {
    id: uuid(),
    event_id: eventId,
    type,
    shot_count: shotCount,
    created_at: new Date().toISOString()
  }
  db.prepare(
    `INSERT INTO sessions (id, event_id, type, shot_count, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(session.id, session.event_id, session.type, session.shot_count, session.created_at)
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
  const db = getDatabase()
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

  db.prepare(
    `INSERT INTO media
     (id, event_id, session_id, type, original_path, processed_path, thumbnail_path,
      checksum, sync_status, remote_file_id, last_error, created_at, uploaded_at)
     VALUES (@id, @event_id, @session_id, @type, @original_path, @processed_path,
             @thumbnail_path, @checksum, @sync_status, @remote_file_id, @last_error,
             @created_at, @uploaded_at)`
  ).run(media)

  return media
}

export function getMediaById(id: string): ArayMedia | null {
  const db = getDatabase()
  return (db.prepare('SELECT * FROM media WHERE id = ?').get(id) as ArayMedia | undefined) ?? null
}

export function listMedia(filters: {
  event_id?: string
  type?: MediaType
  sync_status?: SyncStatus
  limit?: number
  offset?: number
} = {}): ArayMedia[] {
  const db = getDatabase()
  const conditions: string[] = []
  const params: any[] = []

  if (filters.event_id) {
    conditions.push('event_id = ?')
    params.push(filters.event_id)
  }
  if (filters.type) {
    conditions.push('type = ?')
    params.push(filters.type)
  }
  if (filters.sync_status) {
    conditions.push('sync_status = ?')
    params.push(filters.sync_status)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = filters.limit ?? 500
  const offset = filters.offset ?? 0

  return db
    .prepare(`SELECT * FROM media ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as ArayMedia[]
}

export function updateMediaSyncStatus(
  id: string,
  syncStatus: SyncStatus,
  remoteFileId?: string | null,
  error?: string | null
): void {
  const db = getDatabase()
  const uploadedAt = syncStatus === 'SYNCED' ? new Date().toISOString() : null
  db.prepare(
    `UPDATE media SET
       sync_status = ?, remote_file_id = COALESCE(?, remote_file_id),
       last_error = ?, uploaded_at = COALESCE(?, uploaded_at)
     WHERE id = ?`
  ).run(syncStatus, remoteFileId ?? null, error ?? null, uploadedAt, id)
}

export function deleteMedia(id: string): boolean {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM media WHERE id = ?').run(id)
  return result.changes > 0
}

export function getMediaStats(eventId?: string) {
  const db = getDatabase()
  const where = eventId ? `WHERE event_id = ?` : ''
  const params = eventId ? [eventId] : []
  const row = db
    .prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN sync_status = 'SYNCED' THEN 1 ELSE 0 END) as synced,
         SUM(CASE WHEN sync_status IN ('PENDING','RETRYING','OFFLINE') THEN 1 ELSE 0 END) as pending,
         SUM(CASE WHEN sync_status = 'FAILED' THEN 1 ELSE 0 END) as failed,
         SUM(CASE WHEN sync_status = 'UPLOADING' THEN 1 ELSE 0 END) as uploading
       FROM media ${where}`
    )
    .get(...params) as {
    total: number
    synced: number
    pending: number
    failed: number
    uploading: number
  }

  return row
}
