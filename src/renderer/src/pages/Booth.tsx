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
import QRCode from 'qrcode'

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
  const boothModeSetting = settings?.booth_mode || 'combined'
  const [activeFilterId, setActiveFilterId] = useState('original')
  const [activeFilterIdVideo, setActiveFilterIdVideo] = useState('original')
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1' | '4:3'>('9:16')
  const [aspectRatioVideo, setAspectRatioVideo] = useState<'16:9' | '9:16' | '1:1' | '4:3'>('9:16')
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
  // v4.2.1: Share QR modal — tampilkan QR code dari share_qr_link
  const [showQrModal, setShowQrModal] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const activeEvent = events.find((e) => e.id === activeEventId) ?? events[0]
  const totalShots = settings?.booth_shot_count ?? 4
  const countdownSeconds = settings?.booth_countdown_seconds ?? 3
  const activeFilter = FILTERS.find(f => f.id === (mode === 'video' ? activeFilterIdVideo : activeFilterId)) || FILTERS[0]
  const activeVideoTemplate = VIDEO_TEMPLATES.find(t => t.id === selectedVideoTemplate) || VIDEO_TEMPLATES[0]
  const currentAspectRatio = mode === 'video' ? aspectRatioVideo : aspectRatio

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
  // v4.3.7: Ref for startRecording — dipakai palm trigger video mode
  const startRecordingRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (events.length === 0) loadEvents()
    // Load booth settings from Settings page
    if (settings) {
      if (settings.camera_effect) setActiveFilterId(settings.camera_effect)
      if (settings.camera_effect_video) setActiveFilterIdVideo(settings.camera_effect_video)
      if (settings.aspect_ratio) setAspectRatio(settings.aspect_ratio as any)
      if (settings.aspect_ratio_video) setAspectRatioVideo(settings.aspect_ratio_video as any)
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

    const dims = aspectDims[currentAspectRatio] || aspectDims['9:16']
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
  }, [mirror, activeFilter, currentAspectRatio])

  const performCapture = useCallback(async (retakeShotNumber?: number) => {
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
      let sessionId = (window as any).__aray_current_session_id as string | undefined
      if (!sessionId) {
        const sessionResult = await window.aray.sessions.create(activeEvent.id, 'photo', totalShots)
        if (!sessionResult.success) throw new Error('Failed to create session')
        sessionId = (sessionResult.data as any).id
        ;(window as any).__aray_current_session_id = sessionId
      }

      const shotNum = retakeShotNumber ?? currentShot
      setCapturedShots((prev) => {
        // v4.6.2: Retake individual shot — replace existing shot data
        const idx = prev.findIndex(s => s.shotNumber === shotNum)
        if (idx !== -1) {
          const updated = [...prev]
          updated[idx] = { shotNumber: shotNum, mediaId: `temp_${shotNum}`, dataUrl: frames.full }
          return updated
        }
        return [...prev, { shotNumber: shotNum, mediaId: `temp_${shotNum}`, dataUrl: frames.full }]
      })
      console.log('[Booth] Shot', shotNum, retakeShotNumber ? 'RETAKE' : '', 'captured (in-memory only)')
    } catch (e: any) {
      setError(e.message)
      setPhase('error')
    }
  }, [activeEvent, captureFrame, currentShot, totalShots])

  // ─── VIDEO RECORDING (canvas-based for filter support) ────────
  const canvasRecordRef = useRef<HTMLCanvasElement | null>(null)
  const rafRecordRef = useRef<number | null>(null)
  const recordTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // v4.5.0: cleanupAllRecording — bersihkan SEMUA refs/timers dari recording sebelumnya.
  // Dipanggil sebelum startRecording dan saat Retake/Done untuk prevent:
  // - Double countdown (timer lama masih running)
  // - Flicker (recordingTimer interval masih jalan)
  // - Draw loop conflict (rafRecordRef lama masih jalan)
  // - Video tidak tersimpan (MediaRecorder state conflict)
  const cleanupAllRecording = useCallback(() => {
    console.log('[Booth] cleanupAllRecording — clearing all refs/timers')
    // Stop MediaRecorder
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop()
        }
      } catch (e) {
        console.warn('[Booth] Error stopping MediaRecorder:', e)
      }
      mediaRecorderRef.current = null
    }
    // Cancel draw loop
    if (rafRecordRef.current) {
      cancelAnimationFrame(rafRecordRef.current)
      rafRecordRef.current = null
    }
    // Clear recording timer (interval yang update recordingTime)
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
    // Clear auto-stop timeout
    if (recordTimeoutRef.current) {
      clearTimeout(recordTimeoutRef.current)
      recordTimeoutRef.current = null
    }
    // Reset state
    setIsRecording(false)
    setRecordingTime(0)
    setVideoDuration(0)
    setCountdown(0)
    // Clear recorded chunks
    recordedChunksRef.current = []
  }, [])

  const stopRecording = useCallback(() => {
    cleanupAllRecording()
  }, [cleanupAllRecording])

  const startRecording = useCallback(() => {
    const video = videoRef.current
    if (!video || !streamRef.current) return

    // v4.5.0: Cleanup any leftover recording state from previous session.
    // Ini prevent: double countdown, flicker, draw loop conflict, video tidak tersimpan.
    cleanupAllRecording()

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
      const dims = aspectDims[currentAspectRatio] || aspectDims['9:16']
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
              console.log('[Booth] Creating new video session...')
              const sr = await window.aray.sessions.create(activeEvent.id, 'video', 1)
              if (sr.success) {
                sessionId = (sr.data as any).id
                ;(window as any).__aray_current_session_id = sessionId
                console.log('[Booth] Video session created:', sessionId)
              } else {
                console.error('[Booth] Failed to create video session:', sr)
                setError('Failed to create video session: ' + ((sr as any).error?.message || 'unknown'))
                setPhase('error')
                return
              }
            }
            console.log('[Booth] Saving video, session:', sessionId, 'template:', template.id)
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
              setError('Failed to save video: ' + ((saveResult as any).error?.message || 'unknown'))
              setPhase('error')
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
  }, [activeEvent, addMedia, selectedVideoTemplate, currentAspectRatio, cleanupAllRecording])

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
        composite = await compositeCustomTemplate(customTemplate, photoUrls, currentAspectRatio)
      } else if (builtinTemplate) {
        // Built-in template: use compositeTemplate
        console.log('[Booth] Compositing with built-in template:', builtinTemplate.name)
        composite = await compositeTemplate(builtinTemplate, photoUrls, currentAspectRatio)
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

  // v4.6.2: Retake individual shot — user klik foto hasil di result screen,
  // hanya foto itu yang di-retake, bukan dari awal.
  const [retakeShotNumber, setRetakeShotNumber] = useState<number | null>(null)

  const retakeShot = useCallback((shotNumber: number) => {
    console.log('[Booth] Retake shot', shotNumber)
    setRetakeShotNumber(shotNumber)
    setCurrentShot(shotNumber)
    setCompositeUrl(null)
    setCompositeMediaId(null)
    setPhase('preview')
  }, [])

  // v4.6.2: runCountdown support retake individual shot
  const runCountdown = useCallback(async () => {
    if (mode === 'video') {
      for (let i = countdownSeconds; i > 0; i--) {
        setCountdown(i)
        setPhase('countdown')
        await sleep(1000)
      }
      setCountdown(0)
      setPhase('preview')
      await sleep(200)
      startRecording()
      return
    }

    const shotToCapture = retakeShotNumber ?? currentShot
    for (let i = countdownSeconds; i > 0; i--) {
      setCountdown(i)
      await sleep(1000)
    }
    setCountdown(0)
    setPhase('flash')
    await performCapture(shotToCapture)
    await sleep(400)

    // v4.6.2: If retaking, go back to result. Otherwise continue sequence.
    if (retakeShotNumber) {
      setRetakeShotNumber(null)
      setPhase('result')
    } else if (currentShot < totalShots) {
      setCurrentShot((n) => n + 1)
      setPhase('preview')
    } else {
      setPhase('result')
    }
  }, [countdownSeconds, performCapture, currentShot, totalShots, mode, startRecording, retakeShotNumber])

  // Keep runCountdownRef in sync so the palm trigger callback always calls the
  // latest runCountdown (otherwise shot 2+ would re-run shot 1's closure).
  useEffect(() => { runCountdownRef.current = runCountdown }, [runCountdown])
  // v4.3.7: Keep startRecordingRef in sync untuk palm trigger video mode
  useEffect(() => { startRecordingRef.current = startRecording }, [startRecording])

  // Cleanup
  useEffect(() => {
    return () => {
      stopCamera()
      ;(window as any).__aray_current_session_id = undefined
    }
  }, [stopCamera])

  // v4.6.4: Auto-set mode from settings. If 'photo' or 'video', lock mode.
  // If 'combined', user can switch in greeting screen.
  useEffect(() => {
    if (boothModeSetting === 'photo') setMode('photo')
    else if (boothModeSetting === 'video') setMode('video')
    // combined: don't override, let user choose
  }, [boothModeSetting])

  // v4.6.4: Determine if mode selector should be shown in greeting
  const showModeSelector = boothModeSetting === 'combined'

  // Auto-start camera on greeting screen for live background
  useEffect(() => {
    if (phase === 'greeting' && !streamRef.current) {
      startCamera()
    }
  }, [phase, startCamera])

  // Palm trigger v3: MediaPipe Hands (Saatiril-Andro port)
  // Flow: hand appear → 500ms sustain → "confirmed" → hand leaves → START TIMER
  // v4.3.7: Palm trigger aktif di BOTH photo dan video mode (sebelumnya photo only)
  useEffect(() => {
    // v4.5.4: Don't activate palm trigger during recording — prevent re-trigger
    if (phase !== 'preview' || !settings?.palm_trigger || isRecording) return

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
          // Confirmed hand left frame → START TIMER/RECORDING!
          // v4.5.3: Video mode JUGA pakai countdown (3 detik) sebelum recording.
          // Sebelumnya langsung start — tangan yang baru dilepas masuk rekaman.
          setPalmState('triggered')
          setPalmTriggerActive(false)
          // Both modes: countdown first, then capture/record
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
  }, [phase, mode, settings?.palm_trigger, settings?.palm_trigger_sensitivity, isRecording])

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
            aspectRatio: currentAspectRatio.replace(':', ' / '),
            maxHeight: '100dvh',
            maxWidth: '100%',
            width: currentAspectRatio === '16:9' ? '100%' : 'auto',
            height: currentAspectRatio === '16:9' ? '100%' : '100dvh'
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

      {/* Top bar — hidden saat fullscreenBooth ATAU kiosk mode.
          Di fullscreen/kiosk, hanya tombol X kecil yang tampil (untuk exit). */}
      {!fullscreenBooth && !settings?.kiosk_mode && (
        <div className="absolute top-0 left-0 right-0 z-20 p-3 sm:p-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between bg-gradient-to-b from-black/60 to-transparent" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}>
          <button
            onClick={() => {
              stopCamera()
              navigate('/dashboard')
            }}
            className="text-silver-300 hover:text-white flex items-center gap-2 text-sm min-h-[44px]"
          >
            <ChevronLeft className="w-5 h-5" />
            Exit Booth
          </button>
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <ArayBadge variant="purple">{activeEvent.code}</ArayBadge>
            <ArayBadge variant="gold" className="hidden xs:inline-flex sm:inline-flex">{activeEvent.name}</ArayBadge>
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

      {/* v4.2.1: QR Code modal — untuk Share button.
          User scan QR → close → Done untuk kembali ke greeting. */}
      <AnimatePresence>
        {showQrModal && qrDataUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setShowQrModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-surface-raised border border-silver-300/15 rounded-2xl shadow-card p-6 w-full max-w-sm text-center"
            >
              <h3 className="text-lg font-semibold mb-2 text-silver-100">Scan QR Code</h3>
              <p className="text-silver-400 text-sm mb-4">
                Arahkan kamera HP ke QR code untuk mengakses link share.
              </p>
              <div className="bg-white rounded-xl p-4 inline-block mb-4">
                <img src={qrDataUrl} alt="QR Code" className="w-64 h-64" />
              </div>
              <div className="text-xs text-silver-500 font-mono break-all mb-4 px-4">
                {settings?.share_qr_link}
              </div>
              <ArayButton
                variant="gold"
                className="w-full"
                icon={<X className="w-4 h-4" />}
                onClick={() => setShowQrModal(false)}
              >
                Close
              </ArayButton>
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

              {/* v4.6.4: Mode selector — hanya tampil jika booth_mode = 'combined'.
                  Photo only / Video only: mode sudah locked, selector hidden. */}
              {showModeSelector && (
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
              )}

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
            {/* Shot progress (photo mode only) — hidden saat fullscreen booth saja.
                Kiosk mode tetap tampilkan (user perlu tahu progress). */}
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
                    className="text-[64px] xs:text-[90px] sm:text-[120px] md:text-[180px] font-extrabold aray-gradient-text leading-none"
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
                    {palmState === 'hand_detected' ? 'Tahan...' : 'Arahkan tangan ke layar, tahan, dan lepaskan'}
                  </div>
                </div>
              </div>
            )}

            {/* Video recording: no overlay (clean preview, auto-stop handles everything) */}

            {/* v4.5.3: Video recording indicator — overlay "RECORDING" yang jelas +
                big countdown timer di atas + REC badge + red border glow */}
            {mode === 'video' && isRecording && (
              <>
                {/* Big countdown timer di tengah atas */}
                <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 text-center pointer-events-none">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={`text-[48px] xs:text-[72px] sm:text-[90px] md:text-[120px] font-extrabold leading-none ${
                      videoDuration - recordingTime <= 3
                        ? 'text-red-400'
                        : 'text-white'
                    }`}
                    style={{
                      textShadow: videoDuration - recordingTime <= 3
                        ? '0 0 40px rgba(239, 68, 68, 0.8)'
                        : '0 0 30px rgba(0, 0, 0, 0.8)'
                    }}
                  >
                    {videoDuration - recordingTime}
                  </motion.div>
                  <div className="text-2xl font-bold text-silver-300 mt-1">
                    {videoDuration - recordingTime <= 3 ? 'seconds left!' : 'seconds'}
                  </div>
                </div>

                {/* v4.5.9: "RECORDING" overlay di tengah bawah — pulse.
                    Hapus elapsed/total (sudah ada countdown di atas). */}
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 bg-red-600/80 backdrop-blur-sm rounded-full px-8 py-3 shadow-2xl"
                    style={{ animation: 'pulse 1.5s ease-in-out infinite' }}
                  >
                    <div className="w-4 h-4 rounded-full bg-white" />
                    <span className="text-white text-xl font-extrabold tracking-wider">
                      RECORDING
                    </span>
                  </motion.div>
                </div>
              </>
            )}

            {/* "Shot X of Y" info — sekarang digabung dengan shutter button
                (lihat bottom capture button). Tidak ada teks terpisah lagi. */}

            {!(mode === 'video' && isRecording) && !fullscreenBooth && !palmTriggerActive && (
              <div className="text-center mb-32">
                {mode === 'photo' ? (
                  <p className="text-silver-200 text-2xl font-semibold mb-1">
                    Ready
                  </p>
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
                // v4.5.10: During recording — no red circle (RECORDING overlay di bawah sudah cukup)
                null
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
                className="text-3xl xs:text-4xl sm:text-5xl font-extrabold mb-2 aray-gradient-text"
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
                <img
                  src={compositeUrl}
                  alt="Template composite"
                  className="max-h-64 rounded-xl border-2 border-gold-400/40 shadow-glow-gold mx-auto"
                />
              </div>
            )}

            {/* v4.6.2: Individual photos — KLIK untuk retake foto tersebut saja */}
            {mode === 'photo' && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl mb-8">
                {capturedShots.map((shot) => (
                  <motion.button
                    key={shot.shotNumber}
                    initial={{ scale: 0.8, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    transition={{ delay: shot.shotNumber * 0.1 }}
                    onClick={() => retakeShot(shot.shotNumber)}
                    className="relative aspect-[3/2] rounded-xl overflow-hidden border-2 border-purple-haze-500/30 hover:border-gold-400/60 shadow-card group cursor-pointer transition-all"
                    title={`Retake shot ${shot.shotNumber}`}
                  >
                    <img src={shot.dataUrl} alt={`Shot ${shot.shotNumber}`} className="w-full h-full object-cover" />
                    {/* Retake overlay on hover */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="text-center">
                        <RotateCcw className="w-8 h-8 text-gold-400 mx-auto mb-1" />
                        <span className="text-gold-300 text-xs font-medium">Retake</span>
                      </div>
                    </div>
                    {/* Shot number badge */}
                    <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] font-bold rounded px-1.5 py-0.5">
                      {shot.shotNumber}
                    </div>
                  </motion.button>
                ))}
              </div>
            )}

            {/* v4.5.11: Hapus "Video saved successfully" — tidak professional */}

            {/* v4.5.11: Hapus badge "Saved locally" dan "Syncing to Google Drive"
                — tidak professional untuk event display */}

            <div className="flex items-center gap-3 flex-wrap justify-center">
              {settings?.show_print_button !== false && (
              <ArayButton
                variant="silver"
                icon={<Printer className="w-4 h-4" />}
                onClick={async () => {
                  const mediaId = compositeMediaId ?? capturedShots[0]?.mediaId ?? ''
                  if (!mediaId) return
                  // v4.3.3: Pass print settings ke IPC
                  const printSettings = {
                    paper_size: settings?.print_paper_size || '4x6',
                    custom_width: settings?.print_custom_width || 100,
                    custom_height: settings?.print_custom_height || 150,
                    copies: settings?.print_copies || 1,
                    color: settings?.print_color !== false,
                    orientation: settings?.print_orientation || 'portrait',
                    quality: settings?.print_quality || 'normal',
                    fit: settings?.print_fit || 'contain'
                  }
                  await window.aray.print.queue(
                    mediaId,
                    settings?.printer_name || undefined,
                    settings?.print_copies || 1,
                    printSettings
                  )
                }}
              >
                Print
              </ArayButton>
              )}
              {settings?.show_share_button !== false && settings?.share_qr_enabled && settings?.share_qr_link && (
                <ArayButton
                  variant="silver"
                  icon={<Share2 className="w-4 h-4" />}
                  onClick={async () => {
                    try {
                      const link = settings.share_qr_link!
                      const dataUrl = await QRCode.toDataURL(link, {
                        width: 400,
                        margin: 2,
                        color: { dark: '#0F0B1A', light: '#FFFFFF' }
                      })
                      setQrDataUrl(dataUrl)
                      setShowQrModal(true)
                    } catch (e) {
                      console.error('[Booth] QR generation failed:', e)
                    }
                  }}
                >
                  Share
                </ArayButton>
              )}
              <ArayButton
                variant="ghost"
                icon={<RotateCcw className="w-4 h-4" />}
                onClick={() => {
                  cleanupAllRecording()  // v4.5.0: clear all recording state
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
                  cleanupAllRecording()  // v4.5.0: clear all recording state
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
          v4.1.8: SELALU tampil termasuk saat fullscreen booth.
          Shot count "1/2" digabung di dalam lingkaran shutter (compact format). */}
      {phase === 'preview' && mode === 'photo' && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-30">
          <button
            onClick={() => {
              setPhase('countdown')
              runCountdown()
            }}
            className="relative w-24 h-24 rounded-full bg-gradient-to-br from-gold-300 to-gold-500 border-4 border-white/80 shadow-glow-gold hover:scale-105 transition-transform flex flex-col items-center justify-center"
          >
            <Camera className="w-7 h-7 text-purple-haze-950" />
            <span className="text-purple-haze-950 text-sm font-extrabold leading-none mt-1">
              {currentShot}/{totalShots}
            </span>
          </button>
        </div>
      )}

      {/* v4.3.9: Footer — tampil di booth fullscreen mode juga.
          Multi-phrase dengan style berbeda, fit 9:16 vertical. */}
      {fullscreenBooth && (
        <footer className="absolute bottom-0 left-0 right-0 h-10 px-2 flex items-center justify-center gap-1.5 bg-black/40 flex-wrap z-20">
          <span className="text-[10px] text-silver-600">© 2026 ·</span>
          <span className="text-[10px] text-silver-500">Made by</span>
          <span className="text-[10px] text-gold-400 font-semibold">Fajrianor</span>
          <span className="text-[10px] text-silver-600">-</span>
          <span className="text-[10px] text-purple-haze-300 font-medium">ARAY: Are You Ready? and....Yapping!</span>
          <span className="text-[10px] text-silver-600">-</span>
          <span className="text-[10px] text-silver-400">Pusat Humas dan Keterbukaan Informasi</span>
          <span className="text-[10px] text-silver-600">·</span>
          <span className="text-[10px] text-silver-300">UIN Antasari Banjarmasin</span>
        </footer>
      )}
    </div>
  )
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
