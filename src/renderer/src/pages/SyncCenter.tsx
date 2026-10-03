import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Cloud,
  CloudOff,
  RefreshCw,
  Pause,
  Play,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Zap
} from 'lucide-react'
import { ArayCard, ArayButton, ArayBadge, ArayProgress, ArayLogo } from '../components/ui'
import { useMediaStore } from '../stores/media'
import { useSettingsStore } from '../stores/settings'

export function SyncCenterPage() {
  const { stats, loadStats } = useMediaStore()
  const { settings } = useSettingsStore()
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    loadStats()
    const interval = setInterval(() => loadStats(), 5000)
    return () => clearInterval(interval)
  }, [loadStats])

  const total = stats.total
  const syncedPct = total > 0 ? (stats.synced / total) * 100 : 0

  const runSync = async () => {
    setSyncing(true)
    try {
      await window.aray.sync.start()
      await loadStats()
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-1 aray-gradient-text">Sync Center</h1>
          <p className="text-silver-400 text-sm">
            Local-first. Cloud-optional. <span className="italic">Your yap is safe.</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ArayButton variant="silver" icon={<Pause className="w-4 h-4" />} onClick={() => window.aray.sync.pause()}>
            Pause
          </ArayButton>
          <ArayButton variant="silver" icon={<Play className="w-4 h-4" />} onClick={() => window.aray.sync.resume()}>
            Resume
          </ArayButton>
          <ArayButton variant="gold" icon={<RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />} onClick={runSync} loading={syncing}>
            Sync Now
          </ArayButton>
        </div>
      </div>

      {/* Connection status */}
      <ArayCard className="p-6">
        <div className="flex items-start gap-4">
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
              settings?.google_drive_connected
                ? 'bg-green-500/15 text-green-300'
                : 'bg-silver-200/10 text-silver-400'
            }`}
          >
            {settings?.google_drive_connected ? (
              <Cloud className="w-7 h-7" />
            ) : (
              <CloudOff className="w-7 h-7" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold">Google Drive</h3>
              {settings?.google_drive_connected ? (
                <ArayBadge variant="success">Connected</ArayBadge>
              ) : (
                <ArayBadge variant="silver">Not connected</ArayBadge>
              )}
            </div>
            <p className="text-silver-400 text-sm">
              {settings?.google_drive_connected
                ? `Signed in as ${settings.google_drive_email ?? '(unknown)'}`
                : 'Local-only mode. All captures are saved safely on your drive. Connect Google Drive in Phase 3 for cloud sync.'}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <ArayButton variant="silver" onClick={() => window.aray.googleDrive.connect()}>
              {settings?.google_drive_connected ? 'Manage' : 'Connect'}
            </ArayButton>
            {settings?.google_drive_connected && (
              <ArayButton variant="ghost" onClick={() => window.aray.googleDrive.disconnect()}>
                Disconnect
              </ArayButton>
            )}
          </div>
        </div>
      </ArayCard>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <SyncStatCard label="Total" value={stats.total} icon={<Zap className="w-5 h-5" />} variant="purple" />
        <SyncStatCard label="Synced" value={stats.synced} icon={<CheckCircle2 className="w-5 h-5" />} variant="gold" />
        <SyncStatCard label="Pending" value={stats.pending} icon={<Clock className="w-5 h-5" />} variant="silver" />
        <SyncStatCard label="Failed" value={stats.failed} icon={<AlertTriangle className="w-5 h-5" />} variant="danger" />
        <SyncStatCard label="Uploading" value={stats.uploading} icon={<RefreshCw className="w-5 h-5" />} variant="info" />
      </div>

      {/* Progress */}
      <ArayCard className="p-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Sync Progress</h3>
          <span className="text-sm text-silver-400">
            {stats.synced} / {stats.total} ({syncedPct.toFixed(0)}%)
          </span>
        </div>
        <ArayProgress value={stats.synced} max={Math.max(stats.total, 1)} variant={stats.failed > 0 ? 'gold' : 'purple'} />
        {stats.failed > 0 && (
          <div className="mt-4 flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="w-4 h-4 text-red-300" />
            <span className="text-sm text-red-300 flex-1">
              {stats.failed} file(s) failed to sync. ARAY will retry with exponential backoff.
            </span>
            <ArayButton variant="ghost" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => window.aray.sync.retry()}>
              Retry failed
            </ArayButton>
          </div>
        )}
      </ArayCard>

      {/* Architecture explainer */}
      <ArayCard className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <ArayLogo size="sm" showTagline={false} />
          <h3 className="font-semibold">How ARAY Sync Works</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2 text-xs">
          {['Capture', 'Process', 'Save Local', 'Verify Local', 'Database', 'Sync Queue', 'Google Drive'].map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
                className="flex-1 p-3 rounded-lg bg-purple-haze-500/10 border border-purple-haze-500/20 text-center"
              >
                <div className="text-purple-haze-200 font-semibold">{step}</div>
              </motion.div>
            </div>
          ))}
        </div>
        <p className="text-xs text-silver-500 mt-4 italic">
          Local-first architecture: every file saves to your drive and is verified BEFORE any cloud
          upload begins. Google Drive is a synchronization layer, never the primary storage.
        </p>
      </ArayCard>
    </div>
  )
}

function SyncStatCard({
  label,
  value,
  icon,
  variant
}: {
  label: string
  value: number
  icon: React.ReactNode
  variant: 'purple' | 'gold' | 'silver' | 'danger' | 'info'
}) {
  const colorMap = {
    purple: 'from-purple-haze-500/15 to-purple-haze-700/5 text-purple-haze-200 border-purple-haze-500/20',
    gold: 'from-gold-400/15 to-gold-600/5 text-gold-300 border-gold-400/20',
    silver: 'from-silver-200/10 to-silver-400/5 text-silver-200 border-silver-300/15',
    danger: 'from-red-500/15 to-red-700/5 text-red-300 border-red-500/20',
    info: 'from-blue-500/15 to-blue-700/5 text-blue-300 border-blue-500/20'
  }[variant]

  return (
    <div className={`rounded-2xl p-5 bg-gradient-to-br ${colorMap} border backdrop-blur-md`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-silver-400 uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  )
}
