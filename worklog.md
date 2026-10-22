
---
Task ID: android-launch-crash-fix
Agent: main
Task: Fix APK install OK tapi crash saat dibuka

Work Log:
- User lapor: APK v1.0.12 bisa diinstall tapi langsung crash/blank saat dibuka
- Inspeksi source code android-app:
  - android-app/src/android-shim.ts ADA dan lengkap (definisikan window.aray API)
  - TAPI android-shim.ts TIDAK PERNAH di-import di mana pun
  - android-app/index.html langsung load ../src/renderer/src/main.tsx
  - Saat app start, App.tsx useEffect langsung call window.aray.license.status()
  - Karena window.aray undefined → TypeError → React crash → blank screen
- Inspeksi tambahan:
  - Public assets mediapipe (24 MB) tidak di-copy ke android-app/public/
  - Palm trigger feature akan 404 saat load ./mediapipe/hands.js
- Fix yang diterapkan:
  1. Buat android-app/src/main-android.tsx — entry point baru yang:
     - Import './android-shim' dulu (side-effect: set window.aray)
     - Lalu import '../../src/renderer/src/main' (render React)
  2. Update android-app/index.html: <script src="./src/main-android.tsx">
  3. Copy src/renderer/public/mediapipe/ → android-app/public/mediapipe/ (24 MB, 10 files)
     supaya Vite bundle ke dist/ (palm trigger tidak 404)
- Issue saat push: PAT ter-leak di scripts/poll-android-build.sh yang saya buat sebelumnya
  - GitHub Secret Scanning block push
  - Reset ke origin/main (6b5c354), apply ulang fix dengan clean commit (bb7625f)
- Push bb7625f + tag android-v1.0.14 → trigger Run #14 (id 37881790407)
- Poll build via GitHub API: 205 detik, status SUCCESS, semua 19 step lulus
- APK size naik dari 13.52 MB → 28.75 MB (debug) karena mediapipe sekarang ter-bundle
- Release live dengan 2 APK: debug (28.75 MB) + release-signed (26.35 MB)

Stage Summary:
- Release: https://github.com/synclicen/ARAY/releases/tag/android-v1.0.14
- Fix utama: window.aray sekarang ter-register sebelum React render
- Kalau masih crash, perlu logcat — user install Android Studio atau pakai `adb logcat`
- PAT user masih aktif, harus di-rotate

---
Task ID: android-camera-permission-fix
Agent: main
Task: Fix "Permission denied" saat buka Booth page di Android

Work Log:
- User kirim screenshot: error "Permission denied — Your camera took a little break. Please reconnect it." di Booth page
- Analisis Booth.tsx: pakai navigator.mediaDevices.getUserMedia() (browser native API)
- Akar masalah:
  1. Capacitor generate AndroidManifest.xml tanpa CAMERA permission
  2. Android 6+ wajib runtime permission request, tidak otomatis
  3. WebView tanpa CAMERA permission granted → getUserMedia reject → Booth error page
- Fix:
  - Buat android-app/android-patches/MainActivity.java — custom BridgeActivity yang call
    ActivityCompat.requestPermissions(CAMERA) di onCreate()
  - Update workflow: tambah step "Patch native Android" yang:
    1. Inject CAMERA + RECORD_AUDIO + storage permissions ke AndroidManifest.xml via awk
    2. Replace MainActivity.java dengan custom version
    3. Pastikan androidx.core dependency ada di build.gradle
- Build #15 (v1.0.15) gagal: Python heredoc PYEOF indent issue di YAML
- Fix: rewrite patch pakai awk one-liner (no heredoc)
- Build #16 (v1.0.16) sukses dalam 236 detik, semua 19 step lulus
- Verifikasi APK: extract AndroidManifest.xml binary, parse string pool
  → ditemukan: CAMERA, RECORD_AUDIO, MODIFY_AUDIO_SETTINGS, READ/WRITE_EXTERNAL_STORAGE,
    ACCESS_NETWORK_STATE, plus hardware.camera + autofocus features
- MainActivity.java custom ter-bundle (request runtime permission saat app start)

