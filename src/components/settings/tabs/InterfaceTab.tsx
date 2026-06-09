import { useSettingsStore } from '../../../stores/settingsStore'
import { SettingsSection } from '../SettingsSection'
import { SettingsRow } from '../SettingsRow'

const THEMES = [
  { value: 'light', label: '☀️ 亮色' },
  { value: 'dark', label: '🌙 暗色' },
  { value: 'system', label: '💻 跟随系统' },
] as const

export function InterfaceTab() {
  const { settings, updateSettings } = useSettingsStore()

  return (
    <div style={{ maxWidth: 600 }}>
      {/* 主题 */}
      <SettingsSection title="主题">
        <div style={{ display: 'flex', gap: 8 }}>
          {THEMES.map((opt) => (
            <button
              key={opt.value}
              className={`btn ${settings.theme === opt.value ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => updateSettings({ theme: opt.value })}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </SettingsSection>

      {/* 记忆压缩 */}
      <SettingsSection title="记忆压缩">
        <SettingsRow
          label="压缩敏感度"
          hint={`${settings.compressionSensitivity}% · 调高延后压缩，调低提前压缩`}
          control={
            <div style={{ padding: '4px 0' }}>
              <input
                type="range" min={20} max={80} step={5}
                value={settings.compressionSensitivity}
                onChange={(e) => updateSettings({ compressionSensitivity: Number(e.target.value) })}
                style={{
                  width: '100%',
                  accentColor: 'var(--primary)',
                  height: 6,
                  cursor: 'pointer',
                }}
              />
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: 11, color: 'var(--text-muted)', marginTop: 2,
              }}>
                <span>提前压缩 (20%)</span>
                <span>延后压缩 (80%)</span>
              </div>
            </div>
          }
        />
      </SettingsSection>
    </div>
  )
}
