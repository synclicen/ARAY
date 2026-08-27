import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, FileText } from 'lucide-react'
import { useSettingsStore } from './stores/settings'
import { AraySplash } from './components/ui'

import { AppShell } from './components/layout/AppShell'
import { FirstRunPage } from './pages/FirstRun'
import { DashboardPage } from './pages/Dashboard'
import { EventsPage } from './pages/Events'
import { BoothPage } from './pages/Booth'
import { GalleryPage } from './pages/Gallery'
import { TemplatesPage } from './pages/Templates'
import { SyncCenterPage } from './pages/SyncCenter'
import { PrinterPage } from './pages/Printer'
import { SettingsPage } from './pages/Settings'

interface StartupStatus {
  database: boolean
  dbError: string | null
  logPath: string | null
}

function App() {
  const { settings, loadSettings, loadStorageInfo } = useSettingsStore()
  const location = useLocation()
  const [startupStatus, setStartupStatus] = useState<StartupStatus | null>(null)

  useEffect(() => {
    loadSettings()
    loadStorageInfo()

    // Listen for startup status from main process (Electron only)
    if (typeof window !== 'undefined' && (window as any).electronAPI?.receive) {
      ;(window as any).electronAPI.receive('aray:startup-status', (_e: any, status: StartupStatus) => {
        console.log('[ARAY] Startup status:', status)
        setStartupStatus(status)
      })
    }
  }, [loadSettings, loadStorageInfo])

  if (!settings) {
    return <AraySplash message="Warming up the booth..." />
  }

  // First-run gate
  if (!settings.first_run_completed) {
    return (
      <Routes>
        <Route path="*" element={<FirstRunPage />} />
      </Routes>
    )
  }

  return (
    <AppShell>
      {startupStatus && !startupStatus.database && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-14 left-0 right-0 z-50 px-4 py-2 bg-red-500/15 border-b border-red-500/30 backdrop-blur-md"
        >
          <div className="flex items-center gap-2 text-sm text-red-200">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="flex-1">
              Database unavailable — running in degraded mode.
              {!startupStatus.dbError ? '' : ` Error: ${startupStatus.dbError}`}
            </span>
            {startupStatus.logPath && (
              <span className="text-xs text-red-300/70 flex items-center gap-1">
                <FileText className="w-3 h-3" />
                {startupStatus.logPath}
              </span>
            )}
          </div>
        </motion.div>
      )}
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="h-full"
        >
          <Routes location={location}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/booth" element={<BoothPage />} />
            <Route path="/gallery" element={<GalleryPage />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/sync" element={<SyncCenterPage />} />
            <Route path="/printer" element={<PrinterPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    </AppShell>
  )
}

export default App
