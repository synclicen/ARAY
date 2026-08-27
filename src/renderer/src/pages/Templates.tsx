import { motion } from 'framer-motion'
import { LayoutTemplate, Sparkles, Plus, Wand2 } from 'lucide-react'
import { ArayCard, ArayButton, ArayBadge } from '../components/ui'

interface TemplatePreset {
  id: string
  name: string
  description: string
  variant: 'purple' | 'gold' | 'silver'
  size: string
  preview: string
}

const presets: TemplatePreset[] = [
  {
    id: 'aray-classic',
    name: 'ARAY Classic',
    description: 'Purple haze background, silver frame, gold accent.',
    variant: 'purple',
    size: '4×6',
    preview: 'from-purple-haze-700 to-purple-haze-900'
  },
  {
    id: 'aray-gold',
    name: 'ARAY Gold',
    description: 'Dark purple, gold typography, silver border.',
    variant: 'gold',
    size: '4×6',
    preview: 'from-gold-600 to-purple-haze-900'
  },
  {
    id: 'aray-silver',
    name: 'ARAY Silver',
    description: 'Purple haze with silver metallic frame and gold highlight.',
    variant: 'silver',
    size: '5×7',
    preview: 'from-silver-600 to-purple-haze-800'
  },
  {
    id: 'aray-social',
    name: 'ARAY Social',
    description: 'Fun typography, purple haze, gold CTA — built for sharing.',
    variant: 'purple',
    size: '2×6',
    preview: 'from-purple-haze-500 to-gold-500'
  }
]

export function TemplatesPage() {
  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-1 aray-gradient-text">Templates</h1>
          <p className="text-silver-400 text-sm">
            Photo layouts for print and digital composites.{' '}
            <span className="italic">Memory unlocked.</span>
          </p>
        </div>
        <ArayButton variant="gold" icon={<Plus className="w-4 h-4" />}>
          New Template
        </ArayButton>
      </div>

      <ArayCard className="p-6 bg-gradient-to-br from-purple-haze-900/40 to-transparent">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gold-400/15 flex items-center justify-center">
            <Wand2 className="w-6 h-6 text-gold-300" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold mb-1">ARAY Signature Templates</h3>
            <p className="text-silver-400 text-sm leading-relaxed">
              Every ARAY template uses the signature Purple Haze filter — soft purple tint, cinematic
              contrast, warm skin tones, and a premium finish. Templates auto-composite your booth
              shots into print-ready files. The visual editor ships in <strong className="text-gold-300">Phase 2</strong>.
            </p>
          </div>
        </div>
      </ArayCard>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {presets.map((p) => (
          <motion.div
            key={p.id}
            whileHover={{ y: -3 }}
            className="rounded-2xl overflow-hidden border border-silver-300/10 hover:border-purple-haze-500/40 transition-all cursor-pointer group"
          >
            {/* Preview */}
            <div className={`aspect-[3/4] bg-gradient-to-br ${p.preview} relative p-4 flex flex-col`}>
              <div className="absolute inset-3 border-2 border-white/20 rounded-lg" />
              <div className="absolute inset-3 border border-gold-400/40 rounded-lg" />
              <div className="flex-1 grid grid-cols-2 gap-1.5 relative z-10 p-2">
                <div className="bg-black/30 rounded" />
                <div className="bg-black/30 rounded" />
                <div className="bg-black/30 rounded" />
                <div className="bg-black/30 rounded" />
              </div>
              <div className="relative z-10 text-center mt-2">
                <div className="text-white/90 font-bold text-sm">ARAY</div>
                <div className="text-white/60 text-[10px]">{p.size}</div>
              </div>
            </div>
            {/* Meta */}
            <div className="p-4 bg-surface-raised">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-silver-100">{p.name}</h3>
                <ArayBadge variant={p.variant}>{p.variant}</ArayBadge>
              </div>
              <p className="text-xs text-silver-500">{p.description}</p>
            </div>
          </motion.div>
        ))}
      </div>

      <ArayCard className="text-center py-12">
        <LayoutTemplate className="w-12 h-12 text-silver-600 mx-auto mb-3" />
        <h3 className="text-lg font-semibold mb-1">Custom Templates</h3>
        <p className="text-silver-500 text-sm mb-4 max-w-md mx-auto">
          Build your own layout with photos, text, logos, QR codes, and decorative elements.
          Drag-and-drop editor arrives in Phase 2.
        </p>
        <ArayButton variant="silver" icon={<Sparkles className="w-4 h-4" />}>
          Get notified
        </ArayButton>
      </ArayCard>
    </div>
  )
}
