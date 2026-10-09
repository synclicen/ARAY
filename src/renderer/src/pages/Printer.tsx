import { useState, useEffect } from 'react'
import { Printer as PrinterIcon, RefreshCw, Check, AlertCircle, Printer as PrinterLucide } from 'lucide-react'
import { ArayCard, ArayButton, ArayBadge, ArayLogo } from '../components/ui'
import { useSettingsStore } from '../stores/settings'

interface PrinterInfo {
  id: string
  name: string
  is_default: boolean
  status: number
  is_connected: boolean
}

export function PrinterPage() {
  const { settings, updateSettings } = useSettingsStore()
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  const detectPrinters = async () => {
    setLoading(true)
    setTestResult(null)
    try {
      console.log('[Printer] Detecting printers...')
      const result = await window.aray.print.listPrinters()
      console.log('[Printer] Detect result:', JSON.stringify(result))
      if (result?.success && Array.isArray(result.data)) {
        const list = result.data as PrinterInfo[]
        setPrinters(list)
        console.log('[Printer] Found', list.length, 'printers:', list.map(p => p.name))
        if (list.length === 0) {
          setTestResult('⚠ Tidak ada printer terdeteksi. Pastikan printer terhubung dan driver terinstall. Cek log di %APPDATA%/ARAY/aray-startup.log')
        } else {
          setTestResult(`✓ Ditemukan ${list.length} printer`)
        }
      } else {
        console.error('[Printer] Detect failed:', result)
        const errMsg = (result as any)?.error?.message || 'Format response salah'
        setTestResult('✗ Gagal detect printer: ' + errMsg)
      }
    } catch (e: any) {
      console.error('[Printer] Detect printers exception:', e)
      setTestResult('✗ Error: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    detectPrinters()
  }, [])

  const selectPrinter = async (printer: PrinterInfo) => {
    await updateSettings({ printer_name: printer.name })
  }

  const testPrint = async () => {
    if (!settings?.printer_name) return
    setTesting(true)
    setTestResult(null)
    try {
      // v4.3.3: Pass print settings ke test print
      const printSettings = {
        paper_size: settings.print_paper_size || '4x6',
        custom_width: settings.print_custom_width || 100,
        custom_height: settings.print_custom_height || 150,
        copies: settings.print_copies || 1,
        color: settings.print_color !== false,
        orientation: settings.print_orientation || 'portrait',
        quality: settings.print_quality || 'normal',
        fit: settings.print_fit || 'contain'
      }
      const result = await window.aray.print.queue('test', settings.printer_name, settings.print_copies || 1, printSettings)
      if (result?.success) {
        setTestResult('✓ Test print berhasil dikirim ke ' + settings.printer_name)
      } else {
        setTestResult('✗ Test print gagal: ' + (result as any)?.error || 'unknown error')
      }
    } catch (e: any) {
      setTestResult('✗ Error: ' + e.message)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="page-padding space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-1 aray-gradient-text">Printer</h1>
          <p className="text-silver-400 text-sm">
            Print memories straight from the booth. <span className="italic">Say cheese!</span>
          </p>
        </div>
        <ArayButton
          variant="silver"
          icon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}
          onClick={detectPrinters}
          disabled={loading}
        >
          {loading ? 'Detecting...' : 'Refresh'}
        </ArayButton>
      </div>

      {/* Printer list */}
      <ArayCard className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Available Printers</h3>
          {printers.length > 0 && (
            <ArayBadge variant="silver">{printers.length} found</ArayBadge>
          )}
        </div>

        {printers.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-2xl bg-purple-haze-500/15 flex items-center justify-center mx-auto mb-4">
              <PrinterIcon className="w-8 h-8 text-purple-haze-200" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              {loading ? 'Mendeteksi printer...' : 'No printers detected'}
            </h3>
            <p className="text-silver-400 text-sm mb-4 max-w-md mx-auto">
              {loading
                ? 'Tunggu sebentar, sedang scan printer yang terhubung...'
                : 'Pastikan printer terhubung ke komputer dan driver terinstall. Klik Refresh untuk scan ulang.'}
            </p>
            {!loading && (
              <ArayButton variant="primary" icon={<RefreshCw className="w-4 h-4" />} onClick={detectPrinters}>
                Detect Printers
              </ArayButton>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {printers.map((p) => (
              <div
                key={p.id}
                className={`flex items-center justify-between p-4 rounded-lg border transition-all cursor-pointer ${
                  settings?.printer_name === p.name
                    ? 'bg-gold-400/10 border-gold-400/40 shadow-glow-gold'
                    : 'bg-surface-elevated/40 border-silver-300/10 hover:border-purple-haze-500/30'
                }`}
                onClick={() => selectPrinter(p)}
              >
                <div className="flex items-center gap-3">
                  <PrinterLucide className={`w-5 h-5 ${
                    settings?.printer_name === p.name ? 'text-gold-400' : 'text-silver-400'
                  }`} />
                  <div>
                    <div className="text-sm font-medium text-silver-100">{p.name}</div>
                    <div className="text-xs text-silver-500">
                      {p.is_default ? 'Default printer · ' : ''}
                      Status: {p.is_connected ? 'Ready' : 'Offline'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {p.is_default && <ArayBadge variant="purple">Default</ArayBadge>}
                  {settings?.printer_name === p.name && (
                    <ArayBadge variant="success">
                      <Check className="w-3 h-3" /> Selected
                    </ArayBadge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </ArayCard>

      {/* Selected printer + print settings + test print */}
      {settings?.printer_name && (
        <ArayCard className="p-6">
          <h3 className="font-semibold mb-4">Selected Printer</h3>
          <div className="flex items-center justify-between p-4 rounded-lg bg-surface-elevated/40 mb-6">
            <div className="flex items-center gap-3">
              <PrinterLucide className="w-5 h-5 text-gold-400" />
              <div>
                <div className="text-sm font-medium text-silver-100">{settings.printer_name}</div>
                <div className="text-xs text-silver-500">Active printer untuk booth</div>
              </div>
            </div>
          </div>

          {/* Print Settings */}
          <h4 className="text-sm font-semibold text-silver-200 mb-3">Print Settings</h4>
          <div className="space-y-3 mb-6">
            {/* Paper Size */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-start gap-3">
                <PrinterLucide className="w-4 h-4 text-silver-400 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-silver-100">Paper Size</div>
                  <div className="text-xs text-silver-500 mt-0.5">Ukuran kertas print</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="aray-input max-w-[140px]"
                  value={settings.print_paper_size || '4x6'}
                  onChange={(e) => updateSettings({ print_paper_size: e.target.value as any })}
                >
                  <option value="4x6">4×6 (Photo)</option>
                  <option value="5x7">5×7 (Large Photo)</option>
                  <option value="A6">A6 (105×148mm)</option>
                  <option value="A4">A4 (210×297mm)</option>
                  <option value="Letter">Letter (8.5×11")</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
            </div>

            {/* Custom Size Inputs — tampil hanya jika paper_size = custom */}
            {settings.print_paper_size === 'custom' && (
              <div className="flex items-center justify-between py-2 pl-7">
                <div className="text-xs text-silver-500">Custom dimensions (mm)</div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="10"
                    max="1000"
                    className="aray-input max-w-[80px]"
                    value={settings.print_custom_width || 100}
                    onChange={(e) => updateSettings({ print_custom_width: parseInt(e.target.value) || 100 })}
                    placeholder="W"
                  />
                  <span className="text-silver-500 text-sm">×</span>
                  <input
                    type="number"
                    min="10"
                    max="1000"
                    className="aray-input max-w-[80px]"
                    value={settings.print_custom_height || 150}
                    onChange={(e) => updateSettings({ print_custom_height: parseInt(e.target.value) || 150 })}
                    placeholder="H"
                  />
                  <span className="text-silver-500 text-xs">mm</span>
                </div>
              </div>
            )}

            {/* Copies */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-start gap-3">
                <PrinterLucide className="w-4 h-4 text-silver-400 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-silver-100">Copies</div>
                  <div className="text-xs text-silver-500 mt-0.5">Jumlah copy per print</div>
                </div>
              </div>
              <input
                type="number"
                min="1"
                max="10"
                className="aray-input max-w-[80px]"
                value={settings.print_copies || 1}
                onChange={(e) => updateSettings({ print_copies: parseInt(e.target.value) || 1 })}
              />
            </div>

            {/* Color */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-start gap-3">
                <PrinterLucide className="w-4 h-4 text-silver-400 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-silver-100">Color</div>
                  <div className="text-xs text-silver-500 mt-0.5">Color atau Grayscale</div>
                </div>
              </div>
              <select
                className="aray-input max-w-[140px]"
                value={settings.print_color === false ? 'grayscale' : 'color'}
                onChange={(e) => updateSettings({ print_color: e.target.value === 'color' })}
              >
                <option value="color">Color</option>
                <option value="grayscale">Grayscale</option>
              </select>
            </div>

            {/* Orientation */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-start gap-3">
                <PrinterLucide className="w-4 h-4 text-silver-400 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-silver-100">Orientation</div>
                  <div className="text-xs text-silver-500 mt-0.5">Portrait atau Landscape</div>
                </div>
              </div>
              <select
                className="aray-input max-w-[140px]"
                value={settings.print_orientation || 'portrait'}
                onChange={(e) => updateSettings({ print_orientation: e.target.value as any })}
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </div>

            {/* Quality */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-start gap-3">
                <PrinterLucide className="w-4 h-4 text-silver-400 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-silver-100">Quality</div>
                  <div className="text-xs text-silver-500 mt-0.5">Resolusi print</div>
                </div>
              </div>
              <select
                className="aray-input max-w-[140px]"
                value={settings.print_quality || 'normal'}
                onChange={(e) => updateSettings({ print_quality: e.target.value as any })}
              >
                <option value="draft">Draft (cepat, hemat tinta)</option>
                <option value="normal">Normal</option>
                <option value="high">High (kualitas tinggi)</option>
              </select>
            </div>

            {/* Fit */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-start gap-3">
                <PrinterLucide className="w-4 h-4 text-silver-400 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-silver-100">Image Fit</div>
                  <div className="text-xs text-silver-500 mt-0.5">Contain = utuh, Cover = penuh (crop)</div>
                </div>
              </div>
              <select
                className="aray-input max-w-[140px]"
                value={settings.print_fit || 'contain'}
                onChange={(e) => updateSettings({ print_fit: e.target.value as any })}
              >
                <option value="contain">Contain (utuh, mungkin ada margin)</option>
                <option value="cover">Cover (penuh, mungkin crop)</option>
              </select>
            </div>
          </div>

          <ArayButton
            variant="gold"
            icon={<PrinterLucide className="w-4 h-4" />}
            onClick={testPrint}
            disabled={testing}
            className="w-full"
          >
            {testing ? 'Printing test page...' : 'Test Print'}
          </ArayButton>
          {testResult && (
            <div className={`mt-3 p-3 rounded-lg text-sm ${
              testResult.startsWith('✓')
                ? 'bg-green-500/10 border border-green-500/20 text-green-300'
                : 'bg-red-500/10 border border-red-500/20 text-red-300'
            }`}>
              {testResult}
            </div>
          )}
        </ArayCard>
      )}

      <ArayCard className="p-6 bg-gradient-to-br from-yellow-500/5 to-transparent border-yellow-500/20">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-300 mt-0.5 shrink-0" />
          <div>
            <h4 className="font-semibold text-yellow-200 mb-1">Resilience Promise</h4>
            <p className="text-sm text-silver-300 leading-relaxed mb-2">
              If the printer disconnects mid-event, ARAY will never lose a capture. Files save first,
              print jobs queue patiently, and you can reprint anything from the Gallery at any time.
            </p>
            <p className="text-xs text-silver-500">
              <strong>Debug:</strong> Buka <code className="text-purple-haze-300">%APPDATA%/ARAY/aray-startup.log</code> untuk lihat detail detection (strategi 1/2/3).
            </p>
          </div>
        </div>
      </ArayCard>

      <div className="flex justify-center pt-4">
        <ArayLogo size="sm" showTagline={false} className="opacity-30" />
      </div>
    </div>
  )
}
