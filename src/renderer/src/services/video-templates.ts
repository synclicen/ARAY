/**
 * ARAY Video Templates — 360 booth style + trending effects
 * 
 * ALL effects applied DURING recording via canvas draw.
 * NO post-processing. Video saved immediately after recording stops.
 *
 * Each template combines: duration + filter + motion effect
 * Output is ready for social media (reels/shorts/tiktok).
 */

export interface VideoTemplate {
  id: string
  name: string
  description: string
  duration: number          // fixed duration in seconds
  filterCss: string         // canvas filter for color grade
  motionType: string        // motion effect type for drawFrame
}

export const VIDEO_TEMPLATES: VideoTemplate[] = [
  // ─── BASIC ──────────────────────────────────────────────────
  {
    id: 'classic-15',
    name: 'Classic',
    description: 'Clean recording, no effects. Natural look.',
    duration: 15,
    filterCss: '',
    motionType: 'none'
  },

  // ─── ZOOM & PULSE ───────────────────────────────────────────
  {
    id: 'party-pulse-15',
    name: 'Party Pulse',
    description: 'Zoom pulse + purple haze. Energetic party vibe.',
    duration: 15,
    filterCss: 'hue-rotate(270deg) saturate(1.4) contrast(1.15) brightness(1.05)',
    motionType: 'pulse'
  },
  {
    id: 'cinematic-zoom-15',
    name: 'Cinematic Zoom',
    description: 'Slow zoom in + cinematic color. Movie trailer feel.',
    duration: 15,
    filterCss: 'contrast(1.2) saturate(1.1) brightness(0.98)',
    motionType: 'zoom-in'
  },

  // ─── VINTAGE & FILM ─────────────────────────────────────────
  {
    id: 'vintage-shake-15',
    name: 'Vintage Shake',
    description: 'Retro film + subtle shake. Nostalgic 8mm feel.',
    duration: 15,
    filterCss: 'sepia(0.5) contrast(1.1) brightness(1.1) saturate(1.3)',
    motionType: 'shake'
  },
  {
    id: 'neon-glow-15',
    name: 'Neon Glow',
    description: 'Neon purple + gentle sway. Cyberpunk aesthetic.',
    duration: 15,
    filterCss: 'hue-rotate(270deg) saturate(1.6) contrast(1.25) brightness(1.15)',
    motionType: 'sway'
  },

  // ─── TRENDING: SLOW MOTION ──────────────────────────────────
  {
    id: 'slowmo-dream-15',
    name: 'Slow-mo Dream',
    description: 'Dreamy slow zoom + soft glow. Aesthetic reels vibe.',
    duration: 15,
    filterCss: 'brightness(1.15) saturate(1.2) contrast(0.95) blur(0.3px)',
    motionType: 'slow-zoom'
  },
  {
    id: 'slowmo-bw-15',
    name: 'Slow-mo Noir',
    description: 'Black & white slow zoom. Dramatic cinematic reels.',
    duration: 15,
    filterCss: 'grayscale(1) contrast(1.35) brightness(1.05)',
    motionType: 'slow-zoom'
  },

  // ─── TRENDING: BOOMERANG (real-time bounce) ────────────────
  {
    id: 'boomerang-bounce-10',
    name: 'Boomerang Bounce',
    description: 'Bouncing zoom + warm tone. Instagram boomerang style.',
    duration: 10,
    filterCss: 'saturate(1.3) contrast(1.1) brightness(1.08)',
    motionType: 'bounce'
  },
  {
    id: 'boomerang-neon-10',
    name: 'Boomerang Neon',
    description: 'Bouncing zoom + neon purple. TikTok trending.',
    duration: 10,
    filterCss: 'hue-rotate(280deg) saturate(1.7) contrast(1.3) brightness(1.1)',
    motionType: 'bounce'
  },

  // ─── TRENDING: SHAKE & GLITCH ───────────────────────────────
  {
    id: 'glitch-shake-10',
    name: 'Glitch Shake',
    description: 'Aggressive shake + high contrast. EDM/concert reels.',
    duration: 10,
    filterCss: 'contrast(1.4) saturate(1.5) hue-rotate(15deg)',
    motionType: 'glitch'
  },
  {
    id: 'rave-shake-10',
    name: 'Rave Shake',
    description: 'Fast shake + neon strobe. Festival/party reels.',
    duration: 10,
    filterCss: 'hue-rotate(300deg) saturate(1.8) contrast(1.35) brightness(1.2)',
    motionType: 'rave'
  },

  // ─── TRENDING: COMBINED EFFECTS ─────────────────────────────
  {
    id: 'aesthetic-sway-15',
    name: 'Aesthetic Sway',
    description: 'Slow sway + pastel warm. Cozy aesthetic reels.',
    duration: 15,
    filterCss: 'sepia(0.2) saturate(1.3) brightness(1.12) contrast(0.95)',
    motionType: 'sway'
  },
  {
    id: 'portrait-zoom-15',
    name: 'Portrait Zoom',
    description: 'Vertical zoom + soft skin tone. Beauty/influencer reels.',
    duration: 15,
    filterCss: 'saturate(1.1) brightness(1.08) contrast(1.02)',
    motionType: 'zoom-in'
  },
  {
    id: 'golden-hour-15',
    name: 'Golden Hour',
    description: 'Warm sunset + slow zoom. Travel/lifestyle reels.',
    duration: 15,
    filterCss: 'sepia(0.35) saturate(1.5) hue-rotate(-15deg) brightness(1.12)',
    motionType: 'slow-zoom'
  },
  {
    id: 'cool-vibe-15',
    name: 'Cool Vibe',
    description: 'Cool blue + sway. Chill/lofi aesthetic.',
    duration: 15,
    filterCss: 'hue-rotate(190deg) saturate(1.3) contrast(1.1) brightness(1.02)',
    motionType: 'sway'
  },

  // ─── TRENDING: PARTY & ENERGY ───────────────────────────────
  {
    id: 'energy-pulse-10',
    name: 'Energy Pulse',
    description: 'Fast zoom pulse + vivid color. High energy reels.',
    duration: 10,
    filterCss: 'saturate(1.6) contrast(1.25) brightness(1.1)',
    motionType: 'pulse-fast'
  },
  {
    id: 'disco-zoom-10',
    name: 'Disco Zoom',
    description: 'Zoom + hue shift strobe. Disco/party reels.',
    duration: 10,
    filterCss: 'saturate(1.5) contrast(1.2) brightness(1.1)',
    motionType: 'disco'
  }
]

