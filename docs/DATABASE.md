# ARAY Database

ARAY uses **SQLite via better-sqlite3** (synchronous, fast, native binding). The database file lives in the OS user-data directory (NOT in the storage path) so it remains accessible even when the storage drive is unmounted.

## Location

| OS | Path |
|---|---|
| Windows | `%APPDATA%\aray\database\aray.db` |
| macOS | `~/Library/Application Support/aray/database/aray.db` |
| Linux | `~/.config/aray/database/aray.db` |

## Pragmas

```sql
PRAGMA journal_mode = WAL;     -- Write-Ahead Logging: concurrent readers + 1 writer
PRAGMA foreign_keys = ON;      -- Enforce FK constraints
PRAGMA synchronous = NORMAL;   -- Safe with WAL, faster than FULL
```

WAL mode is critical: it lets the renderer read stats (e.g., dashboard widgets) while a capture is writing, without blocking.

## Schema (Phase 1)

### `events`

```sql
CREATE TABLE events (
  id                       TEXT PRIMARY KEY,
  code                     TEXT UNIQUE NOT NULL,    -- e.g., ARAY_EVENT_2026_0001
  name                     TEXT NOT NULL,
  client                   TEXT,
  venue                    TEXT,
  event_date               TEXT,                     -- ISO 8601
  operator                 TEXT,
  template_id              TEXT,
  storage_path             TEXT NOT NULL,            -- absolute path on disk
  google_drive_folder_id   TEXT,                     -- Phase 3
  sync_status              TEXT NOT NULL DEFAULT 'LOCAL_ONLY',
  status                   TEXT NOT NULL DEFAULT 'active',  -- draft|active|archived|deleted
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);
```

Event codes are auto-generated as `ARAY_EVENT_<year>_<4-digit-sequence>`. The sequence is determined by querying the highest existing code for that year and incrementing.

### `sessions`

```sql
CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  event_id     TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,    -- photo|gif|boomerang|video|video_guestbook|print
  shot_count   INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL
);
```

A session groups one or more shots captured in sequence (e.g., a 4-shot photo strip is one session with `shot_count=4`).

### `media`

```sql
CREATE TABLE media (
  id                TEXT PRIMARY KEY,
  event_id          TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  session_id        TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type              TEXT NOT NULL,    -- photo|gif|boomerang|video|video_guestbook|print
  original_path     TEXT NOT NULL,    -- absolute path to original file
  processed_path    TEXT,             -- edited version (filter applied)
  thumbnail_path    TEXT,             -- 320×240 JPEG preview
  checksum          TEXT,             -- SHA-256 of original file
  sync_status       TEXT NOT NULL DEFAULT 'LOCAL_ONLY',
  remote_file_id    TEXT,             -- Google Drive file ID (Phase 3)
  last_error        TEXT,             -- last sync failure message
  created_at        TEXT NOT NULL,
  uploaded_at       TEXT              -- set when sync_status flips to SYNCED
);

CREATE INDEX idx_media_event  ON media(event_id);
CREATE INDEX idx_media_sync   ON media(sync_status);
CREATE INDEX idx_media_created ON media(created_at);
```

The `sync_status` column drives the entire sync UI. The flow is always:

```
LOCAL_ONLY → PENDING → UPLOADING → SYNCED
                                ↘ FAILED → RETRYING → UPLOADING → SYNCED
```

The original file is **never** deleted when its media row is deleted from the database — only the database record is removed. This is intentional: even if an event is accidentally deleted, the files remain on disk and can be re-imported in a future Phase 5 "Recover Lost Media" feature.

### `templates`

```sql
CREATE TABLE templates (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  width       INTEGER NOT NULL,    -- pixels (e.g., 1200 for 4×6 at 200 DPI)
  height      INTEGER NOT NULL,
  layout      TEXT NOT NULL,       -- JSON: array of elements (photo slots, text, logos, QR)
  is_default  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
```

The `layout` JSON is interpreted by the Phase 2 template engine. Each element has `{type, x, y, width, height, rotation, opacity, layer, ...props}`.

### `settings`

```sql
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,       -- JSON-serialized
  updated_at  TEXT NOT NULL
);
```

Settings are stored as key-value pairs with JSON-encoded values. This makes schema changes trivial — adding a new setting just means inserting a new row; old code reading a missing key falls back to the default.

Defaults (defined in `src/main/database/repositories/settings.ts`):

```typescript
{
  storage_path: 'D:\\ARAY',
  first_run_completed: false,
  kiosk_mode: false,
  auto_print: false,
  auto_sync: false,
  sync_interval: 'immediately',    // immediately|30s|1m|5m|event_end|manual
  delete_local_after_sync: false,
  google_drive_connected: false,
  google_drive_email: null,
  camera_device_id: null,
  printer_name: null,
  booth_countdown_seconds: 3,
  booth_shot_count: 4
}
```

### `sync_queue`

