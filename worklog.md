
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
