import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { LayoutTemplate, Check, Eye, Upload, Trash2, Plus, X } from 'lucide-react'
import { ArayCard, ArayButton, ArayBadge } from '../components/ui'
import {
  TEMPLATES, type ArayTemplateDef,
  getCustomTemplates, saveCustomTemplate, deleteCustomTemplate,
  getLayoutShotCount, getAvailableLayouts, type CustomTemplate
} from '../services/templates'
import { useSettingsStore } from '../stores/settings'

export function TemplatesPage() {
  const { settings, updateSettings } = useSettingsStore()
  const [selectedId, setSelectedId] = useState<string>(settings?.selected_template_id || 'classic-strip-4')
  const [previewTemplate, setPreviewTemplate] = useState<ArayTemplateDef | null>(null)
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([])
  const [showUploadModal, setShowUploadModal] = useState(false)
  const LAYOUTS = getAvailableLayouts()
  const [uploadName, setUploadName] = useState('')
  const [uploadLayout, setUploadLayout] = useState('classic-strip-4')
  const [uploadFrameData, setUploadFrameData] = useState<string | null>(null)
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (settings?.selected_template_id) setSelectedId(settings.selected_template_id)
    setCustomTemplates(getCustomTemplates())
  }, [settings?.selected_template_id])

  const handleSelect = (id: string, shotCount: number) => {
    setSelectedId(id)
    updateSettings({ selected_template_id: id, booth_shot_count: shotCount })
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (PNG with transparency recommended)')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setUploadFrameData(dataUrl)
      setUploadPreview(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  const handleSaveCustom = async () => {
    if (!uploadName.trim() || !uploadFrameData) return

    // Get PNG natural dimensions for pixel-perfect composite
    let pngWidth = 1080
    let pngHeight = 1920
    try {
      const img = new Image()
      img.src = uploadFrameData
      await new Promise<void>((resolve) => {
        img.onload = () => {
          pngWidth = img.naturalWidth || 1080
          pngHeight = img.naturalHeight || 1920
          resolve()
        }
        img.onerror = () => resolve()
      })
    } catch {}

    const custom: CustomTemplate = {
      id: 'custom-' + Date.now(),
      name: uploadName.trim(),
      frameDataUrl: uploadFrameData,
      shotCount: getLayoutShotCount(uploadLayout),
      layout: uploadLayout as any,
      canvasWidth: pngWidth,
      canvasHeight: pngHeight
    }
    saveCustomTemplate(custom)
    setCustomTemplates(getCustomTemplates())
    setShowUploadModal(false)
    setUploadName('')
    setUploadFrameData(null)
    setUploadPreview(null)
    setUploadLayout('strip-4')
  }

  const handleDeleteCustom = (id: string) => {
    if (!confirm('Delete this custom template?')) return
    deleteCustomTemplate(id)
    setCustomTemplates(getCustomTemplates())
    if (selectedId === id) {
      setSelectedId('classic-strip-4')
      updateSettings({ selected_template_id: 'classic-strip-4', booth_shot_count: 4 })
    }
  }

  const closeUploadModal = () => {
    setShowUploadModal(false)
    setUploadName('')
    setUploadFrameData(null)
    setUploadPreview(null)
    setUploadLayout('strip-4')
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-1 aray-gradient-text">Templates</h1>
          <p className="text-silver-400 text-sm">
            Pilih template untuk auto-composite foto. <span className="italic">Memory unlocked.</span>
          </p>
        </div>
        <ArayButton variant="gold" icon={<Upload className="w-4 h-4" />} onClick={() => setShowUploadModal(true)}>
          Upload Custom Frame
        </ArayButton>
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
              foto akan otomatis di-composite (digabung) ke dalam template. Hasil composite tersimpan
              di folder <code className="text-gold-300">Photos/Prints/</code>.
              <br /><br />
              <strong className="text-purple-haze-200">Custom Frame:</strong> Upload gambar PNG (dengan transparansi)
              yang berfungsi sebagai frame overlay. Foto akan ditempatkan di belakang frame.
              Pilih layout yang sesuai dengan frame Anda (4 strip, 2×2 grid, 3 horizontal, atau single).
            </p>
          </div>
        </div>
      </ArayCard>

      {/* Selected template indicator */}
      <div className="flex items-center gap-3 p-4 rounded-xl bg-purple-haze-500/10 border border-purple-haze-500/20">
        <Check className="w-5 h-5 text-green-400" />
        <span className="text-sm text-silver-200">
          Template aktif:{' '}
          <strong className="text-purple-haze-100">
            {TEMPLATES.find(t => t.id === selectedId)?.name ||
             customTemplates.find(t => t.id === selectedId)?.name ||
             'None'}
          </strong>
        </span>
        <span className="text-xs text-silver-500 ml-auto">
          {TEMPLATES.find(t => t.id === selectedId)?.shotCount ||
           customTemplates.find(t => t.id === selectedId)?.shotCount ||
           4} shots required
        </span>
      </div>

      {/* Built-in templates */}
      <div>
        <h2 className="text-lg font-semibold mb-3 text-silver-200">Built-in Templates</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TEMPLATES.map((template) => (
            <motion.div
              key={template.id}
              whileHover={{ y: -3 }}
              onClick={() => handleSelect(template.id, template.shotCount)}
              className={`rounded-2xl overflow-hidden border-2 cursor-pointer transition-all ${
                selectedId === template.id
                  ? 'border-gold-400 shadow-glow-gold'
                  : 'border-silver-300/10 hover:border-purple-haze-500/40'
              }`}
            >
              <div
                className="aspect-[3/4] relative p-3 flex flex-col"
                style={{ background: template.bgColor }}
              >
                <div className="absolute inset-2 border-2 rounded" style={{ borderColor: template.frameColor }} />
                <div className="absolute inset-3 border rounded" style={{ borderColor: template.accentColor }} />
                <div className="flex-1 grid gap-1.5 relative z-10 p-2"
                     style={{
                       gridTemplateColumns: template.canvasWidth > template.canvasHeight ? `repeat(${template.slots.length}, 1fr)` : '1fr',
                       gridTemplateRows: template.canvasWidth > template.canvasHeight ? '1fr' : `repeat(${template.slots.length}, 1fr)`
                     }}>
                  {template.slots.map((_, i) => (
                    <div key={i} className="bg-black/40 rounded border" style={{ borderColor: template.frameColor }} />
                  ))}
                </div>
                <div className="relative z-10 text-center mt-1">
                  <div className="font-bold text-sm" style={{ color: template.accentColor }}>
                    {template.titleText}
                  </div>
                </div>
                {selectedId === template.id && (
                  <div className="absolute top-2 right-2 z-20 bg-gold-400 rounded-full p-1">
                    <Check className="w-3 h-3 text-purple-haze-950" strokeWidth={3} />
                  </div>
                )}
              </div>
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
      </div>

      {/* Custom templates */}
      {customTemplates.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 text-silver-200">Custom Templates</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {customTemplates.map((custom) => (
              <motion.div
                key={custom.id}
                whileHover={{ y: -3 }}
                onClick={() => handleSelect(custom.id, custom.shotCount)}
                className={`rounded-2xl overflow-hidden border-2 cursor-pointer transition-all ${
                  selectedId === custom.id
                    ? 'border-gold-400 shadow-glow-gold'
                    : 'border-silver-300/10 hover:border-purple-haze-500/40'
                }`}
              >
                <div className="aspect-[3/4] relative bg-black flex items-center justify-center overflow-hidden">
                  {custom.frameDataUrl && (
                    <img src={custom.frameDataUrl} alt={custom.name} className="w-full h-full object-contain" />
                  )}
                  {selectedId === custom.id && (
                    <div className="absolute top-2 right-2 z-20 bg-gold-400 rounded-full p-1">
                      <Check className="w-3 h-3 text-purple-haze-950" strokeWidth={3} />
                    </div>
                  )}
                </div>
                <div className="p-4 bg-surface-raised">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-silver-100 text-sm">{custom.name}</h3>
                    <ArayBadge variant="gold">CUSTOM</ArayBadge>
                  </div>
                  <p className="text-xs text-silver-500 mb-2">
                    Layout: {LAYOUTS.find(l => l.id === custom.layout)?.name || custom.layout}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-silver-600">{custom.shotCount} photos</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteCustom(custom.id) }}
                      className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={closeUploadModal}
        >
          <div
            className="bg-surface-raised border border-silver-300/15 rounded-2xl shadow-card w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-silver-300/10">
              <h2 className="text-lg font-semibold">Upload Custom Frame</h2>
              <button onClick={closeUploadModal} className="text-silver-400 hover:text-silver-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-silver-300 mb-1.5">Template Name</label>
                <input
                  className="aray-input"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-silver-300 mb-1.5">Layout</label>
                <select
                  className="aray-input"
                  value={uploadLayout}
                  onChange={(e) => setUploadLayout(e.target.value)}
                >
                  {LAYOUTS.map(l => (
                    <option key={l.id} value={l.id} className="bg-surface-elevated">
                      {l.name} ({l.shotCount} shots)
                    </option>
                  ))}
                </select>
                <p className="text-xs text-silver-600 mt-1">
                  Pilih layout yang sesuai dengan frame Anda
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-silver-300 mb-1.5">Frame Image (PNG with transparency)</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full p-6 border-2 border-dashed border-silver-300/30 rounded-xl hover:border-purple-haze-500/40 transition-all flex flex-col items-center justify-center gap-2 text-silver-400 hover:text-silver-200"
                >
                  {uploadPreview ? (
                    <div className="w-full">
                      <img src={uploadPreview} alt="Frame preview" className="max-h-32 mx-auto rounded" />
                      <p className="text-xs text-center mt-2 text-green-400">✓ Frame loaded</p>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-8 h-8" />
                      <span className="text-sm">Click to select image</span>
                      <span className="text-xs text-silver-600">PNG with transparency recommended</span>
                    </>
                  )}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-silver-300/10">
              <ArayButton variant="ghost" onClick={closeUploadModal}>
                Cancel
              </ArayButton>
              <ArayButton
                variant="gold"
                onClick={handleSaveCustom}
                disabled={!uploadName.trim() || !uploadFrameData}
              >
                Save Template
              </ArayButton>
            </div>
          </div>
        </div>
      )}

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
              <ArayButton variant="gold" onClick={() => { handleSelect(previewTemplate.id, previewTemplate.shotCount); setPreviewTemplate(null) }}>
                Use This Template
              </ArayButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
