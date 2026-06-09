import { useState, useEffect, useRef } from 'react'
import { useEditorStore } from '../../stores/editorStore'
import { useBookStore } from '../../stores/bookStore'
import { useMemoryStore } from '../../stores/memoryStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { analyzeChapterEvents, buildActiveElementsMd } from '../../services/eventAnalysis'
import {
  getCompressionPlan,
  generateT1Summary,
  buildChapterTimelineMd,
} from '../../services/compression'
import type { CompressionLevel, ChapterSummary } from '../../types'
import Modal from '../ui/Modal'

type Stage =
  | { id: 'reading'; label: '读取草稿内容' }
  | { id: 'splitting'; label: '分割章节' }
  | { id: 'writing'; label: '写入 chapters/' }
  | { id: 'clearing'; label: '清空草稿' }
  | { id: 'analyzing'; label: 'LLM 分析事件线程' }
  | { id: 'updating'; label: '更新状态卡与线程' }
  | { id: 'compression'; label: '检查里程碑压缩' }
  | { id: 'git'; label: 'Git 提交' }
  | { id: 'done'; label: '🎉 归档完成' }

const STAGES: Stage[] = [
  { id: 'reading', label: '读取草稿内容' },
  { id: 'splitting', label: '分割章节' },
  { id: 'writing', label: '写入 chapters/' },
  { id: 'clearing', label: '清空草稿' },
  { id: 'analyzing', label: 'LLM 分析事件线程' },
  { id: 'updating', label: '更新状态卡与线程' },
  { id: 'compression', label: '检查里程碑压缩' },
  { id: 'git', label: 'Git 提交' },
  { id: 'done', label: '🎉 归档完成' },
]

interface ArchiveModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

