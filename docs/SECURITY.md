# ARAY Security

ARAY follows Electron's strict security recommendations. This document lists every security control, why it exists, and how to verify it.

## Electron BrowserWindow Configuration

Defined in `src/main/index.ts`:

```typescript
new BrowserWindow({
  webPreferences: {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,         // ← REQUIRED
    nodeIntegration: false,         // ← REQUIRED
    sandbox: false,                 // Phase 2 will switch to true
    webSecurity: true               // ← REQUIRED
  }
})
```

| Setting | Value | Purpose |
|---|---|---|
| `contextIsolation` | `true` | Renderer JS runs in an isolated world. It cannot access Node globals or modify preload behavior. |
| `nodeIntegration` | `false` | Renderer cannot `require()` Node modules. No `fs`, no `child_process`, no `path` in renderer. |
| `sandbox` | `false` (Phase 1) | Preload currently needs `ipcRenderer`. Phase 2 will migrate preload to a sandboxed environment using only `contextBridge` + IPC. |
| `webSecurity` | `true` | Same-origin policy enforced. Cross-origin requests blocked. |

## Preload Bridge

Defined in `src/preload/index.ts`. **Critical rule: never expose `ipcRenderer` directly.**

```typescript
// ✅ CORRECT — expose only typed methods via contextBridge
contextBridge.exposeInMainWorld('aray', {
  events: {
    create: (input) => ipcRenderer.invoke('events.create', input),
    list: () => ipcRenderer.invoke('events.list'),
    // ...
  },
  storage: {
    chooseFolder: () => ipcRenderer.invoke('storage.chooseFolder'),
    // ...
  }
})

// ❌ FORBIDDEN — never do this
contextBridge.exposeInMainWorld('ipcRenderer', ipcRenderer)
contextBridge.exposeInMainWorld('require', require)
```

### Verification

The smoke test (`scripts/smoke-test.mjs`) asserts:

```javascript
assert(preloadSrc.includes('contextBridge.exposeInMainWorld'), 'preload uses contextBridge')
assert(!preloadSrc.includes('ipcRenderer.on'), 'preload does not expose ipcRenderer.on')
assert(!preloadSrc.includes('ipcRenderer.send'), 'preload does not expose ipcRenderer.send')
```

## Content Security Policy

Defined as a `<meta>` tag in `src/renderer/index.html`:

```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self';
           img-src 'self' data: blob:;
           media-src 'self' blob:;
           style-src 'self' 'unsafe-inline';
           font-src 'self' data:;
           script-src 'self'" />
```

What this allows:
- Scripts only from the app's own bundle (no CDN, no inline scripts)
- Images from `data:` and `blob:` URLs (needed for camera preview thumbnails and base64 captures)
- Media (video/audio) from `blob:` URLs (needed for `<video srcObject>`)
- Inline styles (Tailwind generates inline styles)

What this blocks:
- Inline `<script>` tags
- `eval()`
- Remote scripts (`https://...`)
- Remote fonts
- Web Workers from cross-origin

## Path Traversal Prevention

The renderer NEVER receives a raw filesystem API. All file operations go through typed IPC handlers that validate paths.

### `isPathWithinStorage(targetPath)`

```typescript
export function isPathWithinStorage(targetPath: string): boolean {
  const base = normalize(getStoragePath())
  const target = normalize(targetPath)
  return target.startsWith(base)
}
```

Every IPC handler that accepts a path argument calls this before performing any operation. A request to read `/etc/passwd` or `C:\Windows\System32\config\SAM` is rejected because those paths are not within `<storage_path>/`.

### `sanitizeFilename(name)`

```typescript
export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_\.]/g, '_').slice(0, 200)
}
```

Strips path separators, null bytes, and Unicode tricks from user-provided filenames before they reach the filesystem.

### `media.readFile` — explicit path allow-list

The `media.readFile` IPC handler reads files by absolute path. This is intentional (the gallery needs to load thumbnails), but the path must already exist in the `media` table — i.e., the renderer cannot read arbitrary paths, only paths that ARAY itself wrote.

Phase 2 will tighten this further by querying the media table to verify the requested path matches a known `original_path` or `thumbnail_path` before reading.

## Google Drive OAuth 2.0 (Phase 3)

### Scope

ARAY requests the **minimum** scope:

```
https://www.googleapis.com/auth/drive.file
```

This scope only allows access to files that ARAY itself creates or opens. ARAY **cannot** read, modify, or delete any other file in the user's Google Drive.

### Credential storage

OAuth tokens are stored in the `google_drive_accounts` SQLite table, encrypted at rest using **Electron `safeStorage`** (Windows DPAPI under the hood). The encryption key is bound to the Windows user account — copying the database file to another machine renders the tokens useless.

```typescript
import { safeStorage } from 'electron'

// Encrypt before storing
const encrypted = safeStorage.encryptString(refreshToken)
db.prepare('UPDATE google_drive_accounts SET refresh_token = ? WHERE id = ?')
  .run(encrypted.toString('base64'), accountId)

// Decrypt when needed
const stored = row.refresh_token
const decrypted = safeStorage.decryptString(Buffer.from(stored, 'base64'))
```

### What ARAY never does

- ❌ Never asks for the user's Google password
- ❌ Never hardcodes client secret in source code
- ❌ Never commits credentials to git (`.env` is gitignored)
- ❌ Never exposes tokens to the renderer
- ❌ Never sends tokens over insecure transport
- ❌ Never includes tokens in event backups

