# ARAY Architecture

## Process Model

ARAY uses Electron's three-process model with strict isolation:

```
┌─────────────────────────────────────────────────────────────────┐
│  Main Process (Node.js)                                          │
│  ────────────────────────────                                    │
│  • Window lifecycle                                              │
│  • SQLite database (better-sqlite3)                              │
│  • File system (local-first storage)                            │
│  • Camera providers (WebcamProvider now, DSLR later)            │
│  • Image processing (Sharp)                                      │
│  • Google Drive sync (Phase 3)                                   │
│  • IPC handlers (typed, validated)                              │
└────────┬──────────────────────────────────────────────┬─────────┘
         │ contextBridge                                │
         │ (window.aray typed API)                      │
┌────────▼─────────────────┐  ┌────────────────────────▼─────────┐
│  Preload                  │  │  Renderer (React)                 │
│  ─────────                │  │  ──────────────                   │
│  • Exposes typed API      │  │  • Dashboard, Events, Booth,      │
│  • NEVER exposes          │  │    Gallery, Templates, Sync,      │
│    ipcRenderer directly   │  │    Printer, Settings              │
│  • contextIsolation=true  │  │  • Zustand stores                 │
└───────────────────────────┘  │  • ArayUI components              │
                                │  • Framer Motion animations       │
                                └───────────────────────────────────┘
```

## Security Posture

| Setting | Value | Why |
|---|---|---|
| `contextIsolation` | `true` | Renderer JS cannot touch Node globals |
| `nodeIntegration` | `false` | No `require()` in renderer |
| `sandbox` | `false` (Phase 1) — `true` (Phase 2+) | Preload currently needs `fs` via IPC; Phase 2 will sandbox preload |
| `webSecurity` | `true` | Same-origin policy enforced |
| CSP | `default-src 'self'` | Renderer can only load its own bundle |
| Preload exposure | `contextBridge.exposeInMainWorld('aray', api)` | Only typed methods, never `ipcRenderer` |

The renderer NEVER has direct filesystem access, NEVER has direct database access, NEVER has direct network access. Every privileged operation goes through a typed IPC handler in the main process, which validates inputs (especially paths) before performing the action.

## IPC Contract

All IPC channels follow the convention `<domain>.<action>` and return `ArayIPCResult<T>`:

```typescript
type ArayIPCResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } }
```

### Registered channels (Phase 1)

| Domain | Channels |
|---|---|
| `events` | `create`, `list`, `get`, `update`, `delete`, `archive`, `duplicate`, `openFolder` |
| `sessions` | `create` |
| `media` | `list`, `get`, `delete`, `stats`, `saveCapturedFrame`, `readFile`, `updateSyncStatus` |
| `storage` | `getInfo`, `getPath`, `setPath`, `chooseFolder`, `openFolder`, `ensure` |
| `camera` | `list`, `connect`, `disconnect` |
| `settings` | `get`, `update`, `getDefaultStoragePath` |
| `print` | `queue`, `listPrinters` |
| `googleDrive` | `connect`, `disconnect`, `status` |
| `sync` | `start`, `pause`, `resume`, `retry`, `summary` |
| `app` | `getVersion`, `openExternal` |

### Capture flow (most important IPC sequence)

1. Renderer opens Booth page, calls `navigator.mediaDevices.getUserMedia({ video })` to start webcam preview.
2. User clicks "Capture". Renderer runs countdown in JS.
3. At `T=0`, renderer draws `<video>` frame to `<canvas>`, calls `canvas.toDataURL('image/jpeg', 0.92)`.
4. Renderer strips data-URL prefix, sends base64 buffer to `media.saveCapturedFrame`.
5. **Main process** (critical order):
   - Looks up event → `ensureEventStorage(event.code)` creates folders if missing.
   - `writeFileSync(paths.original, buffer)` — file written to disk **first**.
   - `sharp(buffer).resize(...).toFile(paths.thumbnail)` — thumbnail generated.
   - `calculateChecksum(paths.original)` — SHA-256 of the written file (post-write verification).
   - `createMedia({...})` — SQLite row inserted with `sync_status = 'LOCAL_ONLY'`.
6. Main returns the new `ArayMedia` record to renderer.
7. Renderer adds it to the gallery store and shows the result screen.

This ordering guarantees the local-first rule: **the file exists on disk before the database knows about it, and the database knows about it before any sync queue entry is created**.

## Camera Provider Abstraction

```
CameraProvider (interface)
├── WebcamProvider        ← Phase 1 (uses Chromium getUserMedia)
├── CanonProvider         ← Phase 5 (Canon EDSDK)
├── NikonProvider         ← Phase 5 (Nikon SDK)
├── SonyProvider          ← Phase 5 (Sony Camera Remote SDK)
└── MirrorlessProvider    ← Phase 5 (generic PTP)
```

Each provider implements:

```typescript
interface CameraProvider {
  listCameras(): Promise<CameraInfo[]>
  connect(deviceId: string): Promise<boolean>
  disconnect(): Promise<void>
  capture(options: CaptureOptions): Promise<CaptureResult>
  getCapabilities(deviceId: string): Promise<CameraCapability>
}
```

Capabilities are per-device. The UI queries `getCapabilities` and gracefully disables unsupported controls (e.g., DSLR ISO slider shows "Camera does not support this setting" if `capabilities.iso === false`, instead of crashing).

