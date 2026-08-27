import { create } from 'zustand'
import type { ArayMedia, MediaType, SyncStatus } from '@shared/types'

interface MediaStore {
  media: ArayMedia[]
  loading: boolean
  stats: { total: number; synced: number; pending: number; failed: number; uploading: number }
  loadMedia: (filters?: { event_id?: string; type?: MediaType; sync_status?: SyncStatus }) => Promise<void>
  loadStats: (eventId?: string) => Promise<void>
  addMedia: (m: ArayMedia) => void
  removeMedia: (id: string) => Promise<void>
}

export const useMediaStore = create<MediaStore>((set, get) => ({
  media: [],
  loading: false,
  stats: { total: 0, synced: 0, pending: 0, failed: 0, uploading: 0 },

  loadMedia: async (filters) => {
    set({ loading: true })
    try {
      const result = await window.aray.media.list(filters || {})
      if (result.success) {
        set({ media: result.data as ArayMedia[] })
      }
    } finally {
      set({ loading: false })
    }
  },

  loadStats: async (eventId) => {
    const result = await window.aray.media.stats(eventId)
    if (result.success) {
      set({ stats: result.data as any })
    }
  },

  addMedia: (m) => set({ media: [m, ...get().media] }),

  removeMedia: async (id) => {
    const result = await window.aray.media.delete(id)
    if (result.success) {
      set({ media: get().media.filter((m) => m.id !== id) })
    }
  }
}))
