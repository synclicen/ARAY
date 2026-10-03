/**
 * ARAY Palm Trigger v2 — Saatiril-style arm/release detection
 *
 * ALUR (seperti Saatiril):
 * 1. User angkat tangan ke kamera
 * 2. Sistem deteksi tangan → muncul overlay "SIAP" (READY state)
 * 3. User TARIK tangan keluar dari frame
 * 4. Sistem deteksi tangan hilang → TRIGGER shutter (countdown → capture)
 *
 * Ini berbeda dari v1 yang trigger on HOLD (tahan 2 detik).
 * v2 trigger on RELEASE setelah ARM — lebih natural, lebih responsif.
 *
 * STATE MACHINE:
 *   IDLE  → (palm detected, stable for `armStableMs`)  → ARMED
 *   ARMED → (palm lost for `releaseTriggerMs`)         → TRIGGER → IDLE
 *   ARMED → (palm lost too quickly, < `armStableMs`)   → IDLE (false alarm)
 *
 * CALIBRATION:
 * - 15 frame awal mengukur baseline skin ratio (wajah user sudah di frame)
 * - Palm = delta-above-baseline (bukan absolute threshold)
 *
 * SENSITIVITY (user-configurable):
 *   0.4 (Low)    → delta 0.14 (butuh tangan besar & jelas)
 *   0.6 (Medium) → delta 0.10
 *   0.8 (High)   → delta 0.06 (tangan kecil cukup)
 *
 * TIMING:
 *   armStableMs      = 600   (tangan harus stabil 600ms sebelum ARMED)
 *   releaseTriggerMs = 150   (tangan hilang 150ms → trigger shutter)
 *   cooldownMs       = 1500  (anti double-trigger setelah capture)
 */

export type PalmState = 'IDLE' | 'ARMING' | 'ARMED' | 'TRIGGERED'

export class PalmTrigger {
  private video: HTMLVideoElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private isActive = false
  private sensitivity = 0.6
  private onTrigger: (() => void) | null = null

  // State machine
  private state: PalmState = 'IDLE'
  private stateChangedAt = 0

  // Timing constants
  private readonly armStableMs = 600      // palm must be present this long before ARMED
  private readonly releaseTriggerMs = 150 // palm must be absent this long to trigger
  private readonly cooldownMs = 1500      // after trigger, ignore palm for this long
  private readonly falseAlarmMs = 2000    // if arming doesn't stabilize in 2s, reset

  // Smoothing: rolling buffer of recent skin ratios
  private recentRatios: number[] = []
  private readonly bufferSize = 5

  // Calibration
  private baselineSum = 0
  private baselineCount = 0
  private baselineRatio = 0
  private readonly baselineFrames = 15
  private calibrated = false

  // Last seen palm timestamp (for release detection)
  private lastPalmSeenAt = 0

  // RAF
  private rafId: number | null = null

  // Debug
  private readonly debug = false
  private frameCount = 0

  // Public callbacks for UI feedback
  public onPalmDetected: ((state: PalmState, progress: number) => void) | null = null
  public onPalmLost: (() => void) | null = null
  // v2.1: debug callback — fires every frame with current delta/threshold.
  // UI uses this to show a live "palm detection meter" so user can see
  // if detection is working (delta bar moves when hand enters frame).
  public onDebug: ((info: { ratio: number; baseline: number; delta: number; threshold: number; isPalm: boolean; state: PalmState }) => void) | null = null