```sql
CREATE TABLE sync_queue (
  id             TEXT PRIMARY KEY,
  media_id       TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  attempts       INTEGER NOT NULL DEFAULT 0,
  next_retry_at  TEXT,                -- ISO 8601, null = ready immediately
  last_error     TEXT,
  status         TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING|UPLOADING|SYNCED|FAILED
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX idx_sync_status ON sync_queue(status);
CREATE INDEX idx_sync_retry  ON sync_queue(next_retry_at);
```

Phase 3 sync worker polls this table on the configured interval. Exponential backoff: `next_retry_at = now + (1min, 5min, 15min, 30min)` based on `attempts` count.

### `google_drive_accounts`

```sql
CREATE TABLE google_drive_accounts (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  access_token  TEXT,              -- encrypted via Electron safeStorage (Phase 3)
  refresh_token TEXT,              -- encrypted
  token_expiry  TEXT,
  scope         TEXT,
  connected_at  TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
```

**Security note**: tokens are encrypted at rest using Electron's `safeStorage` API (Windows DPAPI under the hood). The renderer never sees raw tokens — all OAuth operations happen in the main process.

### `print_jobs`

```sql
CREATE TABLE print_jobs (
  id           TEXT PRIMARY KEY,
  media_id     TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  printer_name TEXT NOT NULL,
  paper_size   TEXT NOT NULL,     -- 4x6|5x7|2x6|A4|letter
  copies       INTEGER NOT NULL DEFAULT 1,
  status       TEXT NOT NULL DEFAULT 'queued',  -- queued|printing|printed|failed
  created_at   TEXT NOT NULL,
  completed_at TEXT,
  error        TEXT
);
```

### `share_jobs`

```sql
CREATE TABLE share_jobs (
  id           TEXT PRIMARY KEY,
  media_id     TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  method       TEXT NOT NULL,     -- qr|email|sms|whatsapp|airdrop|save
  recipient    TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   TEXT NOT NULL,
  completed_at TEXT,
  error        TEXT
);
```

### `camera_devices`

```sql
CREATE TABLE camera_devices (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  provider    TEXT NOT NULL,      -- webcam|canon|nikon|sony|mirrorless
  capabilities TEXT,              -- JSON: CameraCapability
  is_default  INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT
);
```

### `backgrounds`

```sql
CREATE TABLE backgrounds (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  file_path  TEXT NOT NULL,
  type       TEXT NOT NULL,       -- image|video
  created_at TEXT NOT NULL
);
```

### `surveys` & `survey_responses`

```sql
CREATE TABLE surveys (
  id         TEXT PRIMARY KEY,
  event_id   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  questions  TEXT NOT NULL,       -- JSON array of {id, type, prompt, options?}
  created_at TEXT NOT NULL
);

CREATE TABLE survey_responses (
  id         TEXT PRIMARY KEY,
  survey_id  TEXT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  event_id   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  responses  TEXT NOT NULL,       -- JSON: {questionId: answer}
  created_at TEXT NOT NULL
);
```

### `schema_version`

```sql
CREATE TABLE schema_version (
  version     INTEGER PRIMARY KEY,
  applied_at  TEXT NOT NULL
);
```

Migration tracker. The `runMigrations()` function in `src/main/database/schema.ts` reads the current version, applies any pending migrations in order, and inserts a row per migration.

## Migration Strategy

Migrations are forward-only and stored as an array of SQL strings in `schema.ts`. There is no down-migration — once a column is added, it stays. This is intentional for a local-first app where the database is owned by a single user.

To add a new migration:

```typescript
const MIGRATIONS: string[] = [
  // v1 — initial schema
  `CREATE TABLE IF NOT EXISTS events (...); ...`,

  // v2 — add print_color_profile column (Phase 2 example)
  `ALTER TABLE print_jobs ADD COLUMN color_profile TEXT DEFAULT 'sRGB';`
]
```

The runner automatically applies v2 on next launch if `schema_version.max(version) < 2`.

## Repository Pattern

All database access goes through repository modules in `src/main/database/repositories/`:

- `events.ts` — CRUD + `duplicateEvent`, `archiveEvent`, soft delete
- `media.ts` — CRUD + `updateMediaSyncStatus`, `getMediaStats`
- `settings.ts` — `getSettings`, `updateSettings`, `getDefaultStoragePath`

Repositories are the ONLY modules that touch the database directly. IPC handlers call repositories; repositories call `getDatabase().prepare(...).run(...)`. This keeps SQL isolated and testable.

## Backup & Export

Phase 2 will add an "Export Event" feature that produces `ARAY_EVENT_BACKUP.zip` containing:

- `Photos/`, `Videos/`, `GIF/`, `Boomerang/`, `360/` — all media files
- `Metadata/event.json` — full event row + sessions + media rows
- `Templates/` — any templates referenced by the event
- `Configuration/settings.json` — relevant settings (storage path, booth config)

**OAuth tokens are NEVER included in backups.** The `google_drive_accounts` table is explicitly excluded.
