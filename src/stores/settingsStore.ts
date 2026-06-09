import { create } from 'zustand'
import type { AppSettings } from '../types'

const DEFAULT_SETTINGS: AppSettings = {
  provider: 'claude',
  apiKey: '',
  baseUrl: '',
  model: '',
  modelContextWindow: 200000,
  savedModels: [],
  compressionSensitivity: 40,
  theme: 'dark',
  fetchedModels: [],
  authorName: '',
  authorBio: '',
  authorAvatar: '',
}

interface SettingsStore {
  settings: AppSettings
  activeSettingsTab: string
  setActiveSettingsTab: (tab: string) => void
  updateSettings: (partial: Partial<AppSettings>) => void
  isConfigured: () => boolean
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  activeSettingsTab: 'providers',

  setActiveSettingsTab: (tab) => set({ activeSettingsTab: tab }),

  updateSettings: (partial) => {
    set((state) => ({
      settings: { ...state.settings, ...partial },
    }))
  },

  isConfigured: () => {
    return !!get().settings.apiKey
  },
}))
