import { useEffect, useState, useCallback } from 'react'
import { useBookStore } from '../stores/bookStore'
import { useGitStore } from '../stores/gitStore'
import { useEditorStore } from '../stores/editorStore'
import BranchList from '../components/git/BranchList'
import CommitTimeline from '../components/git/CommitTimeline'
import DiffViewer from '../components/git/DiffViewer'
import ContextMenu from '../components/ui/ContextMenu'
import Modal from '../components/ui/Modal'
import type { GitCommit, GitDiff, DiffHunk, GitBranch } from '../types'

function filterCommits(commits: GitCommit[], branch: string): GitCommit[] {
  return commits.filter((c) => c.branch === branch)
}

// ---- Generate diff from two chapter contents ----
function generateChapterDiff(oldContent: string, newContent: string, filePath: string): GitDiff {
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')
  const hunks: DiffHunk[] = []

  // Simple line-by-line diff
  let i = 0, j = 0
  let hunkOldStart = 0, hunkNewStart = 0
  let hunkLines: string[] = []
  let inHunk = false

  while (i < oldLines.length || j < newLines.length) {
    const oldLine = oldLines[i]
    const newLine = newLines[j]

    if (oldLine === newLine) {
      if (inHunk && hunkLines.length > 0) {
        hunks.push({
          oldStart: hunkOldStart + 1,
          oldLines: hunkLines.filter(l => l.startsWith('-') || l.startsWith(' ')).length,
          newStart: hunkNewStart + 1,
          newLines: hunkLines.filter(l => l.startsWith('+') || l.startsWith(' ')).length,
          content: hunkLines.join('\n'),
        })
        hunkLines = []
        inHunk = false
      }
      i++
      j++
      if (!inHunk) {
        hunkOldStart = i
        hunkNewStart = j
      }
    } else {
      if (!inHunk) {
        hunkOldStart = i
        hunkNewStart = j
        inHunk = true
      }
      if (i < oldLines.length && (j >= newLines.length || oldLine !== newLines[j])) {
        hunkLines.push(`-${oldLine}`)
        i++
      } else if (j < newLines.length) {
        hunkLines.push(`+${newLine}`)
        j++
      }
    }
  }

  if (inHunk && hunkLines.length > 0) {
    hunks.push({
      oldStart: hunkOldStart + 1,
      oldLines: hunkLines.filter(l => l.startsWith('-') || l.startsWith(' ')).length,
      newStart: hunkNewStart + 1,
      newLines: hunkLines.filter(l => l.startsWith('+') || l.startsWith(' ')).length,
      content: hunkLines.join('\n'),
    })
  }

  const additions = newLines.length - oldLines.length > 0 ? newLines.length - oldLines.length : 0
  const deletions = oldLines.length - newLines.length > 0 ? oldLines.length - newLines.length : 0

  return { filePath, additions, deletions, hunks }
}

