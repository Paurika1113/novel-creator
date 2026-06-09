import { useEffect, useState } from 'react'
import { useBookStore } from '../stores/bookStore'
import { useEditorStore } from '../stores/editorStore'
import { useSettingsStore } from '../stores/settingsStore'
import type { KnowledgeFile, KnowledgeFileType } from '../types'
import { WORLD_MODEL_TEMPLATE, MASTER_OUTLINE_TEMPLATE, BRAINSTORM_TEMPLATE } from '../lib/knowledgeTemplates'
import FileTree from '../components/editor/FileTree'
import MarkdownEditor from '../components/editor/MarkdownEditor'
import ChatPanel from '../components/editor/ChatPanel'
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
  const [rightWidth, setRightWidth] = useState(storedRight ? Number(storedRight) : 340)
  const [isDraggingLeft, setIsDraggingLeft] = useState(false)
  const [isDraggingRight, setIsDraggingRight] = useState(false)
  const { settings } = useSettingsStore()

  const [showArchiveModal, setShowArchiveModal] = useState(false)

  // ---- 从实际文件计算章节统计（响应式：files 随 book 切换自动更新） ----
  const actualChapters = files.filter((f) => f.type === 'chapter')
  const chapterCount = actualChapters.length
  const wordCount = files.reduce((sum, f) => sum + f.content.length, 0)

  // ---- 估算记忆使用率 ----
  // 基于草稿正文 + 最近章节内容量，按 200K token 上下文窗口估算
  const draftContent = files.find((f) => f.type === 'chapter_draft')?.content || ''
  const recentChapters = actualChapters.slice(-3)
  const recentContent = recentChapters.reduce((sum, f) => sum + f.content.length, 0)
  const estimatedTokens = (draftContent.length + recentContent.length + 5000) * 1.2  // 含 system prompt
  const CONTEXT_WINDOW = 200000
  const computedMemoryPercent = Math.min(Math.round((estimatedTokens / CONTEXT_WINDOW) * 100), 99)
  const memoryUsagePercent = computedMemoryPercent

  // 同步 bookStore 的 currentBookId 到 editorStore
  // 仅在 bookStore 有有效 currentBookId 且与 editorStore 不同时同步
  // 避免在初始化时覆盖 editorStore 已恢复的 currentFilePath 和 editorContent
  useEffect(() => {
    if (currentBookId && currentBookId !== editorStore.currentBookId) {
      setCurrentBook(currentBookId)
    }
  }, [currentBookId])

  // 保证文件树内容完整：合并已存在的文件（来自知识文件初始化向导等）和默认文件列表
  useEffect(() => {
    if (!book) return

    const defaultFiles = generateDefaultFiles(book.title, book.chapterCount, book.id)

    if (files.length === 0) {
      // 完全新建：使用默认文件列表
      setFiles(defaultFiles)
      const firstKnowledge = defaultFiles.find((f) => f.type === 'master_outline')
      if (firstKnowledge) {
        openFile(firstKnowledge.path, firstKnowledge.content)
      }
    } else {
      // 已有文件：更新章节名称（从内容中提取标题），补充缺失的文件类型
      const existingPaths = new Set(files.map((f) => f.path))
      const missing = defaultFiles.filter((f) => !existingPaths.has(f.path))

      // 更新已有章节文件的名称和内容
      const updatedFiles = files.map((file) => {
        const defaultFile = defaultFiles.find((f) => f.path === file.path)
        if (defaultFile && file.type === 'chapter') {
          // 对于章节文件，从内容中提取标题，同时更新内容
          return {
            ...file,
            name: defaultFile.name,
            content: defaultFile.content,
          }
        }
        return file
      })

      if (missing.length > 0) {
        setFiles([...updatedFiles, ...missing])
      } else if (updatedFiles.some((f, i) => f.name !== files[i].name || f.content !== files[i].content)) {
        setFiles(updatedFiles)
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
      const newWidth = Math.min(500, Math.max(200, window.innerWidth - e.clientX))
      setRightWidth(newWidth)
    }
  }

  function handleMouseUp() {
    if (isDraggingLeft) {
      setIsDraggingLeft(false)
      localStorage.setItem('nc:panelLeftWidth', String(leftWidth))
    }
    if (isDraggingRight) {
      setIsDraggingRight(false)
      localStorage.setItem('nc:panelRightWidth', String(rightWidth))
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
        <span className="editor-topbar-divider">|</span>
        <span className="editor-topbar-meta">
          📝 {chapterCount}章 · {(wordCount / 10000).toFixed(1)}万字
        </span>
        <span className="editor-topbar-divider">|</span>
        <span
          className={`editor-topbar-memory-indicator ${getMemoryClass(memoryUsagePercent)}`}
          title={`上下文使用率: ${Math.round(memoryUsagePercent)}% | ${getMemoryLabel(memoryUsagePercent)}`}
        >
          <span className="editor-topbar-memory-bar">
            <span
              className="editor-topbar-memory-fill"
              style={{ width: `${Math.min(memoryUsagePercent, 100)}%` }}
            />
          </span>
          <span className="editor-topbar-memory-text">
            {Math.round(memoryUsagePercent)}%
          </span>
        </span>
        <div style={{ flex: 1 }} />
        <span className="editor-topbar-meta">
          {currentFilePath ? currentFilePath : ''}
        </span>
      </div>

      {/* Three-column Body */}
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

        {/* Middle: Editor */}
        <div className="editor-panel-center">
          <MarkdownEditor />
        </div>

        {/* Right: Chat */}
        <div
          className="editor-drag-handle"
          onMouseDown={handleRightDragStart}
          title="拖拽调整右侧面板宽度"
        >
          <div className="editor-drag-handle-line" />
        </div>
        <div className="editor-panel-right" style={{ width: rightWidth }}>
          <ChatPanel onArchive={() => setShowArchiveModal(true)} />
        </div>
      </div>

      {/* Archive Modal */}
      <ArchiveModal open={showArchiveModal} onClose={() => setShowArchiveModal(false)} />
    </div>
  )
}

function getMemoryClass(percent: number): string {
  if (percent >= 85) return 'memory-danger'
  if (percent >= 70) return 'memory-warn'
  if (percent >= 40) return 'memory-mild'
  return ''
}

function getMemoryLabel(percent: number): string {
  if (percent >= 85) return '深度压缩 - 上下文空间紧张'
  if (percent >= 70) return '中度压缩 - 建议关注上下文使用'
  if (percent >= 40) return '轻度压缩 - 正常使用中'
  return '上下文充足'
}
