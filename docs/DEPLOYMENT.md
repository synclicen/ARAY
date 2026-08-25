# ARAY Deployment

## Build

### Prerequisites

- Node.js 18+ (LTS recommended; tested on Node 24)
- npm 9+
- Windows 10/11 x64 (for installer packaging). macOS/Linux work for development builds.

### Install dependencies

```bash
cd aray
npm install
```

> ⚠️ `better-sqlite3` and `sharp` compile native bindings. On first install this may take 1-2 minutes. Pre-built binaries are fetched for common platforms; if the fetch fails, Node-gyp will compile from source (requires Python 3 + build tools).

### Verify build

```bash
npm run typecheck    # TypeScript type checking
npm run build        # Produce out/main, out/preload, out/renderer
node scripts/smoke-test.mjs   # 45 invariants across schema, repos, security
```

### Development mode

```bash
npm run dev
```

This launches:
1. Vite dev server (HMR for renderer) on port 5173
2. Electron main process watching `src/main/`
3. Preload script watching `src/preload/`

### Production build

```bash
npm run build
```

Output structure:

```
out/
├── main/
│   └── index.js              ← Electron main process bundle (~28KB)
├── preload/
│   └── index.js              ← Preload script (~3KB)
└── renderer/
    ├── index.html
    └── assets/
        ├── index-<hash>.css  ← Tailwind + ArayUI (~45KB)
        └── index-<hash>.js   ← React + pages + components (~680KB)
```

## Package as Windows Installer

### Configuration

Defined in `electron-builder.yml`:

```yaml
appId: com.aray.booth
productName: ARAY

win:
  target:
    - target: nsis
      arch: [x64]
  icon: resources/icon/icon.ico

nsis:
  oneClick: false                              # User chooses install directory
  perMachine: false                            # Per-user install (no admin needed)
  allowToChangeInstallationDirectory: true
  shortcutName: ARAY
  deleteAppDataOnUninstall: false              # Preserve user data on uninstall
```

### Build the installer

```bash
npm run dist
```

Output:

```
release/
└── ARAY-Setup-1.0.0.exe     ← NSIS installer (~90MB)
```

### Quick unpacked build (for testing)

```bash
npm run dist:dir
```

Produces an unpacked `release/win-unpacked/ARAY.exe` that can be run directly without installation. Useful for quick testing on a dev machine.

## App Icon

Phase 1 does not yet include a custom `.ico` file. The build will use Electron's default icon. Phase 2 will commission a proper icon:

- **Source**: 1024×1024 PNG designed per the brand system (Purple Haze background, gold accent, "ARAY" wordmark or stylized camera shutter abstraction)
- **Format**: `.ico` for Windows (multi-resolution: 16, 32, 48, 64, 128, 256, 512, 1024)
- **Location**: `resources/icon/icon.ico`

Until then, you can generate a placeholder:

```bash
# Using ImageMagick (if installed)
convert -size 256x256 xc:'#7B61A8' -fill '#D4AF37' -gravity center \
  -pointsize 80 -font Inter-Black -annotate +0+0 'ARAY' \
  resources/icon/icon.ico
```

## Code Signing (Phase 5)

Phase 1 installers are **unsigned**. Windows SmartScreen will show a warning on first install. Phase 5 will add code signing:

1. Purchase an EV Code Signing Certificate (DigiCert, Sectigo, or similar)
2. Configure `electron-builder.yml`:

```yaml
win:
  certificateFile: cert/ARAY-ev.pfx
  certificatePassword: ${env.CERT_PASSWORD}
  signingHashAlgorithms: [sha256]
  rfc3161TimeStampServer: http://timestamp.digicert.com
```

3. Build with `CERT_PASSWORD` env var set:

```bash
CERT_PASSWORD=... npm run dist
```

EV certificates provide immediate SmartScreen reputation (no warning), while OV certificates build reputation over time.

## Auto-Update (Phase 5+)

Phase 1 pre-wires the auto-update architecture but does not activate it. Phase 5 will:

1. Host signed release bundles at a public URL (e.g., `https://releases.aray.example/win/`)
2. Generate `latest.yml` manifest per release
3. Configure `electron-builder.yml`:

```yaml
publish:
  provider: generic
  url: https://releases.aray.example/win/
  channel: latest
```

4. Add `electron-updater` to dependencies and integrate in main process:

```typescript
import { autoUpdater } from 'electron-updater'

autoUpdater.autoDownload = false  // Ask user first
autoUpdater.autoInstallOnAppQuit = true

app.whenReady().then(() => {
  autoUpdater.checkForUpdates()
})

autoUpdater.on('update-available', (info) => {
  // Show "Update available" dialog in renderer
})

autoUpdater.on('update-downloaded', () => {
  // Show "Restart to update" dialog
})
```

5. **Critical**: Phase 5 must enable code signing before activating auto-update. Unsigned updates will be rejected by Windows.

## Distribution Channels

