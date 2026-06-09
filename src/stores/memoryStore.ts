import { create } from 'zustand'
import type { WaterLevel, ThreadInfo, ThreadEvent, ChapterSummary } from '../types'

interface MemoryStore {
  // 水位线设置
  waterLevels: WaterLevel

  // 事件图谱
  events: Record<string, ThreadEvent[]> // bookId -> events
  threads: Record<string, ThreadInfo[]> // bookId -> threads

  // 摘要
  summaries: Record<string, ChapterSummary[]>

  // 内存使用率
  memoryUsagePercent: number

  // 水位线配置
  setWaterLevels: (levels: Partial<WaterLevel>) => void

  // 事件操作
  addEvent: (bookId: string, event: ThreadEvent) => void
  setThreads: (bookId: string, threads: ThreadInfo[]) => void
  updateThreadStatus: (bookId: string, threadName: string, status: ThreadInfo['status']) => void

  // 摘要操作
  addSummary: (bookId: string, summary: ChapterSummary) => void

  // 内存使用率
  setMemoryUsage: (percent: number) => void

  // 计算压缩状态
  getCompressionStatus: (bookId: string) => {
    level: 'none' | 'mild' | 'moderate' | 'deep'
    percent: number
  }
}

export const useMemoryStore = create<MemoryStore>((set, get) => ({
  waterLevels: {
    mild: 0.4,
    moderate: 0.7,
    deep: 0.85,
  },
  events: {},
  threads: {},
  summaries: {},
  memoryUsagePercent: 0,

  setWaterLevels: (levels) => {
    set((state) => ({
      waterLevels: { ...state.waterLevels, ...levels },
    }))
  },

  addEvent: (bookId, event) => {
    set((state) => ({
      events: {
        ...state.events,
        [bookId]: [...(state.events[bookId] || []), event],
      },
    }))
  },

  setThreads: (bookId, threads) => {
    set((state) => ({
      threads: { ...state.threads, [bookId]: threads },
    }))
  },

  updateThreadStatus: (bookId, threadName, status) => {
    set((state) => {
      const existing = state.threads[bookId] || []
      return {
        threads: {
          ...state.threads,
          [bookId]: existing.map((t) =>
            t.name === threadName ? { ...t, status } : t
          ),
        },
      }
    })
  },

  addSummary: (bookId, summary) => {
    set((state) => ({
      summaries: {
        ...state.summaries,
        [bookId]: [...(state.summaries[bookId] || []), summary],
      },
    }))
  },

  setMemoryUsage: (percent) => set({ memoryUsagePercent: percent }),

  getCompressionStatus: (bookId) => {
    const { waterLevels, memoryUsagePercent } = get()
    const percent = memoryUsagePercent / 100

    if (percent >= waterLevels.deep) return { level: 'deep', percent: memoryUsagePercent }
    if (percent >= waterLevels.moderate) return { level: 'moderate', percent: memoryUsagePercent }
    if (percent >= waterLevels.mild) return { level: 'mild', percent: memoryUsagePercent }
    return { level: 'none', percent: memoryUsagePercent }
  },
}))
