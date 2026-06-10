import { SKILLS } from '../../types'
import { useChatStore } from '../../stores/chatStore'
import { useEditorStore } from '../../stores/editorStore'
import { useBookStore } from '../../stores/bookStore'

export default function ActionBar({ onArchive }: { onArchive?: () => void }) {
  const { addMessage, isStreaming } = useChatStore()
  const filesByBook = useEditorStore((s) => s.filesByBook)
  const currentBookId = useEditorStore((s) => s.currentBookId)
  const { books } = useBookStore()

  const activeBook = books.find((b) => b.id === currentBookId)
  const files = currentBookId ? (filesByBook[currentBookId] || []) : []
  const draftFile = files.find((f) => f.type === 'chapter_draft')
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

  function handleClick(skill: (typeof SKILLS)[0]) {
    if (!skill.needsDraft && !skill.needsChapters) return

    // Archive action opens modal
    if (skill.id === 'archive') {
      onArchive?.()
      return
    }

    // Send the prompt to chat
    addMessage({ role: 'user', content: skill.prompt })
  }

  function getDisabledReason(skill: (typeof SKILLS)[0]): boolean {
    if (!isConfigured) return true
    if (isStreaming) return true

    if (skill.needsDraft && !hasDraftContent) return true
    if (skill.needsChapters && !hasChapters) return true
    if (skill.id === 'write_chapter' && hasDraftContent) return true // 已有草稿无法写新章

    return false
  }

  return (
    <div className="editor-action-bar">
      {SKILLS.map((skill) => {
        const disabled = getDisabledReason(skill)
        return (
          <button
            key={skill.id}
            className={`action-bar-btn${skill.primary ? ' primary' : ''}`}
            onClick={() => handleClick(skill)}
            disabled={disabled}
          >
            {skill.icon} {skill.label}
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
