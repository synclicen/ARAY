import { Printer as PrinterIcon, Plus, Settings as SettingsIcon, AlertCircle } from 'lucide-react'
import { ArayCard, ArayButton, ArayBadge, ArayLogo } from '../components/ui'

export function PrinterPage() {
  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-1 aray-gradient-text">Printer</h1>
          <p className="text-silver-400 text-sm">
            Print memories straight from the booth. <span className="italic">Say cheese!</span>
          </p>
        </div>
        <ArayButton variant="gold" icon={<Plus className="w-4 h-4" />}>
          Add Printer
        </ArayButton>
      </div>

      <ArayCard className="p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-purple-haze-500/15 flex items-center justify-center mx-auto mb-4">
          <PrinterIcon className="w-8 h-8 text-purple-haze-200" />
        </div>
        <h3 className="text-xl font-semibold mb-2">No printers configured</h3>
        <p className="text-silver-400 text-sm mb-6 max-w-md mx-auto">
          ARAY supports any Windows printer. Add one to enable auto-print and the print queue. Even
          without a printer, all captures are saved safely to local storage.
        </p>
        <ArayButton variant="primary" icon={<SettingsIcon className="w-4 h-4" />}>
          Detect Printers
        </ArayButton>
      </ArayCard>

      <ArayCard className="p-6">
        <h3 className="font-semibold mb-4">Print Queue</h3>
        <div className="space-y-2">
          {['Queued', 'Printing', 'Printed', 'Failed'].map((status) => (
            <div
              key={status}
              className="flex items-center justify-between p-3 rounded-lg bg-surface-elevated/40"
            >
              <span className="text-sm text-silver-300">{status}</span>
              <ArayBadge variant={status === 'Printed' ? 'success' : status === 'Failed' ? 'danger' : 'silver'}>
                0 jobs
              </ArayBadge>
            </div>
          ))}
        </div>
      </ArayCard>

      <ArayCard className="p-6 bg-gradient-to-br from-yellow-500/5 to-transparent border-yellow-500/20">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-300 mt-0.5 shrink-0" />
          <div>
            <h4 className="font-semibold text-yellow-200 mb-1">Resilience Promise</h4>
            <p className="text-sm text-silver-300 leading-relaxed">
              If the printer disconnects mid-event, ARAY will never lose a capture. Files save first,
              print jobs queue patiently, and you can reprint anything from the Gallery at any time.
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
