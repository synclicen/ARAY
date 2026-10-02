import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
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

function App() {
  const { settings, loadSettings, loadStorageInfo } = useSettingsStore()
  const location = useLocation()

  useEffect(() => {
    loadSettings()
    loadStorageInfo()
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
