import { useMemo } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import type { KnowledgeFileType } from '../../types'

type FileSection = 'chapters' | 'draft' | 'knowledge'

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
    key: 'draft',
    icon: '📝',
    label: '草稿',
    predicate: (t) => t === 'chapter_draft',
  },
  {
    key: 'knowledge',
    icon: '📚',
    label: '知识',
    predicate: (t) =>
      !['chapter', 'chapter_draft'].includes(t),
  },
]

const FILE_ICONS: Record<string, string> = {
  world_model: '🌍',
  style_fingerprint: '🎨',
  master_outline: '📋',
  arc_outline: '📋',
  chapter_outline: '📋',
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
  // 使用稳定的 selector：只返回原始 state 引用，不调用会创建新引用的方法
  const filesByBook = useEditorStore((s) => s.filesByBook)
  const currentBookId = useEditorStore((s) => s.currentBookId)
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const openFile = useEditorStore((s) => s.openFile)

  // 在组件内用 useMemo 获取当前书籍的文件列表，避免无限循环
  const files = useMemo(() => {
    if (!currentBookId) return []
    return filesByBook[currentBookId] || []
  }, [filesByBook, currentBookId])

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
                const isDraft = file.type === 'chapter_draft'

                return (
                  <div
                    key={file.path}
                    className={`file-tree-item${isActive ? ' active' : ''}`}
                    onClick={() => openFile(file.path, file.content)}
                  >
                    <span className="file-tree-item-icon">
                      {isChapter ? '📄' : isDraft ? '✏️' : fileIcon(file.type)}
                    </span>
                    <span className="file-tree-item-name">{file.name}</span>
                    {isChapter && (
                      <span className="file-tree-item-badge archived">✓</span>
                    )}
                    {isDraft && (
                      <span className="file-tree-item-badge draft">📝</span>
                    )}
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
