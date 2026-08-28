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
  AlertTriangle
} from 'lucide-react'
import { ArayButton, ArayBadge, ArayLogo } from '../components/ui'
import { useEventStore } from '../stores/events'
import { useMediaStore } from '../stores/media'
import { useSettingsStore } from '../stores/settings'
import type { ArayMedia } from '@shared/types'

type BoothPhase = 'greeting' | 'preview' | 'countdown' | 'flash' | 'review' | 'result' | 'error'

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

  const activeEvent = events.find((e) => e.id === activeEventId) ?? events[0]
  const totalShots = settings?.booth_shot_count ?? 4
  const countdownSeconds = settings?.booth_countdown_seconds ?? 3

  useEffect(() => {
    if (events.length === 0) loadEvents()
  }, [events.length, loadEvents])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  const enumerateCameras = useCallback(async () => {
    try {
      // Request permission first to get device labels
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }).catch(() => null)
      if (tempStream) tempStream.getTracks().forEach((t) => t.stop())

      const devices = await navigator.mediaDevices.enumerateDevices()
      const videos = devices.filter((d) => d.kind === 'videoinput')
      setVideoDevices(videos)
      if (videos.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videos[0].deviceId)
      }
      return videos
    } catch (e: any) {
      console.error('[Booth] Enumerate cameras failed:', e)
      return []
    }
  }, [selectedDeviceId])

  const startCamera = useCallback(async (deviceId?: string) => {
    try {
      setError(null)
      // Stop existing stream first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }

      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
      const useDeviceId = deviceId || selectedDeviceId
      if (useDeviceId) {
        videoConstraints.deviceId = { exact: useDeviceId }
      } else {
        videoConstraints.facingMode = 'user'
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      })
      streamRef.current = stream

      // Attach to video element (always rendered now)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch((e) => console.warn('[Booth] Play failed:', e))
      }

      // Refresh device list after permission granted
      if (videoDevices.length === 0) {
        enumerateCameras()
      }
      return true
    } catch (e: any) {
      console.error('[Booth] Camera error:', e)
      setError(e?.message ?? 'Camera failed to start')
      setPhase('error')
      return false
    }
  }, [selectedDeviceId, videoDevices.length, enumerateCameras])

  const captureFrame = useCallback((): { full: string; thumb: string } | null => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return null

    // Check if video has actual content (not black)
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.warn('[Booth] Video not ready:', video.videoWidth, 'x', video.videoHeight)
      return null
    }

    const w = video.videoWidth
    const h = video.videoHeight
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // Mirror for selfie feel (controlled by user setting)
    if (mirror) {
      ctx.translate(w, 0)
      ctx.scale(-1, 1)
    }
    ctx.drawImage(video, 0, 0, w, h)
    ctx.setTransform(1, 0, 0, 1, 0, 0)

    const full = canvas.toDataURL('image/jpeg', 0.92)

    // Generate thumbnail (320x240) via second canvas
    const thumbCanvas = document.createElement('canvas')
    thumbCanvas.width = 320
    thumbCanvas.height = 240
    const thumbCtx = thumbCanvas.getContext('2d')
    if (!thumbCtx) return { full, thumb: full }
    if (mirror) {
      thumbCtx.translate(320, 0)
      thumbCtx.scale(-1, 1)
    }
    thumbCtx.drawImage(video, 0, 0, 320, 240)
    const thumb = thumbCanvas.toDataURL('image/jpeg', 0.8)

    return { full, thumb }
  }, [mirror])

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
      // Create session lazily on first shot
      let sessionId = (window as any).__aray_current_session_id as string | undefined
      if (!sessionId) {
        const sessionResult = await window.aray.sessions.create(activeEvent.id, 'photo', totalShots)
        if (!sessionResult.success) throw new Error('Failed to create session')
        sessionId = (sessionResult.data as any).id
        ;(window as any).__aray_current_session_id = sessionId
      }

      const fullBase64 = frames.full.split(',')[1]
      const thumbBase64 = frames.thumb.split(',')[1]
      const saveResult = await window.aray.media.saveCapturedFrame({
        event_id: activeEvent.id,
        session_id: sessionId,
        shot_number: currentShot,
        frame_base64: fullBase64,
        thumbnail_base64: thumbBase64,
        mime_type: 'image/jpeg'
      })

      if (!saveResult.success) throw new Error((saveResult as any).error?.message ?? 'Save failed')

      const media = saveResult.data as ArayMedia
      addMedia(media)
      setCapturedShots((prev) => [
        ...prev,
        { shotNumber: currentShot, mediaId: media.id, dataUrl: frames.full }
      ])
    } catch (e: any) {
      setError(e.message)
      setPhase('error')
    }
  }, [activeEvent, captureFrame, currentShot, totalShots, addMedia])

  const runCountdown = useCallback(async () => {
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
  }, [countdownSeconds, performCapture, currentShot, totalShots])

  // Cleanup
  useEffect(() => {
    return () => {
      stopCamera()
      ;(window as any).__aray_current_session_id = undefined
    }
  }, [stopCamera])

  // Attach stream to video element when it becomes available
  // (video element is always rendered now, but this ensures stream attaches
  // even if startCamera was called before video was in DOM)
  useEffect(() => {
    if (streamRef.current && videoRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch((e) => console.warn('[Booth] Video play failed:', e))
    }
  }, [phase])

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

      {/* Camera video — ALWAYS rendered so videoRef is available for startCamera.
          Hidden via CSS when not in booth phases. */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 w-full h-full object-cover ${mirror ? 'scale-x-[-1]' : ''} ${
          phase === 'preview' || phase === 'countdown' || phase === 'flash' ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

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

      {/* Top bar */}
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

      {/* Phases */}
      <AnimatePresence mode="wait">
        {phase === 'greeting' && (
          <motion.div
            key="greeting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gradient-to-br from-purple-haze-950 via-surface-base to-purple-haze-900"
          >
            <div
              className="absolute inset-0 opacity-30 pointer-events-none"
              style={{
                backgroundImage:
                  'radial-gradient(circle at 30% 30%, rgba(123,97,168,0.4) 0%, transparent 50%), radial-gradient(circle at 70% 70%, rgba(212,175,55,0.2) 0%, transparent 45%)'
              }}
            />
            <div className="relative z-10 text-center">
              <ArayLogo size="xl" animated className="mb-8" />
              <h1 className="text-5xl font-bold mb-3 aray-gradient-text">ARE YOU READY?</h1>
              <p className="text-silver-300 text-xl italic mb-6">Let's make a memory.</p>

              {/* Camera device selector */}
              <div className="mb-6 flex items-center justify-center gap-3">
                <div className="flex items-center gap-2 bg-surface-elevated/60 border border-silver-300/20 rounded-xl px-4 py-2">
                  <Camera className="w-4 h-4 text-purple-haze-300" />
                  <select
                    className="bg-transparent text-sm text-silver-100 outline-none cursor-pointer min-w-[180px]"
                    value={selectedDeviceId || ''}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    onClick={() => enumerateCameras()}
                  >
                    <option value="" className="bg-surface-elevated">
                      {videoDevices.length === 0 ? 'Click to detect cameras...' : 'Select camera...'}
                    </option>
                    {videoDevices.map((device, idx) => (
                      <option key={device.deviceId} value={device.deviceId} className="bg-surface-elevated">
                        {device.label || `Camera ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => setMirror(!mirror)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                    mirror
                      ? 'bg-purple-haze-500/20 border-purple-haze-500/40 text-purple-haze-100'
                      : 'bg-silver-200/5 border-silver-300/20 text-silver-400'
                  }`}
                >
                  {mirror ? 'Mirror ON' : 'Mirror OFF'}
                </button>
              </div>

              <ArayButton
                variant="gold"
                size="xl"
                icon={<Sparkles className="w-5 h-5" />}
                onClick={async () => {
                  await enumerateCameras()
                  const ok = await startCamera()
                  if (ok) {
                    setCapturedShots([])
                    setCurrentShot(1)
                    ;(window as any).__aray_current_session_id = undefined
                    setPhase('preview')
                  }
                }}
                className="text-lg px-12 py-4"
              >
                LET'S YAP!
              </ArayButton>
              <p className="text-silver-500 text-xs mt-6">
                {totalShots} shots · {countdownSeconds}s countdown each
              </p>
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
            {/* Shot progress */}
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

            <div className="text-center mb-8">
              <p className="text-silver-200 text-2xl font-semibold mb-1">
                Shot {currentShot} of {totalShots}
              </p>
              <p className="text-silver-400 text-sm italic">Strike a pose. Don't blink.</p>
            </div>

            <ArayButton
              variant="gold"
              size="xl"
              icon={<Camera className="w-6 h-6" />}
              onClick={() => {
                setPhase('countdown')
                runCountdown()
              }}
              className="text-lg px-12 py-4"
            >
              Capture
            </ArayButton>
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
              <ArayButton variant="silver" icon={<Printer className="w-4 h-4" />} onClick={() => window.aray.print.queue(capturedShots[0]?.mediaId ?? '')}>
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
                  stopCamera()
                  navigate('/gallery')
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

      {/* Capture button (visible during preview) */}
      {phase === 'preview' && (
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
