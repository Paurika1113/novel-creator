/**
 * 创作工作流状态管理
 * IDE式工作流：大纲 → 草稿 → 审核 → 归档
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type WorkflowPhase = 'idle' | 'outline' | 'draft' | 'review' | 'archived'

export interface WorkflowState {
  // 当前工作流阶段
  phase: WorkflowPhase
  // 当前章节编号
  currentChapterNum: number
  // 当前章节标题
  currentChapterTitle: string
  // 大纲内容（临时存储，确认后写入文件）
  outlineContent: string
  // 草稿内容（临时存储，确认后写入文件）
  draftContent: string
  // 审核报告
  reviewReport: string
  // 选中的文本（用于部分重写）
  selectedText: string
  // 历史操作记录
  history: Array<{
    phase: WorkflowPhase
    action: string
    timestamp: number
  }>
}

export interface WorkflowStore extends WorkflowState {
  // 状态转换
  startOutline: (chapterNum: number, chapterTitle: string) => void
  confirmOutline: (content: string) => void
  regenerateOutline: () => void
  startDraft: () => void
  confirmDraft: (content: string) => void
  regenerateDraft: () => void
  startReview: () => void
  confirmReview: (report: string) => void
  applyFix: (fixedContent: string) => void
  archive: () => void
  reset: () => void
  // 选中文本
  setSelectedText: (text: string) => void
  // 获取当前阶段的操作按钮
  getCurrentActions: () => WorkflowAction[]
}

export interface WorkflowAction {
  id: string
  label: string
  icon: string
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
}

const initialState: WorkflowState = {
  phase: 'idle',
  currentChapterNum: 0,
  currentChapterTitle: '',
  outlineContent: '',
  draftContent: '',
  reviewReport: '',
  selectedText: '',
  history: [],
}

export const useWorkflowStore = create<WorkflowStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      // 开始大纲阶段
      startOutline: (chapterNum, chapterTitle) => {
        set({
          phase: 'outline',
          currentChapterNum: chapterNum,
          currentChapterTitle: chapterTitle,
          outlineContent: '',
          draftContent: '',
          reviewReport: '',
          history: [{ phase: 'outline', action: 'start', timestamp: Date.now() }],
        })
      },

      // 确认大纲，进入草稿阶段
      confirmOutline: (content) => {
        const state = get()
        set({
          phase: 'draft',
          outlineContent: content,
          history: [...state.history, { phase: 'draft', action: 'start', timestamp: Date.now() }],
        })
      },

      // 重新生成大纲
      regenerateOutline: () => {
        const state = get()
        set({
          outlineContent: '',
          history: [...state.history, { phase: 'outline', action: 'regenerate', timestamp: Date.now() }],
        })
      },

      // 开始草稿阶段
      startDraft: () => {
        const state = get()
        set({
          phase: 'draft',
          history: [...state.history, { phase: 'draft', action: 'start', timestamp: Date.now() }],
        })
      },

      // 确认草稿，进入审核阶段
      confirmDraft: (content) => {
        const state = get()
        set({
          phase: 'review',
          draftContent: content,
          history: [...state.history, { phase: 'review', action: 'start', timestamp: Date.now() }],
        })
      },

      // 重新生成草稿
      regenerateDraft: () => {
        const state = get()
        set({
          draftContent: '',
          history: [...state.history, { phase: 'draft', action: 'regenerate', timestamp: Date.now() }],
        })
      },

      // 开始审核阶段
      startReview: () => {
        const state = get()
        set({
          phase: 'review',
          history: [...state.history, { phase: 'review', action: 'start', timestamp: Date.now() }],
        })
      },

      // 确认审核报告
      confirmReview: (report) => {
        const state = get()
        set({
          reviewReport: report,
          history: [...state.history, { phase: 'review', action: 'confirm', timestamp: Date.now() }],
        })
      },

      // 应用修改
      applyFix: (fixedContent) => {
        const state = get()
        set({
          draftContent: fixedContent,
          history: [...state.history, { phase: 'review', action: 'fix', timestamp: Date.now() }],
        })
      },

      // 归档完成
      archive: () => {
        const state = get()
        set({
          phase: 'archived',
          history: [...state.history, { phase: 'archived', action: 'complete', timestamp: Date.now() }],
        })
      },

      // 重置工作流
      reset: () => {
        set(initialState)
      },

      // 设置选中文本
      setSelectedText: (text) => {
        set({ selectedText: text })
      },

      // 获取当前阶段的操作按钮
      getCurrentActions: () => {
        const state = get()
        const actions: WorkflowAction[] = []

        switch (state.phase) {
          case 'outline':
            actions.push(
              { id: 'regenerate_outline', label: '全重写', icon: '🔄', variant: 'secondary' },
              { id: 'rewrite_selection', label: '重写选中', icon: '✏️', variant: 'secondary', disabled: !state.selectedText },
              { id: 'confirm_outline', label: '确认大纲', icon: '✅', variant: 'primary' },
              { id: 'reset_workflow', label: '取消', icon: '❌', variant: 'danger' },
            )
            break
          case 'draft':
            actions.push(
              { id: 'regenerate_draft', label: '全重写', icon: '🔄', variant: 'secondary' },
              { id: 'rewrite_selection', label: '重写选中', icon: '✏️', variant: 'secondary', disabled: !state.selectedText },
              { id: 'confirm_draft', label: '确认草稿', icon: '✅', variant: 'primary' },
              { id: 'reset_workflow', label: '取消', icon: '❌', variant: 'danger' },
            )
            break
          case 'review':
            actions.push(
              { id: 'auto_fix', label: '一键修改', icon: '🔧', variant: 'secondary' },
              { id: 'rewrite_selection', label: '部分修改', icon: '✏️', variant: 'secondary', disabled: !state.selectedText },
              { id: 'archive', label: '归档', icon: '📦', variant: 'primary' },
              { id: 'reset_workflow', label: '取消', icon: '❌', variant: 'danger' },
            )
            break
          case 'archived':
            actions.push(
              { id: 'next_chapter', label: '下一章', icon: '➡️', variant: 'primary' },
            )
            break
        }

        return actions
      },
    }),
    {
      name: 'novel-creator-workflow-store',
      partialize: (state) => ({
        phase: state.phase,
        currentChapterNum: state.currentChapterNum,
        currentChapterTitle: state.currentChapterTitle,
        outlineContent: state.outlineContent,
        draftContent: state.draftContent,
        reviewReport: state.reviewReport,
        history: state.history,
      }),
    }
  )
)