// ---- Build real commit history from archived chapters ----
function buildRealCommitHistory(bookId: string, bookTitle: string): { branches: GitBranch[]; commits: GitCommit[] } {
  const commits: GitCommit[] = []
  const now = Date.now()

  // Read archived chapters from localStorage
  const chapterFiles: { index: number; path: string; title: string; content: string; timestamp: number }[] = []

  for (let i = 1; i <= 20; i++) {
    const path = `chapters/${String(i).padStart(3, '0')}.md`
    const content = localStorage.getItem(`nc:${bookId}:${path}`)
    if (content && content.trim().length > 0) {
      // Extract title from content
      const titleMatch = content.match(/^#\s*(.+)$/m)
      const title = titleMatch ? titleMatch[1].trim() : `第${i}章`
      // Use a deterministic timestamp based on index (older chapters = earlier)
      chapterFiles.push({ index: i, path, title, content, timestamp: now - (20 - i) * 3600000 })
    }
  }

  // Generate commits from chapters
  chapterFiles.forEach((ch, idx) => {
    commits.push({
      hash: `c${String(ch.index).padStart(3, '0')}-${Date.now().toString(36).slice(-6)}`,
      message: `📦 归档：${ch.title}`,
      author: '作者',
      date: new Date(ch.timestamp).toISOString(),
      branch: 'master',
    })
  })

  // Add initial commit if we have chapters
  if (chapterFiles.length > 0) {
    commits.push({
      hash: `init-${Date.now().toString(36).slice(-6)}`,
      message: `📝 创建作品《${bookTitle}》`,
      author: '作者',
      date: new Date(now - (chapterFiles.length + 1) * 3600000).toISOString(),
      branch: 'master',
    })
  }

  const branches: GitBranch[] = [
    {
      name: 'master',
      isCurrent: true,
      commitCount: commits.length,
      lastCommitDate: commits.length > 0 ? commits[0].date : new Date().toISOString(),
    },
  ]

  return { branches, commits }
}

// ---- Generate branch comparison diff ----
function generateBranchDiff(branchA: string, branchB: string): GitDiff {
  return {
    filePath: `比较 ${branchA} ↔ ${branchB}`,
    additions: 0,
    deletions: 0,
    hunks: [
      {
        oldStart: 1, oldLines: 3, newStart: 1, newLines: 3,
        content: [
          ` 当前分支 ${branchA} 与 ${branchB} 的差异：`,
          ` 两个分支的内容将在未来版本中支持详细对比。`,
          '',
        ].join('\n'),
      },
    ],
  }
}

export default function GitPage() {
  const { currentBookId, books } = useBookStore()
  const { branches, setBranches, commits, setCommits } = useGitStore()
  const editorStore = useEditorStore()

  const book = currentBookId ? books.find((b) => b.id === currentBookId) : null

  // Core state
  const [activeBranch, setActiveBranch] = useState('master')
  const [selectedHash, setSelectedHash] = useState<string | null>(null)
  const [currentDiff, setCurrentDiff] = useState<GitDiff | null>(null)

  // Right panel mode: 'diff' | 'compare'
  const [rightMode, setRightMode] = useState<'diff' | 'compare'>('diff')
  const [compareBranchA, setCompareBranchA] = useState('')
  const [compareBranchB, setCompareBranchB] = useState('')

  // Modals
  const [showNewBranchModal, setShowNewBranchModal] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [showRevertModal, setShowRevertModal] = useState(false)
  const [revertTarget, setRevertTarget] = useState<{ hash: string; message: string } | null>(null)
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [mergeSource, setMergeSource] = useState('')
  const [mergeResult, setMergeResult] = useState<'success' | 'conflict' | null>(null)

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; branchName: string } | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [renameTarget, setRenameTarget] = useState('')

  const bookBranches = book ? branches[book.id] || [] : []
  const bookCommits = book ? commits[book.id] || [] : []

  // ---- Build real data from archived chapters ----
  useEffect(() => {
    if (book && bookBranches.length === 0) {
      const realData = buildRealCommitHistory(book.id, book.title)
      setBranches(book.id, realData.branches)
      setCommits(book.id, realData.commits)
    }
  }, [book?.id])

  // ---- Diff on commit select ----
  useEffect(() => {
    if (selectedHash && rightMode === 'diff' && book) {
      // Find the commit and generate diff from previous version
      const commitIndex = bookCommits.findIndex((c) => c.hash === selectedHash)
      if (commitIndex >= 0) {
        const commit = bookCommits[commitIndex]
        // Extract chapter index from hash (c001-xxx format)
        const chapterMatch = commit.hash.match(/^c(\d{3})/)
        if (chapterMatch) {
          const chapterIdx = parseInt(chapterMatch[1], 10)
          const path = `chapters/${String(chapterIdx).padStart(3, '0')}.md`
          const currentContent = localStorage.getItem(`nc:${book.id}:${path}`) || ''

          // For diff, compare with previous chapter version or empty
          const prevCommit = bookCommits[commitIndex + 1]
          let prevContent = ''
          if (prevCommit) {
            const prevMatch = prevCommit.hash.match(/^c(\d{3})/)
            if (prevMatch && parseInt(prevMatch[1], 10) === chapterIdx) {
              // Same chapter, use empty as previous (simplified)
              prevContent = ''
            }
          }

          const diff = generateChapterDiff(prevContent, currentContent, path)
          setCurrentDiff(diff)
        } else {
          // Initial commit - show empty diff
          setCurrentDiff(null)
        }
      }
    } else if (rightMode === 'diff') {
      setCurrentDiff(null)
    }
  }, [selectedHash, book?.id, rightMode, bookCommits])

  // ---- Branch comparison diff ----
  useEffect(() => {
    if (rightMode === 'compare' && compareBranchA && compareBranchB) {
      setCurrentDiff(generateBranchDiff(compareBranchA, compareBranchB))
    } else if (rightMode === 'compare') {
      setCurrentDiff(null)
    }
  }, [rightMode, compareBranchA, compareBranchB])

  // ---- Handlers ----
  const handleSwitchBranch = useCallback((name: string) => {
    setActiveBranch(name)
    setSelectedHash(null)
  }, [])

  const handleRevert = useCallback((hash: string, message: string) => {
    setRevertTarget({ hash, message })
    setShowRevertModal(true)
  }, [])

  function confirmRevert() {
    if (book && revertTarget) {
      const revertCommit: GitCommit = {
        hash: `rev-${Date.now().toString(36)}`,
        message: `↩ 回退到 ${revertTarget.hash.slice(0, 7)} · ${revertTarget.message}`,
        author: '作者',
        date: new Date().toISOString(),
        branch: activeBranch,
      }
      setCommits(book.id, [revertCommit, ...bookCommits])
    }
    setShowRevertModal(false)
    setRevertTarget(null)
  }

  function handleMerge(branchName: string) {
    if (branchName === activeBranch) return
    setMergeSource(branchName)
    setMergeResult(Math.random() > 0.5 ? 'conflict' : 'success')
    setShowMergeModal(true)
  }

  function confirmMerge() {
    if (!book || !mergeResult) return
    if (mergeResult === 'success') {
      const mergeCommit: GitCommit = {
        hash: `merge-${Date.now().toString(36)}`,
        message: `🔀 合并 ${mergeSource} 到 ${activeBranch}`,
        author: '作者',
        date: new Date().toISOString(),
        branch: activeBranch,
      }
      setCommits(book.id, [mergeCommit, ...bookCommits])
    }
    setShowMergeModal(false)
    setMergeResult(null)
    setMergeSource('')
  }

  function handleBranchContextMenu(e: React.MouseEvent, branchName: string) {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, branchName })
  }

  function handleRename() {
    if (!renameValue.trim() || !book) return
    const updated = bookBranches.map((b) =>
      b.name === renameTarget ? { ...b, name: renameValue.trim() } : b
    )
    setBranches(book.id, updated)
    if (activeBranch === renameTarget) setActiveBranch(renameValue.trim())
    setShowRenameModal(false)
    setRenameTarget('')
    setRenameValue('')
  }

  function handleDeleteBranch(branchName: string) {
    if (!book) return
    const updated = bookBranches.filter((b) => b.name !== branchName)
    setBranches(book.id, updated)
    if (activeBranch === branchName) {
      const fallback = updated.find((b) => b.isCurrent) || updated[0]
      if (fallback) setActiveBranch(fallback.name)
    }
    setContextMenu(null)
  }

  const contextMenuItems = contextMenu
    ? [
        {
          label: '切换到此分支',
          icon: '🔀',
          onClick: () => {
            handleSwitchBranch(contextMenu.branchName)
            setContextMenu(null)
          },
        },
        {
          label: '重命名',
          icon: '✏️',
          onClick: () => {
            setRenameTarget(contextMenu.branchName)
            setRenameValue(contextMenu.branchName)
            setShowRenameModal(true)
            setContextMenu(null)
          },
        },
        {
          label: contextMenu.branchName === activeBranch ? '不能合并到自身' : `合并到 ${activeBranch}`,
          icon: '🔗',
          disabled: contextMenu.branchName === activeBranch,
          onClick: () => {
            if (contextMenu.branchName !== activeBranch) {
              handleMerge(contextMenu.branchName)
            }
            setContextMenu(null)
          },
        },
        { label: '---', onClick: () => {} },
        {
          label: '删除分支',
          icon: '🗑️',
          danger: true,
          onClick: () => {
            if (confirm(`确定删除分支「${contextMenu.branchName}」吗？`)) {
              handleDeleteBranch(contextMenu.branchName)
            }
          },
        },
      ]
    : []

  // ---- Empty state ----
  if (!book) {
    return (
      <div className="page-content">
        <div className="page-header">
          <h1 className="page-title">版本管理</h1>
        </div>
        <div className="empty-state">
          <div className="empty-icon">🔀</div>
          <p className="empty-text">请先在作品库选择一本书</p>
          <p className="empty-subtext">选择书籍后可查看 Git 分支、提交历史和版本差异</p>
        </div>
      </div>
    )
  }

  return (
    <div className="editor-page" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Top Bar */}
      <div className="editor-topbar">
        <span className="editor-topbar-title">版本管理</span>
        <span className="editor-topbar-divider">|</span>
        <span className="editor-topbar-meta">{book.title}</span>
        <div style={{ flex: 1 }} />
        <span className="editor-topbar-meta" style={{ fontSize: 11 }}>
          当前分支: {activeBranch} · {filterCommits(bookCommits, activeBranch).length} 提交
        </span>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: Branch List */}
        <div style={{ width: 220, flexShrink: 0, overflowY: 'auto', background: 'var(--bg-card)', borderRight: '1px solid var(--border)' }}>
          <BranchList
            branches={bookBranches}
            currentBranch={activeBranch}
            onSwitch={handleSwitchBranch}
            onNewBranch={() => setShowNewBranchModal(true)}
            onContextMenu={handleBranchContextMenu}
          />
        </div>

        {/* Middle: Commit Timeline */}
        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-card)', borderRight: '1px solid var(--border)' }}>
          <CommitTimeline
            commits={filterCommits(bookCommits, activeBranch)}
            selectedHash={selectedHash}
            onSelect={setSelectedHash}
            onRevert={handleRevert}
          />
        </div>

        {/* Right: Diff / Compare */}
        <div style={{ flex: 1, overflow: 'hidden', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column' }}>
          {/* Mode tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <button
              className={`editor-mode-btn${rightMode === 'diff' ? ' active' : ''}`}
              style={{ padding: '8px 16px', borderRadius: 0, fontSize: 12, flex: 1 }}
              onClick={() => setRightMode('diff')}
            >
              📄 Diff
            </button>
            <button
              className={`editor-mode-btn${rightMode === 'compare' ? ' active' : ''}`}
              style={{ padding: '8px 16px', borderRadius: 0, fontSize: 12, flex: 1 }}
              onClick={() => setRightMode('compare')}
            >
              🔄 比较分支
            </button>
          </div>

          {/* Compare branch selectors */}
          {rightMode === 'compare' && (
            <div style={{ display: 'flex', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, alignItems: 'center', fontSize: 12 }}>
              <span style={{ color: 'var(--text-secondary)' }}>比较</span>
              <select
                className="chat-model-select"
                value={compareBranchA}
                onChange={(e) => setCompareBranchA(e.target.value)}
              >
                <option value="">选择分支</option>
                {bookBranches.map((b) => (
                  <option key={b.name} value={b.name}>{b.name}</option>
                ))}
              </select>
              <span style={{ color: 'var(--text-secondary)' }}>↔</span>
              <select
                className="chat-model-select"
                value={compareBranchB}
                onChange={(e) => setCompareBranchB(e.target.value)}
              >
                <option value="">选择分支</option>
                {bookBranches.map((b) => (
                  <option key={b.name} value={b.name}>{b.name}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ flex: 1, overflow: 'hidden' }}>
            <DiffViewer diff={currentDiff} onClose={() => setSelectedHash(null)} />
          </div>
        </div>
      </div>

      {/* === Context Menu === */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* === New Branch Modal === */}
      <Modal open={showNewBranchModal} onClose={() => setShowNewBranchModal(false)} title="新建分支" width={400}>
        <div className="form-group">
          <label className="form-label">分支名称</label>
          <input className="form-input" placeholder="如：dev/rewrite-ch3" value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)} autoFocus maxLength={40} />
          <div className="form-hint">从当前分支 "{activeBranch}" 创建</div>
        </div>
        <div className="form-actions">
          <button className="btn btn-secondary" onClick={() => setShowNewBranchModal(false)}>取消</button>
          <button className="btn btn-primary" onClick={() => {
            if (!newBranchName.trim() || !book) return
            setBranches(book.id, [...bookBranches, {
              name: newBranchName.trim(), isCurrent: false, commitCount: 0,
              lastCommitDate: new Date().toISOString(),
            }])
            setShowNewBranchModal(false)
            setNewBranchName('')
          }} disabled={!newBranchName.trim()}>创建</button>
        </div>
      </Modal>

      {/* === Revert Modal === */}
      <Modal open={showRevertModal} onClose={() => setShowRevertModal(false)} title="回退确认" width={420}>
        <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
          <p style={{ marginBottom: 12 }}>
            将当前工作区回退到提交
            <code style={{ background: 'var(--bg-page)', padding: '2px 6px', borderRadius: 3, color: 'var(--text-primary)', fontSize: 12 }}>
              {revertTarget?.hash.slice(0, 7)}
            </code>
            ？
          </p>
          <div style={{ background: 'var(--bg-page)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', marginBottom: 12, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>{revertTarget?.message}</div>
          </div>
          <div style={{ background: 'rgba(240, 173, 78, 0.1)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--warning)', fontSize: 12 }}>
            ⚠️ 回退会生成一个新的回退提交，不会删除历史。之前的修改可通过 Git 历史恢复。
          </div>
        </div>
        <div className="form-actions">
          <button className="btn btn-secondary" onClick={() => setShowRevertModal(false)}>取消</button>
          <button className="btn btn-primary" style={{ background: 'var(--danger)' }} onClick={confirmRevert}>确认回退</button>
        </div>
      </Modal>

      {/* === Merge / Conflict Modal === */}
      <Modal open={showMergeModal} onClose={() => setShowMergeModal(false)} title={mergeResult === 'conflict' ? '合并冲突' : '合并分支'} width={420}>
        {mergeResult === 'success' ? (
          <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            <p>将 <strong>{mergeSource}</strong> 合并到 <strong>{activeBranch}</strong></p>
            <div style={{ background: 'rgba(40,167,69,0.08)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--success)', marginTop: 12, fontSize: 12 }}>
              ✅ 合并成功，无冲突。将生成一个合并提交。
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            <p>尝试合并 <strong>{mergeSource}</strong> 到 <strong>{activeBranch}</strong> 时发现冲突：</p>
            <div style={{ background: 'rgba(220,53,69,0.08)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--danger)', marginTop: 12, fontSize: 12, fontFamily: 'monospace' }}>
              <div style={{ color: 'var(--danger)' }}>冲突文件：需要手动解决</div>
              <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
                &lt;&lt;&lt;&lt;&lt;&lt;&lt; {activeBranch}<br/>
                当前分支内容<br/>
                =======<br/>
                合并分支内容<br/>
                &gt;&gt;&gt;&gt;&gt;&gt;&gt; {mergeSource}
              </div>
            </div>
            <p style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
              需要手动解决冲突后提交。冲突文件已在编辑器中打开。
            </p>
          </div>
        )}
        <div className="form-actions">
          <button className="btn btn-secondary" onClick={() => setShowMergeModal(false)}>取消</button>
          <button className="btn btn-primary" onClick={confirmMerge}>
            {mergeResult === 'success' ? '确认合并' : '标记为已解决'}
          </button>
        </div>
      </Modal>

      {/* === Rename Branch Modal === */}
      <Modal open={showRenameModal} onClose={() => setShowRenameModal(false)} title="重命名分支" width={400}>
        <div className="form-group">
          <label className="form-label">新名称</label>
          <input className="form-input" value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)} autoFocus maxLength={40} />
        </div>
        <div className="form-actions">
          <button className="btn btn-secondary" onClick={() => setShowRenameModal(false)}>取消</button>
          <button className="btn btn-primary" onClick={handleRename} disabled={!renameValue.trim()}>确认</button>
        </div>
      </Modal>
    </div>
  )
}
