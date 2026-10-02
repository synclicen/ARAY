import { v4 as uuid } from 'uuid'
import { getDatabase } from '../index'
import type { ArayEvent, CreateEventInput, UpdateEventInput } from '@shared/types'

function generateEventCode(): string {
  const year = new Date().getFullYear()
  const db = getDatabase()
  const row = db
    .prepare(
      `SELECT code FROM events WHERE code LIKE ? ORDER BY id DESC LIMIT 1`
    )
    .get(`ARAY_EVENT_${year}_%`) as { code: string } | undefined

  let next = 1
  if (row) {
    const match = row.code.match(/_(\d+)$/)
    if (match) next = parseInt(match[1], 10) + 1
  }
  return `ARAY_EVENT_${year}_${String(next).padStart(4, '0')}`
}

export function createEvent(input: CreateEventInput, storagePath: string): ArayEvent {
  const db = getDatabase()
  const now = new Date().toISOString()
  const event: ArayEvent = {
    id: uuid(),
    code: generateEventCode(),
    name: input.name,
    client: input.client ?? null,
    venue: input.venue ?? null,
    event_date: input.event_date ?? null,
    operator: input.operator ?? null,
    template_id: input.template_id ?? null,
    storage_path: storagePath,
    google_drive_folder_id: null,
    sync_status: 'LOCAL_ONLY',
    status: 'active',
    created_at: now,
    updated_at: now
  }

  db.prepare(
    `INSERT INTO events
     (id, code, name, client, venue, event_date, operator, template_id, storage_path,
      google_drive_folder_id, sync_status, status, created_at, updated_at)
     VALUES (@id, @code, @name, @client, @venue, @event_date, @operator, @template_id,
             @storage_path, @google_drive_folder_id, @sync_status, @status, @created_at, @updated_at)`
  ).run(event)

  return event
}

export function getEventById(id: string): ArayEvent | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as ArayEvent | undefined
  return row ?? null
}

export function listEvents(includeArchived = false): ArayEvent[] {
  const db = getDatabase()
  const sql = includeArchived
    ? 'SELECT * FROM events WHERE status != ? ORDER BY created_at DESC'
    : 'SELECT * FROM events WHERE status = ? ORDER BY created_at DESC'
  return db.prepare(sql).all('deleted') as ArayEvent[]
}

export function updateEvent(input: UpdateEventInput): ArayEvent | null {
  const db = getDatabase()
  const existing = getEventById(input.id)
  if (!existing) return null

  const updated: ArayEvent = {
    ...existing,
    ...input,
    updated_at: new Date().toISOString()
  } as ArayEvent

  db.prepare(
    `UPDATE events SET
       name = @name, client = @client, venue = @venue, event_date = @event_date,
       operator = @operator, template_id = @template_id, status = @status,
       sync_status = @sync_status, updated_at = @updated_at
     WHERE id = @id`
  ).run({
    id: updated.id,
    name: updated.name,
    client: updated.client,
    venue: updated.venue,
    event_date: updated.event_date,
    operator: updated.operator,
    template_id: updated.template_id,
    status: updated.status,
    sync_status: updated.sync_status,
    updated_at: updated.updated_at
  })

  return updated
}

export function deleteEvent(id: string): boolean {
  const db = getDatabase()
  const result = db
    .prepare("UPDATE events SET status = 'deleted', updated_at = ? WHERE id = ?")
    .run(new Date().toISOString(), id)
  return result.changes > 0
}

export function archiveEvent(id: string): ArayEvent | null {
  return updateEvent({ id, status: 'archived' })
}

export function duplicateEvent(id: string): ArayEvent | null {
  const source = getEventById(id)
  if (!source) return null
  const now = new Date().toISOString()
  const newId = uuid()
  const newCode = generateEventCode()
  const db = getDatabase()

  db.prepare(
    `INSERT INTO events
     (id, code, name, client, venue, event_date, operator, template_id, storage_path,
      google_drive_folder_id, sync_status, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'LOCAL_ONLY', 'active', ?, ?)`
  ).run(
    newId,
    newCode,
    `${source.name} (Copy)`,
    source.client,
    source.venue,
    source.event_date,
    source.operator,
    source.template_id,
    source.storage_path,
    now,
    now
  )

  return getEventById(newId)
}
