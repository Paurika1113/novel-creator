import { useState, useEffect, useRef, useCallback } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { useChatStore } from '../../stores/chatStore'
import { useMemoryStore } from '../../stores/memoryStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { analyzeDraftEvents } from '../../services/eventAnalysis'

const INLINE_ACTIONS = [
  { id: 'polish', label: '润色', prompt: '请润色以下文本，优化表达和语感，保持原文意思不变：\n\n' },
  { id: 'rewrite', label: '改写', prompt: '请用不同的表达方式改写以下文本，保持核心信息不变：\n\n' },
  { id: 'expand', label: '扩写', prompt: '请在以下文本基础上进行扩写，丰富细节和描写，保持文风一致：\n\n' },
  { id: 'shorten', label: '缩写', prompt: '请缩写以下文本，保留核心信息，去除冗余：\n\n' },
]

function renderMarkdown(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const html = escaped
    .replace(/^###### (.+)$/gm, '<h6>$1</h6>')
    .replace(/^##### (.+)$/gm, '<h5>$1</h5>')
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/\n\s*\n/g, '</p><p>')
    .replace(/\n/g, '<br>')

  return '<p>' + html + '</p>'
}

export default function MarkdownEditor() {
  const {
    currentFilePath,
    editorContent,
    isDirty,
    isPreviewMode,
    updateContent,
    saveContent,
    togglePreview,
  } = useEditorStore()

  const workflow = useWorkflowStore()

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const cursorRef = useRef<{ start: number; end: number } | null>(null)

  // Inline AI selection state
  const [selectedText, setSelectedText] = useState('')
  const [selectionPos, setSelectionPos] = useState<{ top: number; left: number } | null>(null)
  const addMessage = useChatStore((s) => s.addMessage)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const settings = useSettingsStore((s) => s.settings)
  const memoryStore = useMemoryStore()
  const editorStore = useEditorStore()

  // Auto-save 30s after last change
  useEffect(() => {
    if (!isDirty) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)

    autoSaveTimer.current = setTimeout(() => {
      setSaveStatus('saving')
      setTimeout(() => {
        saveContent()
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      }, 300)
    }, 30000)

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    }
  }, [isDirty, saveContent])

  // Fire-and-forget: on draft save, trigger lightweight event analysis
  // This runs in background and does not block the UI
  const prevDirtyRef = useRef(isDirty)
  useEffect(() => {
    const justSaved = prevDirtyRef.current === true && isDirty === false
    prevDirtyRef.current = isDirty

    if (!justSaved) return
    const filePath = editorStore.currentFilePath
    if (!filePath || !filePath.includes('chapter_draft') || !settings.apiKey) return
    if (!editorStore.currentBookId) return

    const content = editorStore.editorContent
    const threads = memoryStore.threads[editorStore.currentBookId] || []
    const currentChapterIndex = useWorkflowStore.getState().currentChapterNum || 1

    // Fire and forget — don't block save
    analyzeDraftEvents(content, currentChapterIndex, threads, settings.apiKey, settings.provider, settings.baseUrl)
      .then((result) => {
        if (result.newThreads && result.newThreads.length > 0) {
          console.log('[DraftEventAnalysis] 检测到新线索:', result.newThreads)
        }
      })
      .catch(() => { /* silent */ })
  }, [isDirty])

  // Restore cursor after content update from toolbar buttons
  useEffect(() => {
    if (cursorRef.current && textareaRef.current) {
      textareaRef.current.setSelectionRange(cursorRef.current.start, cursorRef.current.end)
      cursorRef.current = null
    }
  })

  // Ctrl+S
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        setSaveStatus('saving')
        setTimeout(() => {
          saveContent()
          setSaveStatus('saved')
          setTimeout(() => setSaveStatus('idle'), 2000)
        }, 200)
      }
    },
    [saveContent]
  )

  // Focus textarea when file changes
  useEffect(() => {
    if (textareaRef.current && !isPreviewMode) {
      textareaRef.current.focus()
    }
  }, [currentFilePath, isPreviewMode])

  // Toolbar button handler: insert markdown around selection
  function handleToolAction(before: string, after: string) {
    const ta = textareaRef.current
    if (!ta) return

    const start = ta.selectionStart
    const end = ta.selectionEnd
    const text = ta.value
    const selected = text.substring(start, end)

    const newText =
      text.substring(0, start) + before + selected + after + text.substring(end)

    // Save cursor position for restoration after re-render
    cursorRef.current = {
      start: start + before.length,
      end: start + before.length + selected.length,
    }

    updateContent(newText)
  }

  // Handle text selection for workflow rewrite + inline AI
  function handleSelectionChange() {
    const ta = textareaRef.current
    if (!ta) return

    const start = ta.selectionStart
    const end = ta.selectionEnd
    if (start !== end) {
      const selected = ta.value.substring(start, end)
      setSelectedText(selected)
      workflow.setSelectedText(selected)

      // Calculate position for inline action bar
      const textUpToCursor = ta.value.substring(0, start)
      const lines = textUpToCursor.split('\n')
      const lineNumber = lines.length
      const colNumber = lines[lines.length - 1].length
      // Approximate position: each line ~18px height, with scroll offset
      const lineHeight = 18
      const scrollTop = ta.scrollTop
      const top = (lineNumber - 1) * lineHeight - scrollTop + 30 // offset below toolbar
      const left = Math.min(colNumber * 7.5, ta.offsetWidth - 320)
      setSelectionPos({ top: Math.max(top, 4), left: Math.max(left, 8) })
    } else {
      setSelectedText('')
      setSelectionPos(null)
    }
  }

  // Send selected text to AI agent
  function handleInlineAction(action: typeof INLINE_ACTIONS[number]) {
    if (!selectedText) return

    const continuationPrompt = `${action.prompt}${selectedText}`
    addMessage({ role: 'user', content: continuationPrompt })
    setSelectedText('')
    setSelectionPos(null)
  }

  if (!currentFilePath) {
    return (
      <div className="editor-content">
        <div className="empty-state" style={{ padding: '60px 20px' }}>
          <div className="empty-icon">📝</div>
          <p className="empty-text">从左侧文件树选择一个文件开始编辑</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Toolbar */}
      <div className="editor-toolbar">
        <div className="editor-toolbar-group">
          <button
            className="editor-tool-btn"
            title="粗体 Ctrl+B"
            onClick={() => handleToolAction('**', '**')}
          >
            <strong>B</strong>
          </button>
          <button
            className="editor-tool-btn"
            title="斜体 Ctrl+I"
            onClick={() => handleToolAction('*', '*')}
          >
            <em>I</em>
          </button>
          <button
            className="editor-tool-btn"
            title="下划线"
            onClick={() => handleToolAction('<u>', '</u>')}
          >
            <span style={{ textDecoration: 'underline' }}>U</span>
          </button>
          <span style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
          <button
            className="editor-tool-btn"
            title="标题 (H2)"
            onClick={() => handleToolAction('## ', '')}
          >
            H
          </button>
          <button
            className="editor-tool-btn"
            title="链接"
            onClick={() => handleToolAction('[', '](url)')}
          >
            🔗
          </button>
          <button
            className="editor-tool-btn"
            title="图片"
            onClick={() => handleToolAction('![alt](', ')')}
          >
            📷
          </button>
        </div>

        <div className="editor-toolbar-group">
          <span className={`editor-save-indicator ${saveStatus}`}>
            {saveStatus === 'idle' && isDirty && '未保存'}
            {saveStatus === 'saving' && '保存中…'}
            {saveStatus === 'saved' && '✓ 已保存'}
          </span>
          <div className="editor-mode-toggle">
            <button
              className={`editor-mode-btn${!isPreviewMode ? ' active' : ''}`}
              onClick={() => {
                if (isPreviewMode) togglePreview()
              }}
            >
              编辑
            </button>
            <button
              className={`editor-mode-btn${isPreviewMode ? ' active' : ''}`}
              onClick={() => {
                if (!isPreviewMode) togglePreview()
              }}
            >
              预览
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="editor-content">
        {/* Inline AI action bar */}
        {selectedText && selectionPos && !isPreviewMode && (
          <div
            className="editor-inline-actions"
            style={{
              top: selectionPos.top,
              left: selectionPos.left,
            }}
          >
            <span className="editor-inline-actions-label">选中 {selectedText.length} 字</span>
            {INLINE_ACTIONS.map((action) => (
              <button
                key={action.id}
                className="editor-inline-action-btn"
                onClick={() => handleInlineAction(action)}
                title={action.label}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
        {isPreviewMode ? (
          <div
            className="editor-preview"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(editorContent) }}
          />
        ) : (
          <textarea
            ref={textareaRef}
            className="editor-textarea"
            value={editorContent}
            onChange={(e) => updateContent(e.target.value)}
            onKeyDown={handleKeyDown}
            onSelect={handleSelectionChange}
            onMouseUp={handleSelectionChange}
            placeholder={
              workflow.phase === 'outline' ? 'AI 生成的大纲将显示在这里，你可以直接编辑...' :
              workflow.phase === 'draft' ? 'AI 生成的草稿将显示在这里，你可以直接编辑...' :
              workflow.phase === 'review' ? '审核中，请查看右侧聊天窗口的审核报告...' :
              '开始写作…'
            }
            spellCheck
          />
        )}
      </div>
    </>
  )
}