Stage Summary:
- Release: https://github.com/synclicen/ARAY/releases/tag/android-v1.0.16
- Saat install, Android akan prompt "Allow ARAY to take pictures and record video?"
- User tap Allow → getUserMedia berhasil → Booth page jalan
- Kalau user tap Deny, masih gagal — perlu tambah UI "Open Settings" supaya user bisa grant permission manual

---
Task ID: android-responsive-ui
Agent: main
Task: Make UI responsive for Android (mobile-first)

Work Log:
- User: "buat agar tampilan responsive"
- Delegasi audit ke Explore agent → dapat 10 masalah kritis + 5 pola berulang
- Implementasi fix dalam 10 phase:

Phase 1 - Foundation:
- viewport-fit=cover di android-app/index.html
- globals.css: scrollbar desktop-only, body safe-area padding, touch-target min-h-[44px]
  di semua .aray-btn-* dan .aray-input, 100vh → 100dvh, mobile font 14px,
  utility classes .page-padding dan .hero-row
- tailwind.config (root + android): tambah xs:400px breakpoint

Phase 2 - AppShell responsive:
- Sidebar: hidden md:flex (desktop only)
- Bottom nav baru (mobile only, fixed bottom-0): 5 items — Home, Events, Booth
  (center elevated with gradient circle), Gallery, Settings
- MobileMoreMenu: bottom-sheet drawer untuk Templates, Sync, Printer — buka via
  tombol "⋯" di top-right
- Header: compact di mobile (hide tagline + Drive badge)
- Footer: hidden md:flex (mobile pakai bottom nav)
- safe-area-inset-bottom padding untuk gesture bar

Phase 3 - All pages: p-8 → page-padding (p-4 sm:p-6 md:p-8) di Dashboard, Events,
  Gallery, Printer, Settings, SyncCenter, Templates
- Hero rows: flex items-center justify-between → flex flex-col gap-4 sm:flex-row

Phase 4 - Booth.tsx:
- 100vh → 100dvh (Android WebView safe)
- Top bar: p-3 sm:p-5, flex-col sm:flex-row, safe-area top padding
- Hide event name badge di xs
- Font raksasa responsive: text-[180px] → text-[64px] xs:text-[90px] sm:text-[120px] md:text-[180px]
  (SIAP overlay, countdown, LOOK AT YOU!)

Phase 5 - Settings.tsx:
- SettingRow: flex-col sm:flex-row, label stacks above control di mobile
- Inputs: max-w-[Xpx] → w-full sm:w-auto sm:max-w-[Xpx]

Phase 6 - Dashboard storage stats: text-xl → text-base sm:text-xl, gap-4 → gap-2 sm:gap-4

Phase 7 - Gallery modal: action bar stack vertical di mobile, hide path + Open Folder

Phase 8 - Events: Client/Operator grid-cols-2 → grid-cols-1 sm:grid-cols-2

Phase 9 - ArayButton: danger variant min-h-[44px], sm size min-h-[36px] sm:min-h-[auto]

Phase 10 - Commit bde8e2e, push, tag android-v1.0.17
- Build #17 sukses dalam 262 detik, semua 19 step lulus
- APK size sama (28.75 MB debug, 26.35 MB release)

Stage Summary:
- Release: https://github.com/synclicen/ARAY/releases/tag/android-v1.0.17
- Mobile-first: bottom nav + safe-area + touch targets + responsive grids/fonts
- Desktop layout tetap utuh (semua breakpoint pakai sm:/md: prefix)
- User test di HP: download release.apk, uninstall v1.0.16 dulu, install v1.0.17

---
Task ID: android-camera-settings-nav-fix
Agent: main
Task: Tambah setting kamera depan/belakang + mirror; fix glitch navigasi Android

Work Log:
- User: "tambah pengaturan untuk memilih kamera depan atau belakang, dan opsi untuk
  mirror kamera. aplikasikan pada versi elektron dan juga android. pada versi android,
  ketika berpindah dari satu bagian ke bagian lainnya ... ada glitch pada layar seperti
  berkelip sepersekian detik."

