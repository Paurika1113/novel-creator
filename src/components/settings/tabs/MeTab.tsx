import { useState, useEffect } from 'react'
import { useSettingsStore } from '../../../stores/settingsStore'
import { usePersonaStore } from '../../../stores/personaStore'
import { SettingsSection } from '../SettingsSection'
import { SettingsRow } from '../SettingsRow'

export function MeTab() {
  const { settings, updateSettings } = useSettingsStore()
  const { personas, createPersona } = usePersonaStore()
  const [authorName, setAuthorName] = useState('')
  const [authorBio, setAuthorBio] = useState('')

  // 从账号上下文加载作者信息（暂从 settings 或 persona 列表获取）
  useEffect(() => {
    setAuthorName(settings.authorName || '')
    setAuthorBio(settings.authorBio || '')
  }, [settings.authorName, settings.authorBio])

  const saveAuthor = () => {
    updateSettings({ authorName, authorBio })
    // 如果还没有 persona，用当前账号信息创建一个
    if (personas.length === 0 && authorName.trim()) {
      // createPersona 签名: (name: string, sourceBookIds?: string[]) => Persona
      createPersona(authorName.trim())
    }
  }

  const personaCount = personas.length

  return (
    <div style={{ maxWidth: 600 }}>
      <SettingsSection title="作者身份" variant="flush">
        {/* 头像区 */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div
            style={{
              width: 72, height: 72, borderRadius: '50%',
              background: 'var(--bg-card)',
              border: '2px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, color: 'var(--text-muted)',
              cursor: 'pointer', overflow: 'hidden',
            }}
            title="点击上传头像"
            onClick={() => alert('头像上传将在后续版本实现')}
          >
            {settings.authorAvatar ? (
              <img src={settings.authorAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            )}
          </div>
        </div>

        <SettingsRow
          label="笔名 / 别名"
          hint="你的作者名，在书页和创作台显示"
          layout="stacked"
          control={
            <input
              className="form-input"
              type="text"
              placeholder="输入你的笔名…"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              style={{ width: '100%' }}
            />
          }
        />

        <SettingsRow
          label="个人简介"
          hint="简短的自我介绍，可选"
          layout="stacked"
          control={
            <textarea
              className="form-input"
              rows={4}
              placeholder="介绍一下你自己…"
              value={authorBio}
              onChange={(e) => setAuthorBio(e.target.value)}
              style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
            />
          }
        />
      </SettingsSection>

      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
        <button
          className="btn btn-primary"
          style={{ padding: '8px 28px' }}
          onClick={saveAuthor}
        >
          保存个人信息
        </button>
      </div>

      <SettingsSection title="角色档案">
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          {personaCount > 0 ? (
            <span>已创建 <strong style={{ color: 'var(--text)' }}>{personaCount}</strong> 个角色档案</span>
          ) : (
            <span>尚未创建角色档案，可以在「作者身份」页面中管理</span>
          )}
        </div>
      </SettingsSection>
    </div>
  )
}
