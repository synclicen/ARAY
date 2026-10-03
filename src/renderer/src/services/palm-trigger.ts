/**
 * ARAY Palm Trigger — hand gesture detection for hands-free capture
 *
 * Angkat telapak tangan ke kamera → tahan 2 detik → capture otomatis.
 *
 * Detection strategy (heuristic, no ML model):
 * 1. Sample whole frame at low resolution (160x120) for skin-tone pixels.
 * 2. Calibration phase (first ~15 frames): measure baseline skin ratio
 *    (user's face is already in frame, so baseline is non-zero).
 * 3. Detection: palm is "present" when current skin ratio exceeds
 *    baseline by a delta threshold (sensitivity-controlled).
 * 4. Smoothing: rolling 5-frame average prevents flicker from hand wobble.
 * 5. Hold timer: once palm is present, start 2-second countdown.
 *    Palm must remain present (with brief slack) for the full 2 seconds.
 * 6. On trigger: fire callback once, then auto-stop (caller must restart).
 */

export class PalmTrigger {
  private video: HTMLVideoElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private isActive = false
  private sensitivity = 0.6  // 0.0-1.0, higher = more sensitive
  private onTrigger: (() => void) | null = null

  // Hold timer
  private holdStart: number | null = null
  private holdThreshold = 2000  // 2 seconds hold to trigger
  private rafId: number | null = null

  // Smoothing: rolling buffer of recent skin ratios
  private recentRatios: number[] = []
  private readonly bufferSize = 5

  // Calibration: baseline skin ratio (face is already skin-tone)
  private baselineSum = 0
  private baselineCount = 0
  private baselineRatio = 0
  private readonly baselineFrames = 15
  private calibrated = false

  // Palm-lost slack: tolerate brief detection gaps without resetting hold timer
  private lastPalmSeenAt = 0
  private readonly palmLostSlackMs = 250

  // Debug flag — set to true to spam console with per-frame diagnostics
  private readonly debug = false

  // Public callbacks for UI feedback
  public onPalmDetected: ((progress: number) => void) | null = null  // 0.0-1.0
  public onPalmLost: (() => void) | null = null

  start(video: HTMLVideoElement, sensitivity: number, onTrigger: () => void): void {
    this.video = video
    this.sensitivity = sensitivity
    this.onTrigger = onTrigger
    this.isActive = true
    this.holdStart = null
    this.recentRatios = []
    this.baselineSum = 0
    this.baselineCount = 0
    this.baselineRatio = 0
    this.calibrated = false
    this.lastPalmSeenAt = 0

    this.canvas = document.createElement('canvas')
    this.canvas.width = 160  // low res for performance
    this.canvas.height = 120
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })

    console.log('[PalmTrigger] Started, sensitivity:', sensitivity,
      '(delta threshold will be', this.deltaThreshold().toFixed(3), ')')
    this.detect()
  }

  stop(): void {
    this.isActive = false
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.holdStart = null
    this.recentRatios = []
    this.calibrated = false
    console.log('[PalmTrigger] Stopped')
  }

  /**
   * Delta above baseline required to consider palm "present".
   * Sensitivity 0.4 (Low)    → delta 0.14 (need a big clear palm)
   * Sensitivity 0.6 (Medium) → delta 0.10
   * Sensitivity 0.8 (High)   → delta 0.06 (small palm enough)
   */
  private deltaThreshold(): number {
    return 0.18 - this.sensitivity * 0.15
  }

  private detect = (): void => {
    if (!this.isActive || !this.video || !this.canvas || !this.ctx) return
    // Wait until video has a real frame
    if (this.video.videoWidth === 0 || this.video.readyState < 2) {
      this.rafId = requestAnimationFrame(this.detect)
      return
    }

    // Draw current video frame to small canvas
    try {
      this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height)
    } catch (e) {
      // Video may not be ready — try again next frame
      this.rafId = requestAnimationFrame(this.detect)
      return
    }

    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height)
    const data = imageData.data
    const w = this.canvas.width
    const h = this.canvas.height

    // Count skin-tone pixels across the WHOLE frame.
    // Sample every pixel (160x120 = 19200 px, cheap enough at this resolution).
    // Heuristic: skin tones satisfy R > G > B, R > 60, R - B > 12,
    // and not too close to white (R,G,B all < 245) or black (max > 60).
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
          // Exclude near-white highlights (background, lights)
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

    // Calibration phase — establish baseline skin ratio (face, body, background)
    if (!this.calibrated) {
      this.baselineSum += smoothed
      this.baselineCount++
      if (this.baselineCount < this.baselineFrames) {
        if (this.debug) {
          console.log('[PalmTrigger] calibrating', this.baselineCount, '/',
            this.baselineFrames, 'ratio=', smoothed.toFixed(3))
        }
        this.rafId = requestAnimationFrame(this.detect)
        return
      }
      this.baselineRatio = this.baselineSum / this.baselineCount
      this.calibrated = true
      console.log('[PalmTrigger] Calibrated. baseline skin ratio:',
        this.baselineRatio.toFixed(3), '— delta threshold:',
        this.deltaThreshold().toFixed(3))
    }

    // Palm "present" if smoothed ratio exceeds baseline by delta threshold
    const delta = smoothed - this.baselineRatio
    const threshold = this.deltaThreshold()
    const isPalm = delta > threshold

    if (this.debug) {
      console.log('[PalmTrigger] ratio=', smoothed.toFixed(3),
        'baseline=', this.baselineRatio.toFixed(3),
        'delta=', delta.toFixed(3), 'thr=', threshold.toFixed(3),
        'palm=', isPalm, 'hold=', this.holdStart ? Date.now() - this.holdStart : 0)
    }

    const now = Date.now()

    if (isPalm) {
      this.lastPalmSeenAt = now

      if (this.holdStart === null) {
        this.holdStart = now
        console.log('[PalmTrigger] Palm acquired. delta=', delta.toFixed(3),
          'ratio=', smoothed.toFixed(3), '— hold for', this.holdThreshold, 'ms')
      }

      const elapsed = now - this.holdStart
      const progress = Math.min(1, elapsed / this.holdThreshold)

      if (this.onPalmDetected) {
        this.onPalmDetected(progress)
      }

      if (progress >= 1) {
        console.log('[PalmTrigger] TRIGGER! Palm held for', elapsed, 'ms')
        if (this.onTrigger) {
          this.onTrigger()
        }
        // Reset after trigger
        this.holdStart = null
        this.recentRatios = []
        this.isActive = false  // Stop after one trigger — caller must restart
        return
      }
    } else {
      // Palm lost — but tolerate brief gaps (hand wobble, lighting flicker)
      if (this.holdStart !== null) {
        const sinceLastSeen = now - this.lastPalmSeenAt
        if (sinceLastSeen > this.palmLostSlackMs) {
          console.log('[PalmTrigger] Palm lost after',
            now - this.holdStart, 'ms (gap=', sinceLastSeen, 'ms) — resetting')
          this.holdStart = null
          if (this.onPalmLost) {
            this.onPalmLost()
          }
        }
      }
    }

    this.rafId = requestAnimationFrame(this.detect)
  }
}
