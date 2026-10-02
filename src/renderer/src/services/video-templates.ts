/**
 * ARAY Video Templates — motion combination templates
 * 
 * ONLY motion effects. NO color filters (those are in the Effect dropdown).
 * Each template combines multiple motion types into one cohesive video.
 * All effects applied DURING recording via canvas draw — real-time.
 */

export interface VideoTemplate {
  id: string
  name: string
  description: string
  duration: number
  motionType: string  // single or combined motion
  filterCss: string   // always '' — filters come from Effect dropdown
}

export const VIDEO_TEMPLATES: VideoTemplate[] = [
  // ─── SINGLE MOTION ───────────────────────────────────────────
  {
    id: 'plain',
    name: 'Plain',
    description: 'No motion. Clean recording only.',
    duration: 15,
    motionType: 'none',
    filterCss: ''
  },
  {
    id: 'slowmo',
    name: 'Slow Motion',
    description: 'Dreamy slow zoom. Smooth and elegant.',
    duration: 15,
    motionType: 'slow-zoom',
    filterCss: ''
  },
  {
    id: 'speed-ram',
    name: 'Speed Ramp',
    description: 'Start slow, burst fast, end slow. Dynamic energy.',
    duration: 15,
    motionType: 'speed-ramp',
    filterCss: ''
  },
  {
    id: 'boomerang',
    name: 'Boomerang',
    description: 'Bouncing zoom in and out. Loop-ready for social.',
    duration: 10,
    motionType: 'bounce',
    filterCss: ''
  },
  {
    id: 'shake',
    name: 'Shake',
    description: 'Subtle 8mm film shake. Raw and gritty.',
    duration: 15,
    motionType: 'shake',
    filterCss: ''
  },

  // ─── COMBINED MOTION (2 effects in 1) ────────────────────────
  {
    id: 'slowmo-shake',
    name: 'Slow-mo + Shake',
    description: 'Slow zoom with film shake. Cinematic documentary.',
    duration: 15,
    motionType: 'slow-zoom-shake',
    filterCss: ''
  },
  {
    id: 'boomerang-shake',
    name: 'Boomerang + Shake',
    description: 'Bouncing zoom + shake. High energy party clip.',
    duration: 10,
    motionType: 'bounce-shake',
    filterCss: ''
  },
  {
    id: 'speedram-shake',
    name: 'Speed Ramp + Shake',
    description: 'Speed burst with shake impact. Action movie style.',
    duration: 15,
    motionType: 'speed-ramp-shake',
    filterCss: ''
  },
  {
    id: 'slowmo-boomerang',
    name: 'Slow-mo + Boomerang',
    description: 'Slow zoom that bounces back. Mesmerizing loop.',
    duration: 15,
    motionType: 'slow-zoom-bounce',
    filterCss: ''
  },

  // ─── COMBINED MOTION (3 effects in 1) ────────────────────────
  {
    id: 'slowmo-shake-boom',
    name: 'Slow-mo + Shake + Boom',
    description: 'Slow zoom + shake + bounce ending. Full cinematic.',
    duration: 15,
    motionType: 'slow-zoom-shake-bounce',
    filterCss: ''
  },
  {
    id: 'speedram-boom-shake',
    name: 'Speed Ramp + Boom + Shake',
    description: 'Burst + bounce + shake. Max energy reels.',
    duration: 15,
    motionType: 'speed-ramp-bounce-shake',
    filterCss: ''
  },

  // ─── PULSE / ZOOM COMBOS ─────────────────────────────────────
  {
    id: 'pulse',
    name: 'Pulse Zoom',
    description: 'Rhythmic zoom in/out. Beat-synced feel.',
    duration: 15,
    motionType: 'pulse',
    filterCss: ''
  },
  {
    id: 'pulse-shake',
    name: 'Pulse + Shake',
    description: 'Rhythmic zoom + shake. Concert/live energy.',
    duration: 15,
    motionType: 'pulse-shake',
    filterCss: ''
  },
  {
    id: 'zoom-in',
    name: 'Zoom In',
    description: 'Gradual zoom 1x to 1.4x. Portrait focus.',
    duration: 15,
    motionType: 'zoom-in',
    filterCss: ''
  },
  {
    id: 'sway',
    name: 'Sway',
    description: 'Gentle horizontal sway. Smooth and calm.',
    duration: 15,
    motionType: 'sway',
    filterCss: ''
  }
]

/**
 * Draw a single frame with motion effect applied.
 */
