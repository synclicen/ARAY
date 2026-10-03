import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Camera,
  RefreshCw,
  Check,
  X,
  ChevronLeft,
  Printer,
  Share2,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  Video,
  Image as ImageIcon,
  LayoutTemplate,
  Maximize2
} from 'lucide-react'
import { ArayButton, ArayBadge, ArayLogo } from '../components/ui'
import { useEventStore } from '../stores/events'
import { useMediaStore } from '../stores/media'
import { useSettingsStore } from '../stores/settings'
import { TEMPLATES, compositeTemplate, getCustomTemplates, compositeCustomTemplate } from '../services/templates'
import { VIDEO_TEMPLATES, drawMotionFrame, type VideoTemplate } from '../services/video-templates'
import { PalmTrigger } from '../services/palm-trigger'

// Aspect ratio dimensions helper
const aspectDims: Record<string, { w: number; h: number }> = {
  '16:9': { w: 1280, h: 720 },
  '9:16': { w: 720, h: 1280 },
  '1:1': { w: 1080, h: 1080 },
  '4:3': { w: 1024, h: 768 }
}


import type { ArayMedia } from '@shared/types'

type BoothPhase = 'greeting' | 'preview' | 'countdown' | 'flash' | 'review' | 'result' | 'error'
type BoothMode = 'photo' | 'video'

// ─── CINEMATIC FILTERS (5 styles) ───────────────────────────────
interface CameraFilter {
  id: string
  name: string
  css: string
  canvasFilter: string
}

const FILTERS: CameraFilter[] = [
  { id: 'original', name: 'Original', css: 'none', canvasFilter: 'none' },
  { id: 'purple-haze', name: 'Purple Haze', css: 'hue-rotate(270deg) saturate(1.4) contrast(1.15) brightness(1.05)', canvasFilter: 'hue-rotate(270deg) saturate(1.4) contrast(1.15) brightness(1.05)' },
  { id: 'vintage', name: 'Vintage', css: 'sepia(0.5) contrast(1.1) brightness(1.1) saturate(1.3)', canvasFilter: 'sepia(0.5) contrast(1.1) brightness(1.1) saturate(1.3)' },
  { id: 'noir', name: 'Noir B&W', css: 'grayscale(1) contrast(1.4) brightness(1.05)', canvasFilter: 'grayscale(1) contrast(1.4) brightness(1.05)' },
  { id: 'cool-blue', name: 'Cool Blue', css: 'hue-rotate(180deg) saturate(1.2) contrast(1.1) brightness(0.95)', canvasFilter: 'hue-rotate(180deg) saturate(1.2) contrast(1.1) brightness(0.95)' },
  { id: 'warm-sunset', name: 'Warm Sunset', css: 'sepia(0.3) saturate(1.6) hue-rotate(-10deg) brightness(1.1)', canvasFilter: 'sepia(0.3) saturate(1.6) hue-rotate(-10deg) brightness(1.1)' },
  { id: 'cinematic', name: 'Cinematic', css: 'contrast(1.15) saturate(1.1)', canvasFilter: 'contrast(1.15) saturate(1.1)' },
  { id: 'vintage-film', name: 'Vintage Film', css: 'sepia(0.4) contrast(1.1) saturate(1.3) brightness(1.05)', canvasFilter: 'sepia(0.4) contrast(1.1) saturate(1.3) brightness(1.05)' },
  { id: 'neon-pulse', name: 'Neon Pulse', css: 'hue-rotate(270deg) saturate(1.5) contrast(1.2) brightness(1.1)', canvasFilter: 'hue-rotate(270deg) saturate(1.5) contrast(1.2) brightness(1.1)' }
]

// Video templates defined in services/video-templates.ts

interface CapturedShot {
  shotNumber: number
  mediaId: string
  dataUrl: string
}

