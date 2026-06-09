import { create } from 'zustand'
import type { Book, BookType, Chapter, DraftStatus } from '../types'

interface BookStore {
  // 状态
  books: Book[]
  currentBookId: string | null
  draftStatus: DraftStatus
  chapters: Record<string, Chapter[]> // bookId -> chapters

  // 书籍 CRUD
  createBook: (title: string, type: BookType, description?: string, mainCharacter?: string) => Book
  deleteBook: (id: string) => void
  renameBook: (id: string, title: string) => void
  duplicateBook: (id: string) => void
  setCurrentBook: (id: string | null) => void

  // 章节
  addChapter: (bookId: string, chapter: Chapter) => void
  getChapters: (bookId: string) => Chapter[]

  // 草稿状态
  setDraftStatus: (status: DraftStatus) => void

  // 当前书籍
  getCurrentBook: () => Book | null
}

function generateId() {
  return `book-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const useBookStore = create<BookStore>((set, get) => ({
  books: [],
  currentBookId: null,
  draftStatus: 'idle',
  chapters: {},

  createBook: (title, type, description = '', mainCharacter = '') => {
    const now = new Date().toISOString()
    const book: Book = {
      id: generateId(),
      title,
      type,
      description,
      mainCharacter,
      createdAt: now,
      updatedAt: now,
      chapterCount: 0,
      wordCount: 0,
      gitBranchCount: 1,
      readingProgress: 0,
      boundPersonaId: null,
      currentBranch: 'master',
    }
    set((state) => ({
      books: [...state.books, book],
      chapters: { ...state.chapters, [book.id]: [] },
    }))
    return book
  },

  deleteBook: (id) => {
    set((state) => {
      const { [id]: _, ...restChapters } = state.chapters
      return {
        books: state.books.filter((b) => b.id !== id),
        currentBookId: state.currentBookId === id ? null : state.currentBookId,
        chapters: restChapters,
      }
    })
  },

  renameBook: (id, title) => {
    set((state) => ({
      books: state.books.map((b) =>
        b.id === id ? { ...b, title, updatedAt: new Date().toISOString() } : b
      ),
    }))
  },

  duplicateBook: async (id) => {
    const book = get().books.find((b) => b.id === id)
    if (!book) return

    const now = new Date().toISOString()
    const newId = generateId()

    // Deep copy book metadata
    const newBook: Book = {
      ...book,
      id: newId,
      title: `${book.title} (副本)`,
      createdAt: now,
      updatedAt: now,
      boundPersonaId: null,
    }

    // Copy chapters
    const sourceChapters = get().chapters[book.id] || []
    const deepChapters = sourceChapters.map((ch) => ({ ...ch }))

    set((state) => ({
      books: [...state.books, newBook],
      chapters: { ...state.chapters, [newId]: deepChapters },
    }))

    // Copy Git data (lazy import)
    try {
      const { useGitStore } = await import('../stores/gitStore')
      const gitStore = useGitStore.getState()
      const sourceBranches = gitStore.branches[book.id]
      const sourceCommits = gitStore.commits[book.id]
      if (sourceBranches) {
        gitStore.setBranches(newId, sourceBranches.map((b) => ({ ...b })))
      }
      if (sourceCommits) {
        gitStore.setCommits(newId, sourceCommits.map((c) => ({ ...c })))
      }
    } catch { /* ssr guard */ }

    // Copy memory events & threads —— 通过 MemoryStore 的正式 API 操作，避免直接修改状态
    try {
      const { useMemoryStore } = await import('../stores/memoryStore')
      const memoryState = useMemoryStore.getState()
      const sourceEvents = memoryState.events[book.id] || []
      const sourceThreads = memoryState.threads[book.id] || []

      if (sourceEvents.length > 0 || sourceThreads.length > 0) {
        useMemoryStore.setState((prev) => ({
          events: { ...prev.events, [newId]: [...sourceEvents] },
          threads: { ...prev.threads, [newId]: [...sourceThreads] },
        }))
      }
    } catch { /* ssr guard */ }

    return newBook
  },

  setCurrentBook: (id) => {
    set({ currentBookId: id })
  },

  addChapter: (bookId, chapter) => {
    set((state) => {
      const existing = state.chapters[bookId] || []
      return {
        chapters: {
          ...state.chapters,
          [bookId]: [...existing, chapter].sort((a, b) => a.index - b.index),
        },
        books: state.books.map((b) =>
          b.id === bookId
            ? {
                ...b,
                chapterCount: (state.chapters[bookId]?.length || 0) + 1,
                wordCount: b.wordCount + chapter.wordCount,
                updatedAt: new Date().toISOString(),
              }
            : b
        ),
      }
    })
  },

  getChapters: (bookId) => {
    return get().chapters[bookId] || []
  },

  setDraftStatus: (status) => {
    set({ draftStatus: status })
  },

  getCurrentBook: () => {
    const { books, currentBookId } = get()
    return books.find((b) => b.id === currentBookId) || null
  },
}))
