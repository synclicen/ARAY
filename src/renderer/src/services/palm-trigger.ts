/**
 * ARAY Palm Trigger — hand gesture detection for hands-free capture
 * 
 * Uses TensorFlow.js handpose model to detect open palm in camera feed.
 * When palm is held steady for ~2 seconds, triggers capture.
 * 
 * This runs entirely in the renderer (browser) — no native modules.
 */

// Simple palm detection via brightness/motion analysis (no TF needed)
// We analyze the video feed for a large bright area (palm) that stays
// relatively stationary for 2 seconds. This is a lightweight heuristic
// approach that works without loading large ML models.

export class PalmTrigger {
  private video: HTMLVideoElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private isActive = false
  private sensitivity = 0.6  // 0.0-1.0, higher = more sensitive
  private onTrigger: (() => void) | null = null
  
  // Detection state
  private holdStart: number | null = null
  private holdThreshold = 2000  // 2 seconds hold to trigger
  private rafId: number | null = null
  private lastFrameData: Uint8ClampedArray | null = null
  private consecutiveMatches = 0
  private requiredConsecutive = 10  // ~10 frames of consistent palm
  
  // Callbacks for UI feedback
  public onPalmDetected: ((progress: number) => void) | null = null  // 0.0-1.0
  public onPalmLost: (() => void) | null = null

  start(video: HTMLVideoElement, sensitivity: number, onTrigger: () => void): void {
    this.video = video
    this.sensitivity = sensitivity
    this.onTrigger = onTrigger
    this.isActive = true
    this.holdStart = null
    this.consecutiveMatches = 0
    this.lastFrameData = null
    
    this.canvas = document.createElement('canvas')
    this.canvas.width = 160  // low res for performance
    this.canvas.height = 120
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })
    
    console.log('[PalmTrigger] Started, sensitivity:', sensitivity)
    this.detect()
  }

  stop(): void {
    this.isActive = false
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    this.holdStart = null
    this.consecutiveMatches = 0
    this.lastFrameData = null
    console.log('[PalmTrigger] Stopped')
  }

  private detect = (): void => {
    if (!this.isActive || !this.video || !this.canvas || !this.ctx) return
    if (this.video.videoWidth === 0) {
      this.rafId = requestAnimationFrame(this.detect)
      return
    }

    // Draw video to small canvas
    this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height)
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height)
    const data = imageData.data

    // Calculate brightness in center region (where palm would be)
    const cx = this.canvas.width / 2
    const cy = this.canvas.height / 2
    const radius = 40  // detection radius
    let brightPixels = 0
    let totalPixels = 0
    let avgR = 0, avgG = 0, avgB = 0

    for (let y = cy - radius; y < cy + radius; y++) {
      for (let x = cx - radius; x < cx + radius; x++) {
        const idx = (Math.floor(y) * this.canvas.width + Math.floor(x)) * 4
        if (idx < 0 || idx >= data.length) continue
        const r = data[idx]
        const g = data[idx + 1]
        const b = data[idx + 2]
        const brightness = (r + g + b) / 3
        avgR += r
        avgG += g
        avgB += b
        totalPixels++
        
        // Skin tone detection: R > G > B and R > 95, G > 40, B > 20
        if (r > 95 && g > 40 && b > 20 && r > g && g > b && 
            Math.max(r, g, b) - Math.min(r, g, b) > 15) {
          brightPixels++
        }
      }
    }

    if (totalPixels === 0) {
      this.rafId = requestAnimationFrame(this.detect)
      return
    }

    avgR /= totalPixels
    avgG /= totalPixels
    avgB /= totalPixels

    const skinRatio = brightPixels / totalPixels
    // Sensitivity adjusts threshold: higher sensitivity = lower threshold
    const threshold = 0.3 + (1 - this.sensitivity) * 0.3  // 0.3-0.6

    const isPalm = skinRatio > threshold

    if (isPalm) {
      this.consecutiveMatches++
      
      if (this.consecutiveMatches >= this.requiredConsecutive) {
        if (this.holdStart === null) {
          this.holdStart = Date.now()
          console.log('[PalmTrigger] Palm detected, holding...')
        }
        
        const elapsed = Date.now() - this.holdStart
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
          this.consecutiveMatches = 0
          this.isActive = false  // Stop after one trigger — caller must restart
          return
        }
      }
    } else {
      if (this.consecutiveMatches > 0) {
        this.consecutiveMatches = Math.max(0, this.consecutiveMatches - 2)
      }
      if (this.holdStart !== null) {
        const elapsed = Date.now() - this.holdStart
        if (elapsed < this.holdThreshold) {
          // Palm lost before threshold — reset
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
