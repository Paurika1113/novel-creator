import type { GitCommit } from '../../types'
import { formatShortDateTime } from '../../lib/date'

export default function CommitTimeline({
  commits,
  selectedHash,
  onSelect,
  onRevert,
}: {
  commits: GitCommit[]
  selectedHash: string | null
  onSelect: (hash: string) => void
  onRevert?: (hash: string, message: string) => void
}) {
  function formatDate(iso: string) {
    return formatShortDateTime(iso)
  }

  if (commits.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
        <div style={{ fontSize: 13 }}>暂无提交记录</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 20px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: 12 }}>
        提交历史
      </div>
      <div style={{ position: 'relative', paddingLeft: 20 }}>
        {/* Timeline line */}
        <div
          style={{
            position: 'absolute',
            left: 7,
            top: 4,
            bottom: 4,
            width: 2,
            background: 'var(--border)',
            borderRadius: 1,
          }}
        />

        {commits.map((commit, idx) => (
          <div
            key={commit.hash}
            onClick={() => onSelect(commit.hash)}
            className="git-commit-item"
            data-selected={commit.hash === selectedHash}
            style={{ paddingLeft: 16 }}
          >
            {/* Timeline dot */}
            <div
              style={{
                position: 'absolute',
                left: 1,
                top: 8,
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: commit.hash === selectedHash ? 'var(--primary)' : 'var(--bg-card)',
                border: `2px solid ${commit.hash === selectedHash ? 'var(--primary)' : 'var(--border)'}`,
                zIndex: 1,
              }}
            />

            <div className="git-commit-content">
              <div className="git-commit-header">
                <span className="git-commit-message">{commit.message}</span>
                <span className="git-commit-hash">{commit.hash.slice(0, 7)}</span>
              </div>
              <div className="git-commit-meta">
                <span>{commit.author}</span>
                <span style={{ margin: '0 4px' }}>·</span>
                <span>{formatDate(commit.date)}</span>
              </div>
            </div>
            {onRevert && (
              <button
                className="git-commit-revert-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  onRevert(commit.hash, commit.message)
                }}
                title="回退到此提交"
              >
                ↩
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