export default function ArchiveModal({ open, onClose, onSuccess }: ArchiveModalProps) {
  const filesByBook = useEditorStore((s) => s.filesByBook)
  const currentBookId = useEditorStore((s) => s.currentBookId)
  const setFiles = useEditorStore((s) => s.setFiles)
  const currentFilePath = useEditorStore((s) => s.currentFilePath)
  const { addChapter, books } = useBookStore()
  const { addEvent, setThreads, threads } = useMemoryStore()
  const { settings } = useSettingsStore()
  const { currentChapterNum } = useWorkflowStore()

  const [currentStage, setCurrentStage] = useState(0)
  const [status, setStatus] = useState<'running' | 'success' | 'cancelled'>('running')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const files = currentBookId ? (filesByBook[currentBookId] || []) : []
  const draftFile = files.find((f) => f.type === 'chapter_draft')
  const book = books.find((b) => b.id === currentBookId)
  // 章节编号：优先使用工作流中的当前章节号，fallback 到 book.chapterCount+1
  const nextChapterIndex = currentChapterNum || (book?.chapterCount || 0) + 1

  // 权威内容源：localStorage（工具执行器直接写入），Zustand store 作为 fallback
  const draftContent = (() => {
    if (currentBookId) {
      const cached = localStorage.getItem(`nc:${currentBookId}:drafts/chapter_draft.md`)
      if (cached && cached.trim()) return cached
    }
    return draftFile?.content || ''
  })()

  // Reset on open
  useEffect(() => {
    if (open) {
      setCurrentStage(0)
      setStatus('running')
      setProgress('')
      setError('')
      runArchive()
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [open])

  async function runArchive() {
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

    try {
      // Stage 1: Reading
      setProgress('正在读取草稿内容…')
      await delay(600)
      advance()

      if (!draftContent.trim()) {
        throw new Error('草稿为空，无法归档')
      }

      // Stage 2: Splitting
      setProgress(`按章节分割内容…`)
      await delay(500)
      const chapterTitle = `第${nextChapterIndex}章`
      // Simple split by chapter markers or use whole content
      const content = draftContent
      advance()

      // Stage 3: Writing to chapters/
      setProgress(`正在写入 ${chapterTitle}…`)
      await delay(700)
      const now = new Date().toISOString()
      const newChapterFile = {
        name: chapterTitle,
        path: `chapters/${String(nextChapterIndex).padStart(3, '0')}.md`,
        type: 'chapter' as const,
        content: content,
        updatedAt: now,
      }
      const filesWithNewChapter = [...files, newChapterFile]
      setFiles(filesWithNewChapter)
      // Persist chapter content to localStorage so generateDefaultFiles can find it
      if (currentBookId) {
        try {
          localStorage.setItem(
            `nc:${currentBookId}:${newChapterFile.path}`,
            newChapterFile.content
          )
        } catch { /* ignore storage error */ }
      }
      advance()

      // Stage 4: Clearing draft
      setProgress('清空草稿文件…')
      await delay(400)
      const updatedFiles = filesWithNewChapter.map((f) =>
        f.type === 'chapter_draft'
          ? {
              ...f,
              content: '',
              updatedAt: new Date().toISOString(),
            }
          : f
      )
      setFiles(updatedFiles)
      // Also clear localStorage draft to prevent stale content on page reload
      if (currentBookId) {
        try { localStorage.removeItem(`nc:${currentBookId}:drafts/chapter_draft.md`) } catch {}
      }
      advance()

      // Stage 5: LLM analyzing events
      setProgress('调用 LLM 分析新章节事件和线程…')
      const existingThreadsForBook = (threads[currentBookId!] || []).map((t) => ({
        name: t.name,
        status: t.status,
      }))

      let analysisResult
      if (settings.apiKey) {
        try {
          analysisResult = await analyzeChapterEvents({
            chapterIndex: nextChapterIndex,
            chapterTitle,
            chapterContent: content.slice(0, 6000),
            existingThreads: existingThreadsForBook,
          })
        } catch {
          // Fallback: minimal result
          analysisResult = {
            chapter: nextChapterIndex,
            new_events: [],
            new_characters: [],
            resolved_events: [],
            referenced_threads: ['主线'],
            key_locations: [],
          }
        }
      } else {
        // No API key — use fallback
        analysisResult = {
          chapter: nextChapterIndex,
          new_events: [
            {
              id: `evt-${String(nextChapterIndex).padStart(3, '0')}-01`,
              chapter: nextChapterIndex,
              type: 'action',
              description: `${chapterTitle} 继续推进故事`,
              participants: [],
              threads: ['主线'],
              status: 'advancing' as const,
              new_characters: [],
              key_locations: [],
            },
          ],
          new_characters: [],
          resolved_events: [],
          referenced_threads: ['主线'],
          key_locations: [],
        }
      }

      // Store events in memoryStore
      for (const evt of analysisResult.new_events) {
        addEvent(currentBookId!, evt)
      }
      advance()

      // Stage 6: Update status card & active elements
      setProgress('更新 status_card.md 和 active_elements.md…')

      // Build updated thread list
      const existingThreadMap = new Map(
        (threads[currentBookId!] || []).map((t) => [t.name, { ...t }]),
      )

      // Merge new events' threads into thread list
      for (const evt of analysisResult.new_events) {
        for (const threadName of evt.threads) {
          if (existingThreadMap.has(threadName)) {
            const t = existingThreadMap.get(threadName)!
            t.status = evt.status === 'resolved' ? 'resolved' : 'advancing'
            t.lastMentionedChapter = nextChapterIndex
            if (!t.relatedChapters.includes(nextChapterIndex)) {
              t.relatedChapters.push(nextChapterIndex)
            }
          } else {
            existingThreadMap.set(threadName, {
              name: threadName,
              status: 'advancing' as const,
              lastMentionedChapter: nextChapterIndex,
              relatedChapters: [nextChapterIndex],
            })
          }
        }
      }

      const updatedThreads = Array.from(existingThreadMap.values())
      setThreads(currentBookId!, updatedThreads)

      // Generate active_elements.md
      const activeElementsContent = buildActiveElementsMd(updatedThreads)
      const activeElementsFile = updatedFiles.find((f) => f.path === 'summary/active_elements.md')

      let filesAfterThreads = updatedFiles
      if (activeElementsFile) {
        filesAfterThreads = updatedFiles.map((f) =>
          f.path === 'summary/active_elements.md'
            ? { ...f, content: activeElementsContent, updatedAt: now }
            : f
        )
      } else {
        // Create active_elements.md if it doesn't exist
        filesAfterThreads = [
          ...updatedFiles,
          {
            name: 'active_elements',
            path: 'summary/active_elements.md',
            type: 'other' as const,
            content: activeElementsContent,
            updatedAt: now,
          },
        ]
      }

      // Update status_card.md
      const statusCard = filesAfterThreads.find((f) => f.type === 'status_card')
      if (statusCard) {
        const threadSummary = analysisResult.referenced_threads.join('、') || '主线'
        const updatedStatus = {
          ...statusCard,
          content: `# 当前状态卡（第 ${nextChapterIndex} 章）\n\n已归档章节：${nextChapterIndex} 章\n最后归档时间：${new Date().toLocaleString('zh-CN')}\n活跃线程：${threadSummary}\n当前草稿：无\n${analysisResult.new_characters.length > 0 ? `\n新出场人物：${analysisResult.new_characters.join('、')}` : ''}`,
          updatedAt: now,
        }
        filesAfterThreads = filesAfterThreads.map((f) =>
          f.type === 'status_card' ? updatedStatus : f
        )
      }

      setFiles(filesAfterThreads)
      advance()

      // Stage 7: Milestone compression check
      const newChapterCount = nextChapterIndex
      const existingSummaries: ChapterSummary[] = []
      const plan = getCompressionPlan(newChapterCount, existingSummaries)

      if (plan.length > 0) {
        setProgress(`检测到里程碑！${plan.map((p) => `${p.startChapter}-${p.endChapter} 章做 ${p.level}`).join('、')}`)

        const chapterFiles = filesAfterThreads.filter((f) => f.type === 'chapter')
        let compressedFiles = [...filesAfterThreads]
        const timelineSummaries: ChapterSummary[] = []

        // 并行生成 T1 摘要，限制并发数为 3，避免阻塞和过多 API 调用
        const CONCURRENCY_LIMIT = 3
        for (const item of plan) {
          if (item.level === 'T1') {
            const tasks: Array<() => Promise<void>> = []
            for (let idx = item.startChapter; idx <= Math.min(item.endChapter, chapterFiles.length); idx++) {
              const cf = chapterFiles[idx - 1]
              if (cf && cf.content) {
                // 指纹缓存：内容未变时跳过 LLM 调用
                const fingerprint = simpleHash(cf.content)
                const cachedFingerprint = currentBookId
                  ? localStorage.getItem(`nc:${currentBookId}:fingerprint:ch${idx}`)
                  : null

                if (cachedFingerprint === fingerprint) {
                  // 内容未变，从已有 timeline 中提取摘要
                  const existingSummaryText = extractExistingSummary(
                    compressedFiles.find((f) => f.path === 'summary/chapter_timeline.md')?.content,
                    idx
                  )
                  if (existingSummaryText) {
                    timelineSummaries.push({
                      chapterIndex: idx,
                      level: 'T1',
                      summary: existingSummaryText,
                    })
                  }
                  continue
                }

                tasks.push(async () => {
                  const summary = await generateT1Summary(idx, cf.name, cf.content)
                  timelineSummaries.push({
                    chapterIndex: idx,
                    level: 'T1',
                    summary,
                  })
                  // 写入指纹缓存
                  if (currentBookId) {
                    try {
                      localStorage.setItem(`nc:${currentBookId}:fingerprint:ch${idx}`, fingerprint)
                    } catch { /* ignore */ }
                  }
                })
              }
            }
            // 分批并行执行
            for (let i = 0; i < tasks.length; i += CONCURRENCY_LIMIT) {
              const batch = tasks.slice(i, i + CONCURRENCY_LIMIT)
              await Promise.all(batch.map((t) => t()))
            }
          }
        }

        // Update chapter_timeline.md
        if (timelineSummaries.length > 0) {
          const timelineContent = buildChapterTimelineMd(timelineSummaries)
          const existingTimeline = compressedFiles.find((f) => f.path === 'summary/chapter_timeline.md')
          if (existingTimeline) {
            compressedFiles = compressedFiles.map((f) =>
              f.path === 'summary/chapter_timeline.md'
                ? { ...f, content: timelineContent, updatedAt: now }
                : f
            )
          } else {
            compressedFiles.push({
              name: 'chapter_timeline',
              path: 'summary/chapter_timeline.md',
              type: 'other' as const,
              content: timelineContent,
              updatedAt: now,
            })
          }
          setFiles(compressedFiles)
        }
      } else {
        setProgress('无需里程碑压缩')
        await delay(300)
      }
      advance()

      // Stage 8: Git commit (simulated)
      setProgress(`git add + git commit -m "归档：第${nextChapterIndex}章"`)
      await delay(600)
      advance()

      // Update book chapter count
      if (book) {
        addChapter(currentBookId!, {
          index: nextChapterIndex,
          title: chapterTitle,
          fileName: `chapters/${String(nextChapterIndex).padStart(3, '0')}.md`,
          wordCount: content.length,
          createdAt: now,
          updatedAt: now,
        })
        // Increment chapterCount
        if (currentBookId) {
          useBookStore.setState((s) => ({
            books: s.books.map((b) =>
              b.id === currentBookId ? { ...b, chapterCount: nextChapterIndex } : b
            ),
          }))
        }
      }

      // Done!
      setProgress('')
      setStatus('success')
      onSuccess?.()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '归档过程出错'
      setError(msg)
      setStatus('cancelled')
    }
  }

  function advance() {
    setCurrentStage((prev) => Math.min(prev + 1, STAGES.length - 1))
  }

  function handleClose() {
    if (timerRef.current) clearInterval(timerRef.current)
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="✅ 确认归档" width={480}>
      <div style={{ padding: '8px 0' }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
          将当前草稿归档为第 <strong>{nextChapterIndex}</strong> 章正式章节。归档后草稿会被清空，系统将自动执行以下步骤：
        </p>

        {/* Progress Steps */}
        <div className="archive-steps">
          {STAGES.map((stage, i) => {
            const isActive = i === currentStage && status === 'running'
            const isCompleted = i < currentStage
            const isPending = i > currentStage

            return (
              <div
                key={stage.id}
                className={`archive-step${isActive ? ' active' : ''}${isCompleted ? ' completed' : ''}${isPending ? ' pending' : ''}`}
              >
                <div className="archive-step-indicator">
                  {isCompleted ? '✓' : isActive ? '●' : '○'}
                </div>
                <div className="archive-step-label">
                  {stage.label}
                  {isActive && progress && (
                    <div className="archive-step-progress">{progress}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Error */}
        {error && (
          <div
            style={{
              marginTop: 12,
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(220,53,69,0.08)',
              color: 'var(--danger)',
              fontSize: 12,
            }}
          >
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="form-actions" style={{ marginTop: 16 }}>
        {status === 'running' && (
          <button className="btn btn-secondary" onClick={handleClose}>
            取消
          </button>
        )}
        {status === 'success' && (
          <button className="btn btn-primary" onClick={handleClose}>
            完成
          </button>
        )}
        {status === 'cancelled' && (
          <>
            <button className="btn btn-primary" onClick={handleClose}>
              关闭
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setCurrentStage(0)
                setStatus('running')
                setError('')
                runArchive()
              }}
              style={{ marginLeft: 8 }}
            >
              重试
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}

/**
 * Simple string hash for content fingerprinting (browser-compatible)
 */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return 'h' + Math.abs(hash).toString(36)
}

/**
 * Extract existing summary for a chapter index from timeline markdown content
 */
function extractExistingSummary(timelineContent: string | undefined, chapterIndex: number): string | null {
  if (!timelineContent) return null
  const lines = timelineContent.split('\n')
  let inTarget = false
  const result: string[] = []
  for (const line of lines) {
    if (line.startsWith('###') && line.includes(`第 ${chapterIndex} 章`) || line.includes(`#${chapterIndex}`)) {
      inTarget = true
      continue
    }
    if (inTarget) {
      if (line.startsWith('###') || line.startsWith('---')) break
      result.push(line)
    }
  }
  return result.length > 0 ? result.join('\n').trim() : null
}
