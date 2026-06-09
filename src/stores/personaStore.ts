import { create } from 'zustand'
import type { Persona, StyleProfile, StylisticTags } from '../types'

function generateId() {
  return `persona-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function defaultStyleProfile(): StyleProfile {
  return {
    lexical: '',
    narrative: '',
    structural: '',
    stylistic: {
      overallTendency: '',
      rhetoricPreference: [],
      descriptionFocus: [],
      narrativeDistance: '',
    },
  }
}

interface PersonaStore {
  personas: Persona[]
  selectedPersonaId: string | null

  // CRUD
  createPersona: (name: string, sourceBookIds?: string[]) => Persona
  deletePersona: (id: string) => void
  renamePersona: (id: string, name: string) => void

  // 分析状态
  setAnalysisStatus: (id: string, status: Persona['analysisStatus']) => void

  // 文风画像编辑
  updateStyleProfile: (id: string, profile: Partial<StyleProfile>) => void
  updateStylisticTags: (id: string, tags: Partial<StylisticTags>) => void

  // 手动覆盖标记
  setManualOverride: (id: string, key: keyof StyleProfile, value: boolean) => void

  // 选择
  selectPersona: (id: string | null) => void
  getSelectedPersona: () => Persona | null
}

export const usePersonaStore = create<PersonaStore>((set, get) => ({
  personas: [],
  selectedPersonaId: null,

  createPersona: (name, sourceBookIds = []) => {
    const persona: Persona = {
      id: generateId(),
      name,
      createdAt: new Date().toISOString(),
      sourceBookIds,
      analysisStatus: 'idle',
      styleProfile: defaultStyleProfile(),
      manualOverrides: {
        lexical: false,
        narrative: false,
        structural: false,
        stylistic: false,
      },
    }
    set((state) => ({
      personas: [...state.personas, persona],
    }))
    return persona
  },

  deletePersona: (id) => {
    set((state) => ({
      personas: state.personas.filter((p) => p.id !== id),
      selectedPersonaId: state.selectedPersonaId === id ? null : state.selectedPersonaId,
    }))
  },

  renamePersona: (id, name) => {
    set((state) => ({
      personas: state.personas.map((p) =>
        p.id === id ? { ...p, name } : p
      ),
    }))
  },

  setAnalysisStatus: (id, status) => {
    set((state) => ({
      personas: state.personas.map((p) =>
        p.id === id ? { ...p, analysisStatus: status } : p
      ),
    }))
  },

  updateStyleProfile: (id, profile) => {
    set((state) => ({
      personas: state.personas.map((p) =>
        p.id === id
          ? { ...p, styleProfile: { ...p.styleProfile, ...profile } }
          : p
      ),
    }))
  },

  updateStylisticTags: (id, tags) => {
    set((state) => ({
      personas: state.personas.map((p) =>
        p.id === id
          ? {
              ...p,
              styleProfile: {
                ...p.styleProfile,
                stylistic: { ...p.styleProfile.stylistic, ...tags },
              },
            }
          : p
      ),
    }))
  },

  setManualOverride: (id, key, value) => {
    set((state) => ({
      personas: state.personas.map((p) =>
        p.id === id
          ? { ...p, manualOverrides: { ...p.manualOverrides, [key]: value } }
          : p
      ),
    }))
  },

  selectPersona: (id) => {
    set({ selectedPersonaId: id })
  },

  getSelectedPersona: () => {
    const { personas, selectedPersonaId } = get()
    return personas.find((p) => p.id === selectedPersonaId) || null
  },
}))
