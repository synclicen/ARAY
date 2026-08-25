import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Search,
  MoreVertical,
  FolderOpen,
  Copy,
  Archive,
  Trash2,
  Calendar,
  MapPin,
  User,
  X
} from 'lucide-react'
import { ArayCard, ArayButton, ArayBadge, ArayLogo } from '../components/ui'
import { useEventStore } from '../stores/events'
import type { ArayEvent } from '@shared/types'

export function EventsPage() {
  const { events, loadEvents, createEvent, deleteEvent, archiveEvent, duplicateEvent, setActiveEvent } = useEventStore()
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  const filtered = events.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.code.toLowerCase().includes(search.toLowerCase()) ||
      (e.client ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-8 space-y-6" onClick={() => setMenuOpenId(null)}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-1 aray-gradient-text">Events</h1>
          <p className="text-silver-400 text-sm">
            Manage your photo booth events. <span className="italic">Yap. Snap. Repeat.</span>
          </p>
        </div>
        <ArayButton variant="gold" icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
          New Event
        </ArayButton>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-silver-500" />
          <input
            type="text"
            placeholder="Search events..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="aray-input pl-10"
          />
        </div>
        <ArayBadge variant="silver">{events.length} total</ArayBadge>
      </div>

      {filtered.length === 0 ? (
        <ArayCard className="text-center py-16">
          <ArayLogo size="md" showTagline={false} className="mb-4 opacity-50" />
          <h3 className="text-lg font-semibold mb-2">No events yet</h3>
          <p className="text-silver-500 text-sm mb-4">
            {events.length === 0
              ? 'Create your first event to get started.'
              : 'No events match your search.'}
          </p>
          <ArayButton variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
            Create Event
          </ArayButton>
        </ArayCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              menuOpen={menuOpenId === event.id}
              onMenuToggle={(e) => {
                e.stopPropagation()
                setMenuOpenId(menuOpenId === event.id ? null : event.id)
              }}
              onOpenFolder={() => window.aray.events.openFolder(event.id)}
              onDuplicate={() => duplicateEvent(event.id)}
              onArchive={() => archiveEvent(event.id)}
              onDelete={() => {
                if (confirm(`Delete event "${event.name}"? This cannot be undone.`)) {
                  deleteEvent(event.id)
                }
              }}
              onClick={() => {
                setActiveEvent(event.id)
              }}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showCreate && (
          <CreateEventModal
            onClose={() => setShowCreate(false)}
            onCreate={async (input) => {
              const e = await createEvent(input)
              if (e) {
                setShowCreate(false)
                setActiveEvent(e.id)
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

interface EventCardProps {
  event: ArayEvent
  menuOpen: boolean
  onMenuToggle: (e: React.MouseEvent) => void
  onOpenFolder: () => void
  onDuplicate: () => void
  onArchive: () => void
  onDelete: () => void
  onClick: () => void
}

function EventCard({
  event,
  menuOpen,
  onMenuToggle,
  onOpenFolder,
  onDuplicate,
  onArchive,
  onDelete,
  onClick
}: EventCardProps) {
  return (
    <ArayCard hover className="relative">
      <button onClick={onClick} className="block w-full text-left">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-mono text-purple-haze-300">{event.code}</span>
          <ArayBadge variant={event.status === 'active' ? 'success' : event.status === 'archived' ? 'silver' : 'danger'}>
            {event.status}
          </ArayBadge>
        </div>
        <h3 className="font-semibold text-silver-100 text-lg mb-3 truncate">{event.name}</h3>
        <div className="space-y-1.5 text-xs text-silver-400">
          {event.client && (
            <div className="flex items-center gap-2">
              <User className="w-3 h-3" />
              <span>{event.client}</span>
            </div>
          )}
          {event.venue && (
            <div className="flex items-center gap-2">
              <MapPin className="w-3 h-3" />
              <span>{event.venue}</span>
            </div>
          )}
          {event.event_date && (
            <div className="flex items-center gap-2">
              <Calendar className="w-3 h-3" />
              <span>{new Date(event.event_date).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      </button>

      <div className="absolute top-3 right-3">
        <button
          onClick={onMenuToggle}
          className="p-1.5 rounded-lg hover:bg-silver-200/10 text-silver-400 hover:text-silver-100"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.12 }}
              className="absolute right-0 top-full mt-1 w-44 bg-surface-elevated border border-silver-300/15 rounded-xl shadow-card py-1 z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <MenuItem icon={<FolderOpen className="w-3.5 h-3.5" />} onClick={onOpenFolder}>
                Open Folder
              </MenuItem>
              <MenuItem icon={<Copy className="w-3.5 h-3.5" />} onClick={onDuplicate}>
                Duplicate
              </MenuItem>
              <MenuItem icon={<Archive className="w-3.5 h-3.5" />} onClick={onArchive}>
                Archive
              </MenuItem>
              <MenuItem icon={<Trash2 className="w-3.5 h-3.5" />} onClick={onDelete} danger>
                Delete
              </MenuItem>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ArayCard>
  )
}

function MenuItem({
  icon,
  onClick,
  danger,
  children
}: {
  icon: React.ReactNode
  onClick: () => void
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-silver-200/10 transition-colors ${
        danger ? 'text-red-300 hover:bg-red-500/10' : 'text-silver-200'
      }`}
    >
      {icon}
      {children}
    </button>
  )
}

function CreateEventModal({
  onClose,
  onCreate
}: {
  onClose: () => void
  onCreate: (input: {
    name: string
    client?: string
    venue?: string
    event_date?: string
    operator?: string
  }) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [client, setClient] = useState('')
  const [venue, setVenue] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [operator, setOperator] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!name.trim()) return
    setBusy(true)
    try {
      await onCreate({
        name: name.trim(),
        client: client.trim() || undefined,
        venue: venue.trim() || undefined,
        event_date: eventDate || undefined,
        operator: operator.trim() || undefined
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="bg-surface-raised border border-silver-300/15 rounded-2xl shadow-card w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-silver-300/10">
          <h2 className="text-lg font-semibold">Create New Event</h2>
          <button onClick={onClose} className="text-silver-400 hover:text-silver-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <Field label="Event Name *" hint="A friendly name for this event">
            <input
              className="aray-input"
              placeholder="Wedding of Alex & Jamie"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Client">
              <input className="aray-input" placeholder="Alex & Jamie" value={client} onChange={(e) => setClient(e.target.value)} />
            </Field>
            <Field label="Operator">
              <input className="aray-input" placeholder="Your name" value={operator} onChange={(e) => setOperator(e.target.value)} />
            </Field>
          </div>
          <Field label="Venue">
            <input className="aray-input" placeholder="Grand Ballroom Hotel" value={venue} onChange={(e) => setVenue(e.target.value)} />
          </Field>
          <Field label="Event Date">
            <input type="date" className="aray-input" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
          </Field>
        </div>
        <div className="flex items-center justify-end gap-3 p-5 border-t border-silver-300/10">
          <ArayButton variant="ghost" onClick={onClose}>
            Cancel
          </ArayButton>
          <ArayButton variant="gold" onClick={submit} loading={busy} disabled={!name.trim()}>
            Create Event
          </ArayButton>
        </div>
      </motion.div>
    </motion.div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-silver-300 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-silver-600 mt-1">{hint}</p>}
    </div>
  )
}