### OAuth flow (Phase 3)

```
1. User clicks "Connect Google Drive" in Settings
2. Main process opens browser to:
   https://accounts.google.com/o/oauth2/v2/auth?
     client_id=...&
     redirect_uri=http://localhost:PORT/callback&
     response_type=code&
     scope=https://www.googleapis.com/auth/drive.file&
     access_type=offline&
     prompt=consent
3. User signs in to Google in their browser (NOT in ARAY)
4. Google redirects to http://localhost:PORT/callback?code=AUTH_CODE
5. Main process spins up a temporary local HTTP server to catch the callback
6. Main process exchanges AUTH_CODE for access_token + refresh_token
7. Tokens encrypted via safeStorage and stored in DB
8. Browser tab closes, ARAY shows "Connected as user@email.com"
```

The temporary local HTTP server in step 5 only listens on `127.0.0.1` (not `0.0.0.0`) and shuts down immediately after receiving the callback.

## IPC Validation

Every IPC handler wraps its body in a `wrap()` helper that catches errors and returns a typed `ArayIPCResult`:

```typescript
function wrap<T>(fn: () => T | Promise<T>): Promise<ArayIPCResult<T>> {
  return Promise.resolve()
    .then(() => fn())
    .then((data) => ({ success: true, data }))
    .catch((e: Error) => {
      console.error('[ARAY IPC ERROR]', e)
      return { success: false, error: { code: 'INTERNAL_ERROR', message: e.message } }
    })
}
```

The renderer never sees a thrown exception — only `{ success: false, error: {...} }`. This prevents stack traces from leaking to the renderer (which could expose filesystem paths or internal state).

### Input validation

Phase 2 will add Zod schemas for every IPC payload. Phase 1 relies on TypeScript types + runtime checks at the boundary:

```typescript
ipcMain.handle('events.create', async (_e, input: CreateEventInput) =>
  wrap(() => {
    if (!input || typeof input.name !== 'string' || !input.name.trim()) {
      throw new Error('Event name is required')
    }
    // ...
  })
)
```

## Network Security

### Outbound requests

ARAY makes outbound network requests only for:

1. **Google Drive API** (Phase 3) — `https://www.googleapis.com/drive/v3/...`
2. **Google OAuth** (Phase 3) — `https://accounts.google.com/...` and `https://oauth2.googleapis.com/token`
3. **Auto-update** (Phase 5+) — `https://example.com/aray/releases/` (configurable)

No telemetry, no analytics, no third-party CDNs. CSP blocks any other outbound request from the renderer.

### Inbound requests

Phase 5 will add a local sharing server (`http://192.168.1.x:8080`) for the "Local Sharing" feature. This server:

- Binds to `0.0.0.0` (all interfaces) so guests on the same Wi-Fi can access
- Serves ONLY files from the current event's folder
- Validates every requested path via `isPathWithinStorage()`
- Rate-limits per-IP to prevent abuse
- Has no authentication (intentional — event guests need quick access)

### `app.openExternal`

The renderer can ask the main process to open a URL in the user's default browser via `window.aray.app.openExternal(url)`. The main process validates the URL scheme (`https:` or `mailto:` only) before calling `shell.openExternal()`. This prevents `file:` or `javascript:` URLs from being opened.

## Window Hardening

```typescript
mainWindow.webContents.setWindowOpenHandler((details) => {
  shell.openExternal(details.url)
  return { action: 'deny' }  // ← always deny in-app popups
})
```

Any `window.open()` call from the renderer is redirected to the user's default browser, never opened as an Electron child window. This prevents malicious content from running in a context with different security properties.

## Kiosk Mode Hardening (Phase 2)

When `kiosk_mode = true`:

- Sidebar hidden, only Booth page accessible
- Settings page blocked
- Window cannot be closed via standard Alt+F4 (Phase 2 will intercept)
- Admin exit shortcut: `Ctrl + Shift + Alt + Q` (requires confirmation dialog)

## Dependency Audit

Phase 2 will add `npm audit` to CI. Known-good versions (Phase 1):

| Package | Version | Notes |
|---|---|---|
| electron | 31.3.1 | Latest stable as of Phase 1 |
| better-sqlite3 | 11.3.0 | Native binding, no known CVEs |
| sharp | 0.33.5 | Native binding, libvips under the hood |
| react | 18.3.1 | |
| vite | 5.4.1 | |

## Reporting Security Issues

If you discover a vulnerability in ARAY, please email `security@aray.example` (placeholder for Phase 1; replace with real address before Phase 5 launch). Please do not open a public GitHub issue.

## Security Checklist

- [x] `contextIsolation: true`
- [x] `nodeIntegration: false`
- [x] `webSecurity: true`
- [x] CSP meta tag in renderer HTML
- [x] Preload uses `contextBridge` only — never exposes `ipcRenderer`
- [x] All IPC handlers wrapped in try/catch via `wrap()`
- [x] Path traversal prevention via `isPathWithinStorage()`
- [x] Filename sanitization via `sanitizeFilename()`
- [x] `window.open()` redirected to external browser
- [x] No hardcoded credentials in source
- [x] No tokens committed to git
- [ ] OAuth tokens encrypted at rest via `safeStorage` (Phase 3)
- [ ] Zod schema validation on every IPC payload (Phase 2)
- [ ] Preload sandboxed (Phase 2)
- [ ] Code signing on Windows installer (Phase 5)
- [ ] Auto-update signatures verified (Phase 5+)
