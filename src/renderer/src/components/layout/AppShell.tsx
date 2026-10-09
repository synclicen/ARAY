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
  const { settings, updateSettings } = useSettingsStore()
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
        // Tanpa password — langsung exit + navigate ke dashboard
        // v4.1.6: Pakai store's updateSettings (reactive) + navigate.
        // JANGAN pakai window.location.reload() — menyebabkan blank screen.
        updateSettings({ kiosk_mode: false }).then(() => {
          navigate('/dashboard', { replace: true })
        })
      }
    }

    const verifyKioskPassword = () => {
      const pwd = settings?.booth_fullscreen_password || 'aray'
      if (kioskPasswordInput === pwd) {
        // v4.1.6: Pakai store's updateSettings agar settings reactively update.
        // Store update -> isKiosk becomes false -> AppShell re-render normal layout.
        // Lalu navigate ke dashboard. Tidak ada reload, tidak ada blank screen.
        updateSettings({ kiosk_mode: false }).then(() => {
          setShowKioskPasswordModal(false)
          navigate('/dashboard', { replace: true })
        })
      } else {
        setKioskPasswordError(true)
      }
    }

    // In kiosk mode, hide navigation. Hanya booth yang tampil.
    // v4.3.9: Footer tetap tampil di kiosk mode (clean view).
    return (
      <>
        <div className="h-full w-full relative flex flex-col">
          <div className="flex-1 overflow-hidden">{children}</div>
          {/* Kiosk exit button — kecil di pojok kanan atas.
              Klik → password modal (jika password diset) atau langsung exit. */}
          <button
            onClick={exitKiosk}
            className="absolute top-3 right-3 z-50 w-9 h-9 rounded-full bg-black/50 hover:bg-red-500/40 border border-silver-700/30 hover:border-red-500/50 flex items-center justify-center transition-all opacity-40 hover:opacity-100"
            title="Exit Kiosk Mode (butuh password)"
          >
            <X className="w-4 h-4 text-silver-300" />
          </button>
          {/* Footer — tetap tampil di kiosk mode */}
          <footer className="h-10 px-2 flex items-center justify-center gap-1.5 border-t border-silver-300/10 bg-black/40 flex-wrap shrink-0">
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
      {/* Sidebar — desktop only (md+). Mobile uses bottom nav. */}
      <aside
        className={`relative hidden md:flex flex-col bg-surface-raised/80 backdrop-blur-xl border-r border-silver-300/10 transition-all duration-300 ${
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
      <main className="flex-1 overflow-hidden flex flex-col">
        <header className="h-14 px-4 sm:px-6 flex items-center justify-between border-b border-silver-300/10 bg-surface-raised/40 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-2 text-silver-400 text-sm">
            <Sparkles className="w-4 h-4 text-gold-400" />
            <span className="italic hidden sm:inline">Yap. Snap. Repeat.</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {settings?.google_drive_connected ? (
              <ArayBadge variant="success" className="hidden sm:inline-flex">Google Drive Connected</ArayBadge>
            ) : (
              <ArayBadge variant="silver">Local-Only</ArayBadge>
            )}
            <div className="text-xs text-silver-500">ARAY v1.0</div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {/* Footer — desktop only on row layout; mobile hides (bottom nav replaces) */}
        <footer className="hidden md:flex h-10 px-2 items-center justify-center gap-1.5 border-t border-silver-300/10 bg-surface-raised/40 flex-wrap shrink-0">
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
      </main>

      {/* Bottom navigation — mobile only (below md). Replaces sidebar.
          5 primary items; "More" opens drawer with secondary items. */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch justify-around h-16 px-2 border-t border-silver-300/10 bg-surface-raised/95 backdrop-blur-xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {[
          { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
          { to: '/events', label: 'Events', icon: CalendarDays },
          { to: '/booth', label: 'Booth', icon: Camera, primary: true },
          { to: '/gallery', label: 'Gallery', icon: Images },
          { to: '/settings', label: 'Settings', icon: SettingsIcon }
        ].map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 px-3 min-w-[60px] transition-all ${
                  item.primary
                    ? 'relative -mt-4'
                    : ''
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {item.primary ? (
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-glow-purple transition-all ${
                      isActive
                        ? 'bg-gradient-to-br from-purple-haze-400 to-purple-haze-600 scale-105'
                        : 'bg-gradient-to-br from-purple-haze-500 to-purple-haze-700'
                    }`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                  ) : (
                    <Icon className={`w-5 h-5 transition-colors ${isActive ? 'text-purple-haze-300' : 'text-silver-500'}`} />
                  )}
                  <span className={`text-[10px] font-medium transition-colors ${isActive ? 'text-purple-haze-300' : 'text-silver-500'} ${item.primary ? 'mt-0' : ''}`}>
                    {item.label}
                  </span>
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* Mobile secondary nav drawer — accessed via long-press on Settings or via a "More" button.
          For simplicity, we add a small "More" button on the header (mobile) that opens this drawer. */}
      <MobileMoreMenu />
    </div>
  )
}

/** Mobile "More" menu — opens a bottom sheet with secondary nav items (Templates, Sync, Printer). */
function MobileMoreMenu() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  // Listen for a custom event to open this drawer (triggered from header "More" button)
  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('aray:open-more', handler)
    return () => window.removeEventListener('aray:open-more', handler)
  }, [])

  // Close on route change
  useEffect(() => { setOpen(false) }, [location.pathname])

  const secondary = [
    { to: '/templates', label: 'Templates', icon: LayoutTemplate },
    { to: '/sync', label: 'Sync Center', icon: RefreshCw },
    { to: '/printer', label: 'Printer', icon: Printer }
  ]

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed right-3 z-30 w-10 h-10 rounded-full bg-surface-elevated/95 border border-silver-300/15 flex items-center justify-center shadow-card"
        style={{ top: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
        aria-label="More menu"
      >
        <span className="text-silver-300 text-lg leading-none">⋯</span>
      </button>
    )
  }

  return (
    <>
      <button
        onClick={() => setOpen(false)}
        className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        aria-label="Close menu"
      />
      <div
        className="md:hidden fixed bottom-20 left-3 right-3 z-50 bg-surface-raised border border-silver-300/15 rounded-2xl shadow-card p-3"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="text-xs text-silver-500 px-2 py-1 mb-2">More</div>
        <div className="grid grid-cols-3 gap-2">
          {secondary.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.to}
                onClick={() => navigate(item.to)}
                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-surface-elevated/60 hover:bg-purple-haze-500/20 transition-all min-h-[80px]"
              >
                <Icon className="w-5 h-5 text-purple-haze-300" />
                <span className="text-xs text-silver-300">{item.label}</span>
              </button>
            )
          })}
        </div>
        <button
          onClick={() => setOpen(false)}
          className="w-full mt-3 py-2 text-xs text-silver-500 hover:text-silver-300"
        >
          Close
        </button>
      </div>
    </>
  )
}
