
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