| Channel | Use case |
|---|---|
| Direct download from website | Primary — `https://aray.example/download` |
| Auto-update | Existing users — handled by `electron-updater` |
| Email delivery | Trial / promo builds |
| USB installer | Event technicians without reliable internet |

## First-Run Behavior

When a user installs and launches ARAY for the first time:

1. SQLite database created at `%APPDATA%\aray\database\aray.db`
2. Default settings inserted (storage path = `D:\ARAY`, first_run_completed = false)
3. Storage directory tree created at the configured path
4. First-run wizard launches (6 steps — see README)
5. After wizard completion, `first_run_completed = true`, dashboard loads

## Data Directory Layout (Windows)

After install and first run:

```
%APPDATA%\aray\
├── database\
│   ├── aray.db              ← SQLite main database
│   ├── aray.db-wal          ← Write-ahead log
│   └── aray.db-shm          ← Shared memory (transient)
├── Cache\                    ← Electron cache (auto-managed)
├── Code Cache\               ← V8 code cache (auto-managed)
├── GPUCache\                 ← GPU shader cache (auto-managed)
└── Logs\
    └── main.log              ← Application log (Phase 2)

D:\ARAY\                      ← User-chosen storage path
├── Events\
│   └── ARAY_EVENT_2026_0001\
│       ├── Photos\
│       │   ├── Original\
│       │   ├── Edited\
│       │   ├── Prints\
│       │   └── Thumbnails\
│       └── ...
├── Templates\
├── Backgrounds\
└── Exports\
```

## Uninstall Behavior

The NSIS uninstaller removes:
- `%APPDATA%\aray\` directory (database, cache, logs)
- The installed application files

The uninstaller does NOT remove:
- `D:\ARAY\` (user data — preserved so memories survive uninstall)
- User's Start Menu shortcut (only removed if user opts in)

This is intentional: a user who uninstalls ARAY to reinstall or upgrade should not lose their event history.

## Backup & Restore

### Manual backup

Phase 2 will add an "Export Event" feature:

1. Open Events page
2. Click event menu → "Export"
3. ARAY produces `ARAY_EVENT_2026_0001_BACKUP.zip` containing:
   - `Photos/`, `Videos/`, `GIF/`, `Boomerang/`, `360/` — all media files
   - `Metadata/event.json` — full event row + sessions + media rows
   - `Templates/` — referenced template definitions
   - `Configuration/settings.json` — relevant non-sensitive settings

**Excluded**:
- OAuth tokens (never)
- Camera device configs (machine-specific)

### Restore

Phase 5 will add "Import Event Backup":

1. Settings → Data → Import Backup
2. Select `.zip` file
3. ARAY extracts to a temp directory
4. Validates `event.json` schema
5. Imports event row, sessions, media rows into the active database
6. Copies media files to `<storage_path>/Events/<event_code>/`
7. Recomputes checksums to verify integrity
8. Marks all imported media as `LOCAL_ONLY` (sync will queue if Google Drive connected)

## Disaster Recovery

### Database corruption

If `aray.db` becomes corrupt (rare with WAL mode, but possible after a hard crash):

1. ARAY will fail to boot with a SQLite error
2. Recovery procedure:
   ```bash
   # Backup the corrupt file
   mv %APPDATA%\aray\database\aray.db %APPDATA%\aray\database\aray.db.corrupt

   # Delete WAL and SHM (will be recreated)
   rm %APPDATA%\aray\database\aray.db-wal
   rm %APPDATA%\aray\database\aray.db-shm

   # Try SQLite recovery
   sqlite3 %APPDATA%\aray\database\aray.db ".recover" > recovered.sql

   # Recreate database
   mv %APPDATA%\aray\database\aray.db %APPDATA%\aray\database\aray.db.broken
   sqlite3 %APPDATA%\aray\database\aray.db < recovered.sql
   ```
3. Phase 5 will add an automatic "Database Recovery" tool in Settings

### Storage drive failure

If the storage drive (`D:\`) fails or is unmounted:

1. ARAY continues to boot (database is on `C:\`)
2. Captures fail with "Storage path not accessible"
3. Recovery:
   - Replace or remount the drive
   - If path changed: Settings → Storage → Change folder
   - ARAY recreates the directory structure on the new path
   - Existing media records in the DB will have stale paths — Phase 5 will add a "Re-link media" tool

## CI/CD (Future)

Phase 5 will add GitHub Actions:

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run typecheck
      - run: npm run build
      - run: node scripts/smoke-test.mjs
      - run: npm run dist
        env:
          CERT_PASSWORD: ${{ secrets.CERT_PASSWORD }}
      - uses: softprops/action-gh-release@v2
        with:
          files: release/ARAY-Setup-*.exe
```

## Monitoring & Telemetry

ARAY does **not** collect telemetry in Phase 1. Phase 5 may add an opt-in crash reporter:

- Only enabled after explicit user consent
- Sends anonymized crash stack traces to a self-hosted Sentry instance
- Never sends media paths, event names, or user identifiers
- User can disable at any time in Settings → Privacy
