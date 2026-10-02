/**
 * ARAY Video Templates — 360 booth style
 * 
 * ALL effects applied DURING recording via canvas draw.
 * NO post-processing. NO seeking. NO Infinity duration issues.
 * Video is saved immediately after recording stops.
 *
 * Each template combines: duration + filter + motion effect
 * Output is ready for social media (reels/shorts).
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
  {
    id: 'classic-15',
    name: 'Classic 15s',
    description: 'Clean recording, no motion. Perfect for portraits.',
    duration: 15,
    filterCss: '',
    motionType: 'none'
  },
  {
    id: 'party-pulse-15',
    name: 'Party Pulse 15s',
    description: 'Zoom pulse + purple haze. Energetic party vibe.',
    duration: 15,
    filterCss: 'hue-rotate(270deg) saturate(1.4) contrast(1.15) brightness(1.05)',
    motionType: 'pulse'
  },
  {
    id: 'cinematic-zoom-15',
    name: 'Cinematic Zoom 15s',
    description: 'Slow zoom in + cinematic color. Movie trailer feel.',
    duration: 15,
    filterCss: 'contrast(1.2) saturate(1.1) brightness(0.98)',
    motionType: 'zoom-in'
  },
  {
    id: 'vintage-shake-15',
    name: 'Vintage Shake 15s',
    description: 'Retro film + subtle shake. Nostalgic 8mm feel.',
    duration: 15,
    filterCss: 'sepia(0.5) contrast(1.1) brightness(1.1) saturate(1.3)',
    motionType: 'shake'
  },
  {
    id: 'neon-glow-15',
    name: 'Neon Glow 15s',
    description: 'Neon purple + gentle sway. Cyberpunk aesthetic.',
    duration: 15,
    filterCss: 'hue-rotate(270deg) saturate(1.6) contrast(1.25) brightness(1.15)',
    motionType: 'sway'
  }
]

/**
 * Draw a single frame with motion effect applied.
 * Called every requestAnimationFrame during recording.
 * 
 * @param ctx - Canvas 2D context
 * @param video - Source video element
 * @param w - Canvas width
 * @param h - Canvas height
 * @param motionType - Motion effect type
 * @param elapsed - Seconds since recording started
 * @param duration - Total recording duration in seconds
 * @param mirror - Whether to mirror the video
 * @param filterCss - CSS filter string for color grade
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
  // Apply color filter
  if (filterCss) ctx.filter = filterCss

  ctx.save()
  if (mirror) {
    ctx.translate(w, 0)
    ctx.scale(-1, 1)
  }

  const progress = Math.min(1, elapsed / duration)

  switch (motionType) {
    case 'pulse': {
      // Zoom in/out rhythmically (4 pulses over the duration)
      const pulse = 1 + 0.12 * Math.sin(elapsed * Math.PI * 2 * 2)
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
    case 'shake': {
      // Subtle 8mm film shake (2-3px)
      const shakeX = Math.sin(elapsed * 18) * 2.5
      const shakeY = Math.cos(elapsed * 15) * 2
      ctx.drawImage(video, shakeX, shakeY, w, h)
      break
    }
    case 'sway': {
      // Gentle horizontal sway (20px range)
      const swayX = Math.sin(elapsed * 0.8) * 15
      // Slight zoom too for depth
      const zoom = 1.05
      const sw = w / zoom
      const sh = h / zoom
      ctx.drawImage(video, (w - sw) / 2 + swayX, (h - sh) / 2, sw, sh, 0, 0, w, h)
      break
    }
    default: {
      // No motion — just draw the frame
      ctx.drawImage(video, 0, 0, w, h)
    }
  }

  ctx.restore()
  ctx.filter = 'none'
}
