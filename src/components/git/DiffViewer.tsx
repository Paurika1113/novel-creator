import type { GitDiff } from '../../types'

export default function DiffViewer({
  diff,
  onClose,
}: {
  diff: GitDiff | null
  onClose: () => void
}) {
  if (!diff) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: 'center',
          color: 'var(--text-muted)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
        <div style={{ fontSize: 13 }}>选择一个提交查看变更内容</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>{diff.filePath}</span>
        <div style={{ display: 'flex', gap: 10, fontSize: 11, fontWeight: 500 }}>
          <span style={{ color: 'var(--success)' }}>+{diff.additions}</span>
          <span style={{ color: 'var(--danger)' }}>-{diff.deletions}</span>
        </div>
      </div>

      {/* Diff content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        {diff.hunks.map((hunk, hunkIdx) => {
          const lines = hunk.content.split('\n')
          let oldLine = hunk.oldStart
          let newLine = hunk.newStart

          return (
            <div key={hunkIdx}>
              {/* Hunk header */}
              <div
                style={{
                  padding: '4px 16px 4px 12px',
                  background: 'var(--bg-page)',
                  color: 'var(--text-secondary)',
                  fontSize: 11,
                  fontWeight: 500,
                  borderBottom: '1px solid var(--border)',
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                }}
              >
                @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
              </div>

              {/* Lines */}
              {lines.map((line, lineIdx) => {
                const type = line.startsWith('+')
                  ? 'add'
                  : line.startsWith('-')
                  ? 'remove'
                  : 'context'

                // Compute display line numbers before incrementing
                const displayOld = type === 'add' ? '' : String(oldLine)
                const displayNew = type === 'remove' ? '' : String(newLine)

                // Increment counters
                if (type === 'add') newLine++
                else if (type === 'remove') oldLine++
                else { oldLine++; newLine++ } // context

                return (
                  <div
                    key={lineIdx}
                    className={`git-diff-line git-diff-${type}`}
                    style={{ display: 'flex' }}
                  >
                    <span
                      style={{
                        width: 40,
                        textAlign: 'right',
                        paddingRight: 8,
                        color: 'rgba(0,0,0,0.18)',
                        flexShrink: 0,
                        userSelect: 'none',
                      }}
                    >
                      {displayOld}
                    </span>
                    <span
                      style={{
                        width: 40,
                        textAlign: 'right',
                        paddingRight: 12,
                        color: 'rgba(0,0,0,0.18)',
                        flexShrink: 0,
                        userSelect: 'none',
                      }}
                    >
                      {displayNew}
                    </span>
                    <span style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {line}
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
