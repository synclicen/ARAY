import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Folder, Camera, Printer, Cloud, PartyPopper, ArrowRight, ArrowLeft, Check } from 'lucide-react'
import { ArayLogo, ArayButton, ArayCard, ArayBadge } from '../components/ui'
import { useSettingsStore } from '../stores/settings'

const steps = [
  { id: 0, label: 'Welcome', icon: PartyPopper },
  { id: 1, label: 'Storage', icon: Folder },
  { id: 2, label: 'Camera', icon: Camera },
  { id: 3, label: 'Printer', icon: Printer },
  { id: 4, label: 'Google Drive', icon: Cloud, optional: true },
  { id: 5, label: 'Finish', icon: Check }
]

export function FirstRunPage() {
  const [step, setStep] = useState(0)
  const navigate = useNavigate()
  const { settings, setStoragePath, updateSettings } = useSettingsStore()

  const next = () => setStep((s) => Math.min(steps.length - 1, s + 1))
  const prev = () => setStep((s) => Math.max(0, s - 1))

  const finish = async () => {
    await updateSettings({ first_run_completed: true })
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-purple-haze-950 via-surface-base to-purple-haze-900 flex items-center justify-center p-8 overflow-auto">
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 30%, rgba(123,97,168,0.35) 0%, transparent 45%), radial-gradient(circle at 80% 70%, rgba(212,175,55,0.18) 0%, transparent 40%)'
        }}
      />
      <div className="relative z-10 w-full max-w-4xl">
        <div className="flex justify-center mb-10">
          <ArayLogo size="lg" animated />
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {steps.map((s, i) => {
            const Icon = s.icon
            const isActive = step === i
            const isDone = step > i
            return (
              <div key={s.id} className="flex items-center">
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-purple-haze-500/30 text-purple-haze-100 border border-purple-haze-500/40'
                      : isDone
                        ? 'bg-green-500/15 text-green-300'
                        : 'bg-silver-200/5 text-silver-500'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">{s.label}</span>
                  {s.optional && (
                    <span className="text-[10px] text-gold-400 ml-1">opt</span>
                  )}
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={`w-6 h-px mx-1 ${isDone ? 'bg-green-500/40' : 'bg-silver-300/15'}`}
                  />
                )}
              </div>
            )
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.25 }}
          >
            <ArayCard className="p-8 min-h-[320px]">
              {step === 0 && <WelcomeStep />}
              {step === 1 && (
                <StorageStep
                  currentPath={settings?.storage_path ?? ''}
                  onChoose={setStoragePath}
                />
              )}
              {step === 2 && <CameraStep />}
              {step === 3 && <PrinterStep />}
              {step === 4 && <GoogleDriveStep />}
              {step === 5 && <FinishStep />}
            </ArayCard>
          </motion.div>
        </AnimatePresence>

        {/* Nav */}
        <div className="flex items-center justify-between mt-6">
          <ArayButton variant="ghost" onClick={prev} disabled={step === 0} icon={<ArrowLeft className="w-4 h-4" />}>
            Back
          </ArayButton>
          {step < steps.length - 1 ? (
            <div className="flex items-center gap-3">
              {steps[step].optional && (
                <ArayButton variant="ghost" onClick={next}>
                  Skip for now
                </ArayButton>
              )}
              <ArayButton variant="gold" onClick={next} icon={<ArrowRight className="w-4 h-4" />}>
                Continue
              </ArayButton>
            </div>
          ) : (
            <ArayButton variant="gold" onClick={finish} icon={<PartyPopper className="w-4 h-4" />}>
              Let's Yap!
            </ArayButton>
          )}
        </div>
      </div>
    </div>
  )
}

function WelcomeStep() {
  return (
    <div className="text-center">
      <h1 className="text-3xl font-bold mb-3 aray-gradient-text">Welcome to ARAY</h1>
      <p className="text-silver-300 text-lg italic mb-6">Are you Ready? and....Yapping!</p>
      <p className="text-silver-400 leading-relaxed max-w-xl mx-auto">
        ARAY is your premium photo booth companion. Capture memories, apply signature filters,
        print instantly, and sync to Google Drive — all while keeping every file safely on your
        local drive first. Let's get you set up in a few quick steps.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
        <ArayBadge variant="purple">Local-first</ArayBadge>
        <ArayBadge variant="gold">Premium</ArayBadge>
        <ArayBadge variant="silver">Event-ready</ArayBadge>
      </div>
    </div>
  )
}

