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
  Maximize2,
  SwitchCamera,
  FlipHorizontal,
  KeyRound
} from 'lucide-react'

// v4.7.42: Helper untuk akses Camera2Native plugin (USB capture card support)
async function getCamera2Native(): Promise<any> {
  if (typeof window === 'undefined' || !(window as any).aray?.isAndroid) return null
  try {
    // Dynamic import — @capacitor/core only available in Android build
    const mod = await (Function('return import("@capacitor/core")')() as Promise<any>)
    return mod.registerPlugin('Camera2Native')
  } catch { return null }
}

import { ArayButton, ArayBadge, ArayLogo } from '../components/ui'
import { useEventStore } from '../stores/events'
import { useMediaStore } from '../stores/media'
import { useSettingsStore } from '../stores/settings'
import { TEMPLATES, compositeTemplate, getCustomTemplates, compositeCustomTemplate } from '../services/templates'
import { VIDEO_TEMPLATES, drawMotionFrame } from '../services/video-templates'
import { PalmTrigger } from '../services/palm-trigger'

// Aspect ratio dimensions helper
const aspectDims: Record<string, { w: number; h: number }> = {
  '16:9': { w: 1280, h: 720 },
  '9:16': { w: 720, h: 1280 },
  '1:1': { w: 1080, h: 1080 },
  '4:3': { w: 1024, h: 768 }
}

// v4.7.7: Photo quality presets — apply scale + JPEG quality
// Estimasi ukuran file per foto (4-shot composite):
//   small:    640×480 max,  q=0.70, ~80KB/foto, ~320KB/composite
//   medium:   1280×720 max, q=0.82, ~250KB/foto, ~1MB/composite
//   high:     1920×1080 max,q=0.92, ~500KB/foto, ~2MB/composite
//   original: native res,   q=0.95, ~1MB/foto, ~4MB/composite
const QUALITY_PRESETS: Record<string, { scale: number; jpegQuality: number; label: string; estPerPhoto: string }> = {
  small:    { scale: 0.5,  jpegQuality: 0.70, label: 'Small (640×480, ~80KB/foto)',  estPerPhoto: '~80KB' },
  medium:   { scale: 0.75, jpegQuality: 0.82, label: 'Medium (1280×720, ~250KB/foto)', estPerPhoto: '~250KB' },
  high:     { scale: 1.0,  jpegQuality: 0.92, label: 'High (1920×1080, ~500KB/foto)', estPerPhoto: '~500KB' },
  original: { scale: 1.0,  jpegQuality: 0.95, label: 'Original (native res, ~1MB/foto)', estPerPhoto: '~1MB' }
}

