/**
 * ARAY Motion Effects — post-processing for video motion styles
 *
 * Records raw video first, then replays through canvas with motion effect.
 * This ensures the effect is actually baked into the saved video.
 */

interface ProcessOptions {
  motionStyle: string  // normal | boomerang | reverse | fast-forward | zoom-pulse
  filter: string       // canvas filter CSS (from camera filter)
  mirror: boolean
}

/**
 * Apply motion effect to a raw video blob.
 * Returns new blob with effect applied, or null if style is 'normal' (no processing needed).
 */
export async function applyMotionEffect(
  rawBlob: Blob,
  options: ProcessOptions
): Promise<Blob | null> {
  const { motionStyle, filter, mirror } = options

  // Normal = no processing, use raw video as-is
  if (motionStyle === 'normal') return null

  console.log('[Motion] Processing motion effect:', motionStyle)

  // Load raw video
  const video = document.createElement('video')
  video.src = URL.createObjectURL(rawBlob)
  video.muted = true
  video.playsInline = true

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve()
    video.onerror = () => reject(new Error('Failed to load raw video for processing'))
  })

  const duration = video.duration
  const w = video.videoWidth || 1280
  const h = video.videoHeight || 720
  console.log('[Motion] Raw video:', w, 'x', h, 'duration:', duration)

  // Create processing canvas
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas context failed')

  // Capture stream from canvas
  const stream = canvas.captureStream(30)

  let mimeType = 'video/webm;codecs=vp9'
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/webm;codecs=vp8'
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm'
  }

  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5000000 })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }

  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' })
      console.log('[Motion] Processed video:', blob.size, 'bytes')
      resolve(blob)
    }
  })

  // Draw function with filter + mirror + optional zoom
  const drawFrame = (scale = 1) => {
    if (filter && filter !== 'none') ctx.filter = filter
    ctx.save()
    if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1) }
    if (scale !== 1) {
      const sw = w / scale
      const sh = h / scale
      const sx = (w - sw) / 2
      const sy = (h - sh) / 2
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h)
    } else {
      ctx.drawImage(video, 0, 0, w, h)
    }
    ctx.restore()
    ctx.filter = 'none'
  }

  // Seek to specific time and wait for frame
  const seekTo = (time: number): Promise<void> => {
    return new Promise((resolve) => {
      const t = Math.max(0, Math.min(duration - 0.01, time))
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked)
        // Small delay to ensure frame is decoded
        requestAnimationFrame(() => resolve())
      }
      video.addEventListener('seeked', onSeeked)
      video.currentTime = t
    })
  }

  // Real-time frame delay (so captureStream picks up frames)
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
  const frameDelay = 1000 / 30 // 33ms per frame at 30fps

  recorder.start()

  try {
    if (motionStyle === 'boomerang') {
      // Forward pass
      console.log('[Motion] Boomerang: forward pass')
      for (let t = 0; t < duration; t += 1 / 30) {
        await seekTo(t)
        drawFrame()
        await wait(frameDelay)
      }
      // Reverse pass
      console.log('[Motion] Boomerang: reverse pass')
      for (let t = duration - 1 / 30; t >= 0; t -= 1 / 30) {
        await seekTo(t)
        drawFrame()
        await wait(frameDelay)
      }
    } else if (motionStyle === 'reverse') {
      console.log('[Motion] Reverse: playing backward')
      for (let t = duration - 1 / 30; t >= 0; t -= 1 / 30) {
        await seekTo(t)
        drawFrame()
        await wait(frameDelay)
      }
    } else if (motionStyle === 'fast-forward') {
      console.log('[Motion] Fast Forward: 2x speed')
      for (let t = 0; t < duration; t += 2 / 30) {
        await seekTo(t)
        drawFrame()
        await wait(frameDelay)
      }
    } else if (motionStyle === 'zoom-pulse') {
      console.log('[Motion] Zoom Pulse: zoom in/out')
      for (let t = 0; t < duration; t += 1 / 30) {
        await seekTo(t)
        const progress = t / duration
        const scale = 1 + 0.3 * Math.sin(progress * Math.PI * 2)
        drawFrame(scale)
        await wait(frameDelay)
      }
    }
  } catch (e) {
    console.error('[Motion] Processing error:', e)
  }

  // Stop recording
  await wait(100) // flush last frame
  recorder.stop()
  URL.revokeObjectURL(video.src)

  const result = await done
  return result
}
