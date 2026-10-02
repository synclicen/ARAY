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

export async function applyMotionEffect(
  rawBlob: Blob,
  options: ProcessOptions
): Promise<Blob | null> {
  const { motionStyle, filter, mirror } = options

  if (motionStyle === 'normal') return null

  console.log('[Motion] Processing motion effect:', motionStyle)

  // Load raw video
  const video = document.createElement('video')
  video.src = URL.createObjectURL(rawBlob)
  video.muted = true
  video.playsInline = true

  // Wait for metadata — handle Infinity duration (common with MediaRecorder blobs)
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Video metadata load timeout (5s)'))
    }, 5000)

    video.onloadedmetadata = () => {
      clearTimeout(timeout)
      // If duration is Infinity, try to force it by seeking
      if (video.duration === Infinity || isNaN(video.duration)) {
        console.log('[Motion] Duration is Infinity, forcing seek...')
        video.currentTime = 1e101  // Force seek to end
        video.ontimeupdate = () => {
          video.ontimeupdate = null
          video.currentTime = 0
          console.log('[Motion] Fixed duration:', video.duration)
          resolve()
        }
      } else {
        resolve()
      }
    }
    video.onerror = () => {
      clearTimeout(timeout)
      reject(new Error('Failed to load raw video for processing'))
    }
  })

  let duration = video.duration
  if (isNaN(duration) || duration === Infinity || duration <= 0) {
    console.warn('[Motion] Could not determine video duration, aborting motion effect')
    URL.revokeObjectURL(video.src)
    return null  // Fall back to raw video
  }

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
        // Use requestAnimationFrame to ensure frame is decoded
        requestAnimationFrame(() => resolve())
      }
      video.addEventListener('seeked', onSeeked)
      video.currentTime = t
    })
  }

  const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
  const frameInterval = 1 / 30  // 30fps
  const frameDelay = 40  // ms delay between frames for captureStream

  recorder.start()

  try {
    if (motionStyle === 'boomerang') {
      // Forward pass
      console.log('[Motion] Boomerang: forward pass (0 to', duration, 's)')
      for (let t = 0; t < duration; t += frameInterval) {
        await seekTo(t)
        drawFrame()
        await wait(frameDelay)
      }
      // Reverse pass
      console.log('[Motion] Boomerang: reverse pass')
      for (let t = duration - frameInterval; t >= 0; t -= frameInterval) {
        await seekTo(t)
        drawFrame()
        await wait(frameDelay)
      }
    } else if (motionStyle === 'reverse') {
      console.log('[Motion] Reverse: playing backward')
      for (let t = duration - frameInterval; t >= 0; t -= frameInterval) {
        await seekTo(t)
        drawFrame()
        await wait(frameDelay)
      }
    } else if (motionStyle === 'fast-forward') {
      console.log('[Motion] Fast Forward: 2x speed')
      for (let t = 0; t < duration; t += 2 * frameInterval) {
        await seekTo(t)
        drawFrame()
        await wait(frameDelay)
      }
    } else if (motionStyle === 'zoom-pulse') {
      console.log('[Motion] Zoom Pulse')
      for (let t = 0; t < duration; t += frameInterval) {
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
  await wait(200) // flush last frame
  recorder.stop()
  URL.revokeObjectURL(video.src)

  const result = await done
  return result
}
