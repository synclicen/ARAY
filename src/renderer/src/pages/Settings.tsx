import { useState } from 'react'
import {
  Folder,
  Save,
  Camera,
  Clock,
  Hash,
  Cloud,
  Shield,
  AlertTriangle,
  HardDrive
} from 'lucide-react'
import { ArayCard, ArayButton, ArayBadge, ArayProgress } from '../components/ui'
import { useSettingsStore } from '../stores/settings'

export function SettingsPage() {
  const { settings, storageInfo, updateSettings, setStoragePath, loadStorageInfo } = useSettingsStore()
  const [busy, setBusy] = useState(false)

  if (!settings) return null

  const chooseFolder = async () => {
    setBusy(true)
    try {
      const result = await window.aray.storage.chooseFolder()
      if (result.success && !result.data.canceled && result.data.path) {
        await setStoragePath(result.data.path)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold mb-1 aray-gradient-text">Settings</h1>
        <p className="text-silver-400 text-sm">
          Configure ARAY your way. <span className="italic">One more?</span>
        </p>
      </div>

      {/* Storage */}
      <ArayCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <HardDrive className="w-5 h-5 text-purple-haze-300" />
          <h3 className="font-semibold">Local Storage</h3>
        </div>
        <div className="bg-purple-haze-950/40 border border-purple-haze-500/20 rounded-xl p-4 mb-4">
          <div className="text-xs text-silver-500 uppercase tracking-wide mb-1">Storage path</div>
          <div className="font-mono text-purple-haze-100 break-all">{settings.storage_path}</div>
        </div>
        {storageInfo && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-silver-300">
                {formatBytes(storageInfo.free_bytes)} free of {formatBytes(storageInfo.total_bytes)}
              </span>
              <ArayBadge variant={storageInfo.critical ? 'danger' : storageInfo.warning ? 'warning' : 'success'}>
                {storageInfo.critical ? 'Critical' : storageInfo.warning ? 'Warning' : 'Healthy'}
              </ArayBadge>
            </div>
            <ArayProgress
              value={storageInfo.used_percent}
              variant={storageInfo.critical ? 'gold' : 'purple'}
            />
          </div>
        )}
        <div className="flex items-center gap-3">
          <ArayButton variant="silver" icon={<Folder className="w-4 h-4" />} onClick={chooseFolder} loading={busy}>
            Change folder
          </ArayButton>
          <ArayButton variant="ghost" onClick={loadStorageInfo}>
            Refresh
          </ArayButton>
        </div>
      </ArayCard>

      {/* Booth */}
      <ArayCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Camera className="w-5 h-5 text-gold-300" />
          <h3 className="font-semibold">Booth Settings</h3>
        </div>

        <div className="space-y-4">
          <SettingRow
            icon={<Hash className="w-4 h-4" />}
            label="Number of shots"
            hint="How many photos per session"
          >
            <select
              className="aray-input max-w-[120px]"
              value={settings.booth_shot_count}
              onChange={(e) => updateSettings({ booth_shot_count: parseInt(e.target.value, 10) })}
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </SettingRow>

          <SettingRow
            icon={<Clock className="w-4 h-4" />}
            label="Countdown seconds"
            hint="Delay before each capture"
          >
            <select
              className="aray-input max-w-[120px]"
              value={settings.booth_countdown_seconds}
              onChange={(e) => updateSettings({ booth_countdown_seconds: parseInt(e.target.value, 10) })}
            >
              {[3, 5, 7, 10].map((n) => (
                <option key={n} value={n}>{n}s</option>
              ))}
            </select>
          </SettingRow>

          <SettingRow
            icon={<Save className="w-4 h-4" />}
            label="Auto-print after capture"
            hint="Send every capture straight to the printer"
          >
            <Toggle value={settings.auto_print} onChange={(v) => updateSettings({ auto_print: v })} />
          </SettingRow>

          <SettingRow
            icon={<Camera className="w-4 h-4" />}
            label="Default camera effect"
            hint="Cinematic filter applied to photos and videos"
          >
            <select
              className="aray-input max-w-[200px]"
              value={settings.camera_effect || 'original'}
              onChange={(e) => updateSettings({ camera_effect: e.target.value })}
            >
              <option value="original">Original</option>
              <option value="purple-haze">Purple Haze</option>
              <option value="vintage">Vintage</option>
              <option value="noir">Noir B&W</option>
              <option value="cool-blue">Cool Blue</option>
              <option value="warm-sunset">Warm Sunset</option>
              <option value="cinematic">Cinematic</option>
              <option value="vintage-film">Vintage Film</option>
              <option value="neon-pulse">Neon Pulse</option>
            </select>
          </SettingRow>

          <SettingRow
            icon={<Camera className="w-4 h-4" />}
            label="Aspect ratio"
            hint="Output dimensions for photos and videos"
          >
            <select
              className="aray-input max-w-[120px]"
              value={settings.aspect_ratio || '9:16'}
              onChange={(e) => updateSettings({ aspect_ratio: e.target.value })}
            >
              <option value="9:16">9:16 (Portrait)</option>
              <option value="1:1">1:1 (Square)</option>
              <option value="4:3">4:3 (Classic)</option>
              <option value="16:9">16:9 (Landscape)</option>
            </select>
          </SettingRow>

          <SettingRow
            icon={<Camera className="w-4 h-4" />}
            label="Video template"
            hint="Motion effect for video booth recordings"
          >
            <select
              className="aray-input max-w-[300px]"
              value={settings.video_template || 'plain'}
              onChange={(e) => updateSettings({ video_template: e.target.value })}
            >
              <option value="plain">Plain — No motion (15s)</option>
              <option value="slowmo">Slow Motion — Dreamy slow zoom (15s)</option>
              <option value="speed-ram">Speed Ramp — Slow→fast→slow (15s)</option>
              <option value="boomerang">Boomerang — Bouncing zoom (10s)</option>
              <option value="shake">Shake — 8mm film shake (15s)</option>
              <option value="slowmo-shake">Slow-mo + Shake (15s)</option>
              <option value="boomerang-shake">Boomerang + Shake (10s)</option>
              <option value="speedram-shake">Speed Ramp + Shake (15s)</option>
              <option value="slowmo-boomerang">Slow-mo + Boomerang (15s)</option>
              <option value="pulse">Pulse Zoom — Rhythmic (15s)</option>
              <option value="zoom-in">Zoom In — Portrait focus (15s)</option>
              <option value="sway">Sway — Gentle (15s)</option>
            </select>
          </SettingRow>
          <SettingRow
            icon={<Camera className="w-4 h-4" />}
            label="Palm trigger (hands-free)"
            hint="Angkat telapak tangan ke kamera untuk capture otomatis"
          >
            <Toggle
              value={settings.palm_trigger || false}
              onChange={(v) => updateSettings({ palm_trigger: v })}
            />
          </SettingRow>

          <SettingRow
            icon={<Camera className="w-4 h-4" />}
            label="Palm trigger sensitivity"
            hint="Semakin tinggi = semakin mudah mendeteksi telapak tangan"
          >
            <select
              className="aray-input max-w-[160px]"
              value={settings.palm_trigger_sensitivity || 0.6}
              onChange={(e) => updateSettings({ palm_trigger_sensitivity: parseFloat(e.target.value) })}
              disabled={!settings.palm_trigger}
            >
              <option value={0.4}>Low (jarang trigger)</option>
              <option value={0.6}>Medium (seimbang)</option>
              <option value={0.8}>High (mudah trigger)</option>
            </select>
          </SettingRow>
        </div>
      </ArayCard>

      {/* Google Drive */}
      <ArayCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Cloud className="w-5 h-5 text-purple-haze-300" />
          <h3 className="font-semibold">Google Drive</h3>
        </div>
        <div className="space-y-4">
          <SettingRow
            icon={<Cloud className="w-4 h-4" />}
            label="Auto-sync to Google Drive"
            hint="Upload captures in the background"
          >
            <Toggle
              value={settings.auto_sync}
              onChange={(v) => updateSettings({ auto_sync: v })}
              disabled={!settings.google_drive_connected}
            />
          </SettingRow>

          <SettingRow
            icon={<Clock className="w-4 h-4" />}
            label="Sync interval"
            hint="How often pending files upload"
          >
            <select
              className="aray-input max-w-[180px]"
              value={settings.sync_interval}
              onChange={(e) => updateSettings({ sync_interval: e.target.value as any })}
              disabled={!settings.google_drive_connected}
            >
              <option value="immediately">Immediately</option>
              <option value="30s">Every 30 seconds</option>
              <option value="1m">Every 1 minute</option>
              <option value="5m">Every 5 minutes</option>
              <option value="event_end">When event ends</option>
              <option value="manual">Manual only</option>
            </select>
          </SettingRow>

          <SettingRow
            icon={<AlertTriangle className="w-4 h-4" />}
            label="Delete local after sync"
            hint="Free up disk space after cloud upload verified"
            danger
          >
            <Toggle
              value={settings.delete_local_after_sync}
              onChange={(v) => {
                if (v && !confirm('Are you sure? ARAY will delete local files only after verifying the cloud copy. This cannot be undone per file.')) {
                  return
                }
                updateSettings({ delete_local_after_sync: v })
              }}
              disabled={!settings.google_drive_connected}
            />
          </SettingRow>
        </div>
        {!settings.google_drive_connected && (
          <p className="text-xs text-silver-500 mt-4 italic">
            Connect Google Drive first to enable cloud sync features. (OAuth arrives in Phase 3.)
          </p>
        )}
      </ArayCard>

      {/* Kiosk */}
      <ArayCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-gold-300" />
          <h3 className="font-semibold">Kiosk Mode</h3>
        </div>
        <SettingRow
          icon={<Shield className="w-4 h-4" />}
          label="Enable kiosk mode"
          hint="Full-screen booth. Hides settings & sidebar. Admin exit: Ctrl+Shift+Alt+Q"
          danger
        >
          <Toggle
            value={settings.kiosk_mode}
            onChange={(v) => updateSettings({ kiosk_mode: v })}
          />
        </SettingRow>
      </ArayCard>

      <div className="text-center py-4">
        <p className="text-xs text-silver-600">
          ARAY v1.0.0 — <span className="italic">Yap. Snap. Repeat.</span>
        </p>
      </div>
    </div>
  )
}

function SettingRow({
  icon,
  label,
  hint,
  children,
  danger
}: {
  icon: React.ReactNode
  label: string
  hint?: string
  children: React.ReactNode
  danger?: boolean
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-start gap-3">
        <div className={`${danger ? 'text-yellow-300' : 'text-silver-400'} mt-0.5`}>{icon}</div>
        <div>
          <div className="text-sm font-medium text-silver-100">{label}</div>
          {hint && <div className="text-xs text-silver-500 mt-0.5">{hint}</div>}
        </div>
      </div>
      {children}
    </div>
  )
}

function Toggle({
  value,
  onChange,
  disabled
}: {
  value: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      disabled={disabled}
      className={`relative w-12 h-6 rounded-full transition-colors ${
        value ? 'bg-purple-haze-500' : 'bg-silver-700'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
          value ? 'translate-x-6' : ''
        }`}
      />
    </button>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}
