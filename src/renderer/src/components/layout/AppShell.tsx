import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  CalendarDays,
  Camera,
  Images,
  LayoutTemplate,
  RefreshCw,
  Printer,
  Settings as SettingsIcon,
  Sparkles,
  X
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArayLogo, ArayBadge, ArayButton } from '../ui'
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
  const location = useLocation()
  const { settings } = useSettingsStore()
  const [showKioskPasswordModal, setShowKioskPasswordModal] = useState(false)
  const [kioskPasswordInput, setKioskPasswordInput] = useState('')
  const [kioskPasswordError, setKioskPasswordError] = useState(false)

  const isKiosk = settings?.kiosk_mode ?? false

  // v4.1.5: Saat kiosk mode aktif, auto-redirect ke /booth.
  // Sebelumnya kiosk hide sidebar tapi user tetap di route saat ini (mis. Settings),
  // sehingga tidak bisa navigasi kemana-mana — terlihat "stuck".
  useEffect(() => {
    if (isKiosk && location.pathname !== '/booth') {
      navigate('/booth', { replace: true })
    }
  }, [isKiosk, location.pathname, navigate])

  if (isKiosk) {
    const exitKiosk = () => {
      const pwd = settings?.booth_fullscreen_password
      if (pwd && pwd.length > 0) {
        // Password diset — tampilkan modal
        setShowKioskPasswordModal(true)
        setKioskPasswordInput('')
        setKioskPasswordError(false)
      } else {
        // Tanpa password — langsung exit
        window.aray.settings.update({ kiosk_mode: false }).then(() => {
          window.location.reload()
        })
      }
    }

    const verifyKioskPassword = () => {
      const pwd = settings?.booth_fullscreen_password || 'aray'
      if (kioskPasswordInput === pwd) {
        window.aray.settings.update({ kiosk_mode: false }).then(() => {
          setShowKioskPasswordModal(false)
          window.location.reload()
        })
      } else {
        setKioskPasswordError(true)
      }
    }

    // In kiosk mode, hide navigation. Hanya booth yang tampil.
    return (
      <>
        <div className="h-full w-full relative">
          {children}
          {/* Kiosk exit button — kecil di pojok kanan atas.
              Klik → password modal (jika password diset) atau langsung exit. */}
          <button
            onClick={exitKiosk}
            className="absolute top-3 right-3 z-50 w-9 h-9 rounded-full bg-black/50 hover:bg-red-500/40 border border-silver-700/30 hover:border-red-500/50 flex items-center justify-center transition-all opacity-40 hover:opacity-100"
            title="Exit Kiosk Mode (butuh password)"
          >
            <X className="w-4 h-4 text-silver-300" />
          </button>
        </div>

        {/* Password modal untuk exit kiosk */}
        <AnimatePresence>
          {showKioskPasswordModal && (
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
                <h3 className="text-lg font-semibold mb-2 text-silver-100">Exit Kiosk Mode</h3>
                <p className="text-silver-400 text-sm mb-4">Masukkan password untuk keluar dari kiosk mode.</p>
                <input
                  type="password"
                  autoFocus
                  value={kioskPasswordInput}
                  onChange={(e) => { setKioskPasswordInput(e.target.value); setKioskPasswordError(false) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') verifyKioskPassword() }}
                  className={`aray-input w-full ${kioskPasswordError ? 'border-red-500' : ''}`}
                  placeholder="Password"
                />
                {kioskPasswordError && <p className="text-red-400 text-xs mt-2">Password salah</p>}
                <div className="flex gap-2 mt-4">
                  <ArayButton
                    variant="ghost"
                    className="flex-1"
                    onClick={() => { setShowKioskPasswordModal(false); setKioskPasswordInput(''); setKioskPasswordError(false) }}
                  >
                    Batal
                  </ArayButton>
                  <ArayButton variant="gold" className="flex-1" onClick={verifyKioskPassword}>
                    Keluar
                  </ArayButton>
                </div>
                <p className="text-silver-600 text-[10px] text-center mt-3">
                  Shortcut keyboard: Ctrl+Shift+Alt+Q
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    )
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
