import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Shield, Check, AlertTriangle, Copy, KeyRound, Calendar } from 'lucide-react'
import { ArayButton, ArayLogo } from '../components/ui'

interface LicenseStatus {
  isValid: boolean
  isExpired: boolean
  daysRemaining: number
  licenseType: string | null
  expiresAt: string | null
  machineId: string
  displayMachineId: string
}

export function LicenseGate({ onActivated }: { onActivated: () => void }) {
  const [status, setStatus] = useState<LicenseStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [activationCode, setActivationCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [activating, setActivating] = useState(false)
  const [copied, setCopied] = useState(false)

  const checkStatus = async () => {
    try {
      const result = await window.aray.license.status()
      if (result?.success) {
        setStatus(result.data as LicenseStatus)
        if ((result.data as LicenseStatus).isValid) {
          onActivated()
        }
      }
    } catch (e) {
      console.error('License status check failed:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkStatus()
  }, [])

  const handleActivate = async () => {
    if (!activationCode.trim()) {
      setError('Masukkan kode aktivasi')
      return
    }
    setActivating(true)
    setError(null)
    try {
      const result = await window.aray.license.activate(activationCode.trim())
      if (result?.success) {
        await checkStatus()
      } else {
        setError(result?.error || 'Aktivasi gagal')
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setActivating(false)
    }
  }

  const copyMachineId = () => {
    if (status?.displayMachineId) {
      navigator.clipboard.writeText(status.displayMachineId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface-base">
        <div className="text-center">
          <ArayLogo size="xl" animated className="mb-6" />
          <p className="text-silver-400 text-sm">Memeriksa lisensi...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-purple-haze-950 via-surface-base to-purple-haze-900 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <ArayLogo size="xl" animated className="mb-4" />
          <h1 className="text-3xl font-bold aray-gradient-text mb-2">Aktivasi Lisensi</h1>
          <p className="text-silver-400 text-sm">
            Masukkan kode aktivasi untuk menggunakan ARAY
          </p>
        </div>

        <div className="bg-surface-raised/80 backdrop-blur-xl border border-silver-300/10 rounded-2xl p-6 space-y-5">
          {/* Machine ID */}
          <div>
            <label className="text-xs text-silver-500 uppercase tracking-wide flex items-center gap-1 mb-2">
              <Shield className="w-3 h-3" /> Machine ID Perangkat
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2.5 rounded-lg bg-surface-base border border-silver-300/10 text-silver-200 font-mono text-sm">
                {status?.displayMachineId || 'Loading...'}
              </div>
              <button
                onClick={copyMachineId}
                className="p-2.5 rounded-lg bg-purple-haze-500/20 border border-purple-haze-500/30 hover:bg-purple-haze-500/30 transition-all"
                title="Copy Machine ID"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-purple-haze-200" />}
              </button>
            </div>
            <p className="text-xs text-silver-600 mt-1.5">
              Kirim Machine ID ini ke pengembang untuk mendapatkan kode aktivasi
            </p>
          </div>

          {/* Activation Code Input */}
          <div>
            <label className="text-xs text-silver-500 uppercase tracking-wide flex items-center gap-1 mb-2">
              <KeyRound className="w-3 h-3" /> Kode Aktivasi
            </label>
            <input
              type="text"
              value={activationCode}
              onChange={(e) => { setActivationCode(e.target.value); setError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleActivate() }}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              className={`aray-input w-full font-mono text-center text-lg tracking-wider ${error ? 'border-red-500' : ''}`}
              maxLength={19}
            />
            {error && (
              <p className="text-red-400 text-xs mt-1.5 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {error}
              </p>
            )}
          </div>

          {/* Activate Button */}
          <ArayButton
            variant="gold"
            className="w-full"
            disabled={activating}
            onClick={handleActivate}
          >
            {activating ? 'Mengaktivasi...' : 'Aktivasi'}
          </ArayButton>

          {/* Info */}
          {status?.isExpired && status?.expiresAt && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-center">
              <p className="text-red-300 text-sm flex items-center justify-center gap-1">
                <AlertTriangle className="w-4 h-4" />
                Lisensi kadaluarsa
              </p>
              <p className="text-silver-500 text-xs mt-1">
                Kadaluarsa: {new Date(status.expiresAt).toLocaleDateString('id-ID')}
              </p>
            </div>
          )}

          <div className="text-center pt-2 border-t border-silver-300/5">
            <p className="text-xs text-silver-600">
              Lisensi berlaku 30 hari sejak aktivasi.
              <br />
              Hubungi pengembang untuk perpanjangan.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
