import { useMemo, useState, useRef } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import type { KnowledgeFileType, KnowledgeFile } from '../../types'

type FileSection = 'chapters' | 'knowledge'

interface FileGroup {
  key: FileSection
  icon: string
  label: string
  predicate: (t: KnowledgeFileType) => boolean
}

const SECTIONS: FileGroup[] = [
  {
    key: 'chapters',
    icon: '📖',
    label: '章节',
    predicate: (t) => t === 'chapter',
  },
  {
    key: 'knowledge',
    icon: '📚',
    label: '知识',
    predicate: (t) => t !== 'chapter',
  },
]

const FILE_ICONS: Record<string, string> = {
  world_model: '🌍',
  style_fingerprint: '🎨',
  master_outline: '📋',
  arc_outline: '📋',
  chapter_outline: '📝',
  chapter_draft: '✏️',
  status_card: '📊',
  brainstorm: '💡',
  error_archive: '⚠️',
  summary: '📄',
  other: '📄',
}

function fileIcon(type: KnowledgeFileType): string {
  return FILE_ICONS[type] || '📄'
}

/** 从已有章节路径推断下一章编号 */
function nextChapterNumber(files: KnowledgeFile[]): number {
  let max = 0
  for (const f of files) {
    if (f.type !== 'chapter') continue
    const match = f.path.match(/chapters\/(\d+)\.md$/)
    if (match) {
      const n = parseInt(match[1], 10)
      if (n > max) max = n
    }
  }
  return max + 1
}

/** 生成新建章节的默认标题 */
function defaultChapterTitle(num: number): string {
  const names = ['序章·星辰陨落', '初遇', '试炼之路', '风波渐起', '转折', '暗流涌动', '决战前夕', '终章']
  return names[num - 1] || `第${num}章`
}

