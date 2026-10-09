// ARAY Android — Entry point
// 1. Install window.aray shim BEFORE React renders (otherwise window.aray is undefined → crash)
// 2. Then delegate to renderer's main.tsx

import './android-shim'   // side-effect: registers window.aray
import '../../src/renderer/src/main'  // re-execute renderer entry (renders React)
