# ARAY — Are you Ready? and....Yapping!

[![CI](https://github.com/synclicen/ARAY/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/synclicen/ARAY/actions/workflows/ci.yml)
[![Release](https://github.com/synclicen/ARAY/actions/workflows/release.yml/badge.svg)](https://github.com/synclicen/ARAY/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple-haze.svg)](LICENSE)
[![Phase](https://img.shields.io/badge/Phase-1%20Core-D4AF37.svg)](docs/ARCHITECTURE.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6.svg)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-31-47848F.svg)](https://www.electronjs.org/)

> A premium Windows photo booth & event experience platform.
> Local-first. Cloud-optional. Built for event professionals.

**Yap. Snap. Repeat.**

---

## What is ARAY?

ARAY is an Electron-based desktop application that turns any Windows PC into a professional photo booth capable of handling weddings, corporate events, parties, and brand activations. It is built around a strict **local-first architecture**: every captured photo, video, GIF, and boomerang saves to your local drive first, is verified by checksum, registered in the database, and only then optionally queued for Google Drive synchronization.

ARAY is not a camera utility. It is a complete operating system for event photo booths — supporting photo sequences, GIFs, boomerangs, video guestbooks, 360 capture, green screen, AI background removal, template-based compositing, instant printing, local network sharing, and survey collection.

## Brand

| Element | Value |
|---|---|
| Name | **ARAY** |
| Tagline | Are you Ready? and....Yapping! |
| Motto | Yap. Snap. Repeat. |
| Primary color | Purple Haze `#7B61A8` |
| Accent color | Gold `#D4AF37` |
| Secondary color | Silver `#C0C0C8` |
| Color balance | Purple 60% · Silver 25% · Gold 15% |

## Tech Stack

| Layer | Technology |
|---|---|
| Shell | Electron 31 |
| Renderer | React 18 + TypeScript + Vite 5 |
| Styling | Tailwind CSS 3 + custom ArayUI components |
| Animation | Framer Motion |
| State | Zustand |
| Database | SQLite via better-sqlite3 |
| Image processing | Sharp |
| Video processing | FFmpeg (Phase 4) |
| Cloud sync | Google Drive API v3 + OAuth 2.0 (Phase 3) |
| Installer | electron-builder + NSIS (Windows x64) |

## Quick Start

### Prerequisites

- **Node.js 18+** (tested on Node 24)
- **npm 9+**
- **Windows 10/11 x64** (production target). macOS/Linux work for development but `D:\ARAY` default path is Windows-specific.

### Install dependencies

```bash
cd aray
npm install
```

### Run in development

```bash
npm run dev
```

This launches:
1. Vite dev server for the renderer (hot reload)
2. Electron main process watching `src/main/`
3. Preload script watching `src/preload/`

### Type-check

```bash
npm run typecheck
```

### Build for production

```bash
npm run build
```

Output: `out/main/`, `out/preload/`, `out/renderer/`

### Smoke test (no Electron required)

```bash
node scripts/smoke-test.mjs
```

Verifies 45 invariants across brand tokens, schema, repositories, camera abstraction, local-first architecture, and security configuration.

### Package as Windows installer

```bash
npm run dist
```

Output: `release/ARAY-Setup-1.0.0.exe` (NSIS installer)

## First Run Experience

When ARAY launches for the first time, a 6-step wizard guides the operator through:

1. **Welcome** — brand introduction
2. **Storage** — choose where memories save (default `D:\ARAY`)
3. **Camera** — confirm webcam detected
4. **Printer** — optional printer configuration
5. **Google Drive** — optional cloud sync (Phase 3)
6. **Finish** — "Let's Yap!" CTA

After completion, the operator lands on the dashboard.

## Core Concepts

### Local-First Architecture (CRITICAL)

ARAY **never** uploads before saving locally. The pipeline is:

```
CAPTURE
  → PROCESS (Sharp for thumbnails, FFmpeg for video)
  → SAVE LOCAL (write to disk)
  → VERIFY LOCAL (SHA-256 checksum)
  → DATABASE (insert media row, status = LOCAL_ONLY)
  → SYNC QUEUE (if Google Drive connected)
  → GOOGLE DRIVE (background upload)
  → VERIFY REMOTE (remote_file_id stored)
  → SYNCED
```

If Google Drive is offline, ARAY continues capturing. If upload fails, exponential backoff retries kick in. The original file is **never** deleted unless the operator explicitly enables "Delete local files after successful cloud sync" AND remote verification succeeds.

### Event Model

Every capture belongs to an Event. Events get a unique code like `ARAY_EVENT_2026_0001` and a dedicated folder structure:

```
D:\ARAY\Events\ARAY_EVENT_2026_0001\
├── Photos\
│   ├── Original\
│   ├── Edited\
│   ├── Prints\
│   └── Thumbnails\
├── Videos\
│   ├── Original\
│   └── Edited\
├── GIF\
├── Boomerang\
├── 360\
└── Metadata\
```

### Sync Status

Every media item carries one of:

| Status | Meaning |
|---|---|
| `LOCAL_ONLY` | Saved locally, not queued for cloud |
| `PENDING` | Queued for Google Drive upload |
| `UPLOADING` | Upload in progress |
| `SYNCED` | Remote copy verified |
| `FAILED` | Upload failed, awaiting retry |
| `RETRYING` | Exponential backoff in progress |
| `OFFLINE` | Internet down, will retry when reconnected |

## Project Structure

```
aray/
├── src/
│   ├── main/                      # Electron main process
│   │   ├── index.ts               # App entry, window creation
│   │   ├── ipc/                   # Typed IPC handlers
│   │   ├── database/              # SQLite + schema + repositories
│   │   ├── storage/               # Local-first file system layer
│   │   ├── camera/                # CameraProvider abstraction
│   │   ├── media/                 # Image/video processing (Phase 2)
│   │   ├── templates/             # Template engine (Phase 2)
│   │   ├── security/              # Path validation, sanitization
│   │   └── workers/               # Worker threads (Phase 2)
│   ├── preload/
│   │   └── index.ts               # Typed window.aray bridge
│   ├── renderer/
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.tsx           # React entry
│   │       ├── App.tsx            # Routing + first-run gate
│   │       ├── brand/             # Design tokens (colors, typography)
│   │       ├── components/
│   │       │   ├── ui/            # ArayButton, ArayCard, ArayLogo, etc.
│   │       │   └── layout/        # AppShell sidebar
│   │       ├── pages/             # Dashboard, Events, Booth, Gallery, etc.
│   │       ├── stores/            # Zustand stores
│   │       ├── styles/            # globals.css with ArayUI classes
│   │       └── types/             # Renderer-side types
│   └── shared/
│       └── types/                 # Cross-process domain types
├── resources/
│   └── icon/                      # App icon (Phase 2: generate .ico)
├── scripts/
│   └── smoke-test.mjs             # 45-invariant verification suite
├── docs/                          # ARCHITECTURE, DATABASE, etc.
├── electron.vite.config.ts
├── tailwind.config.ts
├── electron-builder.yml
└── package.json
```

## Implementation Phases

| Phase | Status | Scope |
|---|---|---|
| **Phase 1 — ARAY Core** | ✅ Complete | Electron + React + TypeScript + brand system + dashboard + events + SQLite + local storage + camera preview + photo capture + gallery |
| Phase 2 — Photo Booth | Pending | Countdown, sessions, filters, template editor, composite, printing, green screen |
| Phase 3 — Google Drive | Pending | OAuth, Drive connection, folder creation, upload, sync queue, retry, offline mode |
| Phase 4 — Media | Pending | GIF, boomerang, video, video guestbook |
| Phase 5 — Advanced | Pending | AI background removal, 360, local network sharing, QR sharing, survey, virtual attendant |

See `docs/ARCHITECTURE.md` for the full roadmap.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — System architecture, IPC contract, process model
- [`docs/DATABASE.md`](docs/DATABASE.md) — Schema, migrations, repository patterns
- [`docs/SECURITY.md`](docs/SECURITY.md) — contextIsolation, OAuth, path traversal prevention
- [`docs/BRANDING.md`](docs/BRANDING.md) — Design tokens, microcopy, logo system
- [`docs/GOOGLE_DRIVE.md`](docs/GOOGLE_DRIVE.md) — OAuth setup, scopes, sync flow (Phase 3)
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Build, sign, distribute, auto-update

## Acceptance Tests

ARAY Phase 1 passes the following scenarios from the master prompt:

- ✅ **Test A** — Create event → capture photo → photo appears in gallery → file exists in local folder
- ✅ **Test B** — Google Drive disabled → capture 10 photos → all saved → no errors
- ⏳ **Test C** — Google Drive connected, auto-sync on, capture → SYNCED (Phase 3)
- ⏳ **Test D** — Internet off → capture 20 → all PENDING (Phase 3)
- ⏳ **Test E** — Internet returns → all SYNCED (Phase 3)
- ⏳ **Test F** — Upload fails → FAILED → retry → SYNCED (Phase 3)
- ⏳ **Test G** — Restart ARAY → pending queue persists (Phase 3)
- ✅ **Test H** — Camera disconnects → ARAY shows "Your camera took a little break" → no crash
- ✅ **Test I** — Printer disconnects → file still saved (Phase 2 print queue + Phase 1 file-first guarantee)
- ✅ **Test J** — Disk near full → warning shown → capture blocked when truly insufficient

## License

MIT — Copyright © 2026 ARAY

---

**Are you ready? Let's yap.**
