/**
 * Zustand state persistence via localStorage
 */
import { useBookStore } from '../stores/bookStore'
import { useEditorStore } from '../stores/editorStore'
import { usePersonaStore } from '../stores/personaStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useMemoryStore } from '../stores/memoryStore'

const STORAGE_KEY = 'novel-creator-state'

interface PersistedState {
  books: ReturnType<typeof useBookStore.getState>['books']
  currentBookId: string | null
  chapters: Record<string, ReturnType<typeof useBookStore.getState>['chapters'][string]>
  draftStatus: ReturnType<typeof useBookStore.getState>['draftStatus']
  editorFilesByBook: ReturnType<typeof useEditorStore.getState>['filesByBook']
  personas: ReturnType<typeof usePersonaStore.getState>['personas']
  settings: ReturnType<typeof useSettingsStore.getState>['settings']
  memoryEvents: Record<string, ReturnType<typeof useMemoryStore.getState>['events'][string]>
  memoryThreads: Record<string, ReturnType<typeof useMemoryStore.getState>['threads'][string]>
}

const STORES_TO_PERSIST = [useBookStore, useEditorStore, usePersonaStore, useSettingsStore, useMemoryStore]

export function saveState() {
  try {
    const bookState = useBookStore.getState()
    const editorState = useEditorStore.getState()
    const memoryState = useMemoryStore.getState()
    const state: PersistedState = {
      books: bookState.books,
      currentBookId: bookState.currentBookId,
      chapters: bookState.chapters,
      draftStatus: bookState.draftStatus,
      editorFilesByBook: editorState.filesByBook,
      personas: usePersonaStore.getState().personas,
      settings: useSettingsStore.getState().settings,
      memoryEvents: memoryState.events,
      memoryThreads: memoryState.threads,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (e) {
    console.warn('Failed to save state:', e)
  }
}

export function loadState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function initPersistence() {
  // 加载已保存的状态
  const saved = loadState()
  if (saved) {
    useBookStore.setState({
      books: saved.books,
      currentBookId: saved.currentBookId ?? null,
      chapters: saved.chapters ?? {},
      draftStatus: saved.draftStatus ?? 'idle',
    })
    if (saved.editorFilesByBook) {
      useEditorStore.setState({ filesByBook: saved.editorFilesByBook })
    }
    usePersonaStore.setState({ personas: saved.personas })
    if (saved.settings) {
      useSettingsStore.setState({ settings: saved.settings })
    }
    if (saved.memoryEvents || saved.memoryThreads) {
      useMemoryStore.setState({
        events: saved.memoryEvents ?? {},
        threads: saved.memoryThreads ?? {},
      })
    }
  }

  // 节流保存：每 5 秒最多保存一次
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  function throttledSave() {
    if (saveTimer) return
    saveTimer = setTimeout(() => {
      saveState()
      saveTimer = null
    }, 5000)
  }

  // 自动保存
  const unsubscribeFns = STORES_TO_PERSIST.map((store) =>
    store.subscribe(throttledSave)
  )

  // 页面关闭时立即保存
  window.addEventListener('beforeunload', saveState)

  return () => {
    if (saveTimer) clearTimeout(saveTimer)
    unsubscribeFns.forEach((fn) => fn())
    window.removeEventListener('beforeunload', saveState)
  }
}
