import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useSettingsStore } from './stores/settings'
import { AraySplash } from './components/ui'
import { LicenseGate } from './components/LicenseGate'

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
  const [licenseValid, setLicenseValid] = useState(false)
  const [licenseChecked, setLicenseChecked] = useState(false)

  useEffect(() => {
    // v4.4.2: Paralelkan license check + settings + storage untuk startup cepat
    Promise.all([
      window.aray.license.status().then((result: any) => {
        if (result?.success) {
          setLicenseValid((result.data as any).isValid)
        }
      }).catch((e: any) => {
        console.error('License check failed:', e)
      }),
      loadSettings(),
      loadStorageInfo()
    ]).finally(() => {
      setLicenseChecked(true)
    })
  }, [loadSettings, loadStorageInfo])

  // v4.4.0: License gate — if not valid, show activation screen
  if (!licenseChecked) {
    return <AraySplash message="Loading ARAY..." />
  }

  if (!licenseValid) {
    return <LicenseGate onActivated={() => setLicenseValid(true)} />
  }

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
      {/* v4.4.2: Reduce AnimatePresence duration from 0.25s to 0.12s for snappier navigation */}
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
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
