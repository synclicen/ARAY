import { v4 as uuid } from 'uuid'
import { readJSON, writeJSON, appendToArray, updateInArray, getFromArray, listArray, removeFromArray } from '../../storage/json-store'
import type { ArayEvent, CreateEventInput, UpdateEventInput } from '@shared/types'
import { app } from 'electron'
import { join } from 'path'

function generateEventCode(): string {
  const year = new Date().getFullYear()
  const events = listArray<ArayEvent>('events')
  const yearEvents = events.filter((e) => e.code.startsWith(`ARAY_EVENT_${year}_`))
  const next = yearEvents.length + 1
  return `ARAY_EVENT_${year}_${String(next).padStart(4, '0')}`
}

function getDefaultStoragePath(): string {
  try {
    return join(app.getPath('documents'), 'ARAY')
  } catch {
    return join(app.getPath('home'), 'ARAY')
  }
}

export function createEvent(input: CreateEventInput, _storagePath?: string): ArayEvent {
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
    storage_path: _storagePath || join(getDefaultStoragePath(), 'Events'),
    google_drive_folder_id: null,
    sync_status: 'LOCAL_ONLY',
    status: 'active',
    created_at: now,
    updated_at: now
  }

  appendToArray<ArayEvent>('events', event)
  return event
}

export function getEventById(id: string): ArayEvent | null {
  return getFromArray<ArayEvent>('events', id)
}

export function listEvents(includeArchived = false): ArayEvent[] {
  const all = listArray<ArayEvent>('events')
  return includeArchived
    ? all.filter((e) => e.status !== 'deleted')
    : all.filter((e) => e.status === 'active')
}

export function updateEvent(input: UpdateEventInput): ArayEvent | null {
  return updateInArray<ArayEvent>('events', input.id, input as any)
}

export function deleteEvent(id: string): boolean {
  return removeFromArray<ArayEvent>('events', id)
}

export function archiveEvent(id: string): ArayEvent | null {
  return updateEvent({ id, status: 'archived' })
}

export function duplicateEvent(id: string): ArayEvent | null {
  const source = getEventById(id)
  if (!source) return null
  const now = new Date().toISOString()
  const dup: ArayEvent = {
    ...source,
    id: uuid(),
    code: generateEventCode(),
    name: `${source.name} (Copy)`,
    sync_status: 'LOCAL_ONLY',
    status: 'active',
    created_at: now,
    updated_at: now
  }
  appendToArray<ArayEvent>('events', dup)
  return dup
}
