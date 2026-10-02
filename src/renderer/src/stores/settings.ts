import { create } from 'zustand'
import type { AraySettings, StorageInfo } from '@shared/types'

interface SettingsStore {
  settings: AraySettings | null
  storageInfo: StorageInfo | null
  loading: boolean
  loadSettings: () => Promise<void>
  loadStorageInfo: () => Promise<void>
  updateSettings: (partial: Partial<AraySettings>) => Promise<void>
  setStoragePath: (path: string) => Promise<void>
  isFirstRun: () => boolean
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: null,
  storageInfo: null,
  loading: false,

  loadSettings: async () => {
    const result = await window.aray.settings.get()
    if (result.success) {
      set({ settings: result.data as AraySettings })
    }
  },

  loadStorageInfo: async () => {
    const result = await window.aray.storage.getInfo()
    if (result.success) {
      set({ storageInfo: result.data as StorageInfo })
    }
  },

  updateSettings: async (partial) => {
    const result = await window.aray.settings.update(partial)
    if (result.success) {
      set({ settings: result.data as AraySettings })
    }
  },

  setStoragePath: async (path) => {
    const result = await window.aray.storage.setPath(path)
    if (result.success) {
      set({ settings: result.data as AraySettings })
      await get().loadStorageInfo()
    }
  },

  isFirstRun: () => {
    const s = get().settings
    return !s || !s.first_run_completed
  }
}))