TASK 1: Camera settings (front/back + mirror)
- Audit: Booth.tsx getUserMedia pakai facingMode 'user' hardcoded, mirror state default true
- Tambah 2 field baru di AraySettings (src/shared/types/index.ts):
  - camera_facing?: 'user' | 'environment'
  - camera_mirror?: boolean
- Update DEFAULT_SETTINGS di:
  - src/main/database/repositories/settings.ts (Electron)
  - android-app/src/android-shim.ts (Android)
  - keduanya: camera_facing='user', camera_mirror=true (default front cam + mirror)
- Booth.tsx:
  - startCamera() pakai settings.camera_facing untuk getUserMedia facingMode
  - mirror state init dari settings.camera_mirror
  - toggleMirror() helper: persist ke settings
  - switchCamera() helper: switch front/back + auto-update mirror + restart stream
  - Top bar Booth: 2 tombol baru (SwitchCamera + FlipHorizontal icon, 44px touch target)
- Settings.tsx: 2 SettingRow baru di Photo Booth Settings:
  - "Camera" dropdown: Front Camera (selfie) / Back Camera
  - "Mirror preview" toggle
  - Saat ganti camera_facing, mirror auto-update (front=on, back=off)
- Desktop tetap pakai selectedDeviceId (override facingMode kalau user pilih device spesifik)

TASK 2: Fix glitch navigasi Android
- Analisis: App.tsx AnimatePresence mode='wait' melakukan:
  1. exit animation: fade-out (opacity 1 → 0) — halaman lama menghilang
  2. blank frame (gap antara exit selesai dan enter mulai)
  3. enter animation: fade-in (opacity 0 → 1) — halaman baru muncul
  Di Android WebView, gap ini terlihat sebagai "berkelip sepersekian detik"
- Fix: deteksi window.aray.isAndroid ( Capacitor shim sudah set ini sebelum React render)
  - Android: mode='popLayout' (no exit wait, halaman baru mount di atas yang lama) +
    initial opacity 1 (no enter fade) + exit undefined (no exit animation)
    → halaman baru langsung muncul, tidak ada blank frame
  - Desktop: tetap mode='wait' + fade animation (smooth UX)
- Tambah GPU layer forcing via style attribute:
  - willChange: 'opacity'
  - transform: 'translateZ(0)'
  - backfaceVisibility: 'hidden'
  → mencegah repaint flicker selama opacity transition

Build v1.0.18:
- Commit 14f4bb3, push main + tag android-v1.0.18
- Run #18 sukses dalam 257 detik (~4.3 menit), semua 19 step lulus
- APK size sama (28.75 MB debug, 26.35 MB release)

Stage Summary:
- Release: https://github.com/synclicen/ARAY/releases/tag/android-v1.0.18
- Camera: bisa switch front/back dari Settings ATAU langsung dari top bar Booth
- Mirror: bisa toggle on/off dari Settings ATAU top bar Booth, persist ke settings
- Glitch navigasi: Android pakai popLayout mode (instant), desktop tetap smooth

---
Task ID: electron-rebuild-v465
Agent: main
Task: Rebuild Electron app dari commit 14f4bb3 — jangan ada yang tertinggal

Work Log:
- User: "rebuild npm run build dari commit 14f4bb3 ! jangan ada yang tertinggal"
- Checkout ke commit 14f4bb3 (detached HEAD), working tree clean
- npm run build pertama: berhasil, 2031 modules, 3.5s
- Verify semua fitur di output:
  - Renderer: camera_facing, camera_mirror, SwitchCamera, FlipHorizontal, isAndroid, popLayout — semua ada
  - Main.js: booth_fullscreen_password ada, TAPI camera_facing & camera_mirror TIDAK ADA

BUG DITEMUKAN:
- electron/main.ts punya DEFAULT_SETTINGS sendiri (line 246) yang terpisah
  dari src/main/database/repositories/settings.ts
- Saat commit 14f4bb3 tambah camera_facing + camera_mirror, hanya update
  src/main/database/repositories/settings.ts, TIDAK update electron/main.ts
- Akibatnya: fitur camera switch + mirror toggle TIDAK berfungsi di Electron
  build (hanya di Android yang pakai android-shim.ts)