function getQualityPreset(quality: string | undefined) {
  return QUALITY_PRESETS[quality || 'high'] || QUALITY_PRESETS.high
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
  const [showCameraSelector, setShowCameraSelector] = useState(false)  // v4.7.41: camera device selector
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
  // v4.6.5: mirror initialized from settings (not hardcoded true).
  // Front camera (user) typically wants mirror=true, back camera wants false.
  // User can override at runtime via the mirror toggle in Booth UI; the override
  // is also persisted to settings so it survives app restarts.
  const [mirror, setMirror] = useState<boolean>(
    settings?.camera_mirror ?? (settings?.camera_facing !== 'environment')
  )
  // v4.6.5: helper to toggle mirror + persist ke settings
  const { updateSettings } = useSettingsStore()
  const toggleMirror = useCallback(() => {
    setMirror((prev) => {
      const next = !prev
      updateSettings({ camera_mirror: next })
      return next
    })
  }, [updateSettings])

  // v4.6.5: switchCamera dideklarasikan setelah startCamera/stopCamera (lihat bawah)
  // karena butuh keduanya di scope. Forward declaration via ref:
  const switchCameraRef = useRef<() => Promise<void>>(() => Promise.resolve())

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
  const [queueNumber, setQueueNumber] = useState<string>('...')  // v4.7.30: nomor antrean foto
  const [hidePalmTrigger, setHidePalmTrigger] = useState(false)  // v4.7.34: block palm UI saat video countdown
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
    // v4.7.37 P1: Clear video srcObject + onloadedmetadata handler
    if (videoRef.current) {
      videoRef.current.srcObject = null
      videoRef.current.onloadedmetadata = null
    }
  }, [])

  // v4.7.42: Enumerate cameras — pakai Camera2Native jika Android (support USB)
  const [nativeCameras, setNativeCameras] = useState<any[]>([])
  const [useNativeCamera2, setUseNativeCamera2] = useState(false)

  const enumerateCameras = useCallback(async () => {
    // v4.7.42: Coba Camera2Native dulu (support USB capture card)
    const Camera2Native = await getCamera2Native();
    if (Camera2Native) {
      try {
        const result = await Camera2Native.enumerateCameras()
        const cameras = result.cameras || []
        setNativeCameras(cameras)
        console.log('[ARAY] Camera2Native cameras:', cameras.length, cameras.map((c:any) => c.label))
        // Jika ada USB/external camera, tampilkan juga di videoDevices
        const mapped = cameras.map((c:any) => ({
          deviceId: c.id,
          label: c.label,
          kind: 'videoinput' as MediaDeviceKind
        }))
        setVideoDevices(mapped)
        return mapped
      } catch (e) {
        console.warn('[ARAY] Camera2Native enumerate failed, fallback to getUserMedia:', e)
      }
    }
    // Fallback: getUserMedia enumerate
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoInputs = devices.filter(d => d.kind === 'videoinput')
      setVideoDevices(videoInputs)
      console.log('[ARAY] getUserMedia cameras:', videoInputs.length)
      return videoInputs
    } catch (e) {
      console.error('[ARAY] enumerateDevices failed:', e)
      return []
    }
  }, [])

  const startCamera = useCallback(async () => {
    try {
      setError(null)
      // v4.7.22: Stop existing stream dulu (kalau ada yang zombie)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      // v4.6.5: pakai setting camera_facing ('user' atau 'environment').
      // Default 'user' (front) untuk kompatibilitas dengan versi sebelumnya.
      const facingMode = settings?.camera_facing ?? 'user'
      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: facingMode
        },
        audio: false
      }
      // v4.7.41: Jika user pilih device spesifik, override facingMode dengan deviceId
      if (selectedDeviceId) {
        constraints.video = { deviceId: { exact: selectedDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
      }
      // v4.7.41: Jika settings.camera_device_id set (dari Settings), pakai itu
      if (settings?.camera_device_id) {
        constraints.video = { deviceId: { exact: settings.camera_device_id }, width: { ideal: 1280 }, height: { ideal: 720 } }
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        // v4.7.22: Wait for loadedmetadata sebelum play — prevent black screen
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(() => {})
        }
        // Fallback: try play after 200ms
        setTimeout(() => { videoRef.current?.play().catch(() => {}) }, 200)
      }
      return true
    } catch (e: any) {
      console.error('[Booth] Camera error:', e)
      // v4.7.37 P1: Specific error messages
      if (e?.name === 'NotAllowedError') {
        setError('Izin kamera ditolak. Buka Settings → Apps → ARAY → Permissions → Camera → Allow.')
      } else if (e?.name === 'NotReadableError') {
        setError('Kamera sedang dipakai app lain. Tutup app lain dan retry.')
      } else if (e?.name === 'NotFoundError') {
        setError('Kamera tidak ditemukan. Pastikan kamera terhubung.')
      } else if (e?.name === 'OverconstrainedError') {
        setError('Constraint kamera tidak match. Coba ganti kamera di Settings.')
      } else {
        setError(e?.message ?? 'Camera failed to start')
      }
      setPhase('error')
      return false
    }
  }, [settings?.camera_facing, selectedDeviceId])

  // v4.6.5: switch antara front ('user') dan back ('environment') camera.
  // Restart camera stream supaya constraint facingMode baru diterapkan.
  // v4.7.40: Guard untuk prevent double switchCamera
  const switchingRef = useRef(false)
  const switchCamera = useCallback(async () => {
    if (switchingRef.current) return  // v4.7.40: block double-tap
    switchingRef.current = true

    try {
      const current = settings?.camera_facing ?? 'user'
      const next = current === 'user' ? 'environment' : 'user'
      await updateSettings({
        camera_facing: next,
        camera_mirror: next === 'user'
      })
      setMirror(next === 'user')
      // v4.7.40: Stop palm trigger dulu — prevent freeze dari MediaPipe
      if (palmTriggerRef.current) {
        palmTriggerRef.current.dispose?.()
        palmTriggerRef.current = null
      }
      setPalmTriggerActive(false)
      setPalmState('none')
      // Stop camera + clear video element
      stopCamera()
      // v4.7.40: Tunggu 300ms (bukan 150ms) supaya stream benar-benar release
      await new Promise(resolve => setTimeout(resolve, 300))
      // Start camera dengan facingMode baru
      await startCamera()
    } finally {
      switchingRef.current = false
    }
  }, [settings?.camera_facing, updateSettings, stopCamera, startCamera])

  // Assign ke ref supaya tombol di top bar bisa panggil sebelum deklarasi literal
  switchCameraRef.current = switchCamera

  const captureFrame = useCallback((): { full: string; thumb: string } | null => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return null
    if (video.videoWidth === 0 || video.videoHeight === 0) return null

    const dims = aspectDims[currentAspectRatio] || aspectDims['9:16']
    // v4.7.7: Apply photo_quality scale
    const qualityPreset = getQualityPreset(settings?.photo_quality)
    const w = Math.round(dims.w * qualityPreset.scale)
    const h = Math.round(dims.h * qualityPreset.scale)
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
      // Video wider than canvas - crop sides
      sw = vh * canvasRatio
      sx = (vw - sw) / 2
    } else {
      // Video taller than canvas - crop top/bottom
      sh = vw / canvasRatio
      sy = (vh - sh) / 2
    }
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.filter = 'none'

    // v4.7.7: Use quality preset JPEG quality
    const full = canvas.toDataURL('image/jpeg', qualityPreset.jpegQuality)

    // Thumbnail - always small (320px) regardless of quality preset
    const tc = document.createElement('canvas')
    const thumbW = 320
    const thumbH = Math.round(320 * dims.h / dims.w)
    tc.width = thumbW; tc.height = thumbH
    const tctx = tc.getContext('2d')
    if (!tctx) return { full, thumb: full }
    if (activeFilter.canvasFilter !== 'none') tctx.filter = activeFilter.canvasFilter
    if (mirror) { tctx.translate(thumbW, 0); tctx.scale(-1, 1) }
    tctx.drawImage(video, sx, sy, sw, sh, 0, 0, thumbW, thumbH)
    tctx.setTransform(1, 0, 0, 1, 0, 0)
    const thumb = tc.toDataURL('image/jpeg', 0.8)
    return { full, thumb }
  }, [mirror, activeFilter, currentAspectRatio, settings?.photo_quality])

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

    // v4.7.13: Flash effect sudah di-set di runCountdown (sebelum phase=flash)
    // supaya sync dengan "YAP!" text. Tidak perlu set lagi di sini.

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
        // v4.7.37 P1: Cek stream masih active — stop recording jika camera mati
        if (!streamRef.current || !streamRef.current.active) {
          console.warn('[Booth] Camera stream died during recording — stopping')
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop()
          }
          setError('Kamera terputus saat merekam. Silakan retry.')
          setPhase('error')
          return
        }
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
      // v4.7.37 P1: Handle recorder errors
      recorder.onerror = (e: any) => {
        console.error('[Booth] MediaRecorder error:', e)
        setError('Video recorder error. Silakan retry.')
        setPhase('error')
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
              const videoMedia = saveResult.data as ArayMedia
              addMedia(videoMedia)
              // v4.7.31: Set compositeMediaId untuk video juga — supaya queueNumber tampil
              setCompositeMediaId(videoMedia.id)
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
  const compositingRef = useRef(false)  // v4.7.27: prevent double-composite
  const runComposite = useCallback(async () => {
    if (compositingRef.current) {
      console.log('[Booth] runComposite BLOCKED — already compositing')
      return
    }
    compositingRef.current = true
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
        } else {
          // v4.6.8 P0#3: Surface save failure ke user — sebelumnya silent fail
          // yang bisa bikin operator pikir sukses padahal file tidak tersimpan
          // (disk penuh, path invalid, I/O error). Untuk acara 5000 peserta, ini
          // show-stopper karena data loss silent.
          console.error('[Booth] saveComposite FAILED:', saveResult.error)
          setError(`Gagal menyimpan foto: ${saveResult.error?.message || saveResult.error || 'Unknown error'}. Cek storage tersedia.`)
          setPhase('error')
        }
      }
    } catch (e: any) {
      console.error('[Booth] Composite failed:', e)
      // v4.6.8 P0#3: Surface composite exception ke user juga
      setError(`Composite gagal: ${e?.message || e}. Silakan retry.`)
      setPhase('error')
    } finally {
      setCompositing(false)
      compositingRef.current = false
    }
  }, [capturedShots, settings?.selected_template_id, activeEvent, addMedia])

  // Auto-composite when entering result phase (photo mode only)
  // v4.7.27: Check compositing + compositingRef to prevent double-execution
  useEffect(() => {
    if (phase === 'result' && mode === 'photo' && capturedShots.length > 0 && !compositeUrl && !compositing && !compositingRef.current) {
      runComposite()
    }
  }, [phase, mode, capturedShots, compositeUrl, compositing, runComposite])

  // v4.7.30: Fetch queue number saat composite berhasil disimpan
  useEffect(() => {
    if (compositeMediaId && activeEvent) {
      window.aray.media.stats(activeEvent.id).then((result: any) => {
        if (result?.success) {
          const total = (result.data as any).total || 0
          setQueueNumber(String(total).padStart(3, '0'))
        }
      })
    } else {
      setQueueNumber('...')
    }
  }, [compositeMediaId, activeEvent])

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
      // v4.7.32: Kembali ke setPhase('preview') — TIDAK pakai flash untuk video.
      // Palm trigger glitch di-fix dengan isRecording check di palm trigger effect.
      setPhase('preview')
      await sleep(100)
      startRecording()  // startRecording akan set isRecording=true
      return
    }

    const shotToCapture = retakeShotNumber ?? currentShot
    // v4.7.22: Set phase='countdown' di sini juga (bukan hanya di caller)
    // supaya countdown pasti muncul bahkan kalau caller lupa set phase
    setPhase('countdown')
    for (let i = countdownSeconds; i > 0; i--) {
      setCountdown(i)
      await sleep(1000)
    }
    // v4.7.26: Capture frame DULU (synchronous), LALU flash + YAP! bersamaan.
    
    // 1. Capture frame dari video (synchronous, instant)
    const frames = captureFrame()
    if (!frames) {
      setError('Failed to capture frame. Camera may not be ready.')
      setPhase('error')
      return
    }
    
    // 2. Flash + YAP! muncul BERSAMAAN dengan moment capture
    setPhase('flash')
    setLastFlash(true)
    
    // 3. Simpan frame ke MEMORY saja (tidak save ke disk).
    // Composite (dengan template) akan di-save ke disk di result phase.
    // v4.7.26: JANGAN saveCapturedFrame — itu bikin 2 foto (raw + composite).
    // Hanya composite yang disimpan ke disk.
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
        const existing = prev.find((s) => s.shotNumber === shotNum)
        if (existing) {
          return prev.map((s) => s.shotNumber === shotNum ? { ...s, dataUrl: frames.full, mediaId: '' } : s)
        }
        return [...prev, { shotNumber: shotNum, mediaId: '', dataUrl: frames.full }]
      })
    } catch (e: any) {
      console.error('[Booth] Capture failed:', e)
    }
    
    // 4. Flash off + tunggu sebentar sebelum next phase
    setLastFlash(false)
    await sleep(300)

    // v4.6.2: If retaking, go back to result. Otherwise continue sequence.
    if (retakeShotNumber) {
      setRetakeShotNumber(null)
      setPhase('result')
    } else if (currentShot < totalShots) {
      setCurrentShot((n) => n + 1)
      // v4.7.38: Reset hidePalmTrigger untuk foto kedua — palm trigger UI harus muncul lagi
      setHidePalmTrigger(false)
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

  // v4.7.37 P0: Comprehensive cleanup on unmount — camera + recording + palm trigger
  useEffect(() => {
    return () => {
      // Stop camera
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null
        videoRef.current.onloadedmetadata = null
      }
      // Stop recording (prevent leak: MediaRecorder + timer + raf + canvas)
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      mediaRecorderRef.current = null
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
      if (recordTimeoutRef.current) clearTimeout(recordTimeoutRef.current)
      if (rafRecordRef.current) cancelAnimationFrame(rafRecordRef.current)
      canvasRecordRef.current = null
      // Stop palm trigger
      if (palmTriggerRef.current) {
        palmTriggerRef.current.dispose?.()
        palmTriggerRef.current = null
      }
    }
  }, [])

  // Auto-start camera on greeting screen for live background
  useEffect(() => {
    if (phase === 'greeting' && !streamRef.current) {
      startCamera()
      enumerateCameras()  // v4.7.41: list cameras saat greeting
      // v4.6.8: Trigger event session lock — grace period 72 jam aktif
      ;(window as any).aray?.license?.startEventSession?.()
      // v4.7.13: Preload PalmTrigger MediaPipe scripts saat greeting (bukan saat preview)
      // Supaya saat user masuk preview, palm trigger langsung siap tanpa delay loading
      if (settings?.palm_trigger && !palmTriggerRef.current) {
        import('../services/palm-trigger').then(({ PalmTrigger }) => {
          if (!palmTriggerRef.current && phase === 'greeting') {
            palmTriggerRef.current = new PalmTrigger()
            // Preload scripts + model (tidak start detection, cuma load assets)
            palmTriggerRef.current.preload?.()
            console.log('[Booth] PalmTrigger preloaded during greeting')
          }
        }).catch(() => {})
      }
    }
  }, [phase, startCamera, settings?.palm_trigger])

  // v4.6.8 P2#9: Auto-recover camera saat app resume dari background.
  // Android WebView pause camera saat app background. Saat resume, stream mati
  // tapi streamRef masih reference stream lama → video.play() fail.
  // Fix: dengar visibilitychange, kalau visible lagi dan stream mati → restart.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Cek apakah stream masih aktif
        if (streamRef.current) {
          const tracks = streamRef.current.getTracks()
          const live = tracks.length > 0 && tracks.every(t => t.readyState === 'live')
          if (!live) {
            // v4.7.37 P1: Jika sedang recording, stop recording dulu
            if (isRecording) {
              console.warn('[Booth] Camera died during recording — stopping recording')
              if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop()
              }
              setIsRecording(false)
              setError('Kamera terputus saat merekam. Silakan retry.')
              setPhase('error')
              return
            }
            console.log('[Booth] Camera stream dead after resume — restarting')
            stopCamera()
            setTimeout(() => { startCamera() }, 200)
          }
        } else if (phase === 'greeting' || phase === 'preview') {
          console.log('[Booth] No stream after resume — starting camera')
          startCamera()
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [phase, startCamera, stopCamera])

  // Palm trigger v3: MediaPipe Hands (Saatiril-Andro port)
  // Flow: hand appear → 500ms sustain → "confirmed" → hand leaves → START TIMER
  // v4.3.7: Palm trigger aktif di BOTH photo dan video mode (sebelumnya photo only)
  useEffect(() => {
    // v4.5.4: Don't activate palm trigger during recording — prevent re-trigger
    // v4.7.29: Return early if not preview — but cleanup runs for ALL phase changes
    if (phase !== 'preview' || !settings?.palm_trigger || isRecording) {
      // v4.7.29: Force cleanup if palm trigger still active when leaving preview
      if (palmTriggerRef.current) {
        palmTriggerRef.current.dispose?.()
        palmTriggerRef.current = null
      }
      setPalmTriggerActive(false)
      setPalmState('none')
      return
    }

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    const startPalmTrigger = async () => {
      if (cancelled) return
      // v4.7.32: Cek isRecording lagi — mungkin berubah selama await
      if (isRecording) return
      const video = videoRef.current
      if (!video) {
        retryTimer = setTimeout(startPalmTrigger, 200)
        return
      }
      if (video.videoWidth === 0 || video.readyState < 2) {
        retryTimer = setTimeout(startPalmTrigger, 200)
        return
      }

      // v4.7.32: Cek isRecording sekali lagi sebelum buat PalmTrigger
      if (isRecording || cancelled) return

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
          // v4.7.36: Set hidePalmTrigger=true — prevent palm trigger re-activate
          // setelah countdown selesai (glitch sebelum recording dimulai)
          setHidePalmTrigger(true)
          setPalmState('triggered')
          setPalmTriggerActive(false)
          // Dispose palm trigger NOW — stop detection immediately
          if (palmTriggerRef.current) {
            palmTriggerRef.current.dispose?.()
            palmTriggerRef.current = null
          }
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
        // v4.6.8 P0#2: dispose() untuk release MediaPipe WASM model + WebGL context.
        // Sebelumnya hanya stop() yang cancel rAF tapi model tetap loaded → memory leak
        // kumulatif → OOM di Android setelah 30-100 sesi. Untuk 5000 peserta, WAJIB dispose.
        palmTriggerRef.current.dispose?.()
        palmTriggerRef.current = null
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
            // v4.7.20: Untuk rasio landscape (16:9, 4:3) di screen portrait,
            // width harus 100% dan height auto — supaya aspectRatio berlaku.
            // Untuk rasio portrait (9:16) dan square (1:1), height 100dvh dan width auto.
            width: (currentAspectRatio === '16:9' || currentAspectRatio === '4:3') ? '100%' : 'auto',
            height: (currentAspectRatio === '16:9' || currentAspectRatio === '4:3') ? 'auto' : '100dvh'
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
            {/* v4.6.5: Quick camera controls — switch front/back + mirror toggle */}
            <button
              onClick={() => switchCameraRef.current()}
              title={`Switch to ${settings?.camera_facing === 'user' ? 'back' : 'front'} camera`}
              className="ml-1 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/40 hover:bg-purple-haze-500/30 border border-silver-300/20 flex items-center justify-center transition-all min-h-[44px]"
            >
              <SwitchCamera className="w-4 h-4 text-silver-200" />
            </button>
            {/* v4.7.41: Camera device selector — list semua kamera termasuk USB */}
            <button
              onClick={async () => {
                await enumerateCameras()
                setShowCameraSelector(!showCameraSelector)
              }}
              title="Pilih kamera"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/40 hover:bg-purple-haze-500/30 border border-silver-300/20 flex items-center justify-center transition-all min-h-[44px]"
            >
              <Camera className="w-4 h-4 text-silver-200" />
            </button>
            <button
              onClick={toggleMirror}
              title={mirror ? 'Mirror: ON (tap to disable)' : 'Mirror: OFF (tap to enable)'}
              className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full border flex items-center justify-center transition-all min-h-[44px] ${
                mirror
                  ? 'bg-purple-haze-500/40 border-purple-haze-400/50 text-purple-haze-100'
                  : 'bg-black/40 hover:bg-silver-200/10 border-silver-300/20 text-silver-400'
              }`}
            >
              <FlipHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* v4.7.41: Camera device selector dropdown */}
      {showCameraSelector && phase === 'preview' && !fullscreenBooth && (
        <div className="absolute top-20 right-3 z-50 bg-surface-raised border border-silver-300/15 rounded-xl shadow-card p-2 max-w-[280px]">
          <div className="text-xs text-silver-500 px-2 py-1 mb-1">Pilih Kamera:</div>
          {videoDevices.length === 0 ? (
            <div className="text-xs text-silver-400 px-2 py-2">Tidak ada kamera ditemukan</div>
          ) : (
            videoDevices.map((device, idx) => {
              // v4.7.42: Cek apakah kamera ini adalah USB/external (dari Camera2Native)
              const nativeCam = nativeCameras.find((c:any) => c.id === device.deviceId)
              const isUSB = nativeCam?.isExternal
              return (
                <button
                  key={device.deviceId || idx}
                  onClick={async () => {
                    // v4.7.42: Jika USB camera, pakai Camera2Native
                    const cam2 = await getCamera2Native();
                    if (isUSB && cam2) {
                      setUseNativeCamera2(true)
                      // Stop getUserMedia camera
                      stopCamera()
                      await new Promise(r => setTimeout(r, 200))
                      // Open via Camera2Native
                      await cam2.openCamera({ cameraId: device.deviceId })
                      console.log('[ARAY] Opened USB camera via Camera2Native:', device.label)
                    } else {
                      // Built-in camera: pakai getUserMedia
                      setUseNativeCamera2(false)
                      const cam2b = await getCamera2Native();
                      if (cam2b) { try { await cam2b.closeCamera() } catch(e) {} }
                      setSelectedDeviceId(device.deviceId)
                      await updateSettings({ camera_device_id: device.deviceId })
                      stopCamera()
                      await new Promise(r => setTimeout(r, 200))
                      await startCamera()
                    }
                    setShowCameraSelector(false)
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${
                    selectedDeviceId === device.deviceId || settings?.camera_device_id === device.deviceId
                      ? 'bg-purple-haze-500/20 text-purple-haze-100'
                      : 'text-silver-300 hover:bg-silver-200/5'
                  }`}
                >
                  {device.label || `Kamera ${idx + 1}`}
                  {isUSB && <span className="text-gold-400 ml-1">USB</span>}
                </button>
              )
            })
          )}
          <button
            onClick={async () => {
              setSelectedDeviceId(null)
              await updateSettings({ camera_device_id: null })
              setShowCameraSelector(false)
              stopCamera()
              await new Promise(r => setTimeout(r, 200))
              await startCamera()
            }}
            className="w-full text-left px-3 py-2 rounded-lg text-xs text-silver-500 hover:bg-silver-200/5 mt-1 border-t border-silver-300/10 pt-2"
          >
            Auto (Front/Back)
          </button>
          <button
            onClick={() => setShowCameraSelector(false)}
            className="w-full text-center px-3 py-1.5 text-xs text-silver-600 hover:text-silver-400 mt-1"
          >
            Tutup
          </button>
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
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center" style={{ animation: 'fadeIn 0.2s ease-out' }}>
            {/* v4.7.13: Simplified overlay — lighter for Android WebView performance */}
            <div className="absolute inset-0 bg-surface-base/70" />
            <div className="relative z-10 text-center">
              <ArayLogo size="md" className="mb-6" />
              <p className="text-silver-300 text-lg italic mb-6">Let's make a memory.</p>

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
                  setHidePalmTrigger(false)
                  setPhase('preview')
                }}
                className="text-lg px-12 py-4"
              >
                LET'S YAP!
              </ArayButton>
            </div>
        </div>
      )}

      {phase === 'preview' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-end pb-12">
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
            {phase === 'preview' && !isRecording && !hidePalmTrigger && palmTriggerActive && (palmStatus === 'loading_scripts' || palmStatus === 'loading_model') && (
              <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1.5">
                <RefreshCw className="w-3 h-3 animate-spin text-purple-haze-200" />
                <span className="text-purple-haze-100 text-xs">
                  Loading...
                </span>
              </div>
            )}

            {/* Error state — kecil di pojok */}
            {phase === 'preview' && !isRecording && !hidePalmTrigger && palmTriggerActive && palmStatus === 'error' && (
              <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 bg-red-500/20 border border-red-500/40 rounded-full px-3 py-1.5">
                <AlertTriangle className="w-3 h-3 text-red-300" />
                <span className="text-red-100 text-xs">Palm error</span>
              </div>
            )}

            {/* CONFIRMED state: big "SIAP" overlay — pull hand away to trigger */}
            {phase === 'preview' && !isRecording && !hidePalmTrigger && palmTriggerActive && palmState === 'confirmed' && (
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
            {phase === 'preview' && !isRecording && !hidePalmTrigger && palmTriggerActive && (palmState === 'none' || palmState === 'searching' || palmState === 'hand_detected') &&
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

            {/* v4.7.13: Hapus "Ready" text — tidak perlu, preview sudah jelas.
                Sebelumnya muncul dengan latar gelap yang terlihat seperti glitch. */}

            {mode === 'video' ? (
              isRecording ? (
                null
              ) : (
                <button
                  onClick={() => {
                    // v4.7.34: Set hidePalmTrigger SEBELUM countdown — prevent glitch
                    setHidePalmTrigger(true)
                    if (palmTriggerRef.current) {
                      palmTriggerRef.current.dispose?.()
                      palmTriggerRef.current = null
                    }
                    setPalmTriggerActive(false)
                    setPalmState('none')
                    setPhase('countdown')
                    runCountdown()
                  }}
                  className="w-24 h-24 rounded-full border-4 transition-transform hover:scale-105 flex items-center justify-center bg-gradient-to-br from-gold-300 to-gold-500 border-white/80 shadow-glow-gold"
                >
                  <Video className="w-10 h-10 text-purple-haze-950" />
                </button>
              )
            ) : null}
        </div>
      )}

      {phase === 'countdown' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <div className="text-[200px] font-extrabold aray-gradient-text" style={{ textShadow: '0 0 60px rgba(123, 97, 168, 0.6)' }}>
              {countdown}
            </div>
        </div>
      )}

      {phase === 'flash' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          {/* v4.7.28: YAP! dengan animasi zoom — CSS animation, tidak pakai framer-motion */}
          <div
            className="text-7xl xs:text-8xl font-extrabold aray-gradient-text"
            style={{
              textShadow: '0 0 80px rgba(212, 175, 55, 0.8)',
              animation: 'yapZoom 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards'
            }}
          >
            YAP!
          </div>
        </div>
      )}

      {phase === 'result' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gradient-to-br from-purple-haze-950 via-surface-base to-purple-haze-900 p-8 overflow-auto">
            <div className="text-center mb-6">
              <h1 className="text-3xl xs:text-4xl sm:text-5xl font-extrabold mb-2 aray-gradient-text">
                LOOK AT YOU!
              </h1>
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
              {/* v4.7.30: Hapus tombol Retake — user bisa retake via klik foto di atas.
                  Ganti dengan nomor antrean foto untuk kemudahan cari di Google Drive.
                  v4.7.31: Perkecil badge supaya muat di semua rasio (16:9, 4:3, dll). */}
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-haze-500/15 border border-purple-haze-500/30">
                <KeyRound className="w-3.5 h-3.5 text-gold-400 shrink-0" />
                <span className="text-xs text-silver-200 whitespace-nowrap">
                  Antrean ke: <span className="text-gold-300 font-bold text-sm">{queueNumber}</span>
                </span>
              </div>
              <ArayButton
                variant="gold"
                icon={<Sparkles className="w-4 h-4" />}
                onClick={() => {
                  // v4.7.37 P1: Reset ALL state — prevent artifact di sesi baru
                  cleanupAllRecording()
                  setCapturedShots([])
                  setCurrentShot(1)
                  setCompositeUrl(null)
                  setCompositeMediaId(null)
                  setRetakeShotNumber(null)
                  setCountdown(0)
                  setLastFlash(false)
                  setError(null)
                  setPalmState('none')
                  setPalmStatus('unloaded')
                  setPalmError(null)
                  setPalmProgress(0)
                  setQrDataUrl(null)
                  setShowQrModal(false)
                  setShowPasswordModal(false)
                  setPasswordInput('')
                  setPasswordError(false)
                  setHidePalmTrigger(false)
                  ;(window as any).__aray_current_session_id = undefined
                  setPhase('greeting')
                }}
              >
                Done
              </ArayButton>
            </div>
        </div>
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
              // v4.7.34: Set hidePalmTrigger SEBELUM countdown
              setHidePalmTrigger(true)
              if (palmTriggerRef.current) {
                palmTriggerRef.current.dispose?.()
                palmTriggerRef.current = null
              }
              setPalmTriggerActive(false)
              setPalmState('none')
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
