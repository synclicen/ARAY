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
  ChevronRight,
  Wand2,
  CheckSquare,
  Square,
  Check
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
  const { media, loading, loadMedia, removeMedia } = useMediaStore()
  const { events } = useEventStore()
  const [typeFilter, setTypeFilter] = useState<MediaType | 'all'>('all')
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest')
  const [eventId, setEventId] = useState<string>('')
  const [selected, setSelected] = useState<ArayMedia | null>(null)
  const [cleaningUp, setCleaningUp] = useState(false)
  // v4.0.6: Select mode for bulk delete
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  useEffect(() => {
    loadMedia({ event_id: eventId || undefined, type: typeFilter === 'all' ? undefined : typeFilter })
  }, [loadMedia, typeFilter, eventId])

  const sorted = [...media].sort((a, b) => {
    const cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    return sort === 'newest' ? -cmp : cmp
  })

  // v4.0.5: Deduplicate by original_path.
  // Before v4.0.5, all composites in the same event overwrote the same file
  // (`{eventName}_composite.jpg`), so multiple media entries pointed to the
  // same file. Gallery showed N identical thumbnails for 1 file on disk.
  // Even after the filename fix, old media entries still point to the same
  // path. Dedupe here: keep the LATEST entry per unique path, hide the rest.
  const seenPaths = new Set<string>()
  const deduped = sorted.filter((m) => {
    const p = m.original_path || ''
    if (!p) return true  // keep entries without path (shouldn't happen)
    if (seenPaths.has(p)) return false  // duplicate — skip
    seenPaths.add(p)
    return true
  })

  // v4.0.4: Clean up raw shots — delete all media entries whose original_path
  // points to a raw shot file (path contains /Original/ or \Original\).
  // Composite files live in /Prints/ with "_composite" in the name, so they're safe.
  // This removes the clutter of individual raw shots from previous sessions,
  // keeping only the final composite per session.
  const rawShots = media.filter(m => {
    const p = m.original_path || ''
    return p.includes('/Original/') || p.includes('\\Original\\')
  })

  const handleCleanupRawShots = async () => {
    if (rawShots.length === 0) return
    const msg = `This will permanently delete ${rawShots.length} raw shot(s) from your gallery and disk.\n\n` +
      'Composite images will NOT be deleted — only individual raw shots.\n\n' +
      'Proceed?'
    if (!confirm(msg)) return
    setCleaningUp(true)
    try {
      for (const shot of rawShots) {
        await removeMedia(shot.id)
      }
      // Reload to reflect changes
      await loadMedia({ event_id: eventId || undefined, type: typeFilter === 'all' ? undefined : typeFilter })
    } finally {
      setCleaningUp(false)
    }
  }

  // v4.0.6: Select mode handlers
  const toggleSelectMode = () => {
    if (selectMode) {
      // Exiting select mode — clear selection
      setSelectedIds(new Set())
    }
    setSelectMode(!selectMode)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectAll = () => {
    setSelectedIds(new Set(deduped.map((m) => m.id)))
  }

  const deselectAll = () => {
    setSelectedIds(new Set())
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    const msg = `This will permanently delete ${selectedIds.size} item(s) from your gallery and disk.\n\nProceed?`
    if (!confirm(msg)) return
    setBulkDeleting(true)
    try {
      const ids = Array.from(selectedIds)
      for (const id of ids) {
        await removeMedia(id)
      }
      setSelectedIds(new Set())
      setSelectMode(false)
      await loadMedia({ event_id: eventId || undefined, type: typeFilter === 'all' ? undefined : typeFilter })
    } finally {
      setBulkDeleting(false)
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-1 aray-gradient-text">Gallery</h1>
          <p className="text-silver-400 text-sm">
            Every memory, in one place. <span className="italic">That was cute.</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {rawShots.length > 0 && !selectMode && (
            <ArayButton
              variant="ghost"
              icon={<Wand2 className="w-4 h-4" />}
              disabled={cleaningUp}
              onClick={handleCleanupRawShots}
              className="text-purple-haze-200 border border-purple-haze-500/30"
            >
              {cleaningUp ? 'Cleaning…' : `Clean up raw shots (${rawShots.length})`}
            </ArayButton>
          )}
          {/* v4.0.6: Select mode toggle */}
          <ArayButton
            variant={selectMode ? "gold" : "ghost"}
            icon={<CheckSquare className="w-4 h-4" />}
            onClick={toggleSelectMode}
            className={selectMode ? '' : 'text-silver-200 border border-silver-300/20'}
          >
            {selectMode ? 'Exit Select' : 'Select'}
          </ArayButton>
          {selectMode && (
            <>
              <ArayButton
                variant="ghost"
                icon={<CheckSquare className="w-4 h-4" />}
                onClick={selectedIds.size === deduped.length ? deselectAll : selectAll}
                className="text-silver-200 border border-silver-300/20"
              >
                {selectedIds.size === deduped.length && deduped.length > 0
                  ? `Deselect All (${deduped.length})`
                  : `Select All (${deduped.length})`}
              </ArayButton>
              {selectedIds.size > 0 && (
                <ArayButton
                  variant="danger"
                  icon={<Trash2 className="w-4 h-4" />}
                  disabled={bulkDeleting}
                  onClick={handleBulkDelete}
                >
                  {bulkDeleting ? 'Deleting…' : `Delete (${selectedIds.size})`}
                </ArayButton>
              )}
            </>
          )}
          <ArayButton variant="silver" icon={<RefreshCw className="w-4 h-4" />} onClick={() => loadMedia()}>
            Refresh
          </ArayButton>
        </div>
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
      {deduped.length === 0 ? (
        <ArayCard className="text-center py-16">
          <ArayLogo size="md" showTagline={false} className="mb-4 opacity-50" />
          <h3 className="text-lg font-semibold mb-2">No memories yet</h3>
          <p className="text-silver-500 text-sm">
            Head over to the Booth to capture your first photo.
          </p>
        </ArayCard>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {deduped.map((m) => (
            <MediaTile
              key={m.id}
              media={m}
              onClick={() => setSelected(m)}
              selectMode={selectMode}
              isSelected={selectedIds.has(m.id)}
              onToggleSelect={() => toggleSelect(m.id)}
            />
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
              const idx = deduped.findIndex((m) => m.id === selected.id)
              if (idx > 0) setSelected(deduped[idx - 1])
            }}
            onNext={() => {
              const idx = deduped.findIndex((m) => m.id === selected.id)
              if (idx < deduped.length - 1) setSelected(deduped[idx + 1])
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function MediaTile({
  media,
  onClick,
  selectMode = false,
  isSelected = false,
  onToggleSelect
}: {
  media: ArayMedia
  onClick: () => void
  selectMode?: boolean
  isSelected?: boolean
  onToggleSelect?: () => void
}) {
  const [imgError, setImgError] = useState(false)
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const isVideo = media.type === 'video'

  useEffect(() => {
    let cancelled = false
    async function load() {
      // v4.3.6: For video, pakai aray-file:// protocol (efficient, no base64)
      if (isVideo) {
        const normalizedPath = (media.original_path || '').replace(/\\/g, '/')
        const encodedPath = encodeURIComponent(normalizedPath)
        const url = `aray-file:///${encodedPath}`
        if (!cancelled) setImgSrc(url)
        return
      }
      // For photo, use thumbnail_path via base64 (file kecil, OK)
      const path = media.thumbnail_path
      if (path) {
        try {
          const result = await window.aray.media.readFile(path)
          if (!cancelled && result.success) {
            const ext = path.toLowerCase().split('.').pop() || ''
            const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
            setImgSrc(`data:${mime};base64,${result.data}`)
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
  }, [media.thumbnail_path, media.original_path, isVideo])

  const handleClick = () => {
    if (selectMode && onToggleSelect) {
      onToggleSelect()
    } else {
      onClick()
    }
  }

  return (
    <motion.button
      whileHover={{ y: -2 }}
      onClick={handleClick}
      className={`relative aspect-[3/2] rounded-xl overflow-hidden transition-all group ${
        selectMode && isSelected
          ? 'border-4 border-gold-400 shadow-glow-gold'
          : selectMode
            ? 'border-2 border-silver-300/20 hover:border-gold-400/50'
            : 'border border-silver-300/10 hover:border-purple-haze-500/40'
      }`}
    >
      {imgSrc && !imgError ? (
        isVideo ? (
          <>
            <video
              src={imgSrc}
              className="w-full h-full object-cover"
              muted
              preload="metadata"
            />
            {/* Play badge untuk indicate video */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center">
                <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
            <div className="absolute top-2 left-2">
              <ArayBadge variant="purple">VIDEO</ArayBadge>
            </div>
          </>
        ) : (
          <img src={imgSrc} alt={media.id} className="w-full h-full object-cover" />
        )
      ) : (
        <div className="w-full h-full bg-purple-haze-900/40 flex items-center justify-center">
          <Images className="w-8 h-8 text-silver-600" />
        </div>
      )}

      {/* Select mode checkbox overlay */}
      {selectMode && (
        <div className={`absolute top-2 left-2 z-10 w-7 h-7 rounded-full flex items-center justify-center transition-all ${
          isSelected
            ? 'bg-gold-400 text-purple-haze-950'
            : 'bg-black/60 text-silver-300 border-2 border-silver-300/40'
        }`}>
          {isSelected ? <Check className="w-5 h-5" /> : <Square className="w-4 h-4" />}
        </div>
      )}

      {!selectMode && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <AraySyncStatus status={media.sync_status} compact />
        </div>
      )}
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
  const [videoSrc, setVideoSrc] = useState<string | null>(null)
  const [fileInfo, setFileInfo] = useState<{ sizeMB: number } | null>(null)
  const isVideo = media.type === 'video'

  useEffect(() => {
    let cancelled = false
    async function load() {
      const path = media.original_path
      if (!path) return

      // v4.3.6: For video, pakai aray-file:// protocol (stream dari disk).
      // Encode path untuk handle spaces dan special chars.
      if (isVideo) {
        // Windows path: C:\Users\Fajri Bowo\...\video.webm
        // -> replace \ with / -> C:/Users/Fajri Bowo/.../video.webm
        // -> encodeURIComponent setiap segment -> C%3A%2FUsers%2FFajri%20Bowo%2F...
        // -> aray-file:/// + encoded path
        const normalizedPath = path.replace(/\\/g, '/')
        // Encode entire path — protocol handler akan decode
        const encodedPath = encodeURIComponent(normalizedPath)
        const url = `aray-file:///${encodedPath}`
        console.log('[Gallery] Video URL:', url)
        console.log('[Gallery] Video path:', path)
        if (!cancelled) setVideoSrc(url)

        // Get file info untuk debug
        try {
          const info = await window.aray.media.getFileInfo(path)
          if (!cancelled && info?.success) {
            const data = info.data as any
            console.log('[Gallery] Video file size:', data.sizeMB, 'MB')
            setFileInfo({ sizeMB: data.sizeMB })
          } else {
            console.error('[Gallery] Video file not found or error:', info)
          }
        } catch (e) {
          console.error('[Gallery] getFileInfo failed:', e)
        }
        return
      }

      // For photo, pakai base64 (file kecil, OK)
      try {
        const result = await window.aray.media.readFile(path)
        if (!cancelled && result.success) {
          const ext = path.toLowerCase().split('.').pop() || ''
          let mime: string
          if (isVideo) {
            mime = ext === 'mp4' ? 'video/mp4' : ext === 'webm' ? 'video/webm' : 'video/webm'
          } else {
            mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
          }
          setImgSrc(`data:${mime};base64,${result.data}`)
        }
      } catch (e) {
        console.error(e)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [media, isVideo])

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
          {isVideo ? (
            videoSrc ? (
              <video
                src={videoSrc}
                controls
                autoPlay
                className="max-w-full max-h-[70vh] object-contain"
              />
            ) : (
              <div className="text-silver-500">Loading video...</div>
            )
          ) : imgSrc ? (
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
              onClick={async () => {
                // v4.3.5: Open folder + select file di Explorer.
                // Pakai media.openInFolder (shell.showItemInFolder) — buka folder
                // yang contain file lalu select file tsb.
                if (media.original_path) {
                  await window.aray.media.openInFolder(media.original_path)
                } else if (media.event_id) {
                  // Fallback: open event folder
                  await window.aray.events.openFolder(media.event_id)
                }
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
