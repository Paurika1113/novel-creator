import { useEffect, useRef, useState } from 'react'
import { useBookStore } from '../stores/bookStore'
import { useEditorStore } from '../stores/editorStore'
import { useSettingsStore } from '../stores/settingsStore'
import type { KnowledgeFile, KnowledgeFileType } from '../types'
import { WORLD_MODEL_TEMPLATE, MASTER_OUTLINE_TEMPLATE, BRAINSTORM_TEMPLATE } from '../lib/knowledgeTemplates'
import { clearSystemPromptCache } from '../services/skills'
import FileTree from '../components/editor/FileTree'
import MarkdownEditor from '../components/editor/MarkdownEditor'
import ChatPanel from '../components/editor/ChatPanel'
import EditorStatusBar from '../components/editor/EditorStatusBar'
import EditorErrorBoundary from '../components/editor/EditorErrorBoundary'
import ArchiveModal from '../components/editor/ArchiveModal'

function loadPersistedContent(bookId: string, path: string): string {
  try {
    const saved = localStorage.getItem(`nc:${bookId}:${path}`)
    return saved !== null ? saved : ''
  } catch {
    return ''
  }
}

function extractChapterTitle(content: string, defaultTitle: string): string {
  // 从章节内容中提取标题，匹配格式: # 第一章 XXX 或 # 第X章 XXX
  const match = content.match(/^#\s*(第[一二三四五六七八九十\d]+章\s+.+)$/m)
  if (match) {
    return match[1].trim()
  }
  // 也尝试匹配没有"第X章"前缀的标题
  const simpleMatch = content.match(/^#\s*(.+)$/m)
  if (simpleMatch) {
    return simpleMatch[1].trim()
  }
  return defaultTitle
}

function generateDefaultFiles(bookTitle: string, chapterCount: number, bookId?: string): KnowledgeFile[] {
  const files: KnowledgeFile[] = []
  const now = new Date().toISOString()
  const count = Math.max(chapterCount, 3)

  const defaultChapterNames = [
    '序章·星辰陨落',
    '初遇',
    '试炼之路',
    '风波渐起',
    '转折',
    '暗流涌动',
    '决战前夕',
    '终章',
  ]

  for (let i = 0; i < count; i++) {
    const idx = i + 1
    const path = `chapters/${String(idx).padStart(3, '0')}.md`
    const content = bookId ? loadPersistedContent(bookId, path) : ''
    // 优先从已归档内容中提取标题，否则使用默认名称
    const name = content
      ? extractChapterTitle(content, defaultChapterNames[i] || `第${idx}章`)
      : (defaultChapterNames[i] || `第${idx}章`)
    files.push({
      name,
      path,
      type: 'chapter',
      content,
      updatedAt: now,
    })
  }

  // Draft - 优先从 localStorage 加载已持久化的内容
  const draftPath = 'drafts/chapter_draft.md'
  files.push({
    name: '当前草稿',
    path: draftPath,
    type: 'chapter_draft',
    content: bookId ? loadPersistedContent(bookId, draftPath) : '',
    updatedAt: now,
  })

  // Knowledge files
  const knowledge: Array<{ name: string; path: string; type: KnowledgeFileType; content: string }> = [
    { name: '世界观设定', path: 'knowledge/world_model.md', type: 'world_model', content: WORLD_MODEL_TEMPLATE },
    { name: '文风画像', path: 'knowledge/style_fingerprint.md', type: 'style_fingerprint', content: '' },
    { name: '总纲', path: 'knowledge/master_outline.md', type: 'master_outline', content: MASTER_OUTLINE_TEMPLATE },
    { name: '卷纲', path: 'knowledge/arc_outline.md', type: 'arc_outline', content: '' },
    { name: '章纲', path: 'knowledge/chapter_outline.md', type: 'chapter_outline', content: '' },
    { name: '状态卡', path: 'knowledge/status_card.md', type: 'status_card', content: '' },
    { name: '灵感笔记', path: 'knowledge/brainstorm.md', type: 'brainstorm', content: BRAINSTORM_TEMPLATE },
    { name: '错误档案', path: 'knowledge/error_archive.md', type: 'error_archive', content: '' },
    { name: '摘要', path: 'knowledge/summary.md', type: 'summary', content: '' },
  ]

  for (const kf of knowledge) {
    files.push({
      name: kf.name,
      path: kf.path,
      type: kf.type,
      content: kf.content,
      updatedAt: now,
    })
  }

  return files
}

export default function EditorPage() {
  const { currentBookId, books } = useBookStore()
  const editorStore = useEditorStore()
  const files = editorStore.getCurrentFiles()
  const currentFilePath = editorStore.currentFilePath
  const setFiles = editorStore.setFiles
  const openFile = editorStore.openFile
  const setCurrentBook = editorStore.setCurrentBook

  const book = currentBookId ? books.find((b) => b.id === currentBookId) : null

  const storedLeft = localStorage.getItem('nc:panelLeftWidth')
  const storedRight = localStorage.getItem('nc:panelRightWidth')
  const [leftWidth, setLeftWidth] = useState(storedLeft ? Number(storedLeft) : 240)
  const [rightWidth, setRightWidth] = useState(storedRight ? Number(storedRight) : 360)
  const [isDraggingLeft, setIsDraggingLeft] = useState(false)
  const [isDraggingRight, setIsDraggingRight] = useState(false)

  // Refs for drag handlers, avoid stale closure
  const leftWidthRef = useRef(leftWidth)
  const rightWidthRef = useRef(rightWidth)
  leftWidthRef.current = leftWidth
  rightWidthRef.current = rightWidth
  const { settings } = useSettingsStore()

  const [showArchiveModal, setShowArchiveModal] = useState(false)

  // 同步 bookStore 的 currentBookId 到 editorStore
  // 仅在 bookStore 有有效 currentBookId 且与 editorStore 不同时同步
  // 避免在初始化时覆盖 editorStore 已恢复的 currentFilePath 和 editorContent
  useEffect(() => {
    if (currentBookId && currentBookId !== editorStore.currentBookId) {
      setCurrentBook(currentBookId)
      clearSystemPromptCache()
    }
  }, [currentBookId])

  // 保证文件树内容完整：合并已存在的文件（来自知识文件初始化向导等）和默认文件列表
  useEffect(() => {
    if (!book) return

    const defaultFiles = generateDefaultFiles(book.title, book.chapterCount, book.id)

    if (files.length === 0) {
      // 完全新建：批量设置文件并打开首个知识文件, 避免双次渲染
      const firstKnowledge = defaultFiles.find((f) => f.type === 'master_outline')
      setFiles(defaultFiles)
      if (firstKnowledge) {
        openFile(firstKnowledge.path, firstKnowledge.content)
      }
    } else {
      // 已有文件：仅补充缺失的文件类型，不覆盖已有章节内容
      const existingPaths = new Set(files.map((f) => f.path))
      const missing = defaultFiles.filter((f) => !existingPaths.has(f.path))

      if (missing.length > 0) {
        setFiles([...files, ...missing])
      }

      // 如果有 currentFilePath 但 editorContent 为空，从 localStorage 重新加载
      const { currentFilePath, editorContent } = editorStore
      if (currentFilePath && !editorContent) {
        const file = files.find((f) => f.path === currentFilePath)
        openFile(currentFilePath, file?.content || '')
      }
    }
  }, [book?.id])

  // No book selected
  if (!book) {
    return (
      <div className="page-content">
        <div className="page-header">
          <h1 className="page-title">创作台</h1>
        </div>
        <div className="empty-state">
          <div className="empty-icon">📖</div>
          <p className="empty-text">请先在作品库选择一本书</p>
          <p className="empty-subtext">选择书籍后可在此进行写作、编辑和管理章节</p>
        </div>
      </div>
    )
  }

  // Drag handlers with persistence
  function handleMouseMove(e: React.MouseEvent) {
    if (isDraggingLeft) {
      const newWidth = Math.min(420, Math.max(180, e.clientX))
      setLeftWidth(newWidth)
    }
    if (isDraggingRight) {
      const newWidth = Math.min(700, Math.max(300, window.innerWidth - e.clientX))
      setRightWidth(newWidth)
    }
  }

  function handleMouseUp() {
    if (isDraggingLeft) {
      setIsDraggingLeft(false)
      localStorage.setItem('nc:panelLeftWidth', String(leftWidthRef.current))
    }
    if (isDraggingRight) {
      setIsDraggingRight(false)
      localStorage.setItem('nc:panelRightWidth', String(rightWidthRef.current))
    }
  }

  function handleLeftDragStart(e: React.MouseEvent) {
    e.preventDefault()
    setIsDraggingLeft(true)
  }

  function handleRightDragStart(e: React.MouseEvent) {
    e.preventDefault()
    setIsDraggingRight(true)
  }

  return (
    <div
      className={`editor-page${isDraggingLeft || isDraggingRight ? ' is-dragging' : ''}`}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Top Bar */}
      <div className="editor-topbar">
        <span className="editor-topbar-title">{book.title}</span>
        <span className="editor-topbar-divider">|</span>
        <span className="editor-topbar-meta">{book.type || '未分类'}</span>
        <span className="editor-topbar-divider">|</span>
        <span className="editor-topbar-meta">🌿 {book.currentBranch}</span>
        <div style={{ flex: 1 }} />
        <span className="editor-topbar-meta">
          {currentFilePath ? currentFilePath : ''}
        </span>
      </div>

      {/* Three-column Body */}
      <EditorErrorBoundary>
      <div className="editor-body">
        {/* Left: File Tree */}
        <div className="editor-panel-left" style={{ width: leftWidth }}>
          <FileTree />
        </div>
        <div
          className="editor-drag-handle"
          onMouseDown={handleLeftDragStart}
          title="拖拽调整左侧面板宽度"
        >
          <div className="editor-drag-handle-line" />
        </div>

        {/* Middle: Chat / AI Assistant */}
        <div className="editor-panel-center">
          <ChatPanel onArchive={() => setShowArchiveModal(true)} />
        </div>

        {/* Right: Editor */}
        <div
          className="editor-drag-handle"
          onMouseDown={handleRightDragStart}
          title="拖拽调整右侧面板宽度"
        >
          <div className="editor-drag-handle-line" />
        </div>
        <div className="editor-panel-right" style={{ width: rightWidth }}>
          <MarkdownEditor />
        </div>
      </div>
      </EditorErrorBoundary>

      <EditorStatusBar />

      {/* Archive Modal */}
      <ArchiveModal open={showArchiveModal} onClose={() => setShowArchiveModal(false)} />
    </div>
  )
}


