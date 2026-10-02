# ARAY Google Drive Integration (Phase 3 — design preview)

> ⚠️ **Status**: Not yet implemented in Phase 1. This document specifies the design that Phase 3 will deliver.

## Overview

ARAY's Google Drive integration is **optional** and **additive**. The app is fully functional without it — every capture saves to local disk first, registered in the database, and surfaced in the gallery. Google Drive is a synchronization layer, never the primary storage.

### Design principles

1. **Local-first always** — file written + checksum verified + DB row inserted BEFORE any upload begins.
2. **OAuth 2.0, never passwords** — ARAY never asks for or stores the user's Google password.
3. **Minimum scope** — `drive.file` only (access files ARAY creates, nothing else).
4. **Encrypted at rest** — tokens encrypted via Electron `safeStorage` (Windows DPAPI).
5. **Resilient** — internet down? Captures continue, sync resumes when reconnected.
6. **No data loss** — local files deleted only after remote verification, and only if the operator explicitly opts in.

## Google Cloud Project Setup

### Step 1 — Create project

1. Go to <https://console.cloud.google.com/>
2. Click the project dropdown → **New Project**
3. Name: `ARAY Booth` (or your org name)
4. Click **Create**

### Step 2 — Enable Google Drive API

1. In the new project, open **APIs & Services → Library**
2. Search for **Google Drive API**
3. Click **Enable**

### Step 3 — Configure OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**
2. Choose **External** (unless you have a Google Workspace and want internal)
3. Fill in:
   - App name: `ARAY`
   - User support email: your email
   - Developer contact: your email
4. Click **Save and Continue**
5. **Scopes** page:
   - Click **Add or Remove Scopes**
   - Add: `https://www.googleapis.com/auth/drive.file`
   - Click **Save and Continue**
6. **Test users** page:
   - Add your Google account email as a test user
   - Click **Save and Continue**

> **Why `drive.file`?** This scope only grants access to files that ARAY creates or opens. ARAY cannot read, modify, or delete any other file in the user's Drive. This is the minimum scope that satisfies the sync use case.

