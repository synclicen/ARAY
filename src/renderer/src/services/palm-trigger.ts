/**
 * ARAY Palm Trigger v3 — MediaPipe Hands (Saatiril-Andro port)
 *
 * Sama seperti Saatiril-Andro: https://github.com/synclicen/Saatiril-Andro
 * commit c57562dc — src/hooks/use-palm-detection.ts
 *
 * ALUR (photobooth trigger):
 *   1. Person shows hand to camera
 *   2. Hand must be visible for 500ms to be "confirmed" (debounce)
 *   3. Indicator turns green: "Tangan terdeteksi ✓"
 *   4. Person removes hand from frame → TIMER STARTS immediately
 *   5. Person poses during countdown → photo taken at 0
 *
 * Ini jauh lebih akurat dari heuristic skin detection (v1/v2) karena
 * pakai MediaPipe Hands ML model yang mendeteksi 21 hand landmarks.
 *
 * STATE MACHINE:
 *   none          → no hand in frame
 *   hand_detected → hand just appeared, waiting for 500ms sustain
 *   confirmed     → hand sustained 500ms (show "SIAP" / "Tangan terdeteksi ✓")
 *   triggered     → confirmed hand left frame → fire onPalmLeft → START TIMER
 *
 * TIMING:
 *   HAND_CONFIRM_SUSTAIN_MS = 500  (debounce — hand must stay 500ms)
 *   TRIGGER_COOLDOWN_MS     = 5000 (anti re-trigger setelah capture)
 *
 * MODEL:
 *   MediaPipe Hands (maxNumHands: 1, modelComplexity: 1)
 *   minDetectionConfidence: 0.3 (very responsive)
 *   minTrackingConfidence: 0.3
 *   Scripts loaded from CDN: cdn.jsdelivr.net/npm/@mediapipe/hands@0.4
 */

export type PalmStatus =
  | 'unloaded'
  | 'loading_scripts'
  | 'loading_model'
  | 'model_ready'
  | 'detecting'
  | 'stopped'
  | 'error'

export type PalmState = 'none' | 'searching' | 'hand_detected' | 'confirmed' | 'triggered'

export interface PalmCallbacks {
  onPalmConfirmed: () => void  // hand sustained 500ms → show "SIAP"
  onPalmLeft: () => void       // confirmed hand left frame → START TIMER
  onStateChange?: (state: PalmState) => void  // UI feedback
  onStatusChange?: (status: PalmStatus, error?: string | null) => void  // loading/error
  // v3.3: debug callback — fires every frame with detection details.
  // UI uses this to show live feedback: "hand detected, 3/5 fingers, ..."
  onDebug?: (info: {
    handDetected: boolean       // MediaPipe detected a hand
    landmarkCount: number       // number of landmarks (should be 21 if hand detected)
    openPalm: boolean           // validator result (enough fingers extended)
    fingerStatus: { finger: string; extended: boolean }[]  // per-finger status
    state: PalmState
  }) => void
}

// Tuning constants (sama dengan Saatiril-Andro)
const HAND_CONFIRM_SUSTAIN_MS = 500
const TRIGGER_COOLDOWN_MS = 5000