/**
 * Draw a single frame with motion effect applied.
 * Called every requestAnimationFrame during recording.
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

  switch (motionType) {
    case 'pulse': {
      // Rhythmic zoom in/out (4 cycles over duration)
      const pulse = 1 + 0.12 * Math.sin(elapsed * Math.PI * 2 * 2)
      const sw = w / pulse
      const sh = h / pulse
      ctx.drawImage(video, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, w, h)
      break
    }
    case 'pulse-fast': {
      // Fast rhythmic zoom (8 cycles — more energetic)
      const pulse = 1 + 0.15 * Math.sin(elapsed * Math.PI * 2 * 4)
      const sw = w / pulse
      const sh = h / pulse
      ctx.drawImage(video, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, w, h)
      break
    }
    case 'zoom-in': {
      // Gradual zoom from 1.0x to 1.4x
      const zoom = 1 + 0.4 * progress
      const sw = w / zoom
      const sh = h / zoom
      ctx.drawImage(video, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, w, h)
      break
    }
    case 'slow-zoom': {
      // Very slow zoom from 1.0x to 1.25x (dreamy)
      const zoom = 1 + 0.25 * progress
      const sw = w / zoom
      const sh = h / zoom
      ctx.drawImage(video, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, w, h)
      break
    }
    case 'shake': {
      // Subtle 8mm film shake (2-3px)
      const shakeX = Math.sin(elapsed * 18) * 2.5
      const shakeY = Math.cos(elapsed * 15) * 2
      ctx.drawImage(video, shakeX, shakeY, w, h)
      break
    }
    case 'glitch': {
      // Aggressive shake + occasional offset (glitch effect)
      const shakeX = Math.sin(elapsed * 25) * 5
      const shakeY = Math.cos(elapsed * 20) * 3
      // Random horizontal slice offset
      const glitchOffset = Math.random() < 0.15 ? (Math.random() - 0.5) * 20 : 0
      ctx.drawImage(video, shakeX + glitchOffset, shakeY, w, h)
      break
    }
    case 'rave': {
      // Fast shake + strobe zoom
      const shakeX = Math.sin(elapsed * 30) * 4
      const shakeY = Math.cos(elapsed * 28) * 3
      const strobe = Math.sin(elapsed * 12) > 0 ? 1.08 : 1.0
      const sw = w / strobe
      const sh = h / strobe
      ctx.drawImage(video, (w - sw) / 2 + shakeX, (h - sh) / 2 + shakeY, sw, sh, 0, 0, w, h)
      break
    }
    case 'sway': {
      // Gentle horizontal sway (15px range) + slight zoom
      const swayX = Math.sin(elapsed * 0.8) * 15
      const zoom = 1.05
      const sw = w / zoom
      const sh = h / zoom
      ctx.drawImage(video, (w - sw) / 2 + swayX, (h - sh) / 2, sw, sh, 0, 0, w, h)
      break
    }
    case 'bounce': {
      // Boomerang-style bouncing zoom (zoom in then out rapidly)
      const bounce = 1 + 0.2 * Math.abs(Math.sin(elapsed * Math.PI * 1.5))
      const sw = w / bounce
      const sh = h / bounce
      ctx.drawImage(video, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, w, h)
      break
    }
    case 'disco': {
      // Zoom + hue rotation (simulated via canvas transform only)
      const zoom = 1 + 0.1 * Math.sin(elapsed * Math.PI * 3)
      const rotate = Math.sin(elapsed * 2) * 3 // slight rotation
      ctx.translate(w / 2, h / 2)
      ctx.rotate(rotate * Math.PI / 180)
      ctx.translate(-w / 2, -h / 2)
      const sw = w / zoom
      const sh = h / zoom
      ctx.drawImage(video, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, w, h)
      break
    }
    default: {
      ctx.drawImage(video, 0, 0, w, h)
    }
  }

  ctx.restore()
  ctx.filter = 'none'
}
