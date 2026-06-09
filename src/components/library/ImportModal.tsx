import { useState, useRef } from 'react'
import { useBookStore } from '../../stores/bookStore'
import { useEditorStore } from '../../stores/editorStore'
import Modal from '../ui/Modal'

interface ImportedFile {
  name: string
  title: string
  content: string
  size: number
}

interface ImportModalProps {
  open: boolean
  onClose: () => void
}

/**
 * 解析文件名中的章节标题
 * "001-第一章.md" → "第一章"
 * "第一章.md" → "第一章"
 * "ch01.md" → "ch01"
 */
function parseChapterTitle(fileName: string): string {
  const name = fileName.replace(/\.md$/i, '')

  // 模式1: "001-第一章" → "第一章"
  const match1 = name.match(/^\d+[-_.\s]*(.+)$/)
  if (match1) return match1[1]

  // 模式2: "第一章" 直接返回
  if (/^第[一二三四五六七八九十百千万\d]+章/.test(name)) return name

  return name
}

export default function ImportModal({ open, onClose }: ImportModalProps) {
  const { createBook, addChapter } = useBookStore()
  const { files, setFiles } = useEditorStore()

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [importedFiles, setImportedFiles] = useState<ImportedFile[]>([])
  const [bookTitle, setBookTitle] = useState('')
  const [bookType, setBookType] = useState('')
  const [mainChar, setMainChar] = useState('')
  const [importing, setImporting] = useState(false)
  const [step, setStep] = useState<'select' | 'preview'>('select')
  const [error, setError] = useState('')

  const totalWords = importedFiles.reduce((sum, f) => sum + f.content.length, 0)

  // Reset on close
  function handleClose() {
    setImportedFiles([])
    setBookTitle('')
    setBookType('')
    setMainChar('')
    setImporting(false)
    setStep('select')
    setError('')
    onClose()
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return

    setError('')

    const readers: Promise<ImportedFile>[] = []

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]
      if (!file.name.endsWith('.md')) continue

      readers.push(
        new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () =>
            resolve({
              name: file.name,
              title: parseChapterTitle(file.name),
              content: reader.result as string,
              size: file.size,
            })
          reader.onerror = () => reject(new Error(`读取失败: ${file.name}`))
          reader.readAsText(file)
        }),
      )
    }

    try {
      const files = await Promise.all(readers)

      // Sort by filename
      files.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))

      setImportedFiles(files)
      setStep('preview')

      // Auto-fill book title from the first file's series folder name or generic
      if (files.length > 0 && !bookTitle) {
        setBookTitle('导入作品')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '读取出错')
    }

    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleRemoveFile(index: number) {
    setImportedFiles((prev) => prev.filter((_, i) => i !== index))
    if (importedFiles.length <= 1) {
      setStep('select')
    }
  }

  async function handleConfirm() {
    if (!bookTitle.trim() || importedFiles.length === 0) return

    setImporting(true)
    setError('')

    try {
      // Create the book
      const book = createBook(bookTitle.trim(), bookType.trim(), '', mainChar.trim())

      // Create default knowledge files
      const now = new Date().toISOString()
      const knowledgeFiles = [
        { name: '当前草稿', path: 'drafts/chapter_draft.md', type: 'chapter_draft' as const, content: '', updatedAt: now },
        { name: '世界观设定', path: 'knowledge/world_model.md', type: 'world_model' as const, content: '', updatedAt: now },
        { name: '文风画像', path: 'knowledge/style_fingerprint.md', type: 'style_fingerprint' as const, content: '', updatedAt: now },
        { name: '总纲', path: 'knowledge/master_outline.md', type: 'master_outline' as const, content: '', updatedAt: now },
        { name: '卷纲', path: 'knowledge/arc_outline.md', type: 'arc_outline' as const, content: '', updatedAt: now },
        { name: '章纲', path: 'knowledge/chapter_outline.md', type: 'chapter_outline' as const, content: '', updatedAt: now },
        { name: '状态卡', path: 'knowledge/status_card.md', type: 'status_card' as const, content: '', updatedAt: now },
        { name: '灵感笔记', path: 'knowledge/brainstorm.md', type: 'brainstorm' as const, content: '', updatedAt: now },
      ]

      // Add chapters
      importedFiles.forEach((f, index) => {
        const idx = index + 1
        const paddedIdx = String(idx).padStart(3, '0')
        const chapterFileName = `chapters/${paddedIdx}.md`

        addChapter(book.id, {
          index: idx,
          title: f.title,
          fileName: chapterFileName,
          wordCount: f.content.length,
          createdAt: now,
          updatedAt: now,
        })

        knowledgeFiles.push({
          name: f.title,
          path: chapterFileName,
          type: 'chapter',
          content: f.content,
          updatedAt: now,
        })
      })

      // Set files in editor store（editorStore 已按书隔离，先设置当前书再写入）
      useEditorStore.getState().setCurrentBook(book.id)
      setFiles(knowledgeFiles)

      // Set as current book
      useBookStore.getState().setCurrentBook(book.id)

      handleClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '导入过程中出错')
      setImporting(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="📂 导入书籍" width={560}>
      {/* Step 1: File Selection */}
      {step === 'select' && (
        <div style={{ padding: '8px 0' }}>
          <div className="import-dropzone">
            <div className="import-dropzone-icon">📁</div>
            <div className="import-dropzone-text">
              选择 Markdown 文件
              <div className="import-dropzone-hint">
                支持 .md 格式，文件名如「001-第一章.md」将自动识别章节标题
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".md"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              id="import-file-input"
            />
            <label htmlFor="import-file-input" className="btn btn-primary" style={{ cursor: 'pointer' }}>
              选择文件
            </label>
          </div>

          <div className="form-hint" style={{ marginTop: 16, textAlign: 'center' }}>
            选好文件后会自动进入预览界面
          </div>
        </div>
      )}

      {/* Step 2: Preview & Confirm */}
      {step === 'preview' && (
        <div style={{ padding: '4px 0' }}>
          {/* Book Metadata */}
          <div className="form-group">
            <label className="form-label">书名 <span className="form-required">*</span></label>
            <input
              className="form-input"
              placeholder="输入作品名称"
              value={bookTitle}
              onChange={(e) => setBookTitle(e.target.value)}
              maxLength={50}
              autoFocus
            />
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">小说类型</label>
              <input
                className="form-input"
                placeholder="如：玄幻、都市"
                value={bookType}
                onChange={(e) => setBookType(e.target.value)}
                maxLength={12}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">主角名</label>
              <input
                className="form-input"
                placeholder="选填"
                value={mainChar}
                onChange={(e) => setMainChar(e.target.value)}
                maxLength={20}
              />
            </div>
          </div>

          {/* File Preview */}
          <div className="form-group">
            <label className="form-label">
              已选文件（共 {importedFiles.length} 个 · {(totalWords / 10000).toFixed(1)}万字）
            </label>
            <div className="import-file-list">
              {importedFiles.map((f, i) => (
                <div key={i} className="import-file-item">
                  <div className="import-file-info">
                    <span className="import-file-icon">📄</span>
                    <div className="import-file-details">
                      <div className="import-file-name">{f.title}</div>
                      <div className="import-file-original">
                        源文件：{f.name} · {(f.size / 1024).toFixed(1)}KB
                      </div>
                    </div>
                  </div>
                  <button
                    className="import-file-remove"
                    onClick={() => handleRemoveFile(i)}
                    title="移除"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8 }}>
              <label htmlFor="import-file-add" className="btn btn-sm btn-secondary" style={{ cursor: 'pointer', fontSize: 12 }}>
                ＋ 添加更多文件
              </label>
              <input
                id="import-file-add"
                type="file"
                multiple
                accept=".md"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(220,53,69,0.08)',
            color: 'var(--danger)',
            fontSize: 12,
            marginTop: 8,
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* Footer */}
      <div className="form-actions" style={{ marginTop: 16 }}>
        {step === 'preview' && (
          <button className="btn btn-secondary" onClick={() => setStep('select')}>
            返回上一步
          </button>
        )}
        <div style={{ flex: 1 }} />

        {step === 'select' ? (
          <button className="btn btn-secondary" onClick={handleClose}>
            取消
          </button>
        ) : (
          <>
            <button className="btn btn-secondary" onClick={handleClose}>
              取消
            </button>
            <button
              className="btn btn-primary"
              onClick={handleConfirm}
              disabled={!bookTitle.trim() || importedFiles.length === 0 || importing}
            >
              {importing ? '正在导入…' : `导入 ${importedFiles.length} 个章节`}
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}
