/**
 * ARAY Video Templates v2 — 20 templates, motion viral-inspired
 *
 * Distribusi:
 *   5 templates × 10 detik (short reels — TikTok/IG Reels style)
 *   5 templates × 15 detik (medium — standard boomerang)
 *   5 templates × 20 detik (longer storytelling)
 *   5 templates × 30 detik (full cinematic)
 *
 * Setiap template minimal 3 motion berbeda yang dikombinasikan.
 * Motion diadaptasi dari tren viral 2024-2025:
 *   - Dolly zoom (Vertigo effect)
 *   - Speed ramp (TikTok speed transitions)
 *   - Whip pan (Reels transitions)
 *   - Glitch shake (EDM/music video style)
 *   - Bounce zoom (Boomerang)
 *   - Orbit (360° rotation feel)
 *   - Pulse beat (music-synced)
 *   - Slow push (cinematic documentary)
 *   - Freeze frame (impact moments)
 *   - VHS retro (analog shake)
 */

export interface VideoTemplate {
  id: string
  name: string
  description: string
  duration: number
  motionType: string  // combined motion key
  filterCss: string   // always '' — filters come from Effect dropdown
}

export const VIDEO_TEMPLATES: VideoTemplate[] = [
  // ═══ 10 DETIK (5 templates) — Short Reels/TikTok style ═══
  {
    id: 'viral-bounce-10',
    name: 'Viral Bounce 10s',
    description: 'Bounce zoom + glitch shake + pulse beat. TikTok viral style.',
    duration: 10,
    motionType: 'bounce-glitch-pulse',
    filterCss: ''
  },
  {
    id: 'speed-ramp-10',
    name: 'Speed Ramp 10s',
    description: 'Slow start + burst fast + freeze end. Reels transition style.',
    duration: 10,
    motionType: 'speed-ramp-freeze',
    filterCss: ''
  },
  {
    id: 'whip-pan-10',
    name: 'Whip Pan 10s',
    description: 'Whip pan + bounce + shake. Music video transition feel.',
    duration: 10,
    motionType: 'whip-bounce-shake',
    filterCss: ''
  },
  {
    id: 'boomerang-glam-10',
    name: 'Boomerang Glam 10s',
    description: 'Smooth boomerang + slow zoom + pulse. IG Stories style.',
    duration: 10,
    motionType: 'boomerang-zoom-pulse',
    filterCss: ''
  },
  {
    id: 'party-energy-10',
    name: 'Party Energy 10s',
    description: 'Fast bounce + glitch + speed burst. EDM concert vibe.',
    duration: 10,
    motionType: 'party-glitch-speed',
    filterCss: ''
  },

  // ═══ 15 DETIK (5 templates) — Standard boomerang length ═══
  {
    id: 'dolly-zoom-15',
    name: 'Dolly Zoom 15s',
    description: 'Vertigo dolly zoom + shake + pulse. Cinematic thriller.',
    duration: 15,
    motionType: 'dolly-shake-pulse',
    filterCss: ''
  },
  {
    id: 'cinematic-slow-15',
    name: 'Cinematic Slow 15s',
    description: 'Slow push + sway + subtle shake. Documentary aesthetic.',
    duration: 15,
    motionType: 'slow-sway-shake',
    filterCss: ''
  },
  {
    id: 'orbit-15',
    name: 'Orbit 15s',
    description: '360° orbit feel + zoom + bounce. Music video 360 style.',
    duration: 15,
    motionType: 'orbit-zoom-bounce',
    filterCss: ''
  },
  {
    id: 'vhs-retro-15',
    name: 'VHS Retro 15s',
    description: 'VHS shake + glitch + bounce. 90s analog nostalgia.',
    duration: 15,
    motionType: 'vhs-glitch-bounce',
    filterCss: ''
  },
  {
    id: 'beat-sync-15',
    name: 'Beat Sync 15s',
    description: 'Pulse beat + speed ramp + bounce. Music-synced energy.',
    duration: 15,
    motionType: 'beat-speed-bounce',
    filterCss: ''
  },

  // ═══ 20 DETIK (5 templates) — Longer storytelling ═══
  {
    id: 'epic-zoom-20',
    name: 'Epic Zoom 20s',
    description: 'Slow dolly + pulse + freeze end. Movie trailer style.',
    duration: 20,
    motionType: 'epic-dolly-pulse-freeze',
    filterCss: ''
  },
  {
    id: 'travel-vlog-20',
    name: 'Travel Vlog 20s',
    description: 'Sway + slow zoom + bounce. Travel vlog aesthetic.',
    duration: 20,
    motionType: 'travel-sway-zoom-bounce',
    filterCss: ''
  },
  {
    id: 'concert-mosh-20',
    name: 'Concert Mosh 20s',
    description: 'Heavy shake + glitch + speed burst. Live concert mosh pit.',
    duration: 20,
    motionType: 'concert-shake-glitch-speed',
    filterCss: ''
  },
  {
    id: 'dreamy-loop-20',
    name: 'Dreamy Loop 20s',
    description: 'Slow zoom + pulse + boomerang end. Dreamy aesthetic loop.',
    duration: 20,
    motionType: 'dreamy-zoom-pulse-boom',
    filterCss: ''
  },
  {
    id: 'action-burst-20',
    name: 'Action Burst 20s',
    description: 'Speed ramp + shake + freeze. Action movie sequence.',
    duration: 20,
    motionType: 'action-speed-shake-freeze',
    filterCss: ''
  },

  // ═══ 30 DETIK (5 templates) — Full cinematic ═══
  {
    id: 'cinematic-30',
    name: 'Cinematic 30s',
    description: 'Slow dolly + sway + pulse + freeze. Full movie trailer.',
    duration: 30,
    motionType: 'cinematic-dolly-sway-pulse-freeze',
    filterCss: ''
  },
  {
    id: 'viral-story-30',
    name: 'Viral Story 30s',
    description: 'Speed ramp + bounce + glitch + shake. TikTok story style.',
    duration: 30,
    motionType: 'viral-speed-bounce-glitch-shake',
    filterCss: ''
  },
  {
    id: 'wedding-romance-30',
    name: 'Wedding Romance 30s',
    description: 'Slow zoom + sway + pulse + boomerang. Romantic wedding.',
    duration: 30,
    motionType: 'wedding-zoom-sway-pulse-boom',
    filterCss: ''
  },
  {
    id: 'party-anthem-30',
    name: 'Party Anthem 30s',
    description: 'Bounce + beat + glitch + speed. Club party anthem.',
    duration: 30,
    motionType: 'party-bounce-beat-glitch-speed',
    filterCss: ''
  },
  {
    id: 'retro-vhs-30',
    name: 'Retro VHS 30s',
    description: 'VHS shake + glitch + bounce + sway. 90s full nostalgia.',
    duration: 30,
    motionType: 'retro-vhs-glitch-bounce-sway',
    filterCss: ''
  }
]