## Storage Architecture

### Folder layout

```
<storage_path>/                      ← default D:\ARAY (Windows), ~/ARAY (macOS/Linux dev)
├── Events/
│   └── ARAY_EVENT_2026_0001/
│       ├── Photos/
│       │   ├── Original/            ← untouched captures
│       │   ├── Edited/              ← filter-applied composites
│       │   ├── Prints/              ← print-ready composited files
│       │   └── Thumbnails/          ← 320×240 JPEG previews
│       ├── Videos/
│       │   ├── Original/
│       │   └── Edited/
│       ├── GIF/
│       ├── Boomerang/
│       ├── 360/
│       └── Metadata/
├── Templates/                        ← reusable template definitions
├── Backgrounds/                      ← green-screen replacement images
└── Exports/                          ← event ZIP backups
```

### Database location

The SQLite database lives in the OS-specific user data directory (NOT in the storage path):

- Windows: `%APPDATA%\aray\database\aray.db`
- macOS: `~/Library/Application Support/aray/database/aray.db`
- Linux: `~/.config/aray/database/aray.db`

This separation means: even if the storage drive fails or is unmounted, ARAY can still boot, query event metadata, and report which files are missing.

### Path safety

All IPC handlers that accept a path argument call `isPathWithinStorage(targetPath)` to prevent path traversal attacks. Filenames are sanitized via `sanitizeFilename()` before being written to disk. No arbitrary filesystem API is exposed to the renderer.

## Sync Engine (Phase 3 — design preview)

```
┌─────────────────────┐
│  Capture (Phase 1)  │
└──────────┬──────────┘
           ▼
   ┌───────────────┐
   │  Save Local   │  ← file written + checksum computed
   └───────┬───────┘
           ▼
   ┌───────────────┐
   │  DB insert    │  ← sync_status = LOCAL_ONLY
   └───────┬───────┘
           ▼
   ┌───────────────┐
   │  Sync Queue   │  ← enqueue media_id, status = PENDING
   └───────┬───────┘
           ▼
   ┌───────────────────────────────────────┐
   │  Sync Worker (background, retryable)  │
   │  ─────────────────────────────────    │
   │  1. Check internet                    │
   │  2. Acquire OAuth token (refresh)     │
   │  3. Ensure Drive folder exists        │
   │  4. Resumable upload                  │
   │  5. Verify remote file ID             │
   │  6. Update media.sync_status = SYNCED │
   └───────────────────────────────────────┘
```

Retry policy: exponential backoff at 1m → 5m → 15m → 30m → max configurable. After max retries, status flips to `FAILED` and surfaces in Sync Center for manual retry.

## Performance Targets

| Metric | Target | Strategy |
|---|---|---|
| Cold startup | < 5s | Lazy-load non-critical pages, defer Google Drive init |
| Camera preview FPS | 30 FPS | `getUserMedia` constraint + `<video>` element |
| Capture-to-saved latency | < 500ms | Sharp resize runs in main process, no renderer block |
| Background sync impact | 0 UI freezes | Sync runs in worker thread (Phase 3) |
| Gallery scroll | 60 FPS | Virtualized grid, thumbnail cache, base64 in-memory |

## Error Handling Philosophy

ARAY never crashes on hardware failure. Instead:

| Failure | Response |
|---|---|
| Camera disconnects mid-capture | "Your camera took a little break. Please reconnect it." + retry button |
| Printer disconnects | File still saves, print job queued for later |
| Internet down | Status flips to `OFFLINE`, captures continue locally, auto-retry when reconnected |
| Disk full | Capture blocked with "ARAY needs a little more space before we make another memory." |
| Google Drive 401 | Token refresh attempted once; if still failing, sync pauses |
| Template invalid | Composite skipped, originals preserved |
| FFmpeg fails (Phase 4) | Video skipped, error logged, photo path unaffected |

## Future Architecture Considerations

- **Auto-update**: electron-builder's `publish` config is pre-wired to a generic update URL. Phase 5+ will host signed release bundles and use `electron-updater` for delta updates.
- **Multi-window**: Phase 5 may add a separate Operator window (booth) and Admin window (dashboard) running on the same Electron instance.
- **Plugin system**: Phase 5+ may expose a plugin API for third-party filters, templates, and camera providers.

## Roadmap Recap

| Phase | Status | Highlights |
|---|---|---|
| Phase 1 — ARAY Core | ✅ Done | Electron + React + brand + dashboard + events + SQLite + local storage + camera preview + photo capture + gallery |
| Phase 2 — Photo Booth | Next | Countdown UX, multi-shot sessions, ARAY Purple Haze filter, template editor (drag-drop canvas), auto-composite, printing queue, green screen |
| Phase 3 — Google Drive | Then | OAuth 2.0 (drive.file scope), Drive folder creation, resumable upload, sync queue, retry with backoff, offline mode, sync dashboard |
| Phase 4 — Media | Then | GIF mode, boomerang (forward+reverse), video booth (10/15/30/60s), video guestbook |
| Phase 5 — Advanced | Later | AI background removal (ONNX/cloud), 360 booth, local sharing server (QR + mobile browser), survey module, virtual attendant (voice/video cues) |