// ─── Singleton script loader ──────────────────────────────────────────────
// v3.1: Load MediaPipe from LOCAL bundled assets (public/mediapipe/) instead
// of CDN. The previous CDN approach failed silently because Electron's CSP
// (`script-src 'self'`) blocked cross-origin script loading.
// Local loading also works offline and is more reliable.
let scriptsLoadPromise: Promise<boolean> | null = null

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Failed to load: ${src}`))
    document.head.appendChild(s)
  })
}

async function loadPalmScripts(): Promise<boolean> {
  if (scriptsLoadPromise) return scriptsLoadPromise
  scriptsLoadPromise = (async () => {
    try {
      // Load from local bundled assets (copied to public/mediapipe/ at build time)
      // Vite serves public/ at root, so paths are /mediapipe/...
      await loadScript('./mediapipe/hands.js')
      await new Promise((r) => setTimeout(r, 100))

      if (typeof (window as any).Hands === 'undefined') {
        throw new Error('MediaPipe Hands global missing after script load')
      }
      console.log('[ARAY Palm v3] MediaPipe scripts loaded from local bundle')
      return true
    } catch (e: any) {
      console.error('[ARAY Palm v3] Script load failed:', e.message)
      scriptsLoadPromise = null
      return false
    }
  })()
  return scriptsLoadPromise
}

// ─── PalmTrigger class ────────────────────────────────────────────────────

export class PalmTrigger {
  private status: PalmStatus = 'unloaded'
  private state: PalmState = 'none'
  private error: string | null = null

  private hands: any = null
  private video: HTMLVideoElement | null = null
  private animFrame: number | null = null
  private isDetecting = false

  private callbacks: PalmCallbacks | null = null

  // Hand tracking state
  private handVisibleSince = 0
  private isConfirmed = false
  private triggerFired = false
  private lastTriggerTime = 0
  private frameCount = 0  // for periodic console logging

  /**
   * Initialize: load MediaPipe scripts + model.
   * Call this before start(). Returns true on success.
   */
  async initialize(): Promise<boolean> {
    this.setStatus('loading_scripts')
    this.error = null

    const ok = await loadPalmScripts()
    if (!ok) {
      this.setStatus('error', 'Failed to load MediaPipe Hands scripts')
      return false
    }

    this.setStatus('loading_model')

    try {
      const hands = new (window as any).Hands({
        locateFile: (file: string) => {
          // Load WASM/data assets from local bundle (public/mediapipe/)
          return `./mediapipe/${file}`
        }
      })

      hands.setOptions({
        maxNumHands: 1,
        // v3.3: modelComplexity 0 (lite) — faster, more reliable on lower-end machines.
        // modelComplexity 1 (full) sometimes fails to detect on slower CPUs.
        modelComplexity: 0,
        // v3.3: Lowered from 0.6 → 0.4. At 0.6, MediaPipe often fails to detect
        // hands at all (especially in non-ideal lighting). 0.4 is a good balance —
        // still filters most false positives but actually detects real hands.
        minDetectionConfidence: 0.4,
        minTrackingConfidence: 0.4
      })

      hands.onResults((results: any) => this.processResults(results))

      // Initialize with dummy frame (1x1 is fine for warmup)
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = 1
      tempCanvas.height = 1
      await hands.send({ image: tempCanvas })

      this.hands = hands
      this.setStatus('model_ready')
      console.log('[ARAY Palm v3] MediaPipe Hands model ready (complexity: lite, confidence: 0.4)')
      return true
    } catch (e: any) {
      console.error('[ARAY Palm v3] Model init failed:', e)
      this.setStatus('error', e?.message || 'Model init failed')
      return false
    }
  }

  /**
   * Start detection. Will auto-initialize if needed.
   * @param video    HTMLVideoElement with camera stream
   * @param _sensitivity  ignored (kept for backward compat — MediaPipe uses 0.3 confidence)
   * @param callbacks   onPalmConfirmed, onPalmLeft, optional onStateChange/onStatusChange
   */
  async start(
    video: HTMLVideoElement,
    _sensitivity: number,
    callbacks: PalmCallbacks
  ): Promise<void> {
    if (!this.hands) {
      const ok = await this.initialize()
      if (!ok) return
    }

    this.video = video
    this.callbacks = callbacks
    this.isDetecting = true
    this.resetState()

    this.setState('searching')
    this.setStatus('detecting')
    console.log('[ARAY Palm v3] Detection started — show hand to camera, hold 500ms, then remove to trigger')
    this.detectFrame()
  }

  stop(): void {
    this.isDetecting = false
    if (this.animFrame) {
      cancelAnimationFrame(this.animFrame)
      this.animFrame = null
    }
    this.setState('none')
    this.setStatus('model_ready')
    this.resetState()
    console.log('[ARAY Palm v3] Detection stopped')
  }

  dispose(): void {
    this.stop()
    if (this.hands) {
      try { this.hands.close() } catch {}
      this.hands = null
    }
    this.setStatus('unloaded')
  }

  getStatus(): PalmStatus { return this.status }
  getState(): PalmState { return this.state }
  getError(): string | null { return this.error }

  // ─── Internal ───────────────────────────────────────────────────────────

  private resetState(): void {
    this.handVisibleSince = 0
    this.isConfirmed = false
    this.triggerFired = false
    this.lastTriggerTime = 0
  }

  private setState(newState: PalmState): void {
    if (this.state === newState) return
    console.log('[ARAY Palm v3]', this.state, '→', newState)
    this.state = newState
    this.callbacks?.onStateChange?.(newState)
  }

  private setStatus(newStatus: PalmStatus, error?: string | null): void {
    this.status = newStatus
    if (error !== undefined) this.error = error
    this.callbacks?.onStatusChange?.(newStatus, this.error)
  }

  private processResults(results: any): void {
    if (!this.isDetecting) return

    const multiHandLandmarks = results.multiHandLandmarks || []
    const now = Date.now()

    // v3.3: OPEN PALM VALIDATION — relaxed to require 4/5 fingers (not all 5).
    // Strict 5-finger requirement was too hard to achieve — thumb detection
    // is unreliable in MediaPipe lite model. 4/5 is still strict enough to
    // filter faces/fists but accepts real open palms.
    const landmarks = multiHandLandmarks[0]
    const fingerStatus = this.getFingerStatus(landmarks)
    const extendedCount = fingerStatus.filter(f => f.extended).length
    const openPalm = multiHandLandmarks.length > 0 && extendedCount >= 4

    // v3.3: emit debug info every frame so UI can show live detection status
    if (this.callbacks?.onDebug) {
      this.callbacks.onDebug({
        handDetected: multiHandLandmarks.length > 0,
        landmarkCount: landmarks ? landmarks.length : 0,
        openPalm,
        fingerStatus,
        state: this.state
      })
    }

    // Periodic console log (every ~30 frames ≈ 1s)
    this.frameCount = (this.frameCount || 0) + 1
    if (this.frameCount % 30 === 0) {
      if (multiHandLandmarks.length > 0) {
        console.log('[ARAY Palm v3] Hand detected — landmarks:', landmarks.length,
          '— fingers extended:', extendedCount + '/5',
          '(' + fingerStatus.map(f => f.finger + ':' + (f.extended ? 'Y' : 'n')).join(' ') + ')',
          '— openPalm:', openPalm ? 'YES' : 'no')
      } else {
        console.log('[ARAY Palm v3] No hand detected — show open palm to camera')
      }
    }

    const handDetected = openPalm

    // Cooldown check
    if (this.lastTriggerTime > 0 && now - this.lastTriggerTime < TRIGGER_COOLDOWN_MS) {
      this.setState('triggered')
      return
    }

    if (handDetected) {
      if (this.handVisibleSince === 0) {
        // Open palm just appeared
        this.handVisibleSince = now
        this.isConfirmed = false
        this.triggerFired = false
        this.setState('hand_detected')
        console.log('[ARAY Palm v3] Open palm appeared — waiting for 500ms sustain')
      } else if (!this.isConfirmed && now - this.handVisibleSince >= HAND_CONFIRM_SUSTAIN_MS) {
        // Open palm sustained long enough → confirmed
        this.isConfirmed = true
        this.setState('confirmed')
        console.log('[ARAY Palm v3] Open palm confirmed ✓ — remove hand to trigger timer')
        this.callbacks?.onPalmConfirmed?.()
      }
      // else: palm still visible, waiting for sustain or waiting to leave
    } else {
      // No open palm in frame (either no hand, or hand but not enough fingers)
      if (this.isConfirmed && !this.triggerFired) {
        // Open palm was confirmed and now left → TRIGGER!
        this.triggerFired = true
        this.lastTriggerTime = now
        this.setState('triggered')
        console.log('[ARAY Palm v3] Open palm left frame → TIMER STARTED! (photobooth trigger)')
        this.callbacks?.onPalmLeft?.()
      } else {
        // Open palm was not confirmed or already triggered — just reset
        this.setState('none')
      }
      this.handVisibleSince = 0
      this.isConfirmed = false
    }
  }

  /**
   * v3.3: FINGER STATUS — returns per-finger extended status.
   * Used by processResults to determine open palm (4/5 fingers extended).
   *
   * MediaPipe Hands landmark indices (21 landmarks per hand):
   *   0: wrist
   *   1-4: thumb (CMC, MCP, IP, TIP)
   *   5-8: index (MCP, PIP, DIP, TIP)
   *   9-12: middle (MCP, PIP, DIP, TIP)
   *   13-16: ring (MCP, PIP, DIP, TIP)
   *   17-20: pinky (MCP, PIP, DIP, TIP)
   *
   * A finger is "extended" if its TIP is farther from the wrist than its PIP joint.
   * (When you make a fist, fingertips curl back toward palm, closer to wrist than PIP.)
   *
   * v3.3 changes:
   * - Threshold lowered from 1.05 → 1.0 (TIP just needs to be farther, not 5% farther)
   *   This was too strict — many real open palms failed the 5% test.
   * - Returns per-finger status so UI can show "3/5 fingers: index Y middle Y ring Y pinky n thumb n"
   */
  private getFingerStatus(landmarks: any): { finger: string; extended: boolean }[] {
    if (!landmarks || landmarks.length < 21) {
      return [
        { finger: 'thumb', extended: false },
        { finger: 'index', extended: false },
        { finger: 'middle', extended: false },
        { finger: 'ring', extended: false },
        { finger: 'pinky', extended: false }
      ]
    }

    const wrist = landmarks[0]
    const dist = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y)

    // Helper: is finger extended? (TIP farther from wrist than PIP joint)
    // v3.3: threshold 1.0 (just farther, no 5% margin) — more lenient
    const isFingerExtended = (pipIdx: number, tipIdx: number): boolean => {
      const pip = landmarks[pipIdx]
      const tip = landmarks[tipIdx]
      return dist(tip, wrist) > dist(pip, wrist)
    }

    // Index, middle, ring, pinky
    const indexExtended = isFingerExtended(6, 8)
    const middleExtended = isFingerExtended(10, 12)
    const ringExtended = isFingerExtended(14, 16)
    const pinkyExtended = isFingerExtended(18, 20)

    // Thumb — v3.3: more lenient test.
    // Thumb TIP (4) should be farther from pinky MCP (17) than thumb MCP (2) is.
    // This means thumb is spread out, not tucked across palm.
    const thumbMcp = landmarks[2]
    const thumbTip = landmarks[4]
    const pinkyMcp = landmarks[17]
    const thumbSpread = dist(thumbTip, pinkyMcp) > dist(thumbMcp, pinkyMcp)

    return [
      { finger: 'thumb', extended: thumbSpread },
      { finger: 'index', extended: indexExtended },
      { finger: 'middle', extended: middleExtended },
      { finger: 'ring', extended: ringExtended },
      { finger: 'pinky', extended: pinkyExtended }
    ]
  }

  private detectFrame = async (): Promise<void> => {
    if (!this.isDetecting || !this.hands || !this.video) return

    try {
      await this.hands.send({ image: this.video })
    } catch {
      // Frame send failed, skip
    }

    if (this.isDetecting) {
      this.animFrame = requestAnimationFrame(() => this.detectFrame())
    }
  }
}
