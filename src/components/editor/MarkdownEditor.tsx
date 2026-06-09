import { useState, useEffect, useRef, useCallback } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import { useWorkflowStore } from '../../stores/workflowStore'

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

  // Handle text selection for workflow rewrite
  function handleSelectionChange() {
    const ta = textareaRef.current
    if (!ta) return

    const start = ta.selectionStart
    const end = ta.selectionEnd
    if (start !== end) {
      const selected = ta.value.substring(start, end)
      workflow.setSelectedText(selected)
    }
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