export default function FileTree() {
  const filesByBook = useEditorStore((s) => s.filesByBook)
  const currentBookId = useEditorStore((s) => s.currentBookId)
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const openFile = useEditorStore((s) => s.openFile)
  const setFiles = useEditorStore((s) => s.setFiles)
  const removeFile = useEditorStore((s) => s.removeFile)
  const expandedChapterPaths = useEditorStore((s) => s.expandedChapterPaths)
  const toggleChapterExpand = useEditorStore((s) => s.toggleChapterExpand)

  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  const files = useMemo(() => {
    if (!currentBookId) return []
    return filesByBook[currentBookId] || []
  }, [filesByBook, currentBookId])

  function toggleChapter(path: string) {
    toggleChapterExpand(path)
  }

  function openFileOrSummary(filePath: string, content: string) {
    const currentState = useEditorStore.getState()
    if (currentState.currentFilePath === filePath) {
      useEditorStore.setState({ editorContent: content, isDirty: false })
      return
    }
    openFile(filePath, content)
  }

  // ---- 新增章节 ----
  function addChapter() {
    if (!currentBookId) return
    const num = nextChapterNumber(files)
    const path = `chapters/${String(num).padStart(3, '0')}.md`
    const title = defaultChapterTitle(num)
    const now = new Date().toISOString()
    const newFile: KnowledgeFile = {
      name: title,
      path,
      type: 'chapter',
      content: `# ${title}\n\n`,
      updatedAt: now,
    }
    const currentFiles = filesByBook[currentBookId] || []
    setFiles([...currentFiles, newFile])
    // 自动打开新章节
    openFile(path, newFile.content)
  }

  // ---- 删除文件 ----
  function handleDelete(path: string) {
    if (!currentBookId) return
    const file = files.find((f) => f.path === path)
    const label = file?.name || path.split('/').pop() || '文件'
    if (!confirm(`确认删除「${label}」？此操作不可撤销。`)) return

    setRenamingPath(null)
    removeFile(path)
  }

  // ---- 重命名 ----
  function startRename(path: string) {
    const file = files.find((f) => f.path === path)
    if (!file) return
    setRenamingPath(path)
    setRenameValue(file.name)
    setTimeout(() => renameInputRef.current?.focus(), 50)
  }

  function finishRename() {
    if (!renamingPath || !currentBookId) return
    const name = renameValue.trim()
    if (!name) {
      setRenamingPath(null)
      return
    }
    const currentFiles = filesByBook[currentBookId] || []
    const updated = currentFiles.map((f) =>
      f.path === renamingPath ? { ...f, name, updatedAt: new Date().toISOString() } : f
    )
    setFiles(updated)
    setRenamingPath(null)
  }

  function handleRenameKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      finishRename()
    } else if (e.key === 'Escape') {
      setRenamingPath(null)
    }
  }

  return (
    <div className="file-tree">
      {SECTIONS.map((section) => {
        const sectionFiles = files.filter((f) => section.predicate(f.type))
        if (sectionFiles.length === 0 && section.key !== 'chapters') return null

        return (
          <div key={section.key} className="file-tree-section">
            {/* Section header with action button */}
            <div className="file-tree-section-title">
              <span className="file-tree-section-title-icon">{section.icon}</span>
              <span>{section.label}</span>
              {section.key === 'chapters' && (
                <button
                  className="file-tree-add-btn"
                  onClick={addChapter}
                  title="新增章节"
                >
                  ＋
                </button>
              )}
            </div>

            <div className="file-tree-items">
              {sectionFiles.map((file) => {
                const isActive = file.path === currentFilePath
                const isChapter = file.type === 'chapter'
                const isExpanded = expandedChapterPaths.includes(file.path)
                const isRenaming = renamingPath === file.path

                if (isChapter) {
                  return (
                    <div key={file.path}>
                      <div
                        className={`file-tree-item file-tree-chapter-parent${isActive ? ' active' : ''}`}
                        onClick={() => toggleChapter(file.path)}
                      >
                        <span className="file-tree-item-caret">{isExpanded ? '▼' : '▶'}</span>
                        <span className="file-tree-item-icon">📄</span>
                        {isRenaming ? (
                          <input
                            ref={renameInputRef}
                            className="file-tree-rename-input"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={finishRename}
                            onKeyDown={handleRenameKeyDown}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className="file-tree-item-name">{file.name}</span>
                        )}
                        <span className="file-tree-item-badge archived">✓</span>
                        {/* Hover actions */}
                        <div className="file-tree-item-actions">
                          <button
                            className="file-tree-action-btn"
                            onClick={(e) => { e.stopPropagation(); startRename(file.path) }}
                            title="重命名"
                          >✎</button>
                          <button
                            className="file-tree-action-btn danger"
                            onClick={(e) => { e.stopPropagation(); handleDelete(file.path) }}
                            title="删除章节"
                          >✕</button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="file-tree-chapter-children">
                          <div
                            className="file-tree-item file-tree-child-item"
                            onClick={() => {
                              const summaryFile = files.find((f) => f.type === 'summary')
                              if (summaryFile) {
                                openFileOrSummary('knowledge/summary.md', summaryFile.content)
                              }
                            }}
                            title="查看章节概要"
                          >
                            <span className="file-tree-item-icon">📋</span>
                            <span className="file-tree-item-name">纲要</span>
                          </div>
                          <div
                            className={`file-tree-item file-tree-child-item${isActive ? ' active' : ''}`}
                            onClick={() => openFileOrSummary(file.path, file.content)}
                            title="查看章节正文"
                          >
                            <span className="file-tree-item-icon">📝</span>
                            <span className="file-tree-item-name">正文</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                }

                // Knowledge file
                return (
                  <div
                    key={file.path}
                    className={`file-tree-item${isActive ? ' active' : ''}`}
                    onClick={() => openFile(file.path, file.content)}
                  >
                    <span className="file-tree-item-icon">{fileIcon(file.type)}</span>
                    {isRenaming ? (
                      <input
                        ref={renameInputRef}
                        className="file-tree-rename-input"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={finishRename}
                        onKeyDown={handleRenameKeyDown}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="file-tree-item-name">{file.name}</span>
                    )}
                    <div className="file-tree-item-actions">
                      <button
                        className="file-tree-action-btn"
                        onClick={(e) => { e.stopPropagation(); startRename(file.path) }}
                        title="重命名"
                      >✎</button>
                      <button
                        className="file-tree-action-btn danger"
                        onClick={(e) => { e.stopPropagation(); handleDelete(file.path) }}
                        title="删除"
                      >✕</button>
                    </div>
                  </div>
                )
              })}

              {/* Empty state for chapters */}
              {section.key === 'chapters' && sectionFiles.length === 0 && (
                <div key="chapters-empty" className="file-tree-empty-row">
                  <span className="file-tree-empty-text">暂无章节</span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
