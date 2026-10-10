/**
 * ARAY Android — IPC Shim Layer
 *
 * Replaces Electron's window.aray API with Capacitor/local storage equivalents.
 * This file is loaded ONLY in Android build — Electron build uses preload.ts.
 */

import { Preferences } from '@capacitor/preferences'

const DB_KEY = 'aray_database'

async function loadDB() {
  const { value } = await Preferences.get({ key: DB_KEY })
  if (value) { try { return JSON.parse(value) } catch {} }
  return { events: [], sessions: [], media: [], settings: {} }
}

async function saveDB(db: any) {
  await Preferences.set({ key: DB_KEY, value: JSON.stringify(db) })
}

const DEFAULT_SETTINGS = {
  storage_path: '', first_run_completed: false, kiosk_mode: false,
  auto_print: false, auto_sync: false, sync_interval: 'immediately',
  delete_local_after_sync: false, google_drive_connected: false,
  google_drive_email: null, camera_device_id: null, printer_name: null,
  booth_countdown_seconds: 3, booth_shot_count: 4,
  selected_template_id: 'classic-strip-4', booth_mode: 'combined',
  backup_folder: null, auto_backup: false,
  camera_effect: 'original', camera_effect_video: 'original',
  aspect_ratio: '9:16', aspect_ratio_video: '9:16',
  video_template: 'viral-bounce-10', palm_trigger: false,
  palm_trigger_sensitivity: 0.6, booth_fullscreen_password: 'aray',
  share_qr_enabled: false, share_qr_link: '',
  show_print_button: true, show_share_button: true,
  print_paper_size: '4x6', print_copies: 1, print_color: true,
  print_orientation: 'portrait', print_quality: 'normal', print_fit: 'contain',
  // v4.6.5: camera facing + mirror settings (mobile)
  camera_facing: 'user',       // 'user' (front) or 'environment' (back)
  camera_mirror: true          // mirror preview (natural for front cam)
}

async function getSettings() {
  const db = await loadDB()
  const s = { ...DEFAULT_SETTINGS, ...db.settings }
  s.google_drive_connected = !!db.settings.backup_folder
  return s
}

async function updateSettings(partial: any) {
  const db = await loadDB()
  db.settings = { ...db.settings, ...partial }
  await saveDB(db)
  return getSettings()
}

