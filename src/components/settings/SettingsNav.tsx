import { useSettingsStore } from '../../stores/settingsStore'

interface NavItem {
  id: string
  label: string
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'providers', label: '供应商', icon: '🔌' },
  { id: 'me', label: '作者', icon: '👤' },
  { id: 'interface', label: '界面', icon: '🎨' },
  { id: 'about', label: '关于', icon: 'ℹ️' },
]

export function SettingsNav() {
  const { activeSettingsTab, setActiveSettingsTab } = useSettingsStore()

  return (
    <nav
      style={{
        flex: '0 0 160px',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: '6px 8px',
        borderRight: '1px solid var(--border)',
        overflowX: 'hidden',
        overflowY: 'auto',
      }}
    >
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          onClick={() => setActiveSettingsTab(item.id)}
          style={{
            fontFamily: 'inherit',
            textAlign: 'left',
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 13,
            color: activeSettingsTab === item.id ? 'var(--primary)' : 'var(--text-muted)',
            background: activeSettingsTab === item.id ? 'rgba(124,92,252,0.08)' : 'transparent',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            letterSpacing: '0.02em',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontWeight: activeSettingsTab === item.id ? 600 : 400,
          }}
        >
          <span style={{ flexShrink: 0, fontSize: 15 }}>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