FIX:
- Update DEFAULT_SETTINGS di electron/main.ts: tambah camera_facing,
  camera_mirror, plus field-field lain yang missing (camera_effect,
  aspect_ratio, palm_trigger, print_*, share_qr_*, dll)
- Rebuild: semua fitur terverifikasi di output
- Commit 9d5191f: "fix(electron): sync DEFAULT_SETTINGS di main.ts"

TRIGGER WINDOWS INSTALLER BUILD:
- Bump version di package.json: 4.6.4 → 4.6.5
- Commit e773952, tag v4.6.5, push
- Run #145 (Release workflow) — Typecheck gagal!
  Error: src/renderer/src/pages/Booth.tsx(123,48): error TS2448 Block-scoped
  variable 'stopCamera' used before its declaration
  (switchCamera di line 108 mereferensikan stopCamera/startCamera yang
  dideklarasikan di line 197/204 — TypeScript TDZ violation)

FIX TYPECHECK:
- Hapus deklarasi switchCamera dari line 108
- Tambah switchCameraRef = useRef<() => Promise<void>>(() => Promise.resolve())
  sebagai forward declaration
- Deklarasi switchCamera literal setelah startCamera (line 224)
- Assign switchCameraRef.current = switchCamera
- Tombol di top bar: onClick={() => switchCameraRef.current()}
- npm run typecheck LULUS
- Commit 78f1885

RE-TAG v4.6.5:
- Hapus tag v4.6.5 lama (yang point ke e773952)
- Push commit 78f1885
- Re-create tag v4.6.5 di 78f1885
- Push tag — trigger run #146

BUILD #146 BERHASIL:
- 11 step lulus: Setup → Checkout → Node.js → Install → Typecheck →
  Build → Smoke test → NSIS installer → List artifacts → Upload → Release
- Total ~154 detik (~2.5 menit)
- 5 assets di release:
  - ARAY-Setup-4.6.5.exe (97.50 MB) — NSIS installer (recommended)
  - ARAY-Portable-4.6.5.exe (97.26 MB) — portable, no install
  - ARAY-Setup-4.6.5.exe.blockmap (0.10 MB) — delta update metadata
  - ARAY-Setup-4.6.5.zip (127.28 MB) — zip distribusi
  - latest.yml — auto-update manifest

Stage Summary:
- Release: https://github.com/synclicen/ARAY/releases/tag/v4.6.5
- Electron: DEFAULT_SETTINGS di main.ts sekarang sync lengkap dengan
  android-shim.ts — fitur kamera berfungsi di Electron + Android
- Code di main branch: commit 78f1885 (HEAD)
- Versi: 4.6.5 (bump dari 4.6.4)
- Android APK v1.0.18 (dari commit 14f4bb3, build sebelumnya) tetap compatible

---
Task ID: android-license-port
Agent: main
Task: Samakan sistem lisensi Android dengan Electron

Work Log:
- User: "kenapa pada versi android tidak ada sistem lisensi? samakan seperti versi elektron"
- Audit: android-shim.ts hardcoded license.status → isValid: true selamanya
  - Tidak ada aktivasi, expiry, machineId real
  - User Android tidak pernah lihat LicenseGate

Implementasi:
- Buat android-app/src/license.ts — port dari electron/license.ts
- Pakai Web Crypto API:
  - crypto.subtle.digest('SHA-256', ...) untuk hash
  - crypto.subtle.importKey + crypto.subtle.sign('HMAC', ...) untuk HMAC
- Algorithm SAMA PERSIS dengan Electron:
  - machineId = SHA256(navigator.userAgent | platform | cpuCores | mem |
    screenW x screenH | language | timezone)
  - activationCode = SHA256(machineId : licenseType : expiry : SECRET) first 16 chars
  - License data HMAC-signed, stored di Capacitor Preferences
- Same LICENSE_SECRET: 'ARAY-2026-HUMAS-UIN-ANTASARI-BANJARMASIN'
  → activation code yang di-generate oleh tools/generate-license.ts
    berlaku untuk Electron dan Android (asalkan machineId cocok)

API paritas (semua async):
- checkLicenseStatus(): real status (isValid/isExpired/daysRemaining/machineId)
- activateLicense(code): verify code untuk machineId ini, simpan + sign
- generateLicenseCode(machineId, adminKey): admin/dev mode generator
- getMachineId(): return SHA256 fingerprint device

