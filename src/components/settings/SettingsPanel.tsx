import { useSettingsStore } from '../../stores/settingsStore'
import { SettingsNav } from './SettingsNav'
import { ProvidersTab } from './tabs/ProvidersTab'
import { MeTab } from './tabs/MeTab'
import { InterfaceTab } from './tabs/InterfaceTab'
import { AboutTab } from './tabs/AboutTab'

const TAB_COMPONENTS: Record<string, React.ComponentType> = {
  providers: ProvidersTab,
  me: MeTab,
  interface: InterfaceTab,
  about: AboutTab,
}

const TAB_TITLES: Record<string, string> = {
  providers: '供应商',
  me: '作者',
  interface: '界面',
  about: '关于',
}

interface Props {
  onClose: () => void
}

export function SettingsPanel({ onClose }: Props) {
  const { activeSettingsTab } = useSettingsStore()
  const ActiveTab = TAB_COMPONENTS[activeSettingsTab] || ProvidersTab
  const activeTabTitle = TAB_TITLES[activeSettingsTab] || ''

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: 'var(--bg-card)',
        padding: 24,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', letterSpacing: '0.03em' }}>
          ⚙️ 设置
        </div>
        <div
          style={{
            marginLeft: 20,
            fontFamily: '"Songti SC", "STSong", serif',
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--text)',
            letterSpacing: '0.05em',
          }}
        >
          {activeTabTitle}
        </div>

        <button
          onClick={onClose}
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 16,
            color: 'var(--text-muted)',
            padding: '6px 10px',
            borderRadius: 4,
            lineHeight: 1,
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.background = 'var(--bg-page)';
            (e.target as HTMLElement).style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.background = 'none';
            (e.target as HTMLElement).style.color = 'var(--text-muted)';
          }}
          title="关闭设置"
        >
          ✕
        </button>
      </div>

      {/* Nav + Content */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <SettingsNav />

        <div
          style={{
            position: 'relative',
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            paddingLeft: 24,
          }}
        >
          <ActiveTab />
        </div>
      </div>
    </div>
  )
}
