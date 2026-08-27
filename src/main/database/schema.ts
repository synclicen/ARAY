import type Database from 'better-sqlite3'

const MIGRATIONS: string[] = [
  // v1 — initial schema
  `
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    client TEXT,
    venue TEXT,
    event_date TEXT,
    operator TEXT,
    template_id TEXT,
    storage_path TEXT NOT NULL,
    google_drive_folder_id TEXT,
    sync_status TEXT NOT NULL DEFAULT 'LOCAL_ONLY',
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    type TEXT NOT NULL,
    shot_count INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    type TEXT NOT NULL,
    original_path TEXT NOT NULL,
    processed_path TEXT,
    thumbnail_path TEXT,
    checksum TEXT,
    sync_status TEXT NOT NULL DEFAULT 'LOCAL_ONLY',
    remote_file_id TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    uploaded_at TEXT,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_media_event ON media(event_id);
  CREATE INDEX IF NOT EXISTS idx_media_sync ON media(sync_status);
  CREATE INDEX IF NOT EXISTS idx_media_created ON media(created_at);

  CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    layout TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sync_queue (
    id TEXT PRIMARY KEY,
    media_id TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_retry_at TEXT,
    last_error TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_queue(status);
  CREATE INDEX IF NOT EXISTS idx_sync_retry ON sync_queue(next_retry_at);

  CREATE TABLE IF NOT EXISTS google_drive_accounts (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    token_expiry TEXT,
    scope TEXT,
    connected_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS print_jobs (
    id TEXT PRIMARY KEY,
    media_id TEXT NOT NULL,
    printer_name TEXT NOT NULL,
    paper_size TEXT NOT NULL,
    copies INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'queued',
    created_at TEXT NOT NULL,
    completed_at TEXT,
    error TEXT,
    FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS share_jobs (
    id TEXT PRIMARY KEY,
    media_id TEXT NOT NULL,
    method TEXT NOT NULL,
    recipient TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    completed_at TEXT,
    error TEXT,
    FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS camera_devices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    capabilities TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    last_used_at TEXT
  );

  CREATE TABLE IF NOT EXISTS backgrounds (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS surveys (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL,
    name TEXT NOT NULL,
    questions TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS survey_responses (
    id TEXT PRIMARY KEY,
    survey_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    responses TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );
  `
]

export function runMigrations(db: Database.Database): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`)

  const getCurrentVersion = db.prepare('SELECT MAX(version) as v FROM schema_version')
  const row = getCurrentVersion.get() as { v: number | null }
  const currentVersion = row.v ?? 0

  for (let i = currentVersion; i < MIGRATIONS.length; i++) {
    const migration = MIGRATIONS[i]
    db.exec(migration)
    db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(
      i + 1,
      new Date().toISOString()
    )
    console.log(`[ARAY] Applied migration v${i + 1}`)
  }
}
