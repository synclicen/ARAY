/**
 * ARAY — Shared Domain Types
 * Dipakai oleh main process, preload, dan renderer.
 */

export type MediaType = 'photo' | 'gif' | 'boomerang' | 'video' | 'video_guestbook' | 'print'

export type SyncStatus =
  | 'LOCAL_ONLY'
  | 'PENDING'
  | 'UPLOADING'
  | 'SYNCED'
  | 'FAILED'
  | 'RETRYING'
  | 'OFFLINE'

export type EventStatus = 'draft' | 'active' | 'archived' | 'deleted'

export interface ArayEvent {
  id: string
  code: string
  name: string
  client: string | null
  venue: string | null
  event_date: string | null
  operator: string | null
  template_id: string | null
  storage_path: string
  google_drive_folder_id: string | null
  sync_status: SyncStatus
  status: EventStatus
  created_at: string
  updated_at: string
}

export interface AraySession {
  id: string
  event_id: string
  type: MediaType
  shot_count: number
  created_at: string
}

export interface ArayMedia {
  id: string
  event_id: string
  session_id: string
  type: MediaType
  original_path: string
  processed_path: string | null
  thumbnail_path: string | null
  checksum: string | null
  sync_status: SyncStatus
  remote_file_id: string | null
  last_error: string | null
  created_at: string
  uploaded_at: string | null
}

export interface ArayTemplate {
  id: string
  name: string
  width: number
  height: number
  layout: any
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface ArayPrintJob {
  id: string
  media_id: string
  printer_name: string
  paper_size: string
  copies: number
  status: 'queued' | 'printing' | 'printed' | 'failed'
  created_at: string
  completed_at: string | null
  error: string | null
}

export interface AraySettings {
  storage_path: string
  first_run_completed: boolean
  kiosk_mode: boolean
  auto_print: boolean
  auto_sync: boolean
  sync_interval: 'immediately' | '30s' | '1m' | '5m' | 'event_end' | 'manual'
  delete_local_after_sync: boolean
  google_drive_connected: boolean
  google_drive_email: string | null
  camera_device_id: string | null
  printer_name: string | null
  booth_countdown_seconds: number
  booth_shot_count: number
}

export interface StorageInfo {
  path: string
  total_bytes: number
  used_bytes: number
  free_bytes: number
  used_percent: number
  warning: boolean
  critical: boolean
}

export interface CameraDevice {
  id: string
  name: string
  is_connected: boolean
  capabilities: string[]
}

export interface SyncQueueSummary {
  total: number
  synced: number
  pending: number
  failed: number
  uploading: number
}

export interface ArayIPCError {
  code: string
  message: string
  details?: unknown
}

export type ArayIPCResult<T> = { success: true; data: T } | { success: false; error: ArayIPCError }

export interface CreateEventInput {
  name: string
  client?: string
  venue?: string
  event_date?: string
  operator?: string
  template_id?: string
}

export interface UpdateEventInput extends Partial<CreateEventInput> {
  id: string
  status?: EventStatus
}

export interface CaptureResult {
  media_id: string
  original_path: string
  thumbnail_path: string
}