### Step 4 — Create OAuth credentials

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth client ID**
3. Application type: **Desktop app** (NOT Web application — ARAY is a desktop app)
4. Name: `ARAY Desktop`
5. Click **Create**
6. **Copy the Client ID** — you'll need it for ARAY's config
7. The Client Secret is also shown, but ARAY does NOT hardcode it. Instead, ARAY uses the **installed-app flow** where the secret is bundled but treated as semi-public (Google's design for desktop apps).

### Step 5 — Configure ARAY

Phase 3 will add a `google_drive` section to Settings:

```typescript
// src/main/database/repositories/settings.ts (Phase 3 addition)
{
  google_drive_client_id: '<paste your client id here>',
  google_drive_client_secret: '<paste your client secret here>',
  // OR: read from environment variable ARAY_GOOGLE_CLIENT_ID
}
```

The Client ID is stored in the SQLite `settings` table (NOT encrypted — it's semi-public). The Client Secret is also stored in settings but encrypted via `safeStorage` (defense in depth, even though Google considers desktop app secrets semi-public).

## OAuth Flow (Phase 3 implementation)

### Connect flow

```
[User clicks "Connect Google Drive" in Settings]
         │
         ▼
[Main process spawns temporary HTTP server on 127.0.0.1:PORT]
         │
         ▼
[Main process opens default browser to:
  https://accounts.google.com/o/oauth2/v2/auth?
    client_id=<CLIENT_ID>&
    redirect_uri=http://127.0.0.1:PORT/callback&
    response_type=code&
    scope=https://www.googleapis.com/auth/drive.file&
    access_type=offline&
    prompt=consent&
    state=<CSRF_TOKEN>
]
         │
         ▼
[User signs in to Google in their browser]
[NB: ARAY never sees the user's password]
         │
         ▼
[Google redirects to http://127.0.0.1:PORT/callback?code=AUTH_CODE&state=CSRF_TOKEN]
         │
         ▼
[Main process validates state matches CSRF_TOKEN]
         │
         ▼
[Main process exchanges AUTH_CODE for tokens:
  POST https://oauth2.googleapis.com/token
    client_id=<CLIENT_ID>&
    client_secret=<CLIENT_SECRET>&
    code=<AUTH_CODE>&
    grant_type=authorization_code&
    redirect_uri=http://127.0.0.1:PORT/callback
]
         │
         ▼
[Main process receives:
  {
    access_token: "...",
    expires_in: 3600,
    refresh_token: "...",
    scope: "https://www.googleapis.com/auth/drive.file",
    token_type: "Bearer"
  }
]
         │
         ▼
[Main process encrypts tokens via safeStorage]
[Main process inserts row in google_drive_accounts table]
         │
         ▼
[Main process fetches user profile:
  GET https://www.googleapis.com/drive/v3/about?fields=user
  → { user: { displayName, emailAddress } }
]
         │
         ▼
[Main process updates settings: google_drive_connected=true, google_drive_email=user@email.com]
         │
         ▼
[Temporary HTTP server shuts down]
[Renderer shows "Connected as user@email.com"]
```

### Token refresh

Access tokens expire after 1 hour. ARAY refreshes them automatically:

```
[Sync worker needs to upload a file]
         │
         ▼
[Check google_drive_accounts.token_expiry]
         │
         ▼
[If expired (or expires in < 60s):
  POST https://oauth2.googleapis.com/token
    client_id=<CLIENT_ID>&
    client_secret=<CLIENT_SECRET>&
    refresh_token=<ENCRYPTED_REFRESH_TOKEN_DECRYPTED>&
    grant_type=refresh_token
  → new access_token, new expires_in
]
         │
         ▼
[Update google_drive_accounts: access_token, token_expiry]
         │
         ▼
[Proceed with upload using fresh access_token]
```

If refresh fails (refresh token revoked, user changed password, etc.):
1. Mark `google_drive_accounts` row as invalid
2. Flip `settings.google_drive_connected = false`
3. Surface a notification: "Google Drive disconnected. Please reconnect in Settings."
4. Continue capturing locally — no data loss

## Folder Structure on Drive

When an event is created AND Google Drive is connected, ARAY creates a mirrored folder structure:

```
Google Drive root/
└── ARAY/                                    ← app root folder
    └── Events/
        └── ARAY_EVENT_2026_0001/
            ├── Photos/
            │   ├── Original/
            │   ├── Edited/
            │   ├── Prints/
            │   └── Thumbnails/
            ├── Videos/
            │   ├── Original/
            │   └── Edited/
            ├── GIF/
            ├── Boomerang/
            ├── 360/
            └── Metadata/
```

### Folder creation strategy

ARAY creates the root `ARAY/` folder on first connect (not per-event). Per-event folders are created lazily when the first media file from that event is queued for sync.

Folders are created via:

```
POST https://www.googleapis.com/drive/v3/files
  {
    name: "ARAY_EVENT_2026_0001",
    mimeType: "application/vnd.google-apps.folder",
    parents: ["<ARAY_FOLDER_ID>"]
  }
```

The returned `id` is stored in `events.google_drive_folder_id` to avoid re-creating.

## Upload Flow

### Resumable upload

For files > 5MB, ARAY uses Google Drive's resumable upload protocol:

```
1. Initiate resumable session:
   POST https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable
     Authorization: Bearer <access_token>
     X-Upload-Content-Type: image/jpeg
     X-Upload-Content-Length: <file_size>
     Body: { name: "ARAY_EVENT_2026_0001_001.jpg", parents: ["<folder_id>"] }
   → Returns Location: <resumable_session_url>

2. Upload chunks (8MB each):
   PUT <resumable_session_url>
     Content-Range: bytes 0-8388607/<file_size>
     Body: <first 8MB>

3. If interrupted:
   PUT <resumable_session_url>
     Content-Range: bytes */<file_size>
     Content-Length: 0
   → Returns 308 with Range: bytes=0-<last_received_byte> header
   → Resume from <last_received_byte + 1>

4. Final chunk:
   PUT <resumable_session_url>
     Content-Range: bytes <last>-<file_size-1>/<file_size>
     Body: <final chunk>
   → Returns 200 with file metadata (including id)
```

### Small files (< 5MB)

Simple multipart upload:

```
POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart
  Boundary-separated body:
    --boundary
    Content-Type: application/json; charset=UTF-8
    { "name": "thumb_001.jpg", "parents": ["<folder_id>"] }
    --boundary
    Content-Type: image/jpeg
    <binary data>
    --boundary--
```

### Verification

After upload completes, ARAY:

1. Stores the returned `file_id` in `media.remote_file_id`
2. Issues a `GET https://www.googleapis.com/drive/v3/files/<file_id>?fields=id,name,size,md5Checksum`
3. Compares the remote `md5Checksum` against the local SHA-256 (after converting MD5 to comparable form — actually ARAY will store the remote MD5 separately and trust Google's verification)
4. If verification passes: `media.sync_status = SYNCED`, `media.uploaded_at = now`
5. If verification fails: `media.sync_status = FAILED`, `media.last_error = "Checksum mismatch"`, retry queued

## Sync Queue & Worker (Phase 3)

### Queue

Every newly captured media item (when `auto_sync = true`) gets a row in `sync_queue`:

```sql
INSERT INTO sync_queue (id, media_id, attempts, next_retry_at, status, created_at, updated_at)
VALUES (uuid(), media_id, 0, NULL, 'PENDING', now, now);
```

### Worker

A background worker (Node.js `setInterval` or `worker_threads`) runs on the configured interval:

| Setting | Interval |
|---|---|
| `immediately` | 5 seconds (effectively immediate) |
| `30s` | 30 seconds |
| `1m` | 1 minute |
| `5m` | 5 minutes |
| `event_end` | When event status flips to `archived` |
| `manual` | Only when user clicks "Sync Now" |

Worker pseudocode:

```typescript
async function syncWorkerTick() {
  if (!isInternetReachable()) return
  if (!googleDriveConnected()) return

  const pending = db.prepare(`
    SELECT sq.*, m.original_path, m.event_id
    FROM sync_queue sq
    JOIN media m ON m.id = sq.media_id
    WHERE sq.status IN ('PENDING', 'FAILED')
      AND (sq.next_retry_at IS NULL OR sq.next_retry_at <= ?)
    ORDER BY sq.created_at ASC
    LIMIT 5
  `).all(now)

  for (const item of pending) {
    try {
      db.prepare("UPDATE sync_queue SET status = 'UPLOADING', updated_at = ? WHERE id = ?")
        .run(now, item.id)
      db.prepare("UPDATE media SET sync_status = 'UPLOADING' WHERE id = ?").run(item.media_id)

      const fileId = await uploadFile(item.original_path, getDriveFolderId(item.event_id))

      db.prepare("UPDATE media SET sync_status = 'SYNCED', remote_file_id = ?, uploaded_at = ? WHERE id = ?")
        .run(fileId, now, item.media_id)
      db.prepare("UPDATE sync_queue SET status = 'SYNCED', updated_at = ? WHERE id = ?")
        .run(now, item.id)

      // Optional: delete local file if user opted in
      if (settings.delete_local_after_sync) {
        await verifyRemoteFile(fileId)  // extra safety check
        await fs.unlink(item.original_path)
      }
    } catch (err) {
      const attempts = item.attempts + 1
      const backoff = computeBackoff(attempts)  // 1m, 5m, 15m, 30m, max
      db.prepare(`
        UPDATE sync_queue
        SET status = 'FAILED', attempts = ?, next_retry_at = ?, last_error = ?, updated_at = ?
        WHERE id = ?
      `).run(attempts, now + backoff, err.message, now, item.id)
      db.prepare("UPDATE media SET sync_status = 'RETRYING', last_error = ? WHERE id = ?")
        .run(err.message, item.media_id)
    }
  }
}

function computeBackoff(attempts: number): number {
  const minutes = [1, 5, 15, 30, 60, 120, 240]
  return (minutes[Math.min(attempts - 1, minutes.length - 1)] ?? 240) * 60 * 1000
}
```

## Offline Mode

If `isInternetReachable()` returns false:

1. New captures get `sync_status = OFFLINE` (a flavor of `PENDING`)
2. Worker skips tick (no API calls attempted)
3. Sync Center shows "Offline" badge
4. When internet returns:
   - A `online` event listener triggers an immediate worker tick
   - All `OFFLINE` items flip to `PENDING` and upload in order

## Deduplication via Checksum

Before uploading, ARAY checks if a file with the same SHA-256 checksum already exists in the sync queue (case: user re-ran a session and the same file was captured):

```sql
SELECT id, remote_file_id FROM media
WHERE checksum = ? AND sync_status = 'SYNCED'
LIMIT 1
```

If found, ARAY reuses the existing `remote_file_id` instead of re-uploading. This is especially useful for thumbnail files which are often identical across events.

## Local Retention (Delete After Sync)

The `delete_local_after_sync` setting is **OFF by default** and requires explicit confirmation when turned on:

```
[Toggle ON]
   │
   ▼
[Confirmation dialog:
  "Delete local files after successful cloud sync?
   ARAY will verify the remote copy before deleting.
   This cannot be undone per file."]
   │
   ▼
[User confirms]
   │
   ▼
[Setting saved]
```

When ON, after a successful sync:

1. Upload completes → `media.sync_status = SYNCED`
2. ARAY issues `GET /drive/v3/files/<file_id>?fields=id,name,size,md5Checksum`
3. Verifies remote `size` matches local `size`
4. Verifies remote `md5Checksum` matches (Google computes MD5, ARAY stores SHA-256 — Phase 3 will also compute MD5 for verification purposes)
5. Only if both match: `fs.unlink(original_path)`
6. `media.original_path` updated to `"[deleted-local]://<remote_file_id>"` (preserves record)
7. Thumbnail is NEVER deleted (needed for gallery display)

## Disconnect Flow

When user clicks "Disconnect":

```
1. Revoke refresh token:
   POST https://oauth2.googleapis.com/revoke?token=<refresh_token>
2. Delete google_drive_accounts row
3. Update settings: google_drive_connected=false, google_drive_email=null
4. Pending sync_queue items remain in PENDING state (will upload if reconnected)
5. Already-synced files remain in the user's Google Drive (ARAY does NOT delete remote files on disconnect)
```

## Security Recap

| Concern | Mitigation |
|---|---|
| Password exposure | OAuth 2.0 — ARAY never sees the password |
| Token theft from disk | `safeStorage` encryption (Windows DPAPI) |
| Token theft in transit | All Google API calls over HTTPS |
| Excessive scope | `drive.file` only — ARAY cannot touch other Drive files |
| Token in backups | `google_drive_accounts` excluded from event backups |
| Token in logs | Tokens never logged; only `media_id` and `file_id` appear in logs |
| CSRF in OAuth callback | `state` parameter validated against session-generated token |
| Refresh token revocation | ARAY handles 401 by clearing connection and prompting reconnect |

## Testing

Phase 3 will ship with `MockGoogleDriveProvider` for development without real Google credentials:

```typescript
// src/main/google-drive/MockGoogleDriveProvider.ts
class MockGoogleDriveProvider implements GoogleDriveProvider {
  async upload(localPath: string, remoteName: string): Promise<{ file_id: string }> {
    // Simulate upload by copying to a mock directory
    const mockDir = path.join(app.getPath('userData'), 'mock-drive')
    const fileId = `mock-${uuid()}`
    await fs.copy(localPath, path.join(mockDir, fileId))
    return { file_id: fileId }
  }
  // ...
}
```

Set `ARAY_USE_MOCK_DRIVE=true` in env to use the mock provider. The renderer cannot tell the difference — sync status updates flow identically.

## Acceptance Tests (Phase 3)

When Phase 3 ships, these scenarios must pass:

- ✅ **Test C** — Google Drive connected, auto-sync on, capture photo → status: SYNCED
- ✅ **Test D** — Internet OFF, capture 20 photos → all status: PENDING (or OFFLINE)
- ✅ **Test E** — Internet returns → all flip to SYNCED automatically
- ✅ **Test F** — Upload fails → status: FAILED → manual retry → SYNCED
- ✅ **Test G** — Restart ARAY → pending queue persists → sync resumes