  start(video: HTMLVideoElement, sensitivity: number, onTrigger: () => void): void {
    this.video = video
    this.sensitivity = sensitivity
    this.onTrigger = onTrigger
    this.isActive = true
    this.state = 'IDLE'
    this.stateChangedAt = Date.now()
    this.recentRatios = []
    this.baselineSum = 0
    this.baselineCount = 0
    this.baselineRatio = 0
    this.calibrated = false
    this.lastPalmSeenAt = 0
    this.frameCount = 0

    this.canvas = document.createElement('canvas')
    this.canvas.width = 160
    this.canvas.height = 120
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })

    console.log('[PalmTrigger v2] Started, sensitivity:', sensitivity,
      '(delta threshold:', this.deltaThreshold().toFixed(3), ')')
    console.log('[PalmTrigger v2] Flow: IDLE → ARMING (palm detected) →',
      'ARMED ("SIAP" shown) → TRIGGER (palm pulled away) → shutter')
    this.detect()
  }

  stop(): void {
    this.isActive = false
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.state = 'IDLE'
    this.recentRatios = []
    this.calibrated = false
    console.log('[PalmTrigger v2] Stopped')
  }

  /**
   * Delta above baseline required to consider palm "present".
   * v2.1: MUCH lower thresholds — old 0.06-0.14 was too high.
   * With user's face already in frame (baseline ~30% skin), adding a palm
   * only increases skin ratio by ~3-5%. Old threshold of 0.10 (Medium)
   * meant palm was never detected.
   *
   * 0.4 (Low)    → delta 0.06 (need clear, close palm)
   * 0.6 (Medium) → delta 0.04 (moderate palm)
   * 0.8 (High)   → delta 0.025 (small/distant palm enough)
   */
  private deltaThreshold(): number {
    return 0.085 - this.sensitivity * 0.075
  }

  private setState(newState: PalmState): void {
    if (this.state === newState) return
    const now = Date.now()
    console.log('[PalmTrigger v2]', this.state, '→', newState,
      '(was in', this.state, 'for', now - this.stateChangedAt, 'ms)')
    this.state = newState
    this.stateChangedAt = now

    // Notify UI
    if (this.onPalmDetected) {
      this.onPalmDetected(newState, newState === 'ARMED' ? 1 : 0)
    }
    if (newState === 'IDLE' && this.onPalmLost) {
      this.onPalmLost()
    }
  }

  private detect = (): void => {
    if (!this.isActive || !this.video || !this.canvas || !this.ctx) return
    if (this.video.videoWidth === 0 || this.video.readyState < 2) {
      this.rafId = requestAnimationFrame(this.detect)
      return
    }

    try {
      this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height)
    } catch (e) {
      this.rafId = requestAnimationFrame(this.detect)
      return
    }

    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height)
    const data = imageData.data
    const w = this.canvas.width
    const h = this.canvas.height

    // Count skin-tone pixels across whole frame
    let skinPixels = 0
    let totalPixels = 0
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4
        const r = data[idx]
        const g = data[idx + 1]
        const b = data[idx + 2]
        totalPixels++
        if (r > 60 && g > 30 && b > 15 &&
            r > g && g >= b - 5 &&
            r - b > 12) {
          const max = r > g ? r : g
          const min = r < g ? r : g
          if (max < 245 && max - min > 8) {
            skinPixels++
          }
        }
      }
    }

    const skinRatio = totalPixels > 0 ? skinPixels / totalPixels : 0

    // Rolling smoothing
    this.recentRatios.push(skinRatio)
    if (this.recentRatios.length > this.bufferSize) this.recentRatios.shift()
    const smoothed = this.recentRatios.reduce((a, b) => a + b, 0) / this.recentRatios.length

    // Calibration phase
    if (!this.calibrated) {
      this.baselineSum += smoothed
      this.baselineCount++
      if (this.baselineCount < this.baselineFrames) {
        this.rafId = requestAnimationFrame(this.detect)
        return
      }
      this.baselineRatio = this.baselineSum / this.baselineCount
      this.calibrated = true
      console.log('[PalmTrigger v2] Calibrated. baseline skin ratio:',
        this.baselineRatio.toFixed(3), '— delta threshold:',
        this.deltaThreshold().toFixed(3))
    }

    const delta = smoothed - this.baselineRatio
    const threshold = this.deltaThreshold()
    const isPalm = delta > threshold
    const now = Date.now()

    // v2.1: Always emit debug info so UI can show live detection meter
    if (this.onDebug) {
      this.onDebug({
        ratio: smoothed,
        baseline: this.baselineRatio,
        delta,
        threshold,
        isPalm,
        state: this.state
      })
    }

    // Periodic console log (every ~30 frames ≈ 1s) so user can see detection working
    this.frameCount = (this.frameCount || 0) + 1
    if (this.frameCount % 30 === 0) {
      console.log('[PalmTrigger v2.1] state=', this.state,
        'ratio=', smoothed.toFixed(3),
        'baseline=', this.baselineRatio.toFixed(3),
        'delta=', delta.toFixed(3),
        'thr=', threshold.toFixed(3),
        'palm=', isPalm ? 'YES' : 'no')
    }

    // ─── STATE MACHINE ───────────────────────────────────────────
    switch (this.state) {
      case 'IDLE': {
        if (isPalm) {
          // Start arming — palm must stay stable for armStableMs
          this.lastPalmSeenAt = now
          this.setState('ARMING')
        }
        break
      }

      case 'ARMING': {
        if (isPalm) {
          this.lastPalmSeenAt = now
          const elapsed = now - this.stateChangedAt
          if (elapsed >= this.armStableMs) {
            // Palm stable long enough → ARMED ("SIAP" shown to user)
            this.setState('ARMED')
          }
        } else {
          // Palm lost during arming — if quick, treat as false alarm
          const sinceLastSeen = now - this.lastPalmSeenAt
          if (sinceLastSeen > this.releaseTriggerMs) {
            console.log('[PalmTrigger v2] Palm lost during arming — false alarm, reset to IDLE')
            this.setState('IDLE')
          }
        }
        // Timeout: if arming takes too long, reset
        if (now - this.stateChangedAt > this.falseAlarmMs) {
          this.setState('IDLE')
        }
        break
      }

      case 'ARMED': {
        if (!isPalm) {
          // Palm pulled away — trigger shutter!
          const sinceLastSeen = now - this.lastPalmSeenAt
          if (sinceLastSeen >= this.releaseTriggerMs) {
            console.log('[PalmTrigger v2] TRIGGER! Palm pulled away after',
              now - this.stateChangedAt, 'ms in ARMED state')
            this.setState('TRIGGERED')
            if (this.onTrigger) {
              this.onTrigger()
            }
            // Enter cooldown to prevent double-trigger
            this.state = 'IDLE'
            this.stateChangedAt = now + this.cooldownMs  // hack: skip arming during cooldown
            // Reset baseline (lighting may have changed)
            this.calibrated = false
            this.baselineSum = 0
            this.baselineCount = 0
            this.recentRatios = []
          }
        } else {
          this.lastPalmSeenAt = now
        }
        break
      }

      case 'TRIGGERED': {
        // Should not stay here — TRIGGERED immediately transitions to IDLE
        this.setState('IDLE')
        break
      }
    }

    // Cooldown check: if stateChangedAt is in the future, we're in cooldown
    if (this.state === 'IDLE' && this.stateChangedAt > now) {
      // Still in cooldown — skip arming
      if (isPalm) {
        this.lastPalmSeenAt = now
      }
    }

    this.rafId = requestAnimationFrame(this.detect)
  }
}
