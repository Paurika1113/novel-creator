import { useState } from 'react'
import { useBookStore } from '../stores/bookStore'
import { useEditorStore } from '../stores/editorStore'
import type { Book, BookType } from '../types'
import Modal from '../components/ui/Modal'
import ContextMenu from '../components/ui/ContextMenu'
import type { ContextMenuItem } from '../components/ui/ContextMenu'
import ImportModal from '../components/library/ImportModal'
import KnowledgeInitWizard from '../components/library/KnowledgeInitWizard'
import TomatoImportPanel from '../components/library/TomatoImportPanel'

export default function LibraryPage({ onNavigate }: { onNavigate?: (page: 'editor') => void }) {
  const { books, createBook, deleteBook, renameBook, duplicateBook, setCurrentBook } = useBookStore()
  const filesByBook = useEditorStore((s) => s.filesByBook)

  // 新建弹窗
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newType, setNewType] = useState<BookType>('玄幻')
  const [newDesc, setNewDesc] = useState('')
  const [newMainChar, setNewMainChar] = useState('')

  // 知识文件初始化向导（创建书籍后弹出）
  const [initBookId, setInitBookId] = useState<string | null>(null)
  const [initBookInfo, setInitBookInfo] = useState<{ title: string; type: string; description: string; mainCharacter: string } | null>(null)

  // 导入弹窗
  const [showImport, setShowImport] = useState(false)
  const [showTomatoImport, setShowTomatoImport] = useState(false)

  // 作品信息弹窗
  const [infoBookId, setInfoBookId] = useState<string | null>(null)

  // 右键菜单
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; bookId: string
  } | null>(null)
  const [renameBookId, setRenameBookId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const removeFile = useEditorStore((s) => s.removeFile)

  // 从 editorStore 实时计算章节数和字数
  function getBookStats(bookId: string) {
    const files = filesByBook[bookId] || []
    const chapterFiles = files.filter((f) => f.type === 'chapter' && f.content?.trim())
    const chapterCount = chapterFiles.length
    const wordCount = chapterFiles.reduce((sum, f) => sum + (f.content?.length || 0), 0)
    return { chapterCount, wordCount }
  }

  function bookEmoji(type: string): string {
    const map: Record<string, string> = {
      '玄幻': '🗡️', '都市': '🌆', '科幻': '🚀', '仙侠': '🏯',
      '历史': '📜', '悬疑': '🔍', '言情': '💕',
    }
    return map[type] || '📖'
  }

  // ---- 新建书籍 ----
  function handleCreate() {
    if (!newTitle.trim() || newTitle.trim().length < 2) return
    const book = createBook(newTitle.trim(), newType.trim(), newDesc.trim(), newMainChar.trim())
    setShowNewDialog(false)
    setNewTitle('')
    setNewType('')
    setNewDesc('')
    setNewMainChar('')

    // 自动打开知识文件初始化向导
    setInitBookId(book.id)
    setInitBookInfo({
      title: book.title,
      type: book.type,
      description: book.description,
      mainCharacter: book.mainCharacter,
    })
  }

  // ---- 重命名 ----
  function startRename(id: string, currentTitle: string) {
    setRenameBookId(id)
    setRenameValue(currentTitle)
    setContextMenu(null)
  }

  function confirmRename() {
    if (renameBookId && renameValue.trim()) {
      renameBook(renameBookId, renameValue.trim())
    }
    setRenameBookId(null)
    setRenameValue('')
  }

  // ---- 右键菜单 ----
  function handleContextMenu(e: React.MouseEvent, bookId: string) {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, bookId })
  }

  const contextItems: ContextMenuItem[] = contextMenu
    ? [
        {
          label: '初始化知识文件',
          icon: '🔄',
          onClick: () => {
            const book = books.find((b) => b.id === contextMenu.bookId)
            if (!book) return

            // 设置当前书籍（editorStore 会按书隔离文件）
            setCurrentBook(book.id)

            // 移除该书已有的知识文件，让向导重新生成
            // 由于 editorStore 已按书隔离，removeFile 只会删除当前书的知识文件
            removeFile('knowledge/world_model.md')
            removeFile('knowledge/master_outline.md')
            removeFile('knowledge/brainstorm.md')

            // 打开知识文件初始化向导
            setInitBookId(book.id)
            setInitBookInfo({
              title: book.title,
              type: book.type,
              description: book.description,
              mainCharacter: book.mainCharacter,
            })
            setContextMenu(null)
          },
        },
        {
          label: '重命名',
          icon: '✏️',
          onClick: () => {
            const book = books.find((b) => b.id === contextMenu.bookId)
            if (book) startRename(book.id, book.title)
          },
        },
        {
          label: '复制书籍',
          icon: '📋',
          onClick: () => duplicateBook(contextMenu.bookId),
        },
        { label: '---', onClick: () => {} },
        {
          label: '删除',
          icon: '🗑️',
          danger: true,
          onClick: () => {
            if (confirm('确定删除这本书吗？所有内容不可恢复。')) {
              deleteBook(contextMenu.bookId)
            }
          },
        },
      ]
    : []

  return (
    <div className="page-content">
      {/* 顶栏 */}
      <div className="page-header">
        <h1 className="page-title">作品库</h1>
        <div className="page-actions">
          <button className="btn btn-secondary" onClick={() => setShowImport(true)}>
            <span>📂</span> 导入 Markdown
          </button>
          <button className="btn btn-secondary" onClick={() => setShowTomatoImport(true)}>
            <span>🍅</span> 番茄小说
          </button>
          <button className="btn btn-primary" onClick={() => setShowNewDialog(true)}>
            <span>＋</span> 新建
          </button>
        </div>
      </div>

      {/* 书籍卡片网格 */}
      {books.length > 0 ? (
        <div className="book-grid">
          {books.map((book) => {
            const stats = getBookStats(book.id)
            return (
              <div
                key={book.id}
                className="book-card"
                onClick={() => {
                  console.log('Book card clicked!', book.id, book.title)
                  setCurrentBook(book.id)
                  onNavigate?.('editor')
                }}
                onContextMenu={(e) => handleContextMenu(e, book.id)}
              >
                <div className="book-card-emoji">{bookEmoji(book.type)}</div>
                <div className="book-card-info">
                  {renameBookId === book.id ? (
                    <input
                      className="book-card-rename-input"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={confirmRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmRename()
                        if (e.key === 'Escape') setRenameBookId(null)
                      }}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <div className="book-card-title">{book.title}</div>
                  )}
                  <div className="book-card-meta">
                    {book.type} · {stats.chapterCount}章 · {(stats.wordCount / 10000).toFixed(1)}万字
                  </div>
                  {book.mainCharacter && (
                    <div className="book-card-character">👤 {book.mainCharacter}</div>
                  )}
                </div>
                <div className="book-card-progress">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${book.readingProgress}%` }} />
                  </div>
                  <div className="progress-label">
                    {book.gitBranchCount} 分支 · 最后编辑 {formatDate(book.updatedAt)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* 空状态 */
        <div className="empty-state">
          <div className="empty-icon">📚</div>
          <p className="empty-text">还没有书，点击新建开始创作你的第一部长篇吧</p>
          <div className="empty-actions">
            <button className="btn btn-primary btn-lg" onClick={() => setShowNewDialog(true)}>
              <span>＋</span> 新建作品
            </button>
          </div>
          <div className="empty-actions" style={{ marginTop: 8 }}>
            <button className="btn btn-secondary btn-lg" onClick={() => setShowImport(true)}>
              <span>📂</span> 导入 Markdown
            </button>
            <button className="btn btn-secondary btn-lg" onClick={() => setShowTomatoImport(true)}>
              <span>🍅</span> 番茄小说
            </button>
          </div>
        </div>
      )}

      {/* 新建弹窗 */}
      <Modal open={showNewDialog} onClose={() => setShowNewDialog(false)} title="新建作品" width={460}>
        <div className="form-group">
          <label className="form-label">书名 <span className="form-required">*</span></label>
          <input
            className={`form-input ${newTitle && newTitle.trim().length < 2 ? 'error' : ''}`}
            placeholder="输入作品名称（2-50字）"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            autoFocus
            maxLength={50}
          />
          <div className="form-hint">
            {newTitle.length > 0 && newTitle.trim().length < 2
              ? '书名至少 2 个字'
              : `${newTitle.length}/50`}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">小说类型</label>
          <input
            className="form-input"
            placeholder="如：玄幻、都市、科幻、悬疑……"
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            maxLength={12}
          />
        </div>

        <div className="form-group">
          <label className="form-label">主角名</label>
          <input
            className="form-input"
            placeholder="如：林尘、叶凡、江澈"
            value={newMainChar}
            onChange={(e) => setNewMainChar(e.target.value)}
            maxLength={20}
          />
          <div className="form-hint">选填，后续生成大纲和世界观时会自动引用</div>
        </div>

        <div className="form-group">
          <label className="form-label">一句话简介</label>
          <textarea
            className="form-textarea"
            placeholder="可选，简要描述你的作品"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            maxLength={200}
            rows={3}
          />
          <div className="form-hint right">{newDesc.length}/200</div>
        </div>

        <div className="form-actions">
          <button className="btn btn-secondary" onClick={() => setShowNewDialog(false)}>取消</button>
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={!newTitle.trim() || newTitle.trim().length < 2}
          >
            创建
          </button>
        </div>
      </Modal>

      {/* 作品信息弹窗 */}
      {infoBookId && (() => {
        const book = books.find((b) => b.id === infoBookId)
        if (!book) return null
        return (
          <Modal
            open={true}
            onClose={() => setInfoBookId(null)}
            title={`📖 ${book.title}`}
            width={480}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* 基本信息 */}
              <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                <div
                  style={{
                    fontSize: 48,
                    width: 72,
                    height: 72,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--primary-bg)',
                    borderRadius: 'var(--radius-md)',
                    flexShrink: 0,
                  }}
                >
                  {bookEmoji(book.type)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
                    {book.title}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 2 }}>
                    {book.type} · {book.currentBranch}
                  </div>
                  {book.mainCharacter && (
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      主角：{book.mainCharacter}
                    </div>
                  )}
                </div>
              </div>

              {/* 简介 */}
              {book.description && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 4 }}>简介</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {book.description}
                  </div>
                </div>
              )}

              {/* 统计数据 */}
              {(() => {
                const stats = getBookStats(book.id)
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <div className="detail-stat">
                      <div className="detail-stat-value">{stats.chapterCount}</div>
                      <div className="detail-stat-label">章节</div>
                    </div>
                    <div className="detail-stat">
                      <div className="detail-stat-value">
                        {(stats.wordCount / 10000).toFixed(1)}
                      </div>
                      <div className="detail-stat-label">万字</div>
                    </div>
                    <div className="detail-stat">
                      <div className="detail-stat-value">{book.gitBranchCount}</div>
                      <div className="detail-stat-label">分支</div>
                    </div>
                  </div>
                )
              })()}

              {/* 创建 + 修改时间 */}
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                创建于 {formatDate(book.createdAt)} · 最后修改 {formatDate(book.updatedAt)}
              </div>
            </div>

            <div className="form-actions" style={{ marginTop: 20 }}>
              <button className="btn btn-secondary" onClick={() => setInfoBookId(null)}>
                关闭
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setCurrentBook(book.id)
                  setInfoBookId(null)
                  onNavigate?.('editor')
                }}
              >
                ✍️ 进入创作台
              </button>
            </div>
          </Modal>
        )
      })()}

      {/* 知识文件初始化向导 */}
      <KnowledgeInitWizard
        open={initBookId !== null && initBookInfo !== null}
        bookInfo={initBookInfo || { title: '', type: '', description: '', mainCharacter: '' }}
        bookId={initBookId || ''}
        onClose={() => {
          setInitBookId(null)
          setInitBookInfo(null)
        }}
        onComplete={() => {
          // 设置当前书并跳转到创作台
          if (initBookId) setCurrentBook(initBookId)
          setInitBookId(null)
          setInitBookInfo(null)
          onNavigate?.('editor')
        }}
      />

      {/* 导入弹窗 */}
      <ImportModal open={showImport} onClose={() => setShowImport(false)} />

      {/* 番茄小说导入 */}
      <TomatoImportPanel open={showTomatoImport} onClose={() => setShowTomatoImport(false)} />

      {/* 右键菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

import { formatRelativeTime } from '../lib/date'

// 使用统一的日期格式化工具
function formatDate(iso: string) {
  return formatRelativeTime(iso)
}
