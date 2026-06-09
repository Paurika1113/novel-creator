import type { ReactNode, HTMLAttributes } from 'react'

interface Props extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode
  hint?: ReactNode
  hintVariant?: 'default' | 'warn'
  control: ReactNode
  layout?: 'inline' | 'stacked'
}

export function SettingsRow({
  label,
  hint,
  hintVariant = 'default',
  control,
  layout = 'inline',
  ...rest
}: Props) {
  return (
    <div
      {...rest}
      style={{
        display: 'flex',
        flexDirection: layout === 'stacked' ? 'column' : 'row',
        gap: layout === 'stacked' ? 6 : 12,
        padding: '8px 0',
        marginBottom: 4,
        ...(layout === 'inline'
          ? { alignItems: 'flex-start' }
          : {}),
        ...(rest.style || {}),
      }}
    >
      <div
        style={{
          flex: layout === 'inline' ? '0 0 140px' : undefined,
          paddingTop: layout === 'inline' ? 6 : 0,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--text)',
          }}
        >
          {label}
        </div>
        {hint && (
          <div
            style={{
              fontSize: 11,
              color: hintVariant === 'warn' ? 'var(--danger, #e74c3c)' : 'var(--text-muted)',
              marginTop: 2,
            }}
          >
            {hint}
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>{control}</div>
    </div>
  )
}
