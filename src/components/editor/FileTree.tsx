import { useMemo, useState } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import type { KnowledgeFileType } from '../../types'

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
    predicate: (t) =>
      !['chapter', 'chapter_draft'].includes(t) && t !== 'chapter_outline',
  },
]

const FILE_ICONS: Record<string, string> = {
  world_model: '🌍',
  style_fingerprint: '🎨',
  master_outline: '📋',
  arc_outline: '📋',
  status_card: '📊',
  brainstorm: '💡',
  error_archive: '⚠️',
  summary: '📄',
  other: '📄',
}

function fileIcon(type: KnowledgeFileType): string {
  return FILE_ICONS[type] || '📄'
}

export default function FileTree() {
  const filesByBook = useEditorStore((s) => s.filesByBook)
  const currentBookId = useEditorStore((s) => s.currentBookId)
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const openFile = useEditorStore((s) => s.openFile)

  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set())

  const files = useMemo(() => {
    if (!currentBookId) return []
    return filesByBook[currentBookId] || []
  }, [filesByBook, currentBookId])

  function toggleChapter(path: string) {
    setExpandedChapters((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  function openFileOrSummary(filePath: string, content: string) {
    const currentState = useEditorStore.getState()
    if (currentState.currentFilePath === filePath) {
      useEditorStore.setState({ editorContent: content, isDirty: false })
      return
    }
    openFile(filePath, content)
  }

  return (
    <div className="file-tree">
      {SECTIONS.map((section) => {
        const sectionFiles = files.filter((f) => section.predicate(f.type))
        if (sectionFiles.length === 0) return null

        return (
          <div key={section.key} className="file-tree-section">
            <div className="file-tree-section-title">
              <span className="file-tree-section-title-icon">{section.icon}</span>
              {section.label}
            </div>
            <div className="file-tree-items">
              {sectionFiles.map((file) => {
                const isActive = file.path === currentFilePath
                const isChapter = file.type === 'chapter'
                const isExpanded = expandedChapters.has(file.path)

                if (isChapter) {
                  return (
                    <div key={file.path}>
                      <div
                        className={`file-tree-item file-tree-chapter-parent${isActive ? ' active' : ''}`}
                        onClick={() => toggleChapter(file.path)}
                      >
                        <span className="file-tree-item-caret">{isExpanded ? '▼' : '▶'}</span>
                        <span className="file-tree-item-icon">📄</span>
                        <span className="file-tree-item-name">{file.name}</span>
                        <span className="file-tree-item-badge archived">✓</span>
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

                return (
                  <div
                    key={file.path}
                    className={`file-tree-item${isActive ? ' active' : ''}`}
                    onClick={() => openFile(file.path, file.content)}
                  >
                    <span className="file-tree-item-icon">{fileIcon(file.type)}</span>
                    <span className="file-tree-item-name">{file.name}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