export function BoothPage() {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const { events, loadEvents, activeEventId, setActiveEvent } = useEventStore()
  const { addMedia } = useMediaStore()
  const { settings } = useSettingsStore()

  const [phase, setPhase] = useState<BoothPhase>('greeting')
  const [countdown, setCountdown] = useState<number>(0)
  const [capturedShots, setCapturedShots] = useState<CapturedShot[]>([])
  const [currentShot, setCurrentShot] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [lastFlash, setLastFlash] = useState(false)
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  const [mirror, setMirror] = useState(true)
  const [mode, setMode] = useState<BoothMode>('photo')
  const [activeFilterId, setActiveFilterId] = useState('original')
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1' | '4:3'>('9:16')
  const [selectedVideoTemplate, setSelectedVideoTemplate] = useState('plain')
  const [videoDuration, setVideoDuration] = useState(15)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [compositeUrl, setCompositeUrl] = useState<string | null>(null)
  const [compositing, setCompositing] = useState(false)
  const [compositeMediaId, setCompositeMediaId] = useState<string | null>(null)
  const [palmProgress, setPalmProgress] = useState(0)  // 0.0-1.0 palm hold progress
  const [palmTriggerActive, setPalmTriggerActive] = useState(false)
  const [palmState, setPalmState] = useState<'none' | 'searching' | 'hand_detected' | 'confirmed' | 'triggered'>('none')
  const [palmStatus, setPalmStatus] = useState<'unloaded' | 'loading_scripts' | 'loading_model' | 'model_ready' | 'detecting' | 'stopped' | 'error'>('unloaded')
  const [palmError, setPalmError] = useState<string | null>(null)
  const [palmDebug, setPalmDebug] = useState<{
    handDetected: boolean
    landmarkCount: number
    openPalm: boolean
    fingerStatus: { finger: string; extended: boolean }[]
  } | null>(null)
  const palmTriggerRef = useRef<PalmTrigger | null>(null)
  // v4.1.3: Fullscreen booth mode — hide all UI except camera + palm overlay.
  // Toggle button di pojok kanan atas. Exit butuh password (configurable di Settings).
  const [fullscreenBooth, setFullscreenBooth] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const activeEvent = events.find((e) => e.id === activeEventId) ?? events[0]
  const totalShots = settings?.booth_shot_count ?? 4
  const countdownSeconds = settings?.booth_countdown_seconds ?? 3
  const activeFilter = FILTERS.find(f => f.id === activeFilterId) || FILTERS[0]
  const activeVideoTemplate = VIDEO_TEMPLATES.find(t => t.id === selectedVideoTemplate) || VIDEO_TEMPLATES[0]

  // Refs to avoid stale closures in async recording callbacks
      const activeFilterRef = useRef(activeFilter)
  const mirrorRef = useRef(mirror)
      activeFilterRef.current = activeFilter
  mirrorRef.current = mirror

  // Palm trigger needs latest runCountdown (changes when currentShot/totalShots/mode change)
  // — without this ref, the trigger callback captures a stale runCountdown at the
  // moment the palm-trigger effect first runs (e.g., on entering preview for shot 1),
  // and never sees shot 2's countdown logic.
  // Declaration here; assignment lives further down (after runCountdown is defined).
  const runCountdownRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (events.length === 0) loadEvents()
    // Load booth settings from Settings page
    if (settings) {
      if (settings.camera_effect) setActiveFilterId(settings.camera_effect)
      if (settings.aspect_ratio) setAspectRatio(settings.aspect_ratio as any)
      if (settings.video_template) setSelectedVideoTemplate(settings.video_template)
    }
  }, [events.length, loadEvents, settings])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  const startCamera = useCallback(async () => {
    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      return true
    } catch (e: any) {
      console.error('[Booth] Camera error:', e)
      setError(e?.message ?? 'Camera failed to start')
      setPhase('error')
      return false
    }
  }, [])

  const captureFrame = useCallback((): { full: string; thumb: string } | null => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return null
    if (video.videoWidth === 0 || video.videoHeight === 0) return null

    const dims = aspectDims[aspectRatio] || aspectDims['9:16']
    const w = dims.w
    const h = dims.h
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // Apply cinematic filter to canvas
    if (activeFilter.canvasFilter !== 'none') {
      ctx.filter = activeFilter.canvasFilter
    }
    // Mirror
    if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1) }

    // Cover-fit: crop video to match canvas aspect ratio (no stretching)
    const vw = video.videoWidth
    const vh = video.videoHeight
    const canvasRatio = w / h
    const videoRatio = vw / vh
    let sx = 0, sy = 0, sw = vw, sh = vh
    if (videoRatio > canvasRatio) {
      // Video wider than canvas — crop sides
      sw = vh * canvasRatio
      sx = (vw - sw) / 2
    } else {
      // Video taller than canvas — crop top/bottom
      sh = vw / canvasRatio
      sy = (vh - sh) / 2
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.filter = 'none'

    const full = canvas.toDataURL('image/jpeg', 0.92)

    // Thumbnail — same aspect ratio, smaller
    const tc = document.createElement('canvas')
    const thumbW = 320
    const thumbH = Math.round(320 * h / w)
    tc.width = thumbW; tc.height = thumbH
    const tctx = tc.getContext('2d')
    if (!tctx) return { full, thumb: full }
    if (activeFilter.canvasFilter !== 'none') tctx.filter = activeFilter.canvasFilter
    if (mirror) { tctx.translate(thumbW, 0); tctx.scale(-1, 1) }
    tctx.drawImage(video, sx, sy, sw, sh, 0, 0, thumbW, thumbH)
    tctx.setTransform(1, 0, 0, 1, 0, 0)
    const thumb = tc.toDataURL('image/jpeg', 0.8)
    return { full, thumb }
  }, [mirror, activeFilter, aspectRatio])

  const performCapture = useCallback(async () => {
    if (!activeEvent) {
      setError('No active event selected. Create one in Events first.')
      setPhase('error')
      return
    }

    const frames = captureFrame()
    if (!frames) {
      setError('Failed to capture frame. Camera may not be ready.')
      setPhase('error')
      return
    }

    // Flash effect
    setLastFlash(true)
    setTimeout(() => setLastFlash(false), 220)

    try {
      // Create session lazily on first shot (needed for composite save later)
      let sessionId = (window as any).__aray_current_session_id as string | undefined
      if (!sessionId) {
        const sessionResult = await window.aray.sessions.create(activeEvent.id, 'photo', totalShots)
        if (!sessionResult.success) throw new Error('Failed to create session')
        sessionId = (sessionResult.data as any).id
        ;(window as any).__aray_current_session_id = sessionId
      }

      // v4.0.4: Don't save raw shots to disk/media table.
      // Only keep them in-memory for composite generation.
      // This saves storage (1 file per session instead of N+1) and
      // de-clutters the Gallery (only composites show up).
      // If composite fails, user can retake — raw shots are ephemeral.
      setCapturedShots((prev) => [
        ...prev,
        { shotNumber: currentShot, mediaId: `temp_${currentShot}`, dataUrl: frames.full }
      ])
      console.log('[Booth] Shot', currentShot, 'captured (in-memory only, not saved to disk)')
    } catch (e: any) {
      setError(e.message)
      setPhase('error')
    }
  }, [activeEvent, captureFrame, currentShot, totalShots])

  // ─── VIDEO RECORDING (canvas-based for filter support) ────────
  const canvasRecordRef = useRef<HTMLCanvasElement | null>(null)
  const rafRecordRef = useRef<number | null>(null)
  const recordTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (rafRecordRef.current) {
      cancelAnimationFrame(rafRecordRef.current)
      rafRecordRef.current = null
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
    if (recordTimeoutRef.current) {
      clearTimeout(recordTimeoutRef.current)
      recordTimeoutRef.current = null
    }
    setIsRecording(false)
  }, [])

  const startRecording = useCallback(() => {
    const video = videoRef.current
    if (!video || !streamRef.current) return

    // Get selected video template
    const template = VIDEO_TEMPLATES.find(t => t.id === selectedVideoTemplate) || VIDEO_TEMPLATES[0]
    const duration = template.duration
    const filter = activeFilterRef.current
    const mir = mirrorRef.current

    // Combine camera filter + template filter
    const camFilter = filter.canvasFilter !== 'none' ? filter.canvasFilter : ''
    const templateFilter = template.filterCss || ''
    const combinedFilter = (camFilter + ' ' + templateFilter).trim()

    console.log('[Booth] startRecording — template:', template.id, 'duration:', duration, 'motion:', template.motionType, 'filter:', filter.id)

    try {
      const canvas = document.createElement('canvas')
      const dims = aspectDims[aspectRatio] || aspectDims['9:16']
      const w = dims.w
      const h = dims.h
      canvas.width = w
      canvas.height = h
      canvasRecordRef.current = canvas
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas context failed')

      const startTime = Date.now()

      // Draw loop with motion effect — ALL effects applied HERE, in real-time
      const drawFrame = () => {
        if (video.videoWidth > 0) {
          const elapsed = (Date.now() - startTime) / 1000
          drawMotionFrame(ctx, video, w, h, template.motionType, elapsed, duration, mir, combinedFilter)
        }
        rafRecordRef.current = requestAnimationFrame(drawFrame)
      }
      drawFrame()

      // Capture stream from canvas — 30fps, reliable
      const canvasStream = canvas.captureStream(30)

      let mimeType = 'video/webm;codecs=vp9'
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8'
        if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm'
      }

      const recorder = new MediaRecorder(canvasStream, { mimeType, videoBitsPerSecond: 5000000 })
      recordedChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        if (rafRecordRef.current) {
          cancelAnimationFrame(rafRecordRef.current)
          rafRecordRef.current = null
        }

        const rawBlob = new Blob(recordedChunksRef.current, { type: 'video/webm' })
        console.log('[Booth] Video recorded:', rawBlob.size, 'bytes, template:', template.id)

        if (rawBlob.size === 0) {
          console.error('[Booth] Video blob is EMPTY')
          setError('Video recording failed — no data captured')
          setPhase('error')
          return
        }

        // Convert to base64 and save — NO post-processing needed
        console.log('[Booth] Converting to base64...')
        try {
          const arrayBuffer = await rawBlob.arrayBuffer()
          const bytes = new Uint8Array(arrayBuffer)
          let binary = ''
          const chunkSize = 0x8000
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)) as any)
          }
          const base64 = btoa(binary)
          console.log('[Booth] Base64 length:', base64.length)

          if (activeEvent) {
            let sessionId = (window as any).__aray_current_session_id
            if (!sessionId) {
              const sr = await window.aray.sessions.create(activeEvent.id, 'video', 1)
              if (sr.success) {
                sessionId = (sr.data as any).id
                ;(window as any).__aray_current_session_id = sessionId
              }
            }
            console.log('[Booth] Saving video...')
            const saveResult = await window.aray.media.saveVideo({
              event_id: activeEvent.id,
              session_id: sessionId,
              video_base64: base64,
              mime_type: 'video/webm',
              video_style: template.id,
              filter: filter.id
            })
            console.log('[Booth] Save result:', saveResult.success)
            if (saveResult.success) {
              addMedia(saveResult.data as ArayMedia)
              console.log('[Booth] Video saved successfully!')
            } else {
              console.error('[Booth] Save failed:', (saveResult as any).error)
              setError('Failed to save video')
            }
          }
        } catch (e: any) {
          console.error('[Booth] Video save error:', e)
          setError('Video save failed: ' + e.message)
          setPhase('error')
        }
      }

      // Start recording with 100ms timeslice
      recorder.start(100)
      mediaRecorderRef.current = recorder
      setIsRecording(true)
      setRecordingTime(0)
      setVideoDuration(duration)

      const recStartTime = Date.now()
      console.log('[Booth] Recording started, target:', duration, 's')

      // Display timer
      recordingTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recStartTime) / 1000)
        setRecordingTime(elapsed)
      }, 500)

      // Exact auto-stop
      recordTimeoutRef.current = setTimeout(() => {
        const actual = Math.floor((Date.now() - recStartTime) / 1000)
        console.log('[Booth] Auto-stop at', actual, 's')

        if (rafRecordRef.current) { cancelAnimationFrame(rafRecordRef.current); rafRecordRef.current = null }
        if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop()
        }
        setIsRecording(false)
        setPhase('result')
      }, duration * 1000)

    } catch (e: any) {
      console.error('[Booth] Recording start failed:', e)
      setError(e.message)
      setPhase('error')
    }
  }, [activeEvent, addMedia, selectedVideoTemplate, aspectRatio])

  // ─── AUTO-COMPOSITE (template) ─────────────────────────────────
  const runComposite = useCallback(async () => {
    const templateId = settings?.selected_template_id || 'classic-strip-4'

    // Check built-in templates first
    const builtinTemplate = TEMPLATES.find(t => t.id === templateId)
    // Check custom templates
    const customTemplates = getCustomTemplates()
    const customTemplate = customTemplates.find(t => t.id === templateId)

    if (!builtinTemplate && !customTemplate) {
      console.warn('[Booth] No template found for id:', templateId)
      return
    }

    const requiredShots = builtinTemplate?.shotCount || customTemplate?.shotCount || 4
    if (capturedShots.length < requiredShots) {
      console.warn('[Booth] Not enough shots:', capturedShots.length, 'needed:', requiredShots)
      return
    }

    setCompositing(true)
    try {
      const photoUrls = capturedShots.map(s => s.dataUrl)
      let composite: string | null = null

      if (customTemplate) {
        // Custom template: use compositeCustomTemplate
        console.log('[Booth] Compositing with custom template:', customTemplate.name)
        composite = await compositeCustomTemplate(customTemplate, photoUrls, aspectRatio)
      } else if (builtinTemplate) {
        // Built-in template: use compositeTemplate
        console.log('[Booth] Compositing with built-in template:', builtinTemplate.name)
        composite = await compositeTemplate(builtinTemplate, photoUrls, aspectRatio)
      }

      if (composite && activeEvent) {
        const sessionId = (window as any).__aray_current_session_id
        const base64 = composite.split(',')[1]
        const saveResult = await window.aray.media.saveComposite({
          event_id: activeEvent.id,
          session_id: sessionId,
          image_base64: base64,
          mime_type: 'image/jpeg'
        })
        if (saveResult.success) {
          const compositeMedia = saveResult.data as ArayMedia
          setCompositeUrl(composite)
          setCompositeMediaId(compositeMedia.id)
          addMedia(compositeMedia)
          console.log('[Booth] Composite saved successfully — media id:', compositeMedia.id,
            '(this is the ONLY file saved for this session — raw shots were kept in-memory only)')
        }
      }
    } catch (e: any) {
      console.error('[Booth] Composite failed:', e)
    } finally {
      setCompositing(false)
    }
  }, [capturedShots, settings?.selected_template_id, activeEvent, addMedia])

  // Auto-composite when entering result phase (photo mode only)
  useEffect(() => {
    if (phase === 'result' && mode === 'photo' && capturedShots.length > 0 && !compositeUrl) {
      runComposite()
    }
  }, [phase, mode, capturedShots, compositeUrl, runComposite])

  const runCountdown = useCallback(async () => {
    if (mode === 'video') {
      // Video mode: countdown THEN start recording
      for (let i = countdownSeconds; i > 0; i--) {
        setCountdown(i)
        setPhase('countdown')
        await sleep(1000)
      }
      setCountdown(0)
      setPhase('preview')
      // Small delay then start recording
      await sleep(200)
      startRecording()
      return
    }

    for (let i = countdownSeconds; i > 0; i--) {
      setCountdown(i)
      await sleep(1000)
    }
    setCountdown(0)
    setPhase('flash')
    await performCapture()
    await sleep(400)

    if (currentShot < totalShots) {
      setCurrentShot((n) => n + 1)
      setPhase('preview')
    } else {
      setPhase('result')
    }
  }, [countdownSeconds, performCapture, currentShot, totalShots, mode, startRecording])

  // Keep runCountdownRef in sync so the palm trigger callback always calls the
  // latest runCountdown (otherwise shot 2+ would re-run shot 1's closure).
  useEffect(() => { runCountdownRef.current = runCountdown }, [runCountdown])

  // Cleanup
  useEffect(() => {
    return () => {
      stopCamera()
      ;(window as any).__aray_current_session_id = undefined
    }
  }, [stopCamera])

  // Auto-start camera on greeting screen for live background
  useEffect(() => {
    if (phase === 'greeting' && !streamRef.current) {
      startCamera()
    }
  }, [phase, startCamera])

  // Palm trigger v3: MediaPipe Hands (Saatiril-Andro port)
  // Flow: hand appear → 500ms sustain → "confirmed" → hand leaves → START TIMER
  useEffect(() => {
    if (phase !== 'preview' || mode !== 'photo' || !settings?.palm_trigger) return

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const startPalmTrigger = async () => {
      if (cancelled) return
      const video = videoRef.current
      if (!video) {
        retryTimer = setTimeout(startPalmTrigger, 200)
        return
      }
      if (video.videoWidth === 0 || video.readyState < 2) {
        retryTimer = setTimeout(startPalmTrigger, 200)
        return
      }

      if (!palmTriggerRef.current) {
        palmTriggerRef.current = new PalmTrigger()
      }
      const pt = palmTriggerRef.current

      // Wire callbacks — Saatiril API: onPalmConfirmed, onPalmLeft, onStateChange, onStatusChange
      await pt.start(video, settings.palm_trigger_sensitivity || 0.6, {
        onPalmConfirmed: () => {
          // Hand sustained 500ms — show "SIAP" overlay (UI reads palmState === 'confirmed')
          console.log('[Booth] Palm confirmed — waiting for hand to leave')
        },
        onPalmLeft: () => {
          // Confirmed hand left frame → START TIMER!
          setPalmState('triggered')
          setPalmTriggerActive(false)
          setPhase('countdown')
          runCountdownRef.current()
        },
        onStateChange: (newState) => {
          setPalmState(newState)
        },
        onStatusChange: (newStatus, err) => {
          setPalmStatus(newStatus)
          setPalmError(err ?? null)
        },
        onDebug: (info) => {
          setPalmDebug({
            handDetected: info.handDetected,
            landmarkCount: info.landmarkCount,
            openPalm: info.openPalm,
            fingerStatus: info.fingerStatus
          })
        }
      })

      if (!cancelled) {
        setPalmTriggerActive(true)
        console.log('[Booth] Palm trigger v3 activated (MediaPipe Hands — Saatiril-style)')
      }
    }

    startPalmTrigger()

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      if (palmTriggerRef.current) {
        palmTriggerRef.current.stop()
        setPalmTriggerActive(false)
        setPalmState('none')
      }
    }
  }, [phase, mode, settings?.palm_trigger, settings?.palm_trigger_sensitivity])

  // No active event
  if (!activeEvent) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <ArayLogo size="md" showTagline={false} className="mb-6 opacity-60" />
          <h2 className="text-xl font-semibold mb-2">No event selected</h2>
          <p className="text-silver-400 text-sm mb-6">
            Create an event first to start the booth. Every capture belongs to an event so we can
            keep your memories organized.
          </p>
          <ArayButton variant="gold" onClick={() => navigate('/events')}>
            Go to Events
          </ArayButton>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full relative bg-black overflow-hidden">
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera video — ALWAYS rendered. Filter applied via CSS. Aspect ratio via inline style. */}
      <div className="absolute inset-0 flex items-center justify-center bg-black overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`object-cover ${mirror ? 'scale-x-[-1]' : ''} ${
            phase === 'preview' || phase === 'countdown' || phase === 'flash' || phase === 'greeting' ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          style={{
            filter: activeFilter.css,
            aspectRatio: aspectRatio.replace(':', ' / '),
            maxHeight: '100vh',
            maxWidth: '100%',
            width: aspectRatio === '16:9' ? '100%' : 'auto',
            height: aspectRatio === '16:9' ? '100%' : '100vh'
          }}
        />
      </div>

      {/* Flash overlay */}
      <AnimatePresence>
        {lastFlash && (
          <motion.div
            initial={{ opacity: 0.95 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="absolute inset-0 bg-white pointer-events-none z-30"
          />
        )}
      </AnimatePresence>

      {/* Top bar — hidden saat fullscreenBooth (kecuali toggle button kecil) */}
      {!fullscreenBooth && (
        <div className="absolute top-0 left-0 right-0 z-20 p-5 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent">
          <button
            onClick={() => {
              stopCamera()
              navigate('/dashboard')
            }}
            className="text-silver-300 hover:text-white flex items-center gap-2 text-sm"
          >
            <ChevronLeft className="w-5 h-5" />
            Exit Booth
          </button>
          <div className="flex items-center gap-3">
            <ArayBadge variant="purple">{activeEvent.code}</ArayBadge>
            <ArayBadge variant="gold">{activeEvent.name}</ArayBadge>
          </div>
        </div>
      )}

      {/* Fullscreen toggle button — kecil di pojok kanan atas.
          Saat fullscreen: button visible (untuk exit), klik → password modal.
          Saat normal: button visible (untuk enter fullscreen), klik → langsung fullscreen. */}
      <button
        onClick={() => {
          if (fullscreenBooth) {
            // Exit fullscreen — butuh password (jika diset)
            const pwd = settings?.booth_fullscreen_password
            if (pwd && pwd.length > 0) {
              setShowPasswordModal(true)
              setPasswordInput('')
              setPasswordError(false)
            } else {
              setFullscreenBooth(false)
            }
          } else {
            setFullscreenBooth(true)
          }
        }}
        className={`absolute top-3 right-3 z-50 w-9 h-9 rounded-full flex items-center justify-center transition-all ${
          fullscreenBooth
            ? 'bg-black/50 text-silver-300 hover:bg-black/70 hover:text-white opacity-60 hover:opacity-100'
            : 'bg-purple-haze-500/20 border border-purple-haze-500/30 text-purple-haze-200 hover:bg-purple-haze-500/30'
        }`}
        title={fullscreenBooth ? 'Exit fullscreen (butuh password)' : 'Fullscreen booth'}
      >
        {fullscreenBooth ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      </button>

      {/* Password modal — untuk exit fullscreen */}
      <AnimatePresence>
        {showPasswordModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-surface-raised border border-silver-300/15 rounded-2xl shadow-card p-6 w-full max-w-sm"
            >
              <h3 className="text-lg font-semibold mb-2 text-silver-100">Exit Fullscreen</h3>
              <p className="text-silver-400 text-sm mb-4">Masukkan password untuk keluar dari mode fullscreen.</p>
              <input
                type="password"
                autoFocus
                value={passwordInput}
                onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(false) }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (passwordInput === (settings?.booth_fullscreen_password || 'aray')) {
                      setFullscreenBooth(false)
                      setShowPasswordModal(false)
                      setPasswordInput('')
                    } else {
                      setPasswordError(true)
                    }
                  }
                }}
                className={`aray-input w-full ${passwordError ? 'border-red-500' : ''}`}
                placeholder="Password"
              />
              {passwordError && (
                <p className="text-red-400 text-xs mt-2">Password salah</p>
              )}
              <div className="flex gap-2 mt-4">
                <ArayButton
                  variant="ghost"
                  className="flex-1"
                  onClick={() => { setShowPasswordModal(false); setPasswordInput(''); setPasswordError(false) }}
                >
                  Batal
                </ArayButton>
                <ArayButton
                  variant="gold"
                  className="flex-1"
                  onClick={() => {
                    if (passwordInput === (settings?.booth_fullscreen_password || 'aray')) {
                      setFullscreenBooth(false)
                      setShowPasswordModal(false)
                      setPasswordInput('')
                    } else {
                      setPasswordError(true)
                    }
                  }}
                >
                  Keluar
                </ArayButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phases */}
      <AnimatePresence mode="wait">
        {phase === 'greeting' && (
          <motion.div
            key="greeting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center"
          >
            {/* Dark overlay over live camera background */}
            <div className="absolute inset-0 bg-gradient-to-b from-purple-haze-950/80 via-surface-base/60 to-purple-haze-950/80" />
            <div
              className="absolute inset-0 opacity-20 pointer-events-none"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 30% 30%, rgba(123,97,168,0.4) 0%, transparent 50%), radial-gradient(circle at 70% 70%, rgba(212,175,55,0.2) 0%, transparent 45%)'
              }}
            />
            <div className="relative z-10 text-center">
              <ArayLogo size="xl" animated className="mb-8" />
              <p className="text-silver-300 text-xl italic mb-8">Let's make a memory.</p>

              {/* Mode selector: Photo / Video */}
              <div className="mb-8 flex items-center justify-center gap-2">
                <button
                  onClick={() => setMode('photo')}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                    mode === 'photo'
                      ? 'bg-purple-haze-500/25 border-purple-haze-500/40 text-purple-haze-100'
                      : 'bg-silver-200/5 border-silver-300/20 text-silver-400'
                  }`}
                >
                  <ImageIcon className="w-4 h-4" /> Photo
                </button>
                <button
                  onClick={() => setMode('video')}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                    mode === 'video'
                      ? 'bg-purple-haze-500/25 border-purple-haze-500/40 text-purple-haze-100'
                      : 'bg-silver-200/5 border-silver-300/20 text-silver-400'
                  }`}
                >
                  <Video className="w-4 h-4" /> Video
                </button>
              </div>

              <ArayButton
                variant="gold"
                size="xl"
                icon={mode === 'video' ? <Video className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                onClick={async () => {
                  if (!streamRef.current) {
                    const ok = await startCamera()
                    if (!ok) return
                  }
                  setCapturedShots([])
                  setCurrentShot(1)
                  setCompositeUrl(null)
                  setCompositeMediaId(null)
                  ;(window as any).__aray_current_session_id = undefined
                  setPhase('preview')
                }}
                className="text-lg px-12 py-4"
              >
                LET'S YAP!
              </ArayButton>
            </div>
          </motion.div>
        )}

        {phase === 'preview' && (
          <motion.div
            key="preview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex flex-col items-center justify-end pb-12"
          >
            {/* Shot progress (photo mode only) — hidden saat fullscreen */}
            {mode === 'photo' && !fullscreenBooth && (
              <div className="absolute top-20 left-1/2 -translate-x-1/2 flex items-center gap-2">
                {Array.from({ length: totalShots }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-3 h-3 rounded-full transition-all ${
                      i < currentShot - 1
                        ? 'bg-green-400'
                        : i === currentShot - 1
                          ? 'bg-gold-400 animate-pulse shadow-glow-gold'
                          : 'bg-silver-700'
                    }`}
                  />
                ))}
              </div>
            )}

            {/* Palm trigger v2 — Saatiril-style overlay */}
            {/* ═══ PALM TRIGGER OVERLAY (minimal — hanya hand outline di tengah) ═══ */}

            {/* Loading state — kecil di pojok, tidak mengganggu */}
            {palmTriggerActive && (palmStatus === 'loading_scripts' || palmStatus === 'loading_model') && (
              <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1.5">
                <RefreshCw className="w-3 h-3 animate-spin text-purple-haze-200" />
                <span className="text-purple-haze-100 text-xs">
                  Loading...
                </span>
              </div>
            )}

            {/* Error state — kecil di pojok */}
            {palmTriggerActive && palmStatus === 'error' && (
              <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 bg-red-500/20 border border-red-500/40 rounded-full px-3 py-1.5">
                <AlertTriangle className="w-3 h-3 text-red-300" />
                <span className="text-red-100 text-xs">Palm error</span>
              </div>
            )}

            {/* CONFIRMED state: big "SIAP" overlay — pull hand away to trigger */}
            {palmTriggerActive && palmState === 'confirmed' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none z-15"
              >
                <div className="text-center">
                  <motion.div
                    animate={{ scale: [1, 1.08, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                    className="text-[180px] font-extrabold aray-gradient-text leading-none"
                    style={{ textShadow: '0 0 80px rgba(212, 175, 55, 0.7)' }}
                  >
                    SIAP
                  </motion.div>
                  <div className="text-silver-200 text-2xl font-semibold mt-4">
                    Tarik tangan untuk capture
                  </div>
                </div>
              </motion.div>
            )}

            {/* HAND GUIDE OVERLAY — tampil di none/searching/hand_detected.
                HANYA ini yang muncul di tengah. Tidak ada teks bahasa ganda.
                Outline ungu (cari) → hijau (hand_detected). */}
            {palmTriggerActive && (palmState === 'none' || palmState === 'searching' || palmState === 'hand_detected') &&
             palmStatus !== 'loading_scripts' && palmStatus !== 'loading_model' && palmStatus !== 'error' && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <div className="text-center">
                  <motion.svg
                    viewBox="0 0 200 220"
                    className="w-64 h-72 mx-auto drop-shadow-2xl"
                    animate={{
                      scale: palmState === 'hand_detected' ? [1, 1.05, 1] : [1, 1.03, 1],
                      opacity: palmState === 'hand_detected' ? 1 : [0.6, 0.9, 0.6]
                    }}
                    transition={{
                      duration: palmState === 'hand_detected' ? 0.8 : 2,
                      repeat: Infinity,
                      ease: 'easeInOut'
                    }}
                  >
                    <path
                      d="M 100 210 L 100 160 L 70 160 L 70 90 Q 70 80 80 80 Q 90 80 90 90 L 90 140 L 90 60 Q 90 50 100 50 Q 110 50 110 60 L 110 140 L 110 50 Q 110 40 120 40 Q 130 40 130 50 L 130 140 L 130 70 Q 130 60 140 60 Q 150 60 150 70 L 150 140 L 150 100 Q 150 90 158 90 Q 166 90 166 100 L 166 155 Q 166 170 156 180 L 130 200 Z"
                      fill="none"
                      stroke={palmState === 'hand_detected' ? '#22c55e' : '#a78bfa'}
                      strokeWidth="4"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      style={{
                        filter: palmState === 'hand_detected'
                          ? 'drop-shadow(0 0 20px rgba(34, 197, 94, 0.8))'
                          : 'drop-shadow(0 0 15px rgba(167, 139, 250, 0.5))',
                        transition: 'stroke 0.3s, filter 0.3s'
                      }}
                    />
                  </motion.svg>
                  {/* SATU teks singkat saja — ganti sesuai state */}
                  <div className="mt-4 text-silver-200 text-lg font-medium">
                    {palmState === 'hand_detected' ? 'Tahan...' : 'Align tangan ke outline'}
                  </div>
                </div>
              </div>
            )}

            {/* Video recording: no overlay (clean preview, auto-stop handles everything) */}

            {/* Video recording: REC badge at top with countdown, nothing else */}
            {mode === 'video' && isRecording && (
              <div className="absolute top-20 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-red-500/20 border border-red-500/40 rounded-full px-4 py-1.5 z-20">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                <span
                  className={`text-sm font-mono font-bold ${
                    videoDuration - recordingTime <= 3 ? 'text-red-300' : 'text-red-200'
                  }`}
                >
                  REC {videoDuration - recordingTime}s
                </span>
              </div>
            )}

            {/* Text above shutter button: photo mode only, hidden during video recording
                dan hidden saat fullscreen booth (clean view, only palm overlay) */}
            {!(mode === 'video' && isRecording) && !fullscreenBooth && (
              <div className="text-center mb-32">
                {mode === 'photo' ? (
                  <>
                    <p className="text-silver-200 text-2xl font-semibold mb-1">
                      Shot {currentShot} of {totalShots}
                    </p>
                    <p className="text-silver-400 text-sm italic">Strike a pose. Don't blink.</p>
                  </>
                ) : (
                  <>
                    <p className="text-silver-200 text-2xl font-semibold mb-1">
                      Ready to record
                    </p>
                    <p className="text-silver-400 text-sm italic">Click record to start</p>
                  </>
                )}
              </div>
            )}

            {mode === 'video' ? (
              isRecording ? (
                // During recording: red circle only (auto-stop, no button)
                <div className="w-24 h-24 rounded-full bg-red-500/20 border-4 border-red-500 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                </div>
              ) : (
                // Before recording: record button
                <button
                  onClick={() => {
                    setPhase('countdown')
                    runCountdown()
                  }}
                  className="w-24 h-24 rounded-full border-4 transition-transform hover:scale-105 flex items-center justify-center bg-gradient-to-br from-gold-300 to-gold-500 border-white/80 shadow-glow-gold"
                >
                  <Video className="w-10 h-10 text-purple-haze-950" />
                </button>
              )
            ) : null}
          </motion.div>
        )}

        {phase === 'countdown' && (
          <motion.div
            key="countdown"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={countdown}
                initial={{ scale: 0.3, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.6, opacity: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="text-[200px] font-extrabold aray-gradient-text"
                style={{ textShadow: '0 0 60px rgba(123, 97, 168, 0.6)' }}
              >
                {countdown}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}

        {phase === 'flash' && (
          <motion.div
            key="flash"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1.2, opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="text-7xl font-extrabold aray-gradient-text"
              style={{ textShadow: '0 0 80px rgba(212, 175, 55, 0.8)' }}
            >
              YAP!
            </motion.div>
          </motion.div>
        )}

        {phase === 'result' && (
          <motion.div
            key="result"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gradient-to-br from-purple-haze-950 via-surface-base to-purple-haze-900 p-8 overflow-auto"
          >
            <div className="text-center mb-6">
              <motion.h1
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 12 }}
                className="text-5xl font-extrabold mb-2 aray-gradient-text"
              >
                LOOK AT YOU!
              </motion.h1>
              <p className="text-silver-300 text-lg italic">Your memories are ready.</p>
            </div>

            {/* Composite preview (template result) */}
            {mode === 'photo' && compositing && (
              <div className="mb-6 flex items-center gap-3 text-silver-300">
                <RefreshCw className="w-5 h-5 animate-spin text-purple-haze-300" />
                <span className="text-sm">Compositing template...</span>
              </div>
            )}
            {mode === 'photo' && compositeUrl && (
              <div className="mb-6 max-w-sm mx-auto">
                <div className="text-xs text-gold-300 mb-2 flex items-center gap-1.5 justify-center">
                  <LayoutTemplate className="w-3.5 h-3.5" />
                  Template composite ready
                </div>
                <img
                  src={compositeUrl}
                  alt="Template composite"
                  className="max-h-64 rounded-xl border-2 border-gold-400/40 shadow-glow-gold mx-auto"
                />
              </div>
            )}

            {/* Individual photos */}
            {mode === 'photo' && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl mb-8">
                {capturedShots.map((shot) => (
                  <motion.div
                    key={shot.shotNumber}
                    initial={{ scale: 0.8, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    transition={{ delay: shot.shotNumber * 0.1 }}
                    className="aspect-[3/2] rounded-xl overflow-hidden border-2 border-purple-haze-500/30 shadow-card"
                  >
                    <img src={shot.dataUrl} alt={`Shot ${shot.shotNumber}`} className="w-full h-full object-cover" />
                  </motion.div>
                ))}
              </div>
            )}

            {/* Video recorded indicator */}
            {mode === 'video' && (
              <div className="mb-8 flex items-center gap-3 bg-green-500/10 border border-green-500/30 rounded-xl px-6 py-4">
                <Video className="w-6 h-6 text-green-400" />
                <span className="text-green-200 font-medium">Video saved successfully!</span>
              </div>
            )}

            <div className="flex items-center gap-2 mb-6">
              <ArayBadge variant="success">
                <Check className="w-3 h-3" /> Saved locally
              </ArayBadge>
              {settings?.google_drive_connected && (
                <ArayBadge variant="purple">
                  <RefreshCw className="w-3 h-3" /> Syncing to Google Drive...
                </ArayBadge>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap justify-center">
              <ArayButton variant="silver" icon={<Printer className="w-4 h-4" />} onClick={() => window.aray.print.queue(compositeMediaId ?? capturedShots[0]?.mediaId ?? '')}>
                Print
              </ArayButton>
              <ArayButton variant="silver" icon={<Share2 className="w-4 h-4" />}>
                Share
              </ArayButton>
              <ArayButton
                variant="ghost"
                icon={<RotateCcw className="w-4 h-4" />}
                onClick={() => {
                  setCapturedShots([])
                  setCurrentShot(1)
                  setCompositeUrl(null)
                  setCompositeMediaId(null)
                  ;(window as any).__aray_current_session_id = undefined
                  setPhase('preview')
                }}
              >
                Retake
              </ArayButton>
              <ArayButton
                variant="gold"
                icon={<Sparkles className="w-4 h-4" />}
                onClick={() => {
                  setCapturedShots([])
                  setCurrentShot(1)
                  setCompositeUrl(null)
                  setCompositeMediaId(null)
                  ;(window as any).__aray_current_session_id = undefined
                  setPhase('greeting')
                }}
              >
                Done
              </ArayButton>
            </div>
          </motion.div>
        )}

        {phase === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex items-center justify-center bg-surface-base p-8"
          >
            <div className="text-center max-w-md">
              <AlertTriangle className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">Oops.</h2>
              <p className="text-silver-300 mb-6">{error ?? 'Something went wrong.'}</p>
              <p className="text-silver-500 text-sm mb-6 italic">
                "Your camera took a little break. Please reconnect it."
              </p>
              <div className="flex items-center justify-center gap-3">
                <ArayButton variant="ghost" onClick={() => navigate('/dashboard')}>
                  Back to Dashboard
                </ArayButton>
                <ArayButton
                  variant="gold"
                  icon={<RefreshCw className="w-4 h-4" />}
                  onClick={async () => {
                    stopCamera()
                    const ok = await startCamera()
                    if (ok) setPhase('preview')
                  }}
                >
                  Retry Camera
                </ArayButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Capture button (visible during preview, PHOTO mode only)
          Hidden saat fullscreen booth (palm trigger only, no manual button) */}
      {phase === 'preview' && mode === 'photo' && !fullscreenBooth && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20">
          <button
            onClick={() => {
              setPhase('countdown')
              runCountdown()
            }}
            className="w-24 h-24 rounded-full bg-gradient-to-br from-gold-300 to-gold-500 border-4 border-white/80 shadow-glow-gold hover:scale-105 transition-transform flex items-center justify-center"
          >
            <Camera className="w-10 h-10 text-purple-haze-950" />
          </button>
        </div>
      )}
    </div>
  )
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
