import { useState } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useEditorStore } from '../../stores/editorStore'
import { useBookStore } from '../../stores/bookStore'

const ACTIONS = [
  {
    id: 'write',
    icon: '➕',
    label: '写下一章',
    agent: 'continuation' as const,
    prompt: '请根据全书总纲和当前进度，撰写全新的一章。写作前请先读取 status_card.md 和 master_outline.md 了解当前状态和规划。',
    needsDraft: 'none' as const,
    primary: true,
  },
  {
    id: 'continue',
    icon: '✏️',
    label: '续写本章',
    agent: 'continuation' as const,
    prompt: '请读取当前草稿 chapter_draft.md，在末尾继续追加内容，保持叙事连贯。',
    needsDraft: 'has_draft' as const,
    primary: false,
  },
  {
    id: 'review',
    icon: '📋',
    label: '审核草稿',
    agent: 'review' as const,
    prompt: '请从世界观一致性、大纲匹配度、前文连续性、文风一致性和文本质量五个维度审核当前草稿，输出结构化审核报告。',
    needsDraft: 'has_draft' as const,
    primary: false,
  },
  {
    id: 'world',
    icon: '🌍',
    label: '世界观',
    agent: 'world' as const,
    prompt: '请阅读已归档章节，提取和整理世界观设定，生成 world_model.md。',
    needsDraft: 'none' as const,
    primary: false,
  },
  {
    id: 'style',
    icon: '🎨',
    label: '文风',
    agent: 'style' as const,
    prompt: '分析已归档章节的文风特征，从语言层、叙事层、结构层和风格标签四个维度进行描述。',
    needsDraft: 'none' as const,
    primary: false,
  },
  {
    id: 'archive',
    icon: '✅',
    label: '确认归档',
    agent: null,
    prompt: '',
    needsDraft: 'has_draft' as const,
    primary: false,
  },
  {
    id: 'summary',
    icon: '🔄',
    label: '重做摘要',
    agent: 'continuation' as const,
    prompt: '请读取已归档章节，重新生成章节摘要和 summary.md。',
    needsDraft: 'none' as const,
    primary: false,
  },
  {
    id: 'roleplay',
    icon: '🎭',
    label: '扮演模式',
    agent: null,
    prompt: '',
    needsDraft: 'none' as const,
    primary: false,
    disabled: true,
  },
]

export default function ActionBar({ onArchive }: { onArchive?: () => void }) {
  const { setActiveAgent, addMessage, isStreaming } = useChatStore()
  const filesByBook = useEditorStore((s) => s.filesByBook)
  const currentBookId = useEditorStore((s) => s.currentBookId)
  const { books } = useBookStore()

  const activeBook = books.find((b) => b.id === currentBookId)
  const files = currentBookId ? (filesByBook[currentBookId] || []) : []
  const draftFile = files.find((f) => f.type === 'chapter_draft')
  // 优先从 localStorage 读取草稿内容（与 editorStore.openFile 逻辑一致）
  let draftContent = draftFile?.content || ''
  if (currentBookId && !draftContent.trim()) {
    try {
      const saved = localStorage.getItem(`nc:${currentBookId}:drafts/chapter_draft.md`)
      if (saved !== null) draftContent = saved
    } catch { /* ignore */ }
  }
  const hasDraftContent = draftContent.trim().length > 0
  const hasChapters = files.some((f) => f.type === 'chapter')
  const isConfigured = !!activeBook

  function handleClick(action: (typeof ACTIONS)[0]) {
    if (action.disabled) return

    // Archive action opens modal instead
    if (action.id === 'archive') {
      onArchive?.()
      return
    }

    if (!action.agent) return

    // Send the prompt to chat
    setActiveAgent(action.agent)
    addMessage(action.agent, { role: 'user', content: action.prompt })
  }

  function getDisabledReason(action: (typeof ACTIONS)[0]): boolean {
    if (action.disabled) return true
    if (isStreaming) return true

    if (action.id === 'write') {
      // Can't write if there's un-archived draft
      return hasDraftContent
    }
    if (action.id === 'archive' || action.id === 'continue' || action.id === 'review') {
      return !hasDraftContent
    }
    if (action.id === 'world' || action.id === 'style' || action.id === 'summary') {
      return !hasChapters
    }
    return false
  }

  return (
    <div className="editor-action-bar">
      {ACTIONS.map((action) => {
        const disabled = getDisabledReason(action)
        return (
          <button
            key={action.id}
            className={`action-bar-btn${action.primary ? ' primary' : ''}`}
            onClick={() => handleClick(action)}
            disabled={disabled}
            title={action.disabled ? '即将推出' : ''}
          >
            {action.icon} {action.label}
          </button>
        )
      })}
      <div className="action-bar-spacer" />
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        Ctrl+S 保存 · Enter 发送 · Shift+Enter 换行
      </span>
    </div>
  )
}
