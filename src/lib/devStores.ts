/**
 * Dev-only: expose Zustand stores on window for testing via browser evaluate
 */
import { useBookStore } from '../stores/bookStore'
import { useEditorStore } from '../stores/editorStore'
import { usePersonaStore } from '../stores/personaStore'
import { useMemoryStore } from '../stores/memoryStore'
import { useChatStore } from '../stores/chatStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useGitStore } from '../stores/gitStore'

export function exposeStores() {
  const stores = {
    bookStore: useBookStore,
    editorStore: useEditorStore,
    personaStore: usePersonaStore,
    memoryStore: useMemoryStore,
    chatStore: useChatStore,
    settingsStore: useSettingsStore,
    gitStore: useGitStore,
  }

  // @ts-expect-error — intentional dev-only global
  window.__stores = stores

  console.log('[dev] Stores exposed at window.__stores')
}
