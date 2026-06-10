import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { KnowledgeFile } from '../types'

interface EditorStore {
  // 文件树 —— 按书籍隔离: bookId -> files
  filesByBook: Record<string, KnowledgeFile[]>
  currentBookId: string | null
  currentFilePath: string | null
  isFileTreeOpen: boolean

  // 编辑器内容（不持久化，由 openFile 从 localStorage 或 filesByBook 加载）
  editorContent: string
  isDirty: boolean
  viewMode: 'source' | 'split' | 'preview'

  // 书籍切换
  setCurrentBook: (bookId: string | null) => void

  // 文件树操作（自动使用 currentBookId）
  setFiles: (files: KnowledgeFile[]) => void
  addFile: (file: KnowledgeFile) => void
  removeFile: (path: string) => void

  // 编辑器操作
  openFile: (filePath: string, content?: string) => void
  updateContent: (content: string) => void
  saveContent: () => void
  setViewMode: (mode: 'source' | 'split' | 'preview') => void
  toggleFileTree: () => void

  // 获取当前书籍的文件列表
  getCurrentFiles: () => KnowledgeFile[]
}

export const useEditorStore = create<EditorStore>()(
  persist(
    (set, get) => ({
      filesByBook: {},
      currentBookId: null,
      currentFilePath: null,
      isFileTreeOpen: true,
      editorContent: '',
      isDirty: false,
      viewMode: 'source',

      setCurrentBook: (bookId) => {
        set({
          currentBookId: bookId,
          currentFilePath: null,
          editorContent: '',
          isDirty: false,
          viewMode: 'source',
        })
      },

      getCurrentFiles: () => {
        const { currentBookId, filesByBook } = get()
        if (!currentBookId) return []
        return filesByBook[currentBookId] || []
      },

      setFiles: (files) => {
        const { currentBookId } = get()
        if (!currentBookId) return
        set((state) => ({
          filesByBook: { ...state.filesByBook, [currentBookId]: files },
        }))
      },

      addFile: (file) => {
        const { currentBookId } = get()
        if (!currentBookId) return
        set((state) => {
          const bookFiles = state.filesByBook[currentBookId] || []
          const idx = bookFiles.findIndex((f) => f.path === file.path)
          let updatedFiles: KnowledgeFile[]
          if (idx >= 0) {
            // 同名文件已存在 → 替换内容
            updatedFiles = [...bookFiles]
            updatedFiles[idx] = file
          } else {
            updatedFiles = [...bookFiles, file]
          }
          return {
            filesByBook: { ...state.filesByBook, [currentBookId]: updatedFiles },
          }
        })
      },

      removeFile: (path) => {
        const { currentBookId } = get()
        if (!currentBookId) return
        // 同时清除持久化内容
        try {
          localStorage.removeItem(`nc:${currentBookId}:${path}`)
        } catch { /* ignore */ }
        set((state) => {
          const bookFiles = state.filesByBook[currentBookId] || []
          const isDeletingCurrent = state.currentFilePath === path
          return {
            filesByBook: {
              ...state.filesByBook,
              [currentBookId]: bookFiles.filter((f) => f.path !== path),
            },
            currentFilePath: isDeletingCurrent ? null : state.currentFilePath,
            editorContent: isDeletingCurrent ? '' : state.editorContent,
          }
        })
      },

      openFile: (filePath, content = '') => {
        const { currentBookId } = get()
        // 优先从 localStorage 加载已持久化的内容（带 bookId 前缀）
        let resolvedContent = content
        try {
          const saved = currentBookId
            ? localStorage.getItem(`nc:${currentBookId}:${filePath}`)
            : null
          if (saved !== null) {
            resolvedContent = saved
          }
        } catch {
          // localStorage 不可用时使用传入的默认内容
        }
        set({
          currentFilePath: filePath,
          editorContent: resolvedContent,
          isDirty: false,
          viewMode: 'source',
        })
      },

      updateContent: (content) => {
        set({ editorContent: content, isDirty: true })
      },

      saveContent: () => {
        const state = get()
        if (state.currentFilePath && state.currentBookId) {
          try {
            localStorage.setItem(
              `nc:${state.currentBookId}:${state.currentFilePath}`,
              state.editorContent
            )
          } catch (e) {
            console.warn('Failed to persist file content:', e)
          }
        }
        set({ isDirty: false })
      },

      setViewMode: (mode) => {
        set({ viewMode: mode })
      },

      toggleFileTree: () => {
        set((state) => ({ isFileTreeOpen: !state.isFileTreeOpen }))
      },
    }),
    {
      name: 'novel-creator-editor-store',
      // 只持久化文件树和当前书籍ID，编辑器内容从 localStorage 或文件树动态加载
      partialize: (state) => ({
        filesByBook: state.filesByBook,
        currentBookId: state.currentBookId,
        currentFilePath: state.currentFilePath,
        isFileTreeOpen: state.isFileTreeOpen,
      }),
    }
  )
)