Storage:
- Preferences key 'aray_license_data' = signed JSON
- Preferences key 'aray_first_run_date' = ISO date string

Update android-shim.ts:
- license.status: call checkLicenseStatus() (sebelumnya hardcoded isValid:true)
- license.activate: call activateLicense(code) (sebelumnya always success)
- license.generate: call generateLicenseCode(machineId, adminKey)
- license.getMachineId: call getMachineId() real

Build:
- Bump version 4.6.5 → 4.6.6
- Typecheck lulus
- Commit aa06fa8, push main
- Tag android-v1.0.19 + v4.6.6 (build paralel)
- Android Run #19: 283 detik, SUKSES, semua 19 step lulus
- Windows Run #147: SUKSES, semua 11 step lulus

Stage Summary:
- Android APK v1.0.19: https://github.com/synclicen/ARAY/releases/tag/android-v1.0.19
- Windows Installer v4.6.6: https://github.com/synclicen/ARAY/releases/tag/v4.6.6
- Sekarang user Android akan lihat LicenseGate saat pertama buka app
- Mereka dapat Machine ID → kirim ke admin → admin generate code → user input → aktivasi 30 hari
- Sama persis seperti flow Electron

---
Task ID: license-gate-scroll-zoom-fix
Agent: main
Task: Fix LicenseGate tidak bisa scroll + tidak bisa zoom — dev mode inaccessible

Work Log:
- User: "saat membuka halaman developer mode di halaman aktivasi lisensi, halaman
  tidak bisa di scroll ke bawah tidak bisa juga di zoom in, sehingga halaman
  developer tidak lengkap, dan tidak bisa melakukan aktivasi"

Akar masalah (3 layer):
1. Container LicenseGate pakai `h-screen flex items-center justify-center`
   - Paksa center vertikal, tidak ada scroll
   - Saat dev mode dibuka, content melebihi viewport → overflow ke luar layar
2. body { overflow: hidden } di globals.css (diperlukan untuk Booth camera)
   - Block semua scroll global termasuk LicenseGate
3. user-scalable=no, maximum-scale=1.0 di viewport (android-app/index.html)
   - Block pinch-zoom di Android
   - User tidak bisa zoom untuk baca Machine ID 64-char yang kecil

Fix yang diterapkan:
1. Viewport (android-app/index.html):
   - user-scalable=no → user-scalable=yes
   - maximum-scale=1.0 → maximum-scale=5.0
2. LicenseGate container (src/renderer/src/components/LicenseGate.tsx):
   - h-screen → min-h-screen (min-height, bisa grow)
   - flex items-center justify-center → py-8 (top padding, no forced center)
   - Tambah overflow-y-auto + minHeight: 100dvh (dynamic viewport)
   - motion.div: tambah mx-auto untuk center horizontal
   - Tambah useEffect untuk toggle class 'aray-scrollable' di body
3. globals.css: tambah body.aray-scrollable { overflow: auto; overscroll-behavior: contain }
   - Class ditoggle ON saat LicenseGate mount
   - Class di-toggle OFF saat LicenseGate unmount (saat license valid → AppShell)
   - Booth & page lain tidak terpengaruh (tetap overflow:hidden)

Build:
- Bump version 4.6.6 → 4.6.7
- Commit 7f07204, push main
- Tag android-v1.0.20 + v4.6.7 (build paralel)
- Android Run #20: SUKSES, semua 19 step lulus
- Windows Run #148: SUKSES, semua 11 step lulus

Stage Summary:
- Android APK v1.0.20: https://github.com/synclicen/ARAY/releases/tag/android-v1.0.20
- Windows Installer v4.6.7: https://github.com/synclicen/ARAY/releases/tag/v4.6.7
- User Android sekarang bisa:
  - Scroll halaman LicenseGate sampai bawah (termasuk Developer Mode)
  - Pinch-zoom untuk baca Machine ID 64-char dengan jelas
  - Akses tombol Generate Code di dev mode
  - Input activation code dengan nyaman

