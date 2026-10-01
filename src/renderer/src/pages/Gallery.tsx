import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Images,
  Filter,
  Trash2,
  Printer,
  Share2,
  FolderOpen,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { ArayCard, ArayButton, ArayBadge, ArayLogo, AraySyncStatus } from '../components/ui'
import { useMediaStore } from '../stores/media'
import { useEventStore } from '../stores/events'
import type { ArayMedia, MediaType, SyncStatus } from '@shared/types'

const typeFilters: { value: MediaType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'photo', label: 'Photos' },
  { value: 'gif', label: 'GIFs' },
  { value: 'boomerang', label: 'Boomerang' },
  { value: 'video', label: 'Videos' }
]

const sortOptions = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' }
]

export function GalleryPage() {
  const { media, loading, loadMedia } = useMediaStore()
  const { events } = useEventStore()
  const [typeFilter, setTypeFilter] = useState<MediaType | 'all'>('all')
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest')
  const [eventId, setEventId] = useState<string>('')
  const [selected, setSelected] = useState<ArayMedia | null>(null)

  useEffect(() => {
    loadMedia({ event_id: eventId || undefined, type: typeFilter === 'all' ? undefined : typeFilter })
  }, [loadMedia, typeFilter, eventId])

  const sorted = [...media].sort((a, b) => {
    const cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    return sort === 'newest' ? -cmp : cmp
  })

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-1 aray-gradient-text">Gallery</h1>
          <p className="text-silver-400 text-sm">
            Every memory, in one place. <span className="italic">That was cute.</span>
          </p>
        </div>
        <ArayButton variant="silver" icon={<RefreshCw className="w-4 h-4" />} onClick={() => loadMedia()}>
          Refresh
        </ArayButton>
      </div>

      {/* Filters */}
      <ArayCard className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-silver-400" />
            <span className="text-xs text-silver-400 uppercase tracking-wide">Type</span>
          </div>
          <div className="flex items-center gap-1.5">
            {typeFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => setTypeFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  typeFilter === f.value
                    ? 'bg-purple-haze-500/25 text-purple-haze-100 border border-purple-haze-500/40'
                    : 'bg-silver-200/5 text-silver-400 hover:bg-silver-200/10 border border-transparent'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="h-6 w-px bg-silver-300/10" />

          <select
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="aray-input max-w-xs text-xs py-1.5"
          >
            <option value="">All events</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as any)}
            className="aray-input max-w-xs text-xs py-1.5"
          >
            {sortOptions.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          <div className="ml-auto">
            <ArayBadge variant="silver">{media.length} items</ArayBadge>
          </div>
        </div>
      </ArayCard>

      {/* Grid */}
      {sorted.length === 0 ? (
        <ArayCard className="text-center py-16">
          <ArayLogo size="md" showTagline={false} className="mb-4 opacity-50" />
          <h3 className="text-lg font-semibold mb-2">No memories yet</h3>
          <p className="text-silver-500 text-sm">
            Head over to the Booth to capture your first photo.
          </p>
        </ArayCard>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {sorted.map((m) => (
            <MediaTile key={m.id} media={m} onClick={() => setSelected(m)} />
          ))}
        </div>
      )}

      {/* Detail modal */}
      <AnimatePresence>
        {selected && (
          <MediaDetailModal
            media={selected}
            onClose={() => setSelected(null)}
            onPrev={() => {
              const idx = sorted.findIndex((m) => m.id === selected.id)
              if (idx > 0) setSelected(sorted[idx - 1])
            }}
            onNext={() => {
              const idx = sorted.findIndex((m) => m.id === selected.id)
              if (idx < sorted.length - 1) setSelected(sorted[idx + 1])
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function MediaTile({ media, onClick }: { media: ArayMedia; onClick: () => void }) {
  const [imgError, setImgError] = useState(false)
  const [imgSrc, setImgSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (media.thumbnail_path) {
        try {
          const result = await window.aray.media.readFile(media.thumbnail_path)
          if (!cancelled && result.success) {
            setImgSrc(`data:image/jpeg;base64,${result.data}`)
          }
        } catch {
          setImgError(true)
        }
      } else {
        setImgError(true)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [media.thumbnail_path])

  return (
    <motion.button
      whileHover={{ y: -2 }}
      onClick={onClick}
      className="relative aspect-[3/2] rounded-xl overflow-hidden border border-silver-300/10 hover:border-purple-haze-500/40 transition-all group"
    >
      {imgSrc && !imgError ? (
        <img src={imgSrc} alt={media.id} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-purple-haze-900/40 flex items-center justify-center">
          <Images className="w-8 h-8 text-silver-600" />
        </div>
      )}
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <AraySyncStatus status={media.sync_status} compact />
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="text-[10px] text-silver-300 font-mono">
          {new Date(media.created_at).toLocaleString()}
        </div>
      </div>
    </motion.button>
  )
}

function MediaDetailModal({
  media,
  onClose,
  onPrev,
  onNext
}: {
  media: ArayMedia
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}) {
  const [imgSrc, setImgSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const path = media.original_path
      if (!path) return
      try {
        const result = await window.aray.media.readFile(path)
        if (!cancelled && result.success) {
          setImgSrc(`data:image/jpeg;base64,${result.data}`)
        }
      } catch (e) {
        console.error(e)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [media])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-8"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-raised border border-silver-300/15 rounded-2xl shadow-card w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between p-4 border-b border-silver-300/10">
          <div className="flex items-center gap-3">
            <ArayBadge variant="purple">{media.type}</ArayBadge>
            <AraySyncStatus status={media.sync_status} />
            <span className="text-xs text-silver-500 font-mono">
              {new Date(media.created_at).toLocaleString()}
            </span>
          </div>
          <button onClick={onClose} className="text-silver-400 hover:text-silver-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center bg-black p-4 relative min-h-[400px]">
          <button
            onClick={onPrev}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-silver-200 hover:bg-black/60"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          {imgSrc ? (
            <img src={imgSrc} alt={media.id} className="max-w-full max-h-[70vh] object-contain" />
          ) : (
            <div className="text-silver-500">Loading...</div>
          )}
          <button
            onClick={onNext}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-silver-200 hover:bg-black/60"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center justify-between p-4 border-t border-silver-300/10">
          <div className="text-xs text-silver-500 font-mono truncate max-w-md">
            {media.original_path}
          </div>
          <div className="flex items-center gap-2">
            <ArayButton variant="ghost" icon={<Printer className="w-4 h-4" />} onClick={() => window.aray.print.queue(media.id)}>
              Print
            </ArayButton>
            <ArayButton variant="ghost" icon={<Share2 className="w-4 h-4" />}>
              Share
            </ArayButton>
            <ArayButton
              variant="ghost"
              icon={<FolderOpen className="w-4 h-4" />}
              onClick={() => {
                const folder = media.original_path.substring(0, media.original_path.lastIndexOf('/'))
                window.aray.storage.openFolder(folder)
              }}
            >
              Open Folder
            </ArayButton>
            <ArayButton
              variant="danger"
              icon={<Trash2 className="w-4 h-4" />}
              onClick={async () => {
                if (confirm('Delete this memory? This cannot be undone.')) {
                  await window.aray.media.delete(media.id)
                  onClose()
                }
              }}
            >
              Delete
            </ArayButton>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
