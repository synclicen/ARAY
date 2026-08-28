import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  CalendarDays,
  Camera,
  Images,
  LayoutTemplate,
  RefreshCw,
  Printer,
  Settings as SettingsIcon,
  Sparkles
} from 'lucide-react'
import { ArayLogo, ArayBadge } from '../ui'
import { useSettingsStore } from '../../stores'

interface AppShellProps {
  children: React.ReactNode
}

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/events', label: 'Events', icon: CalendarDays },
  { to: '/booth', label: 'Booth', icon: Camera },
  { to: '/gallery', label: 'Gallery', icon: Images },
  { to: '/templates', label: 'Templates', icon: LayoutTemplate },
  { to: '/sync', label: 'Sync Center', icon: RefreshCw },
  { to: '/printer', label: 'Printer', icon: Printer },
  { to: '/settings', label: 'Settings', icon: SettingsIcon }
]

export function AppShell({ children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const { settings } = useSettingsStore()

  const isKiosk = settings?.kiosk_mode ?? false

  if (isKiosk) {
    // In kiosk mode, hide navigation entirely (booth-only)
    return <div className="h-full w-full">{children}</div>
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-base">
      {/* Sidebar */}
      <aside
        className={`relative flex flex-col bg-surface-raised/80 backdrop-blur-xl border-r border-silver-300/10 transition-all duration-300 ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className="p-5 flex items-center justify-center">
          <button
            onClick={() => navigate('/dashboard')}
            className="transition-transform hover:scale-105"
          >
            {collapsed ? (
              <ArayLogo size="sm" showTagline={false} />
            ) : (
              <ArayLogo size="sm" />
            )}
          </button>
        </div>

        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-purple-haze-500/20 text-purple-haze-100 shadow-glow-purple border border-purple-haze-500/30'
                      : 'text-silver-400 hover:text-silver-100 hover:bg-silver-200/5'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            )
          })}
        </nav>

        <div className="p-4 border-t border-silver-300/10">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full text-xs text-silver-500 hover:text-silver-200 transition-colors"
          >
            {collapsed ? '› Expand' : '‹ Collapse'}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-hidden">
        <header className="h-14 px-6 flex items-center justify-between border-b border-silver-300/10 bg-surface-raised/40 backdrop-blur-md">
          <div className="flex items-center gap-2 text-silver-400 text-sm">
            <Sparkles className="w-4 h-4 text-gold-400" />
            <span className="italic">Yap. Snap. Repeat.</span>
          </div>
          <div className="flex items-center gap-3">
            {settings?.google_drive_connected ? (
              <ArayBadge variant="success">Google Drive Connected</ArayBadge>
            ) : (
              <ArayBadge variant="silver">Local-Only Mode</ArayBadge>
            )}
            <div className="text-xs text-silver-500">ARAY v1.0</div>
          </div>
        </header>
        <div className="h-[calc(100%-3.5rem)] overflow-y-auto">{children}</div>
      </main>
    </div>
  )
}
