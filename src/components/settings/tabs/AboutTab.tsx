import { SettingsSection } from '../SettingsSection'

export function AboutTab() {
  return (
    <div style={{ maxWidth: 600 }}>
      <SettingsSection title="关于 Novel Creator">
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 2 }}>
          <div>版本号：v0.1.0 (开发版)</div>
          <div>
            项目地址：
            <a href="#" style={{ color: 'var(--primary)', textDecoration: 'none' }}
              onClick={(e) => { e.preventDefault(); alert('GitHub 链接将在发布后添加') }}>
              GitHub
            </a>
          </div>
          <div style={{ marginTop: 8 }}>
            数据存储位置：
            <code style={{ background: 'var(--bg-page)', padding: '2px 6px', borderRadius: 3, fontSize: 11 }}>
              localStorage (浏览器模式)
            </code>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 500, marginBottom: 4 }}>技术栈</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 8px' }}>
              {['Vite', 'React 19', 'TypeScript 5', 'Zustand', 'OpenHanako UX'].map(tech => (
                <span key={tech} style={{
                  background: 'var(--bg-page)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 11,
                  color: 'var(--text-muted)',
                }}>
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </div>
      </SettingsSection>
    </div>
  )
}
