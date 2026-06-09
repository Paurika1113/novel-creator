import type { ReactNode } from 'react'

interface Props {
  title?: ReactNode
  /** 渲染在 title 右侧的上下文信息 */
  context?: ReactNode
  variant?: 'default' | 'flush'
  children: ReactNode
}

export function SettingsSection({ title, context, variant = 'default', children }: Props) {
  return (
    <section
      style={{
        marginBottom: 20,
        border: variant === 'flush' ? 'none' : '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        background: variant === 'flush' ? 'transparent' : 'var(--bg-card)',
        overflow: 'hidden',
      }}
    >
      {(title || context) && variant !== 'flush' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px 0',
          }}
        >
          {title && (
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text)',
                letterSpacing: '0.02em',
              }}
            >
              {title}
            </div>
          )}
          {context && <div>{context}</div>}
        </div>
      )}
      <div style={{ padding: variant === 'flush' ? 0 : 16 }}>{children}</div>
    </section>
  )
}

/** 节底部操作区 */
SettingsSection.Footer = function Footer({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 8,
        paddingTop: 12,
        marginTop: 12,
        borderTop: '1px solid var(--border)',
      }}
    >
      {children}
    </div>
  )
}
