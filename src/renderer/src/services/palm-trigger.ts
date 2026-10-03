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
}

// Tuning constants (sama dengan Saatiril-Andro)
const HAND_CONFIRM_SUSTAIN_MS = 500
const TRIGGER_COOLDOWN_MS = 5000

// ─── Singleton script loader ──────────────────────────────────────────────
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
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3/camera_utils.js')
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils@0.3/drawing_utils.js')
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/hands.js')
      await new Promise((r) => setTimeout(r, 100))

      if (typeof (window as any).Hands === 'undefined') {
        throw new Error('MediaPipe Hands global missing')
      }
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
          return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`
        }
      })

      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.3,  // Very responsive (sama dengan Saatiril)
        minTrackingConfidence: 0.3
      })

      hands.onResults((results: any) => this.processResults(results))

      // Initialize with dummy frame
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = 1
      tempCanvas.height = 1
      await hands.send({ image: tempCanvas })

      this.hands = hands
      this.setStatus('model_ready')
      console.log('[ARAY Palm v3] MediaPipe Hands model ready')
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
    const handDetected = multiHandLandmarks.length > 0

    // Cooldown check
    if (this.lastTriggerTime > 0 && now - this.lastTriggerTime < TRIGGER_COOLDOWN_MS) {
      this.setState('triggered')
      return
    }

    if (handDetected) {
      if (this.handVisibleSince === 0) {
        // Hand just appeared
        this.handVisibleSince = now
        this.isConfirmed = false
        this.triggerFired = false
        this.setState('hand_detected')
        console.log('[ARAY Palm v3] Hand appeared — waiting for 500ms sustain')
      } else if (!this.isConfirmed && now - this.handVisibleSince >= HAND_CONFIRM_SUSTAIN_MS) {
        // Hand sustained long enough → confirmed
        this.isConfirmed = true
        this.setState('confirmed')
        console.log('[ARAY Palm v3] Hand confirmed ✓ — remove hand to trigger timer')
        this.callbacks?.onPalmConfirmed?.()
      }
      // else: hand still visible, waiting for sustain or waiting to leave
    } else {
      // No hand in frame
      if (this.isConfirmed && !this.triggerFired) {
        // Hand was confirmed and now left → TRIGGER!
        this.triggerFired = true
        this.lastTriggerTime = now
        this.setState('triggered')
        console.log('[ARAY Palm v3] Hand left frame → TIMER STARTED! (photobooth trigger)')
        this.callbacks?.onPalmLeft?.()
      } else {
        // Hand was not confirmed or already triggered — just reset
        this.setState('none')
      }
      this.handVisibleSince = 0
      this.isConfirmed = false
    }
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