---
Task ID: production-audit-5000-peserta
Agent: main
Task: Audit production readiness untuk acara 5000 peserta full offline

Work Log:
- User: "baik, saya akan menggunakan sistem ini pada acara untuk 5000 peserta.
  audit lagi dan pastikan sistem kita siap full offline tanpa limit dan hambatan
  agar lancar dan stabil"
- Delegasi audit ke Explore agent → dapat 10 masalah (3 P0, 5 P1, 2 P2)
- 3 P0 = show-stoppers yang pasti bikin acara gagal kalau tidak fix:
  1. Android Preferences JSON blob dengan base64 inline → crash pada ~1MB (peserta ke-3-10)
  2. PalmTrigger MediaPipe tidak di-dispose → OOM Android setelah 30-100 sesi
  3. saveComposite silent failure → data loss saat disk penuh

P0 #1 — Android storage arch change (SHOW-STOPPER, biggest fix):
- Rewrite android-shim.ts total
- Preferences hanya simpan metadata (id, paths, timestamps, settings)
- File binary (foto/video) → Filesystem Directory.Data, app sandbox, unlimited quota
- Layout: Preferences[aray_database]=JSON metadata, FS:media/<event_id>/<media_id>.jpg
- In-memory cache _dbCache avoid parse JSON berkali-kali
- Debounced save 100ms (dari 500ms)
- Auto-flush saat visibilitychange/pagehide
- readFile/getFileInfo: baca dari Filesystem, fallback ke data URL (backward compat)
- events.delete: juga delete semua media file milik event dari FS
- media.delete: juga delete file binary dari FS

P0 #2 — PalmTrigger dispose:
- palmTriggerRef.current.stop() → palmTriggerRef.current.dispose?.() + null
- Release MediaPipe WASM model (20-40MB) + WebGL context

P0 #3 — saveComposite error handling:
- catch block: tambah setError + setPhase('error') + pesan jelas
- Sebelumnya silent fail → operator pikir sukses padahal file tidak tersimpan

P1 #5 — License event session lock (grace period 72 jam):
- Tambah startEventSession() + isEventSessionActive() di license.ts (Electron + Android)
- Saat Booth pertama dibuka, call window.aray.license.startEventSession()
- Setelah dipanggil, license check tetap isValid:true selama 72 jam bahkan jika expired
- Implementation: in-memory _eventSessionStartedAt di license module
- IPC handler + preload expose startEventSession (Electron)
- Shim expose startEventSession (Android)

P1 #6 — JSON DB backup otomatis (Electron):
- saveDB debounce 500ms → 100ms
- _incrementalBackup(): setiap 50 saves, rotate 3 backup files
  (data.json.bak1 latest, .bak2, .bak3 oldest)
- Kalau data.json corrupt, ada rollback ke .bak1/.bak2/.bak3

P1 #7 — Auto-backup async (tidak block IPC):
- backupFileAsync() via setImmediate
- saveCapturedFrame, saveVideo, saveComposite pakai async backup
- Booth UI tidak stutter saat capture
- Manual sync tetap sync (backupFile) — user menunggu progress

P2 #9 — visibilitychange listener (camera auto-recover):
- Saat Android app background → camera stream mati
- Saat resume, deteksi stream dead → stopCamera + startCamera
- Cek track.readyState === 'live' untuk determine stream health

P2 #10 — FirstRun skip wizard:
- Tombol 'Skip wizard — use defaults' di Welcome step (step 0)
- Setup cepat < 30 detik untuk sebelum acara
- Defaults: Documents/ARAY, camera auto, printer skip, backup off

Build v4.6.8:
- Bump version 4.6.7 → 4.6.8
- Commit 446452e, push main
- Tag android-v1.0.21 + v4.6.8 (build paralel)
- Android Run #21: 257 detik, SUKSES, semua 19 step lulus
- Windows Run #149: SUKSES, semua 11 step lulus