function StorageStep({
  currentPath,
  onChoose
}: {
  currentPath: string
  onChoose: (path: string) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const choose = async () => {
    setBusy(true)
    try {
      const result = await window.aray.storage.chooseFolder()
      if (result.success && !result.data.canceled && result.data.path) {
        await onChoose(result.data.path)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Where should ARAY save your memories?</h2>
      <p className="text-silver-400 mb-6">
        Pick a folder on a drive with plenty of space. We recommend a dedicated drive like{' '}
        <code className="text-gold-300">D:\ARAY</code>.
      </p>
      <div className="bg-purple-haze-950/40 border border-purple-haze-500/20 rounded-xl p-5 mb-4">
        <div className="text-xs text-silver-500 uppercase tracking-wide mb-1">Current path</div>
        <div className="font-mono text-purple-haze-100 text-lg break-all">
          {currentPath || 'Not set yet'}
        </div>
      </div>
      <ArayButton variant="primary" onClick={choose} loading={busy} icon={<Folder className="w-4 h-4" />}>
        Choose folder
      </ArayButton>
      <p className="text-xs text-silver-500 mt-4">
        ARAY creates <code>Events/</code>, <code>Templates/</code>, <code>Backgrounds/</code>, and{' '}
        <code>Exports/</code> subfolders automatically.
      </p>
    </div>
  )
}

function CameraStep() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Connect a camera</h2>
      <p className="text-silver-400 mb-6">
        ARAY uses your default webcam for live preview and capture. DSLR support (Canon, Nikon,
        Sony) arrives in a later phase.
      </p>
      <div className="bg-purple-haze-950/40 border border-purple-haze-500/20 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-sm font-medium text-green-300">Default Webcam Ready</span>
        </div>
        <p className="text-xs text-silver-500">
          Camera enumeration happens automatically when you open the Booth. If a camera
          disconnects, ARAY will pause gracefully and resume when reconnected.
        </p>
      </div>
    </div>
  )
}

function PrinterStep() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Configure your printer</h2>
      <p className="text-silver-400 mb-6">
        ARAY supports any Windows printer. Pick one later in Settings → Printer, or skip for now.
      </p>
      <div className="bg-purple-haze-950/40 border border-purple-haze-500/20 rounded-xl p-5">
        <div className="text-sm text-silver-300">
          <strong className="text-gold-300">Auto-print</strong> can be enabled per-event. When on,
          every captured photo is sent to the print queue automatically after the operator confirms.
        </div>
      </div>
    </div>
  )
}

function GoogleDriveStep() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Connect Google Drive</h2>
      <ArayBadge variant="gold" className="mb-4">Optional</ArayBadge>
      <p className="text-silver-400 mb-6">
        Sync memories to Google Drive in the background. ARAY uses OAuth 2.0 — you never enter your
        password in the app. Files always save locally first, then sync to the cloud.
      </p>
      <div className="bg-purple-haze-950/40 border border-purple-haze-500/20 rounded-xl p-5">
        <div className="text-sm text-silver-300">
          Google Drive integration ships in <strong className="text-gold-300">Phase 3</strong>. For
          now, ARAY runs in local-only mode — every capture is safe on your drive.
        </div>
      </div>
    </div>
  )
}

function FinishStep() {
  return (
    <div className="text-center">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="w-20 h-20 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center mx-auto mb-6 shadow-glow-gold"
      >
        <Check className="w-10 h-10 text-purple-haze-950" strokeWidth={3} />
      </motion.div>
      <h2 className="text-3xl font-bold mb-3 aray-gradient-text">You're all set!</h2>
      <p className="text-silver-300 text-lg mb-2">Time to make your first memory.</p>
      <p className="text-silver-500 text-sm italic">"Ready? Smile!"</p>
    </div>
  )
}
