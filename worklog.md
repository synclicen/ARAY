
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