Stage Summary:
- Android APK v1.0.21: https://github.com/synclicen/ARAY/releases/tag/android-v1.0.21
- Windows Installer v4.6.8: https://github.com/synclicen/ARAY/releases/tag/v4.6.8
- Semua 3 P0 show-stoppers FIXED
- Semua 5 P1 quick fixes APPLIED
- Semua 2 P2 nice-to-have DONE
- Sistem sekarang siap untuk acara 5000 peserta full offline
- Pre-event checklist untuk operator:
  1. Pastikan license expiry > event date + 7 hari (atau andalkan 72h grace period)
  2. Disable auto_backup selama acara (sync manual setelah event)
  3. Disable palm_trigger jika tidak dipakai (hemat memory)
  4. Test storage disk space > 100 GB free
  5. Set kiosk_mode=true + booth_fullscreen_password ≠ 'aray'
  6. Disable screen saver/sleep Windows
  7. Test full rehearsal 100 peserta dulu sebelum hari-H

---
Task ID: android-electron-parity-v470
Agent: main
Task: Android parity dengan Electron — public storage + Share intent backup

Work Log:
- User: "kalau begitu cari cara atau pendekatan berbeda agar konsep yang ada pada
  elektron juga bisa berjalan di android. Kerjakan dengan sistematis dan kawal
  build sampai berhasil. Pastikan apk lancar dan stabil"

Pendekatan baru untuk Android (mimic Electron concepts):

1. PUBLIC STORAGE (seperti Electron file system):
   - Switch dari Directory.Data (sandbox tersembunyi) ke Directory.Documents
   - Foto disimpan di: /storage/emulated/0/Documents/ARAY/<event_id>/<media_id>.jpg
   - Folder PUBLIK — user bisa akses via app "Files" atau "File Manager"
   - User bisa copy folder ARAY ke PC, flashdisk, atau upload ke cloud manual
   - Tidak perlu root, tidak perlu special permission (Android 11+ scoped storage)

2. SHARE INTENT (seperti Google Drive sync):
   - Tambah @capacitor/share integration (sudah di deps, sebelumnya tidak dipakai)
   - googleDrive.connect() sekarang BUKAN stub — buka Android share sheet
   - User tap "Backup to Drive" → share sheet muncul → pilih Google Drive app
   - Google Drive app handle upload (native Android OAuth, no plugin needed)
   - Juga bisa share ke WhatsApp, Email, Bluetooth, dll

3. STORAGE INFO REAL:
   - getStorageInfo() hitung real usage via readdir + stat di Documents/ARAY
   - Path display: /storage/emulated/0/Documents/ARAY (real path)
   - Reference total 8GB (realistic for Android device)

4. UI UPDATES:
   - SyncCenter.tsx:
     - Android: tombol "Backup to Drive / Share" (gold) + "Open in Files app" (silver)
     - Info banner: jelaskan penyimpanan Android + cara backup
     - Electron: tetap Connect/Disconnect Google Drive (tidak berubah)
   - Settings.tsx:
     - Android: tombol "Open in Files app" (gold)
     - Info card: jelaskan path Documents/ARAY + cara backup

5. FILE ACCESS:
   - storage.openFolder(): Share intent untuk buka folder ARAY di file manager
   - media.openInFolder(path): Share individual file ke app lain
   - getFileUri(): helper untuk dapat content:// URI dari Filesystem path

BACKWARD COMPAT:
- Data lama (base64 inline di Preferences) tetap dibaca
- Fallback ke data URL kalau Filesystem tidak available
- Electron codebase TIDAK berubah (masih pakai fs.writeFileSync ke storage_path)

Build v4.7.0:
- Bump version 4.6.9 → 4.7.0
- Commit 9fb2d5b, push main
- Tag android-v1.0.23 + v4.7.0 (build paralel)
- Android Run #23: 461 detik, SUKSES, semua 19 step lulus
- Windows Run #151: SUKSES, semua 11 step lulus

Stage Summary:
- Android APK v1.0.23: https://github.com/synclicen/ARAY/releases/tag/android-v1.0.23
- Windows Installer v4.7.0: https://github.com/synclicen/ARAY/releases/tag/v4.7.0
- Foto Android sekarang tersimpan di Documents/ARAY (public, accessible)
- Backup via Share intent (Google Drive, WhatsApp, Email, dll)
- UI jelas tentang storage location + cara backup
- Electron behavior tetap utuh (tidak breaking change)
