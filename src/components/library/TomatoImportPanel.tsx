import { useState, useRef, useCallback, useEffect } from 'react'
import { useBookStore } from '../../stores/bookStore'
import { useEditorStore } from '../../stores/editorStore'
import Modal from '../ui/Modal'
import {
  searchTomatoNovels,
  getTomatoBookInfo,
  startTomatoDownload,
  pollDownloadProgress,
  setTomatoCookies,
  clearTomatoCookies,
} from '../../services/tomatoImport'
import type { BookInfo, TomatoSearchResult, DownloadResult } from '../../services/tomatoImport'

interface Props {
  open: boolean
  onClose: () => void
}

type Step = 'input' | 'preview' | 'downloading' | 'result' | 'error'

export default function TomatoImportPanel({ open, onClose }: Props) {
  const { createBook, addChapter, setCurrentBook } = useBookStore()
  const { setFiles } = useEditorStore()

  const [step, setStep] = useState<Step>('input')
  const [inputValue, setInputValue] = useState('')
  const [bookInfo, setBookInfo] = useState<BookInfo | null>(null)
  const [searchResults, setSearchResults] = useState<TomatoSearchResult[] | null>(null)
  const [cookies, setCookies_] = useState(() => localStorage.getItem('tomato_cookies') || '')
  const [cookieCollapsed, setCookieCollapsed] = useState(false)
  const [cookieSaved, setCookieSaved] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadResult, setDownloadResult] = useState<DownloadResult | null>(null)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [chapterProgress, setChapterProgress] = useState<Array<{ index: number; title: string; status: string }> | null>(null)
  const [currentChapter, setCurrentChapter] = useState<{ index: number; title: string; status: string } | null>(null)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // 挂载时从 localStorage 恢复 Cookie
  useEffect(() => {
    const saved = localStorage.getItem('tomato_cookies')
    if (saved) {
      setTomatoCookies(saved).catch(() => {})
    }
  }, [])

  // 关闭时重置
  useEffect(() => {
    if (!open) {
      setStep('input')
      setInputValue('')
      setBookInfo(null)
      setSearchResults(null)
      setDownloadResult(null)
      setProgress({ current: 0, total: 0 })
      setChapterProgress(null)
      setCurrentChapter(null)
      setError('')
      setDownloading(false)
      setImporting(false)
      if (pollTimer.current) clearInterval(pollTimer.current)
    }
  }, [open])

  function extractBookId(text: string): string {
    const m = text.match(/(\d{12,22})/)
    return m ? m[1] : text.trim()
  }

  async function handleSearch() {
    const query = inputValue.trim()
    if (!query) return
    setError('')
    setSearchResults(null)
    setBookInfo(null)

    const bookId = extractBookId(query)
    try {
      if (/^\d{12,22}$/.test(bookId)) {
        // 直接按 bookId 预览
        const info = await getTomatoBookInfo(bookId)
        setBookInfo(info)
        setStep('preview')
      } else {
        // 关键词搜索
        const results = await searchTomatoNovels(query)
        setSearchResults(results)
        if (results.length === 0) {
          setError('未找到匹配结果')
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '请求失败')
    }
  }

  async function handleSelectBook(bookId: string) {
    setError('')
    setSearchResults(null)
    try {
      const info = await getTomatoBookInfo(bookId)
      setBookInfo(info)
      setStep('preview')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '获取书籍信息失败')
    }
  }

  async function handleDownload() {
    if (!bookInfo) return
    setDownloading(true)
    setStep('downloading')
    setError('')

    try {
      const taskId = await startTomatoDownload(
        bookInfo.bookId,
        bookInfo.chapters.map((ch) => ({ index: ch.index, title: ch.title })),
      )

      // 轮询进度
      await new Promise<void>((resolve, reject) => {
        pollTimer.current = setInterval(async () => {
          try {
            const status = await pollDownloadProgress(taskId)
            if (status.status === 'running') {
              setProgress({ current: status.progress || 0, total: status.total || 0 })
              if (status.currentChapter) setCurrentChapter(status.currentChapter)
              if (status.chapterProgress) setChapterProgress(status.chapterProgress)
            } else if (status.status === 'done') {
              clearInterval(pollTimer.current!)
              setDownloadResult(status.result!)
              setStep('result')
              resolve()
            } else if (status.status === 'failed') {
              clearInterval(pollTimer.current!)
              reject(new Error(status.error || '下载失败'))
            }
          } catch (err) {
            clearInterval(pollTimer.current!)
            reject(err)
          }
        }, 800)
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '下载失败')
      setStep('error')
    } finally {
      setDownloading(false)
    }
  }

  async function handleImport() {
    if (!downloadResult) return
    setImporting(true)
    setError('')

    try {
      const now = new Date().toISOString()
      const book = createBook(
        downloadResult.bookName,
        '',
        `番茄小说导入 · ${downloadResult.author}`,
        '',
      )

      // 构建知识文件 + 章节列表
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

      const fileEntries: Array<{ name: string; path: string; type: string; content: string; updatedAt: string }> = [
        ...knowledgeFiles,
      ]

      downloadResult.chapters.forEach((ch) => {
        const idx = ch.index
        const paddedIdx = String(idx).padStart(3, '0')
        const chapterFileName = `chapters/${paddedIdx}.md`

        addChapter(book.id, {
          index: idx,
          title: ch.title,
          fileName: chapterFileName,
          wordCount: ch.body.length,
          createdAt: now,
          updatedAt: now,
        })

        // 持久化章节内容到 localStorage
        try {
          localStorage.setItem(`nc:${chapterFileName}`, ch.body)
        } catch { /* ignore */ }

        fileEntries.push({
          name: ch.title,
          path: chapterFileName,
          type: 'chapter',
          content: ch.body,
          updatedAt: now,
        })
      })

      // 设置文件列表（editorStore 已按书隔离，先设置当前书再写入）
      useEditorStore.getState().setCurrentBook(book.id)
      setFiles(fileEntries)

      // 设置为当前书
      setCurrentBook(book.id)

      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '导入出错')
      setImporting(false)
    }
  }

  function handleClose() {
    if (downloading) {
      if (!confirm('下载中，确定取消吗？')) return
    }
    onClose()
  }

  const totalWords = downloadResult
    ? downloadResult.chapters.reduce((s, c) => s + c.body.length, 0)
    : 0

  return (
    <Modal open={open} onClose={handleClose} title="🍅 番茄小说导入" width={560}>
      {/* Step 1: 输入 */}
      {step === 'input' && (
        <div style={{ padding: '8px 0' }}>
          <div className="form-group">
            <label className="form-label">番茄小说链接或 book_id</label>
            <input
              className="form-input"
              placeholder="输入 https://fanqienovel.com/page/7105916563 或 books_id"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
              autoFocus
            />
            <div className="form-hint">
              支持番茄小说书籍详情页链接或纯数字 book_id，也可以输入书名搜索
            </div>
          </div>

          {/* Cookie 设置折叠区 */}
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                userSelect: 'none', fontSize: 13, color: 'var(--text-secondary)',
              }}
              onClick={() => setCookieCollapsed(!cookieCollapsed)}
            >
              <span style={{ transform: cookieCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>▾</span>
              <span>Cookie 设置</span>
              {cookies && <span style={{ color: 'var(--success)', fontSize: 11 }}>✓ 已设置</span>}
              {cookieSaved && <span style={{ color: 'var(--success)', fontSize: 11 }}>已保存</span>}
            </div>

            {!cookieCollapsed && (
              <div style={{ marginTop: 8, marginLeft: 16 }}>
                <div className="form-hint" style={{ marginBottom: 8, lineHeight: 1.6 }}>
                  番茄小说的 WAF 防火墙会拦截自动化请求。从浏览器复制 Cookie 可绕过限制：
                  <br />① 用 Chrome/Firefox 打开{' '}
                  <a href="https://fanqienovel.com" target="_blank" rel="noreferrer">fanqienovel.com</a>
                  {' '}并登录（免费账号即可）
                  <br />② F12 → Network → 刷新页面 → 点击第一条请求 → 复制 Request Headers 中的 Cookie
                  <br />③ 粘贴到下方输入框
                </div>
                <textarea
                  className="form-input"
                  placeholder="粘贴 Cookie 字符串，如：novel_web_id=xxx; sessionid=xxx"
                  value={cookies}
                  onChange={(e) => { setCookies_(e.target.value); setCookieSaved(false) }}
                  rows={3}
                  style={{ fontFamily: 'monospace', fontSize: 11, width: '100%', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 12, padding: '4px 12px' }}
                    onClick={async () => {
                      try {
                        await setTomatoCookies(cookies)
                        localStorage.setItem('tomato_cookies', cookies)
                        setCookieSaved(true)
                        setTimeout(() => setCookieSaved(false), 3000)
                      } catch (e: unknown) {
                        setError(e instanceof Error ? e.message : '保存 Cookie 失败')
                      }
                    }}
                    disabled={!cookies.trim()}
                  >
                    保存 Cookie
                  </button>
                  {cookies && (
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: 12, padding: '4px 12px' }}
                      onClick={async () => {
                        try {
                          await clearTomatoCookies()
                          setCookies_('')
                          localStorage.removeItem('tomato_cookies')
                          setCookieSaved(false)
                        } catch { /* ignore */ }
                      }}
                    >
                      清除
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {searchResults && searchResults.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <label className="form-label">搜索结果（点击选择）</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                {searchResults.map((r) => (
                  <div
                    key={r.bookId}
                    className="import-file-item"
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleSelectBook(r.bookId)}
                  >
                    <div className="import-file-info">
                      <span className="import-file-icon">📖</span>
                      <div className="import-file-details">
                        <div className="import-file-name">{r.bookName}</div>
                        <div className="import-file-original">
                          {r.author} · {r.chapterCount}章 · {(r.wordCount / 10000).toFixed(1)}万字
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="form-actions" style={{ marginTop: 16 }}>
            <button className="btn btn-secondary" onClick={handleClose}>取消</button>
            <div style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={handleSearch} disabled={!inputValue.trim()}>
              搜索 / 预览
            </button>
          </div>

          {error && <div className="form-error" style={{ marginTop: 8 }}>⚠️ {error}</div>}
        </div>
      )}

      {/* Step 2: 预览 */}
      {step === 'preview' && bookInfo && (
        <div style={{ padding: '4px 0' }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{bookInfo.bookName}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
                作者：{bookInfo.author}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {bookInfo.chapterCount} 章 · {(bookInfo.wordCount / 10000).toFixed(1)}万字
              </div>
            </div>
          </div>

          {bookInfo.abstract && (
            <div className="form-group">
              <label className="form-label">简介</label>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {bookInfo.abstract}
              </div>
            </div>
          )}

          {/* 章节预览 */}
          <div className="form-group">
            <label className="form-label">章节列表（前 10 章）</label>
            <div style={{ maxHeight: 200, overflow: 'auto', fontSize: 13 }}>
              {bookInfo.chapters.slice(0, 10).map((ch) => (
                <div key={ch.index} style={{ padding: '4px 0', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', minWidth: 28 }}>{ch.index}</span>
                  <span style={{ flex: 1 }}>{ch.title}</span>
                  {ch.isLocked && <span style={{ color: 'var(--danger)', fontSize: 11 }}>🔒</span>}
                </div>
              ))}
              {bookInfo.chapters.length > 10 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '4px 0' }}>
                  … 共 {bookInfo.chapters.length} 章
                </div>
              )}
            </div>
          </div>

          <div className="form-actions" style={{ marginTop: 12 }}>
            <button className="btn btn-secondary" onClick={() => setStep('input')}>返回</button>
            <div style={{ flex: 1 }} />
            <button className="btn btn-secondary" onClick={handleClose}>取消</button>
            <button
              className="btn btn-primary"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? '下载中…' : '下载全部章节'}
            </button>
          </div>

          {error && <div className="form-error" style={{ marginTop: 8 }}>⚠️ {error}</div>}
        </div>
      )}

      {/* Step 3: 下载中 */}
      {step === 'downloading' && (
        <div style={{ padding: '12px 0' }}>
          {/* 进度条 + 当前章节 */}
          <div style={{ textAlign: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
              {currentChapter
                ? `正在下载 ${currentChapter.title}`
                : '正在准备下载…'}
            </div>
            {progress.total > 0 && (
              <div style={{ width: '80%', margin: '8px auto' }}>
                <div className="progress-bar" style={{ height: 6 }}>
                  <div
                    className="progress-fill"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  {progress.current} / {progress.total} 章
                </div>
              </div>
            )}
          </div>

          {/* 章节下载状态列表（最近 10 条可见，其余可滚动） */}
          {chapterProgress && chapterProgress.length > 0 && (
            <div style={{
              maxHeight: 280,
              overflow: 'auto',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
            }}>
              <div style={{
                display: 'flex', padding: '6px 10px',
                background: 'var(--bg-subtle)',
                fontWeight: 600, fontSize: 11, color: 'var(--text-muted)',
                borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ width: 36 }}>#</span>
                <span style={{ flex: 1 }}>章节</span>
                <span style={{ width: 60, textAlign: 'right' }}>状态</span>
              </div>
              {chapterProgress.map((ch) => (
                <div key={ch.index} style={{
                  display: 'flex', padding: '4px 10px',
                  alignItems: 'center',
                  borderBottom: '1px solid var(--border)',
                  background: currentChapter?.index === ch.index
                    ? 'rgba(13,110,253,0.04)' : 'transparent',
                  opacity: ch.status === 'waiting' ? 0.5 : 1,
                }}>
                  <span style={{ width: 36, color: 'var(--text-muted)' }}>{ch.index}</span>
                  <span style={{
                    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{ch.title}</span>
                  <span style={{ width: 60, textAlign: 'right' }}>
                    {ch.status === 'done' && <span style={{ color: 'var(--success)' }}>✓ 完成</span>}
                    {ch.status === 'failed' && <span style={{ color: 'var(--danger)' }}>✗ 失败</span>}
                    {ch.status === 'waiting' && <span style={{ color: 'var(--text-muted)' }}>等待</span>}
                    {ch.status === 'downloading' && <span style={{ color: 'var(--primary)' }}>下载中…</span>}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 8 }}>
            番茄小说有反爬限制，下载速度约 2-5 章/秒
          </div>
        </div>
      )}

      {/* Step 4: 下载完成 */}
      {step === 'result' && downloadResult && (
        <div style={{ padding: '4px 0' }}>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 32 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 500, marginTop: 4 }}>下载完成</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
            <div className="detail-stat">
              <div className="detail-stat-value">{downloadResult.chapterCount}</div>
              <div className="detail-stat-label">章节</div>
            </div>
            <div className="detail-stat">
              <div className="detail-stat-value">{(totalWords / 10000).toFixed(1)}</div>
              <div className="detail-stat-label">万字</div>
            </div>
            <div className="detail-stat">
              <div className="detail-stat-value" style={{
                color: downloadResult.quality.riskLevel === 'ok' ? 'var(--success)'
                  : downloadResult.quality.riskLevel === 'warn' ? 'var(--warning)' : 'var(--danger)',
              }}>
                {downloadResult.quality.riskLevel === 'ok' ? '良好'
                  : downloadResult.quality.riskLevel === 'warn' ? '需注意'
                  : '有问题'}
              </div>
              <div className="detail-stat-label">质量</div>
            </div>
          </div>

          {/* 质量报告 */}
          {downloadResult.quality.issues.length > 0 && (
            <div className="form-group">
              <label className="form-label">质量报告</label>
              {downloadResult.quality.issues.map((issue, i) => (
                <div key={i} style={{
                  padding: '4px 8px',
                  fontSize: 12,
                  borderRadius: 4,
                  marginBottom: 2,
                  background: issue.severity === 'block'
                    ? 'rgba(220,53,69,0.08)'
                    : 'rgba(255,193,7,0.08)',
                  color: issue.severity === 'block' ? 'var(--danger)' : 'var(--warning)',
                }}>
                  {issue.message}
                  {issue.chapter && ` (${issue.chapter})`}
                </div>
              ))}
            </div>
          )}

          <div className="form-actions" style={{ marginTop: 12 }}>
            <button className="btn btn-secondary" onClick={handleClose}>取消</button>
            <div style={{ flex: 1 }} />
            <button className="btn btn-secondary" onClick={() => setStep('input')}>
              继续导入下一本
            </button>
            <button
              className="btn btn-primary"
              onClick={handleImport}
              disabled={importing}
            >
              {importing ? '导入中…' : '导入到作品库'}
            </button>
          </div>

          {error && <div className="form-error" style={{ marginTop: 8 }}>⚠️ {error}</div>}
        </div>
      )}

      {/* Error state */}
      {step === 'error' && (
        <div style={{ padding: '24px 0', textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>❌</div>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8, color: 'var(--danger)' }}>
            下载失败
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
            {error}
          </div>
          <div className="form-actions" style={{ justifyContent: 'center' }}>
            <button className="btn btn-secondary" onClick={() => setStep('input')}>
              返回重新输入
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