const arayAPI = {
  isElectron: false, isAndroid: true,
  app: {
    getVersion: async () => ({ success: true, data: '4.6.4' }),
    openExternal: async (url: string) => { window.open(url, '_blank'); return { success: true } }
  },
  license: {
    status: async () => ({ success: true, data: {
      isValid: true, isGracePeriod: false, isExpired: false, daysRemaining: 30,
      graceDaysRemaining: 0, licenseType: 'monthly',
      expiresAt: new Date(Date.now() + 30*86400000).toISOString(),
      machineId: 'android', displayMachineId: 'ANDROID', firstRunDate: null
    }}),
    activate: async () => ({ success: true, licenseType: 'monthly' }),
    generate: async () => ({ success: false, error: 'Not available' }),
    getMachineId: async () => ({ success: true, data: { machineId: 'android', displayMachineId: 'ANDROID' }})
  },
  events: {
    create: async (input: any) => {
      const db = await loadDB()
      const ev = { id: crypto.randomUUID(),
        code: `ARAY_EVENT_${new Date().getFullYear()}_${String(db.events.length+1).padStart(4,'0')}`,
        name: input.name, client: input.client||null, venue: input.venue||null,
        event_date: input.event_date||null, operator: input.operator||null,
        template_id: input.template_id||null, storage_path: '',
        google_drive_folder_id: null, sync_status: 'LOCAL_ONLY', status: 'active',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }
      db.events.unshift(ev); await saveDB(db)
      return { success: true, data: ev }
    },
    list: async () => { const db = await loadDB(); return { success: true, data: db.events }},
    get: async (id: string) => { const db = await loadDB(); return { success: true, data: db.events.find((e:any)=>e.id===id)||null }},
    update: async (input: any) => {
      const db = await loadDB()
      const idx = db.events.findIndex((e:any)=>e.id===input.id)
      if (idx!==-1) { db.events[idx] = {...db.events[idx], ...input, updated_at: new Date().toISOString()}; await saveDB(db); return { success: true, data: db.events[idx] }}
      return { success: false, error: { code: 'NOT_FOUND', message: 'Not found' }}
    },
    delete: async (id: string) => { const db = await loadDB(); db.events = db.events.filter((e:any)=>e.id!==id); await saveDB(db); return { success: true, data: true }},
    archive: async (id: string) => arayAPI.events.update({ id, status: 'archived' }),
    duplicate: async (id: string) => {
      const db = await loadDB()
      const ev = db.events.find((e:any)=>e.id===id)
      if (!ev) return { success: false, error: { code: 'NOT_FOUND', message: 'Not found' }}
      const copy = {...ev, id: crypto.randomUUID(), name: ev.name+' (Copy)', created_at: new Date().toISOString()}
      db.events.unshift(copy); await saveDB(db)
      return { success: true, data: copy }
    },
    openFolder: async () => ({ success: true })
  },
  sessions: {
    create: async (eventId: string, type: string, shotCount?: number) => {
      const db = await loadDB()
      const s = { id: crypto.randomUUID(), event_id: eventId, type, shot_count: shotCount||1, created_at: new Date().toISOString() }
      db.sessions.push(s); await saveDB(db)
      return { success: true, data: s }
    }
  },
  media: {
    list: async (filters: any = {}) => {
      const db = await loadDB()
      let r = db.media
      if (filters.event_id) r = r.filter((m:any)=>m.event_id===filters.event_id)
      if (filters.type) r = r.filter((m:any)=>m.type===filters.type)
      return { success: true, data: r.slice(0, 500) }
    },
    get: async (id: string) => { const db = await loadDB(); return { success: true, data: db.media.find((m:any)=>m.id===id)||null }},
    delete: async (id: string) => { const db = await loadDB(); db.media = db.media.filter((m:any)=>m.id!==id); await saveDB(db); return { success: true, data: true }},
    stats: async (eventId?: string) => {
      const db = await loadDB()
      const f = eventId ? db.media.filter((m:any)=>m.event_id===eventId) : db.media
      return { success: true, data: { total: f.length, synced: f.filter((m:any)=>m.sync_status==='SYNCED').length, pending: f.filter((m:any)=>m.sync_status==='PENDING').length, failed: 0, uploading: 0 }}
    },
    saveCapturedFrame: async (p: any) => {
      const db = await loadDB()
      const m = { id: crypto.randomUUID(), event_id: p.event_id, session_id: p.session_id, type: 'photo',
        original_path: `data:image/jpeg;base64,${p.frame_base64}`, thumbnail_path: `data:image/jpeg;base64,${p.frame_base64}`,
        checksum: null, sync_status: 'LOCAL_ONLY', remote_file_id: null, last_error: null,
        created_at: new Date().toISOString(), uploaded_at: null }
      db.media.unshift(m); await saveDB(db)
      return { success: true, data: m }
    },
    saveVideo: async (p: any) => {
      const db = await loadDB()
      const m = { id: crypto.randomUUID(), event_id: p.event_id, session_id: p.session_id, type: 'video',
        original_path: `data:video/webm;base64,${p.video_base64}`, thumbnail_path: null,
        checksum: null, sync_status: 'LOCAL_ONLY', remote_file_id: null, last_error: null,
        created_at: new Date().toISOString(), uploaded_at: null }
      db.media.unshift(m); await saveDB(db)
      return { success: true, data: m }
    },
    saveComposite: async (p: any) => {
      const db = await loadDB()
      const m = { id: crypto.randomUUID(), event_id: p.event_id, session_id: p.session_id, type: 'photo',
        original_path: `data:image/jpeg;base64,${p.image_base64}`, thumbnail_path: `data:image/jpeg;base64,${p.image_base64}`,
        checksum: null, sync_status: 'LOCAL_ONLY', remote_file_id: null, last_error: null,
        created_at: new Date().toISOString(), uploaded_at: null, processed_path: `data:image/jpeg;base64,${p.image_base64}` }
      db.media.unshift(m); await saveDB(db)
      return { success: true, data: m }
    },
    readFile: async (path: string) => {
      if (path.startsWith('data:')) return { success: true, data: path.split(',')[1] }
      return { success: false, error: 'Not found' }
    },
    getFileInfo: async (path: string) => {
      if (path.startsWith('data:')) { const b = path.split(',')[1]; const s = Math.floor(b.length*0.75); return { success: true, data: { size: s, sizeMB: Math.round(s/1048576*100)/100, exists: true }}}
      return { success: false, error: 'Not found' }
    },
    openInFolder: async () => ({ success: true }),
    updateSyncStatus: async (id: string, status: string) => {
      const db = await loadDB()
      const idx = db.media.findIndex((m:any)=>m.id===id)
      if (idx!==-1) { db.media[idx].sync_status = status; if (status==='SYNCED') db.media[idx].uploaded_at = new Date().toISOString(); await saveDB(db) }
      return { success: true }
    }
  },
  storage: {
    getInfo: async () => ({ success: true, data: { path: '/android', total_bytes: 0, used_bytes: 0, free_bytes: 0, used_percent: 0, warning: false, critical: false }}),
    getPath: async () => ({ success: true, data: '/android' }),
    setPath: async () => ({ success: true, data: await getSettings() }),
    chooseFolder: async () => ({ canceled: true, path: null }),
    openFolder: async () => ({ success: true }),
    ensure: async () => ({ success: true })
  },
  camera: { list: async () => ({ success: true, data: [] }), connect: async () => ({ success: true }), disconnect: async () => ({ success: true })},
  settings: { get: async () => ({ success: true, data: await getSettings() }), update: async (p: any) => ({ success: true, data: await updateSettings(p) }), getDefaultStoragePath: async () => ({ success: true, data: '/android' })},
  print: { queue: async () => ({ success: false, error: 'Print not available on Android' }), listPrinters: async () => ({ success: true, data: [] })},
  googleDrive: { connect: async () => ({ connected: false, message: 'Not available' }), disconnect: async () => ({ success: true }), status: async () => ({ connected: false, folder: null, totalFiles: 0, message: 'Not available' })},
  sync: { start: async () => ({ success: true, data: { started: true, backed: 0, skipped: 0, failed: 0 }}), pause: async () => ({ paused: true }), resume: async () => ({ resumed: true, backed: 0, skipped: 0, failed: 0 }), retry: async () => ({ retrying: true, backed: 0, skipped: 0, failed: 0 }), summary: async (eventId?: string) => arayAPI.media.stats(eventId) },
  fs: { readAsDataURL: async (p: string) => p.startsWith('data:') ? { success: true, data: p } : { success: false, error: 'Not found' }, exists: async (p: string) => ({ success: p.startsWith('data:') }), showOpenDialog: async () => ({ success: false, data: null }) }
}

;(window as any).aray = arayAPI
export {}