/**
 * Draw a single frame with motion effect applied.
 * v2: Support 20 new motion types (combined 3-4 motions each).
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

  // Cover-fit: crop video source to match canvas aspect ratio
  const vw = video.videoWidth
  const vh = video.videoHeight
  const canvasRatio = w / h
  const videoRatio = vw / vh
  let srcX = 0, srcY = 0, srcW = vw, srcH = vh
  if (videoRatio > canvasRatio) {
    srcW = vh * canvasRatio
    srcX = (vw - srcW) / 2
  } else {
    srcH = vw / canvasRatio
    srcY = (vh - srcH) / 2
  }

  // Helper: draw video with cover-fit crop + optional zoom/offset
  const drawCover = (zoom = 1, offsetX = 0, offsetY = 0) => {
    const zsw = srcW / zoom
    const zsh = srcH / zoom
    const zsx = srcX + (srcW - zsw) / 2 + offsetX
    const zsy = srcY + (srcH - zsh) / 2 + offsetY
    ctx.drawImage(video, zsx, zsy, zsw, zsh, 0, 0, w, h)
  }

  const applyZoom = (zoom: number, extraX = 0, extraY = 0) => drawCover(zoom, extraX, extraY)

  // Shake helper — returns {x, y} offset
  const shakeXY = (intensity = 2.5, speed = 18) => ({
    x: Math.sin(elapsed * speed) * intensity,
    y: Math.cos(elapsed * speed * 0.8) * intensity * 0.8
  })

  // Glitch shake — random jitter + occasional big jump
  const glitchShake = (intensity = 3) => {
    const base = shakeXY(intensity, 25)
    // Occasional big glitch every ~0.7s
    const glitchPhase = Math.sin(elapsed * 9) > 0.85
    if (glitchPhase) {
      return { x: base.x + (Math.random() - 0.5) * intensity * 4, y: base.y + (Math.random() - 0.5) * intensity * 4 }
    }
    return base
  }

  // Speed ramp — returns time multiplier (0.3 = slow, 3 = fast)
  const speedRampValue = () => {
    if (progress < 0.3) return 0.3 + progress
    if (progress < 0.5) return 1 + (progress - 0.3) * 10
    if (progress < 0.7) return 3 - (progress - 0.5) * 10
    return 1 - (progress - 0.7) * 0.5
  }

  // Whip pan — horizontal slide that snaps back
  const whipPanValue = () => {
    // Whip at 30%, 60%, 90% of duration
    const whipPoints = [0.3, 0.6, 0.9]
    for (const wp of whipPoints) {
      if (progress >= wp && progress < wp + 0.05) {
        const lp = (progress - wp) / 0.05
        return Math.sin(lp * Math.PI) * 30  // swing out and back
      }
    }
    return 0
  }

  // Orbit — circular motion
  const orbitValue = (radius = 10) => ({
    x: Math.cos(elapsed * 1.5) * radius,
    y: Math.sin(elapsed * 1.5) * radius * 0.5
  })

  // Freeze frame — hold position at certain points
  const isFreezePoint = () => {
    // Freeze at 70-75% and 95-100%
    return (progress > 0.7 && progress < 0.75) || (progress > 0.95)
  }

  // ─── MOTION SWITCH ──────────────────────────────────────────
  switch (motionType) {
    // ═══ 10s TEMPLATES ═══
    case 'bounce-glitch-pulse': {
      const pulse = 1 + 0.1 * Math.sin(elapsed * Math.PI * 4)
      const bounce = 1 + 0.15 * Math.abs(Math.sin(elapsed * Math.PI * 2))
      const g = glitchShake(2)
      applyZoom(pulse * bounce, g.x, g.y)
      break
    }
    case 'speed-ramp-freeze': {
      if (isFreezePoint()) {
        applyZoom(1.3)  // hold at zoomed position
      } else {
        const ramp = speedRampValue()
        applyZoom(1 + 0.15 * Math.sin(elapsed * ramp * 3))
      }
      break
    }
    case 'whip-bounce-shake': {
      const whip = whipPanValue()
      const bounce = 1 + 0.15 * Math.abs(Math.sin(elapsed * Math.PI * 2))
      const s = shakeXY(2, 20)
      applyZoom(bounce, whip + s.x, s.y)
      break
    }
    case 'boomerang-zoom-pulse': {
      const pulse = 1 + 0.08 * Math.sin(elapsed * Math.PI * 3)
      const zoom = 1 + 0.15 * progress + 0.1 * Math.abs(Math.sin(elapsed * Math.PI * 1.5))
      applyZoom(pulse * zoom)
      break
    }
    case 'party-glitch-speed': {
      const ramp = speedRampValue()
      const g = glitchShake(3)
      const zoom = 1 + 0.2 * Math.abs(Math.sin(elapsed * Math.PI * 3 * ramp))
      applyZoom(zoom, g.x, g.y)
      break
    }

    // ═══ 15s TEMPLATES ═══
    case 'dolly-shake-pulse': {
      // Dolly zoom: zoom in while scaling background (simulated with zoom + shake)
      const dolly = 1 + 0.3 * progress
      const pulse = 1 + 0.05 * Math.sin(elapsed * Math.PI * 3)
      const s = shakeXY(1.5, 12)
      applyZoom(dolly * pulse, s.x, s.y)
      break
    }
    case 'slow-sway-shake': {
      const sway = Math.sin(elapsed * 0.6) * 12
      const s = shakeXY(1, 8)
      applyZoom(1 + 0.1 * progress, sway + s.x, s.y)
      break
    }
    case 'orbit-zoom-bounce': {
      const o = orbitValue(15)
      const zoom = 1 + 0.1 * progress + 0.1 * Math.abs(Math.sin(elapsed * Math.PI * 1.5))
      applyZoom(zoom, o.x, o.y)
      break
    }
    case 'vhs-glitch-bounce': {
      const g = glitchShake(2.5)
      const bounce = 1 + 0.15 * Math.abs(Math.sin(elapsed * Math.PI * 1.5))
      // VHS wobble
      const wobble = Math.sin(elapsed * 3) * 3
      applyZoom(bounce, g.x + wobble, g.y)
      break
    }
    case 'beat-speed-bounce': {
      const beat = 1 + 0.08 * Math.sin(elapsed * Math.PI * 4)  // 2 beats/sec
      const ramp = speedRampValue()
      const bounce = 1 + 0.1 * Math.abs(Math.sin(elapsed * Math.PI * 2 * ramp))
      applyZoom(beat * bounce)
      break
    }

    // ═══ 20s TEMPLATES ═══
    case 'epic-dolly-pulse-freeze': {
      if (isFreezePoint()) {
        applyZoom(1.4)  // hold
      } else {
        const dolly = 1 + 0.35 * progress
        const pulse = 1 + 0.05 * Math.sin(elapsed * Math.PI * 2)
        applyZoom(dolly * pulse)
      }
      break
    }
    case 'travel-sway-zoom-bounce': {
      const sway = Math.sin(elapsed * 0.5) * 10
      const zoom = 1 + 0.12 * progress
      const bounce = 1 + 0.08 * Math.abs(Math.sin(elapsed * Math.PI * 1.2))
      applyZoom(zoom * bounce, sway, 0)
      break
    }
    case 'concert-shake-glitch-speed': {
      const ramp = speedRampValue()
      const g = glitchShake(4)
      const s = shakeXY(3 + ramp, 20 + ramp * 5)
      const zoom = 1 + 0.1 * Math.sin(elapsed * ramp * 4)
      applyZoom(zoom, g.x + s.x, g.y + s.y)
      break
    }
    case 'dreamy-zoom-pulse-boom': {
      if (progress < 0.85) {
        const zoom = 1 + 0.15 * progress
        const pulse = 1 + 0.06 * Math.sin(elapsed * Math.PI * 2)
        applyZoom(zoom * pulse)
      } else {
        // Boomerang end
        const bp = (progress - 0.85) / 0.15
        const bounce = 1.15 + 0.15 * Math.abs(Math.sin(bp * Math.PI * 3))
        applyZoom(bounce)
      }
      break
    }
    case 'action-speed-shake-freeze': {
      if (isFreezePoint()) {
        applyZoom(1.3)
      } else {
        const ramp = speedRampValue()
        const s = shakeXY(2 + ramp, 18 + ramp * 4)
        applyZoom(1 + 0.12 * Math.sin(elapsed * ramp * 3), s.x, s.y)
      }
      break
    }

    // ═══ 30s TEMPLATES ═══
    case 'cinematic-dolly-sway-pulse-freeze': {
      if (isFreezePoint()) {
        applyZoom(1.4)
      } else {
        const dolly = 1 + 0.3 * progress
        const sway = Math.sin(elapsed * 0.4) * 8
        const pulse = 1 + 0.04 * Math.sin(elapsed * Math.PI * 1.5)
        applyZoom(dolly * pulse, sway, 0)
      }
      break
    }
    case 'viral-speed-bounce-glitch-shake': {
      const ramp = speedRampValue()
      const bounce = 1 + 0.12 * Math.abs(Math.sin(elapsed * Math.PI * 2 * ramp))
      const g = glitchShake(2.5)
      const s = shakeXY(2, 16)
      applyZoom(bounce, g.x + s.x, g.y + s.y)
      break
    }
    case 'wedding-zoom-sway-pulse-boom': {
      if (progress < 0.9) {
        const zoom = 1 + 0.15 * progress
        const sway = Math.sin(elapsed * 0.5) * 8
        const pulse = 1 + 0.05 * Math.sin(elapsed * Math.PI * 1.5)
        applyZoom(zoom * pulse, sway, 0)
      } else {
        const bp = (progress - 0.9) / 0.1
        const bounce = 1.15 + 0.1 * Math.abs(Math.sin(bp * Math.PI * 2))
        applyZoom(bounce)
      }
      break
    }
    case 'party-bounce-beat-glitch-speed': {
      const ramp = speedRampValue()
      const beat = 1 + 0.08 * Math.sin(elapsed * Math.PI * 4)
      const bounce = 1 + 0.1 * Math.abs(Math.sin(elapsed * Math.PI * 2.5))
      const g = glitchShake(2)
      applyZoom(beat * bounce, g.x, g.y)
      break
    }
    case 'retro-vhs-glitch-bounce-sway': {
      const g = glitchShake(3)
      const bounce = 1 + 0.12 * Math.abs(Math.sin(elapsed * Math.PI * 1.3))
      const sway = Math.sin(elapsed * 0.7) * 8
      const wobble = Math.sin(elapsed * 4) * 4  // VHS tracking wobble
      applyZoom(bounce, g.x + sway + wobble, g.y)
      break
    }

    // ═══ LEGACY MOTIONS (backward compat) ═══
    case 'none':
      drawCover()
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
      drawCover(1, s.x, s.y)
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
      const ramp = speedRampValue()
      const zoom = 1 + 0.15 * Math.sin(elapsed * ramp * 3)
      applyZoom(zoom)
      break
    }
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
    case 'slow-zoom-shake-bounce': {
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
      drawCover()
  }

  ctx.restore()
  ctx.filter = 'none'
}
