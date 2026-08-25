import { create } from 'zustand'
import type { ArayEvent, CreateEventInput, UpdateEventInput } from '@shared/types'

interface EventStore {
  events: ArayEvent[]
  activeEventId: string | null
  loading: boolean
  loadEvents: () => Promise<void>
  createEvent: (input: CreateEventInput) => Promise<ArayEvent | null>
  updateEvent: (input: UpdateEventInput) => Promise<void>
  deleteEvent: (id: string) => Promise<void>
  archiveEvent: (id: string) => Promise<void>
  duplicateEvent: (id: string) => Promise<ArayEvent | null>
  setActiveEvent: (id: string | null) => void
  getActiveEvent: () => ArayEvent | null
}

export const useEventStore = create<EventStore>((set, get) => ({
  events: [],
  activeEventId: null,
  loading: false,

  loadEvents: async () => {
    set({ loading: true })
    try {
      const result = await window.aray.events.list(false)
      if (result.success) {
        set({ events: result.data as ArayEvent[] })
        const settings = await window.aray.settings.get()
        if (settings.success) {
          // Persist last active event id via settings? For Phase 1 keep in-memory.
        }
      }
    } finally {
      set({ loading: false })
    }
  },

  createEvent: async (input) => {
    const result = await window.aray.events.create(input)
    if (result.success) {
      const event = result.data as ArayEvent
      set({ events: [event, ...get().events], activeEventId: event.id })
      return event
    }
    return null
  },

  updateEvent: async (input) => {
    const result = await window.aray.events.update(input)
    if (result.success && result.data) {
      const updated = result.data as ArayEvent
      set({
        events: get().events.map((e) => (e.id === updated.id ? updated : e))
      })
    }
  },

  deleteEvent: async (id) => {
    const result = await window.aray.events.delete(id)
    if (result.success) {
      set({ events: get().events.filter((e) => e.id !== id) })
    }
  },

  archiveEvent: async (id) => {
    const result = await window.aray.events.archive(id)
    if (result.success && result.data) {
      const updated = result.data as ArayEvent
      set({
        events: get().events.map((e) => (e.id === updated.id ? updated : e))
      })
    }
  },

  duplicateEvent: async (id) => {
    const result = await window.aray.events.duplicate(id)
    if (result.success && result.data) {
      const dup = result.data as ArayEvent
      set({ events: [dup, ...get().events] })
      return dup
    }
    return null
  },

  setActiveEvent: (id) => set({ activeEventId: id }),

  getActiveEvent: () => {
    const { events, activeEventId } = get()
    return events.find((e) => e.id === activeEventId) ?? null
  }
}))
