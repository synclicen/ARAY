import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { LayoutTemplate, Check, Eye } from 'lucide-react'
import { ArayCard, ArayButton, ArayBadge } from '../components/ui'
import { TEMPLATES, type ArayTemplateDef } from '../services/templates'
import { useSettingsStore } from '../stores/settings'

export function TemplatesPage() {
  const { settings, updateSettings } = useSettingsStore()
  const [selectedId, setSelectedId] = useState<string>(settings?.selected_template_id || 'classic-strip-4')
  const [previewTemplate, setPreviewTemplate] = useState<ArayTemplateDef | null>(null)

  useEffect(() => {
    if (settings?.selected_template_id) setSelectedId(settings.selected_template_id)
  }, [settings?.selected_template_id])

  const handleSelect = (template: ArayTemplateDef) => {
    setSelectedId(template.id)
    updateSettings({ selected_template_id: template.id, booth_shot_count: template.shotCount })
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-1 aray-gradient-text">Templates</h1>
        <p className="text-silver-400 text-sm">
          Pilih template untuk auto-composite foto. <span className="italic">Memory unlocked.</span>
        </p>
      </div>

      <ArayCard className="p-6 bg-gradient-to-br from-purple-haze-900/40 to-transparent">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gold-400/15 flex items-center justify-center">
            <LayoutTemplate className="w-6 h-6 text-gold-300" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold mb-1">Cara Kerja Template</h3>
            <p className="text-silver-400 text-sm leading-relaxed">
              Pilih template di bawah. Saat Anda capture foto di Booth, setelah semua shot selesai,
              foto akan otomatis di-composite (digabung) ke dalam template yang dipilih.
              Hasil composite tersimpan di folder <code className="text-gold-300">Photos/Prints/</code>.
              Template menentukan jumlah shot yang diperlukan.
            </p>
          </div>
        </div>
      </ArayCard>

      {/* Selected template indicator */}
      <div className="flex items-center gap-3 p-4 rounded-xl bg-purple-haze-500/10 border border-purple-haze-500/20">
        <Check className="w-5 h-5 text-green-400" />
        <span className="text-sm text-silver-200">
          Template aktif: <strong className="text-purple-haze-100">
            {TEMPLATES.find(t => t.id === selectedId)?.name || 'None'}
          </strong>
        </span>
        <span className="text-xs text-silver-500 ml-auto">
          {TEMPLATES.find(t => t.id === selectedId)?.shotCount} shots required
        </span>
      </div>

      {/* Template grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {TEMPLATES.map((template) => (
          <motion.div
            key={template.id}
            whileHover={{ y: -3 }}
            onClick={() => handleSelect(template)}
            className={`rounded-2xl overflow-hidden border-2 cursor-pointer transition-all ${
              selectedId === template.id
                ? 'border-gold-400 shadow-glow-gold'
                : 'border-silver-300/10 hover:border-purple-haze-500/40'
            }`}
          >
            {/* Preview — mini canvas rendering of slot layout */}
            <div
              className="aspect-[3/4] relative p-3 flex flex-col"
              style={{ background: template.bgColor }}
            >
              {/* Outer frame */}
              <div
                className="absolute inset-2 border-2 rounded"
                style={{ borderColor: template.frameColor }}
              />
              <div
                className="absolute inset-3 border rounded"
                style={{ borderColor: template.accentColor }}
              />

              {/* Slots */}
              <div className="flex-1 grid gap-1.5 relative z-10 p-2"
                   style={{
                     gridTemplateColumns: template.canvasWidth > template.canvasHeight ? `repeat(${template.slots.length}, 1fr)` : '1fr',
                     gridTemplateRows: template.canvasWidth > template.canvasHeight ? '1fr' : `repeat(${template.slots.length}, 1fr)`
                   }}>
                {template.slots.map((slot, i) => (
                  <div
                    key={i}
                    className="bg-black/40 rounded border"
                    style={{ borderColor: template.frameColor }}
                  />
                ))}
              </div>

              {/* Title */}
              <div className="relative z-10 text-center mt-1">
                <div className="text-white/90 font-bold text-sm" style={{ color: template.accentColor }}>
                  {template.titleText}
                </div>
              </div>

              {/* Selected badge */}
              {selectedId === template.id && (
                <div className="absolute top-2 right-2 z-20 bg-gold-400 rounded-full p-1">
                  <Check className="w-3 h-3 text-purple-haze-950" strokeWidth={3} />
                </div>
              )}
            </div>

            {/* Meta */}
            <div className="p-4 bg-surface-raised">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-silver-100 text-sm">{template.name}</h3>
                <ArayBadge variant={template.variant}>{template.variant}</ArayBadge>
              </div>
              <p className="text-xs text-silver-500 mb-2">{template.description}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-silver-600">{template.shotCount} photos</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setPreviewTemplate(template) }}
                  className="text-xs text-purple-haze-300 hover:text-purple-haze-100 flex items-center gap-1"
                >
                  <Eye className="w-3 h-3" /> Preview
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Preview modal */}
      {previewTemplate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
          onClick={() => setPreviewTemplate(null)}
        >
          <div
            className="bg-surface-raised border border-silver-300/15 rounded-2xl p-6 max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">{previewTemplate.name}</h3>
            <div
              className="mx-auto rounded-lg overflow-hidden border-2"
              style={{
                background: previewTemplate.bgColor,
                borderColor: previewTemplate.frameColor,
                aspectRatio: `${previewTemplate.canvasWidth} / ${previewTemplate.canvasHeight}`,
                maxWidth: previewTemplate.canvasWidth > previewTemplate.canvasHeight ? '600px' : '300px',
                position: 'relative'
              }}
            >
              <div className="absolute inset-2 border rounded" style={{ borderColor: previewTemplate.accentColor }} />
              <div
                className="absolute inset-4 grid gap-2"
                style={{
                  gridTemplateColumns: previewTemplate.canvasWidth > previewTemplate.canvasHeight ? `repeat(${previewTemplate.slots.length}, 1fr)` : '1fr',
                  gridTemplateRows: previewTemplate.canvasWidth > previewTemplate.canvasHeight ? '1fr' : `repeat(${previewTemplate.slots.length}, 1fr)`
                }}
              >
                {previewTemplate.slots.map((_, i) => (
                  <div key={i} className="bg-black/50 rounded border" style={{ borderColor: previewTemplate.frameColor }} />
                ))}
              </div>
              {previewTemplate.titleText && (
                <div
                  className="absolute bottom-3 left-0 right-0 text-center font-bold text-lg"
                  style={{ color: previewTemplate.accentColor }}
                >
                  {previewTemplate.titleText}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-silver-400">{previewTemplate.shotCount} photos · {previewTemplate.canvasWidth}×{previewTemplate.canvasHeight}px</span>
              <ArayButton variant="gold" onClick={() => { handleSelect(previewTemplate); setPreviewTemplate(null) }}>
                Use This Template
              </ArayButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
