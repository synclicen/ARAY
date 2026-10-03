import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  CalendarDays,
  Camera,
  Images,
  Cloud,
  HardDrive,
  Plus,
  Zap,
  ArrowRight,
  Sparkles,
  TrendingUp
} from 'lucide-react'
import { ArayCard, ArayButton, ArayBadge, ArayProgress, ArayLogo } from '../components/ui'
import { useEventStore } from '../stores/events'
import { useMediaStore } from '../stores/media'
import { useSettingsStore } from '../stores/settings'

export function DashboardPage() {
  const navigate = useNavigate()
  const { events, loadEvents, activeEventId, setActiveEvent } = useEventStore()
  const { stats, loadStats } = useMediaStore()
  const { storageInfo, settings } = useSettingsStore()

  useEffect(() => {
    loadEvents()
    loadStats()
  }, [loadEvents, loadStats])

  const activeEvent = events.find((e) => e.id === activeEventId) ?? events[0]
  const totalMemories = stats.total
  const totalPrints = 0 // Phase 2: pull from print_jobs
  const storagePct = storageInfo?.used_percent ?? 0
  const storageCritical = storageInfo?.critical ?? false
  const storageWarning = storageInfo?.warning ?? false

  return (
    <div className="p-8 space-y-8">
      {/* Hero */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-1">
            <span className="aray-gradient-text">Dashboard</span>
          </h1>
          <p className="text-silver-400 text-sm">
            Welcome back. <span className="italic text-purple-haze-300">Are you ready?</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/events">
            <ArayButton variant="silver" icon={<Plus className="w-4 h-4" />}>
              New Event
            </ArayButton>
          </Link>
          <ArayButton
            variant="gold"
            icon={<Camera className="w-4 h-4" />}
            onClick={() => navigate('/booth')}
          >
            Start Booth
          </ArayButton>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          title="Active Event"
          value={activeEvent?.name ?? 'No event yet'}
          subtitle={activeEvent ? activeEvent.code : 'Create one in Events'}
          icon={<CalendarDays className="w-5 h-5" />}
          variant="purple"
          onClick={() => navigate('/events')}
        />
        <StatCard
          title="Memories Created"
          value={totalMemories.toString()}
          subtitle="Total media captures"
          icon={<Images className="w-5 h-5" />}
          variant="gold"
          onClick={() => navigate('/gallery')}
        />
        <StatCard
          title="Prints"
          value={totalPrints.toString()}
          subtitle="Sent to printer"
          icon={<TrendingUp className="w-5 h-5" />}
          variant="silver"
          onClick={() => navigate('/printer')}
        />
        <StatCard
          title="Cloud"
          value={settings?.google_drive_connected ? 'Connected' : 'Local-only'}
          subtitle={
            settings?.google_drive_connected
              ? `${stats.synced}/${stats.total} synced`
              : 'Google Drive not connected'
          }
          icon={<Cloud className="w-5 h-5" />}
          variant={settings?.google_drive_connected ? 'gold' : 'silver'}
          onClick={() => navigate('/sync')}
        />
      </div>

      {/* Storage + Quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <ArayCard className="lg:col-span-2">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-purple-haze-300" />
                Local Storage
              </h3>
              <p className="text-xs text-silver-500 mt-1 font-mono break-all">
                {storageInfo?.path ?? '—'}
              </p>
            </div>
            <ArayBadge
              variant={storageCritical ? 'danger' : storageWarning ? 'warning' : 'success'}
            >
              {storageCritical
                ? 'Critical'
                : storageWarning
                  ? 'Warning'
                  : 'Healthy'}
            </ArayBadge>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-5">
            <div>
              <div className="text-xs text-silver-500 uppercase tracking-wide">Total</div>
              <div className="text-xl font-bold">{formatBytes(storageInfo?.total_bytes ?? 0)}</div>
            </div>
            <div>
              <div className="text-xs text-silver-500 uppercase tracking-wide">Used</div>
              <div className="text-xl font-bold text-purple-haze-200">
                {formatBytes(storageInfo?.used_bytes ?? 0)}
              </div>
            </div>
            <div>
              <div className="text-xs text-silver-500 uppercase tracking-wide">Free</div>
              <div className="text-xl font-bold text-gold-300">
                {formatBytes(storageInfo?.free_bytes ?? 0)}
              </div>
            </div>
          </div>

          <ArayProgress
            value={storagePct}
            variant={storageCritical ? 'gold' : 'purple'}
            showLabel
          />
          {storageCritical && (
            <p className="text-xs text-red-300 mt-3 italic">
              ARAY needs a little more space before we make another memory.
            </p>
          )}
        </ArayCard>

        <ArayCard>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Zap className="w-4 h-4 text-gold-300" />
            Quick Actions
          </h3>
          <div className="space-y-2">
            <QuickAction
              label="Open Booth"
              hint="Start capturing photos"
              icon={<Camera className="w-4 h-4" />}
              onClick={() => navigate('/booth')}
            />
            <QuickAction
              label="Create Event"
              hint="Set up a new event"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => navigate('/events')}
            />
            <QuickAction
              label="View Gallery"
              hint="Browse all memories"
              icon={<Images className="w-4 h-4" />}
              onClick={() => navigate('/gallery')}
            />
            <QuickAction
              label="Sync Center"
              hint="Check Google Drive sync"
              icon={<Cloud className="w-4 h-4" />}
              onClick={() => navigate('/sync')}
            />
          </div>
        </ArayCard>
      </div>

      {/* Recent events */}
      <ArayCard>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-gold-300" />
            Recent Events
          </h3>
          <Link to="/events" className="text-xs text-purple-haze-300 hover:text-purple-haze-100 flex items-center gap-1">
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {events.length === 0 ? (
          <div className="text-center py-12">
            <ArayLogo size="sm" showTagline={false} className="mb-3 opacity-50" />
            <p className="text-silver-400 text-sm">No events yet. Let's make your first one!</p>
            <Link to="/events">
              <ArayButton variant="primary" className="mt-4" icon={<Plus className="w-4 h-4" />}>
                Create Event
              </ArayButton>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {events.slice(0, 6).map((event) => (
              <button
                key={event.id}
                onClick={() => {
                  setActiveEvent(event.id)
                  navigate('/booth')
                }}
                className="text-left p-4 rounded-xl border border-silver-300/10 hover:border-purple-haze-500/40 hover:bg-purple-haze-500/5 transition-all group"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-purple-haze-300">{event.code}</span>
                  <ArayBadge variant={event.status === 'active' ? 'success' : 'silver'}>
                    {event.status}
                  </ArayBadge>
                </div>
                <div className="font-semibold text-silver-100 truncate group-hover:text-purple-haze-100">
                  {event.name}
                </div>
                <div className="text-xs text-silver-500 mt-1">
                  {event.client || 'No client'} · {event.venue || 'No venue'}
                </div>
              </button>
            ))}
          </div>
        )}
      </ArayCard>
    </div>
  )
}

interface StatCardProps {
  title: string
  value: string
  subtitle: string
  icon: React.ReactNode
  variant: 'purple' | 'gold' | 'silver'
  onClick?: () => void
}

function StatCard({ title, value, subtitle, icon, variant, onClick }: StatCardProps) {
  const variantClass = {
    purple: 'from-purple-haze-500/20 to-purple-haze-700/10 text-purple-haze-200',
    gold: 'from-gold-400/20 to-gold-600/10 text-gold-300',
    silver: 'from-silver-200/15 to-silver-400/5 text-silver-200'
  }[variant]

  return (
    <motion.div
      whileHover={{ y: -2 }}
      onClick={onClick}
      className={`cursor-pointer rounded-2xl p-5 bg-gradient-to-br ${variantClass} border border-silver-300/10 backdrop-blur-md transition-all hover:shadow-glow-purple`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-silver-400 uppercase tracking-wide">{title}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold text-silver-100 truncate">{value}</div>
      <div className="text-xs text-silver-500 mt-1 truncate">{subtitle}</div>
    </motion.div>
  )
}

function QuickAction({
  label,
  hint,
  icon,
  onClick
}: {
  label: string
  hint: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-purple-haze-500/10 transition-all text-left group"
    >
      <div className="w-9 h-9 rounded-lg bg-purple-haze-500/15 flex items-center justify-center text-purple-haze-200 group-hover:bg-purple-haze-500/25 transition-colors">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-silver-100">{label}</div>
        <div className="text-xs text-silver-500 truncate">{hint}</div>
      </div>
      <ArrowRight className="w-3.5 h-3.5 text-silver-600 group-hover:text-purple-haze-300 transition-colors" />
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