export function drawMotionFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  w: number,
  h: number,
  motionType: string,
  elapsed: number,
  duration: number,
  mirror: boolean,
  filterCss: string
): void {
  if (filterCss) ctx.filter = filterCss

  ctx.save()
  if (mirror) {
    ctx.translate(w, 0)
    ctx.scale(-1, 1)
  }

  const progress = Math.min(1, elapsed / duration)

  // Helper: apply zoom
  const applyZoom = (zoom: number, extraX = 0, extraY = 0) => {
    const sw = w / zoom
    const sh = h / zoom
    ctx.drawImage(video, (w - sw) / 2 + extraX, (h - sh) / 2 + extraY, sw, sh, 0, 0, w, h)
  }

  // Helper: apply shake
  const shakeXY = (intensity = 2.5, speed = 18) => ({
    x: Math.sin(elapsed * speed) * intensity,
    y: Math.cos(elapsed * speed * 0.8) * intensity * 0.8
  })

  // Helper: speed ramp — returns time multiplier (0.3 = slow, 3 = fast)
  const speedRampValue = () => {
    if (progress < 0.3) return 0.3 + progress  // slow start
    if (progress < 0.5) return 1 + (progress - 0.3) * 10  // burst
    if (progress < 0.7) return 3 - (progress - 0.5) * 10  // slow down
    return 1 - (progress - 0.7) * 0.5  // gentle end
  }

  switch (motionType) {
    // ─── SINGLE ─────────────────────────────────
    case 'none':
      ctx.drawImage(video, 0, 0, w, h)
      break
    case 'slow-zoom':
      applyZoom(1 + 0.25 * progress)
      break
    case 'zoom-in':
      applyZoom(1 + 0.4 * progress)
      break
    case 'bounce':
      applyZoom(1 + 0.2 * Math.abs(Math.sin(elapsed * Math.PI * 1.5)))
      break
    case 'shake': {
      const s = shakeXY(2.5, 18)
      ctx.drawImage(video, s.x, s.y, w, h)
      break
    }
    case 'pulse':
      applyZoom(1 + 0.12 * Math.sin(elapsed * Math.PI * 2 * 2))
      break
    case 'sway': {
      const swayX = Math.sin(elapsed * 0.8) * 15
      applyZoom(1.05, swayX, 0)
      break
    }
    case 'speed-ramp': {
      // Visual speed ramp via zoom intensity changes
      const ramp = speedRampValue()
      const zoom = 1 + 0.15 * Math.sin(elapsed * ramp * 3)
      applyZoom(zoom)
      break
    }

    // ─── COMBINED (2 motions) ───────────────────
    case 'slow-zoom-shake': {
      const s = shakeXY(1.5, 15)
      applyZoom(1 + 0.2 * progress, s.x, s.y)
      break
    }
    case 'bounce-shake': {
      const s = shakeXY(3, 22)
      const zoom = 1 + 0.2 * Math.abs(Math.sin(elapsed * Math.PI * 1.5))
      applyZoom(zoom, s.x, s.y)
      break
    }
    case 'speed-ramp-shake': {
      const ramp = speedRampValue()
      const s = shakeXY(2 + ramp, 15 + ramp * 5)
      const zoom = 1 + 0.1 * Math.sin(elapsed * ramp * 3)
      applyZoom(zoom, s.x, s.y)
      break
    }
    case 'slow-zoom-bounce': {
      // Slow zoom but bounces at the end (last 3 seconds)
      if (progress < 0.8) {
        applyZoom(1 + 0.25 * progress)
      } else {
        const bounceProgress = (progress - 0.8) / 0.2
        const bounce = 1 + 0.25 * 0.8 + 0.15 * Math.abs(Math.sin(bounceProgress * Math.PI * 2))
        applyZoom(bounce)
      }
      break
    }
    case 'pulse-shake': {
      const s = shakeXY(2, 20)
      const zoom = 1 + 0.12 * Math.sin(elapsed * Math.PI * 2 * 2)
      applyZoom(zoom, s.x, s.y)
      break
    }

    // ─── COMBINED (3 motions) ───────────────────
    case 'slow-zoom-shake-bounce': {
      // Phase 1 (0-60%): slow zoom + shake
      // Phase 2 (60-100%): bounce + shake
      if (progress < 0.6) {
        const s = shakeXY(1.5, 15)
        applyZoom(1 + 0.2 * (progress / 0.6), s.x, s.y)
      } else {
        const bp = (progress - 0.6) / 0.4
        const s = shakeXY(3, 20)
        const zoom = 1.2 + 0.15 * Math.abs(Math.sin(bp * Math.PI * 3))
        applyZoom(zoom, s.x, s.y)
      }
      break
    }
    case 'speed-ramp-bounce-shake': {
      // Phase 1 (0-30%): slow + shake
      // Phase 2 (30-50%): burst + shake (strong)
      // Phase 3 (50-100%): bounce + shake
      if (progress < 0.3) {
        const s = shakeXY(1.5, 12)
        applyZoom(1 + 0.1 * progress, s.x, s.y)
      } else if (progress < 0.5) {
        const bp = (progress - 0.3) / 0.2
        const s = shakeXY(5, 25)
        const zoom = 1.03 + 0.2 * bp
        applyZoom(zoom, s.x, s.y)
      } else {
        const bp = (progress - 0.5) / 0.5
        const s = shakeXY(3, 20)
        const zoom = 1.23 + 0.15 * Math.abs(Math.sin(bp * Math.PI * 4))
        applyZoom(zoom, s.x, s.y)
      }
      break
    }

    default:
      ctx.drawImage(video, 0, 0, w, h)
  }

  ctx.restore()
  ctx.filter = 'none'
}
