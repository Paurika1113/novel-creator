import { formatRelativeTime } from '../../lib/date'

interface BranchItem {
  name: string
  isCurrent: boolean
  commitCount: number
  lastCommitDate: string
}

export default function BranchList({
  branches,
  currentBranch,
  onSwitch,
  onNewBranch,
  onContextMenu,
}: {
  branches: BranchItem[]
  currentBranch: string
  onSwitch: (name: string) => void
  onNewBranch: () => void
  onContextMenu?: (e: React.MouseEvent, branchName: string) => void
}) {
  function formatDate(iso: string) {
    return formatRelativeTime(iso)
  }

  return (
    <div style={{ padding: '12px 8px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          padding: '0 8px 8px',
          textTransform: 'uppercase',
          letterSpacing: '0.3px',
        }}
      >
        分支
      </div>
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {branches.map((branch) => (
          <div
            key={branch.name}
            onClick={() => onSwitch(branch.name)}
            onContextMenu={(e) => onContextMenu?.(e, branch.name)}
            className="git-branch-item"
            data-active={branch.name === currentBranch}
          >
            <span className="git-branch-icon">🔀</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="git-branch-name">{branch.name}</span>
                {branch.name === currentBranch && (
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--primary)',
                      fontWeight: 600,
                    }}
                  >
                    当前
                  </span>
                )}
              </div>
              <div className="git-branch-meta">
                {branch.commitCount} 提交 · {formatDate(branch.lastCommitDate)}
              </div>
            </div>
          </div>
        ))}
      </div>
      <button
        className="btn btn-secondary"
        style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
        onClick={onNewBranch}
      >
        ＋ 新建分支
      </button>
    </div>
  )
}
