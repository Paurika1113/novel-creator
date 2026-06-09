import { useState, useRef, useEffect } from 'react'
import { useSettingsStore } from '../../../stores/settingsStore'
import { SettingsSection } from '../SettingsSection'
import { SettingsRow } from '../SettingsRow'
import type { SavedModel } from '../../../types'

const PROVIDERS = [
  { value: 'claude', label: 'Claude (Anthropic)', url: 'https://api.anthropic.com', api: 'anthropic-messages' },
  { value: 'openai', label: 'OpenAI 兼容', url: 'https://api.openai.com/v1', api: 'openai-completions' },
  { value: 'deepseek', label: 'DeepSeek', url: 'https://api.deepseek.com/v1', api: 'openai-completions' },
  { value: 'custom', label: '自定义', url: '', api: 'openai-completions' },
]

const CONTEXT_PRESETS = [
  { label: '64K', value: 64000 },
  { label: '128K', value: 128000 },
  { label: '200K', value: 200000 },
  { label: '1M', value: 1048576 },
]

/** 尝试通过 API 代理转发请求，代理不可用时回退到直连 */
async function tryFetchWithProxy(url: string, method: string, headers: Record<string, string>, timeout = 15000, body?: unknown): Promise<Response> {
  const isLocalhost = typeof window !== 'undefined' &&
    window.location.hostname === 'localhost'
  if (isLocalhost) {
    try {
      const proxyRes = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, method, headers, body: body || undefined }),
        signal: AbortSignal.timeout(timeout),
      })
      // 404/405 说明代理本身不存在（没有中间件），回退到直连
      // 其他状态码（包括远端返回的 404）都算代理生效了
      if (proxyRes.status !== 404 && proxyRes.status !== 405) {
        return proxyRes
      }
    } catch {
      // proxy 不可用，回退到直连
    }
  }
  const opts: RequestInit = { method, headers }
  if (body) opts.body = JSON.stringify(body)
  return fetch(url, { ...opts, signal: AbortSignal.timeout(timeout) })
}

type TestStatus = 'idle' | 'testing' | 'success' | 'failed'

// ---- Toast ----
interface ToastMsg { text: string; type: 'success' | 'error' }
function Toast({ msg, onDone }: { msg: ToastMsg | null; onDone: () => void }) {
  useEffect(() => {
    if (!msg) return
    const timer = setTimeout(onDone, 2000)
    return () => clearTimeout(timer)
  }, [msg, onDone])
  if (!msg) return null
  return (
    <div
      style={{
        position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        zIndex: 9999, padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500,
        color: '#fff',
        background: msg.type === 'success' ? 'var(--success, #28a745)' : 'var(--danger, #dc3545)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        animation: 'hana-fade-up 0.2s ease-out',
      }}
    >
      {msg.text}
    </div>
  )
}

// ---- 单行模型条目 ----
function ModelRow({
  model,
  isActive,
  onSelect,
  onUpdate,
  onDelete,
}: {
  model: SavedModel
  isActive: boolean
  onSelect: () => void
  onUpdate: (partial: Partial<SavedModel>) => void
  onDelete: () => void
}) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px', borderRadius: 'var(--radius-sm)',
        background: isActive ? 'rgba(var(--primary-rgb, 99,102,241), 0.08)' : 'transparent',
        border: isActive ? '1px solid var(--primary)' : '1px solid var(--border)',
        cursor: 'pointer', marginBottom: 4, transition: 'all 0.15s',
      }}
      onClick={onSelect}
    >
      {/* 激活指示器 */}
      <div
        style={{
          width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
          background: isActive ? 'var(--primary)' : 'var(--border)',
          transition: 'background 0.15s',
        }}
      />

      {/* 模型名 */}
      <span style={{ flex: '0 0 auto', fontSize: 12, fontWeight: 500, minWidth: 80,
        color: isActive ? 'var(--primary)' : 'var(--text)',
      }}>
        {model.name}
      </span>

      {/* 上下文窗口 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, justifyContent: 'flex-end' }}>
        <input
          className="form-input"
          type="number" min={1} max={10000000}
          value={model.contextWindow}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10)
            if (!isNaN(v) && v > 0) onUpdate({ contextWindow: v })
          }}
          style={{ width: 80, fontSize: 11, padding: '2px 6px', textAlign: 'right' }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>tokens</span>
      </div>

      {/* 快捷预设（行内小按钮） */}
      <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', gap: 2, marginRight: 4 }}>
        {CONTEXT_PRESETS.slice(0, 3).map(p => (
          <button
            key={p.value}
            className="btn btn-secondary"
            style={{
              fontSize: 9, padding: '0px 4px', height: 18, lineHeight: '18px',
              background: model.contextWindow === p.value ? 'var(--primary)' : undefined,
              color: model.contextWindow === p.value ? '#fff' : undefined,
              border: 'none', borderRadius: 3,
            }}
            onClick={() => onUpdate({ contextWindow: p.value })}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 删除 */}
      <button
        className="btn btn-secondary"
        style={{ padding: '2px 6px', fontSize: 11, lineHeight: 1, flexShrink: 0, opacity: 0.5 }}
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        title="移除此模型"
      >
        ✕
      </button>
    </div>
  )
}

// ============================================================
export function ProvidersTab() {
  const { settings, updateSettings } = useSettingsStore()

  // ---- 凭据编辑（暂存 + 显式保存） ----
  const [apiKeyDraft, setApiKeyDraft] = useState(settings.apiKey)
  const [baseUrlDraft, setBaseUrlDraft] = useState(settings.baseUrl)
  const [keyEdited, setKeyEdited] = useState(false)
  const [urlEdited, setUrlEdited] = useState(false)

  useEffect(() => {
    if (!keyEdited) setApiKeyDraft(settings.apiKey)
  }, [settings.apiKey, keyEdited])
  useEffect(() => {
    if (!urlEdited) setBaseUrlDraft(settings.baseUrl)
  }, [settings.baseUrl, urlEdited])

  const handleProviderChange = (value: string) => {
    updateSettings({ provider: value, fetchedModels: [] })
    setKeyEdited(false)
    setUrlEdited(false)
  }

  // ---- 保存 / Toast ----
  const [toast, setToast] = useState<ToastMsg | null>(null)
  const showToast = (text: string, type: 'success' | 'error') => setToast({ text, type })
  const saveCredentials = () => {
    updateSettings({ apiKey: apiKeyDraft, baseUrl: baseUrlDraft })
    setKeyEdited(false)
    setUrlEdited(false)
    showToast('已保存', 'success')
  }

  // ---- 测试连接 ----
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [testMessage, setTestMessage] = useState('')
  const [showKey, setShowKey] = useState(false)

  // ---- 模型添加面板 ----
  const [addPanelOpen, setAddPanelOpen] = useState(false)
  const [modelSearch, setModelSearch] = useState('')
  const [customModelInput, setCustomModelInput] = useState('')
  const [fetchingModels, setFetchingModels] = useState(false)

  const panelRef = useRef<HTMLDivElement>(null)
  const addBtnRef = useRef<HTMLButtonElement>(null)
  const fetchedModels = settings.fetchedModels || []
  const savedModels = settings.savedModels || []

  // 点击外部关闭添加面板
  useEffect(() => {
    if (!addPanelOpen) return
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        addBtnRef.current && !addBtnRef.current.contains(e.target as Node)
      ) {
        setAddPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [addPanelOpen])

  // 打开面板时重置
  useEffect(() => {
    if (addPanelOpen) { setModelSearch(''); setCustomModelInput('') }
  }, [addPanelOpen])

  const authHeaders = (): Record<string, string> => {
    if (settings.provider === 'claude') {
      return { 'x-api-key': apiKeyDraft, 'anthropic-version': '2023-06-01' }
    }
    return { Authorization: `Bearer ${apiKeyDraft}`, 'Content-Type': 'application/json' }
  }

  // ---- 获取模型 ----
  const handleFetchModels = async () => {
    if (!apiKeyDraft.trim()) {
      setTestStatus('failed')
      setTestMessage('请先输入 API Key 再获取模型列表')
      return
    }
    setFetchingModels(true)
    setTestStatus('idle')
    setTestMessage('')

    try {
      const modelsUrl = settings.provider === 'claude'
        ? ((baseUrlDraft || 'https://api.anthropic.com').replace(/\/+$/, '').replace(/\/messages$/, '') + '/models')
        : ((baseUrlDraft || 'https://api.openai.com/v1').replace(/\/+$/, '').replace(/\/chat\/completions$/, '') + '/models')

      const resp = await tryFetchWithProxy(modelsUrl, 'GET', authHeaders(), 15000)

      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        if (resp.status === 404) {
          setTestStatus('failed')
          setTestMessage('该 API 服务未提供模型列表接口，可手动输入模型名称')
        } else {
          setTestStatus('failed')
          setTestMessage(`获取失败 (${resp.status})：${text.slice(0, 100)}`)
        }
        return
      }

      const data = await resp.json()
      const list: { id: string }[] = Array.isArray(data) ? data : (data.data || [])
      const modelIds = list.map((m) => m.id).filter(Boolean)

      if (modelIds.length === 0) {
        setTestStatus('failed')
        setTestMessage('获取成功，但未找到模型列表')
      } else {
        updateSettings({ fetchedModels: modelIds })
        setTestStatus('success')
        setTestMessage(`共获取 ${modelIds.length} 个模型`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '未知错误'
      const hint = msg.includes('Failed to fetch')
        ? '无法连接到 API，请检查网络、Base URL 或 Provider 类型'
        : msg
      setTestStatus('failed')
      setTestMessage(`获取失败：${hint}`)
    } finally {
      setFetchingModels(false)
    }
  }

  // ---- 保存模型列表相关操作 ----
  const addSavedModel = (name: string) => {
    if (!name.trim()) return
    // 去重
    if (savedModels.some(m => m.name === name.trim())) {
      showToast(`"${name.trim()}" 已存在`, 'error')
      return
    }
    const newModel: SavedModel = { name: name.trim(), contextWindow: settings.modelContextWindow }
    const updated = [...savedModels, newModel]
    updateSettings({ savedModels: updated })
    // 如果没有当前模型，自动激活
    if (!settings.model) {
      updateSettings({ model: newModel.name, modelContextWindow: newModel.contextWindow })
    }
    showToast(`已添加 ${newModel.name}`, 'success')
  }

  const removeSavedModel = (name: string) => {
    const updated = savedModels.filter(m => m.name !== name)
    updateSettings({ savedModels: updated })
    // 如果删除的是当前激活的模型，切换到列表第一个
    if (settings.model === name) {
      if (updated.length > 0) {
        updateSettings({ model: updated[0].name, modelContextWindow: updated[0].contextWindow })
      } else {
        updateSettings({ model: '', modelContextWindow: 200000 })
      }
    }
    showToast(`已移除 ${name}`, 'success')
  }

  const updateSavedModel = (name: string, partial: Partial<SavedModel>) => {
    const updated = savedModels.map(m =>
      m.name === name ? { ...m, ...partial } : m
    )
    updateSettings({ savedModels: updated })
    // 如果编辑的是当前激活模型，同步上下文窗口
    if (settings.model === name && partial.contextWindow) {
      updateSettings({ modelContextWindow: partial.contextWindow })
    }
  }

  const selectSavedModel = (name: string) => {
    const m = savedModels.find(sm => sm.name === name)
    if (m) {
      updateSettings({ model: m.name, modelContextWindow: m.contextWindow })
    }
  }

  // 从下拉列表中添加
  const addFromFetched = (modelId: string) => {
    addSavedModel(modelId)
    setAddPanelOpen(false)
  }

  // 自定义添加
  const addCustomModel = () => {
    if (customModelInput.trim()) {
      addSavedModel(customModelInput.trim())
      setCustomModelInput('')
      setAddPanelOpen(false)
    }
  }

  // ---- 测试连接（保存 + 测试二合一） ----
  const handleTestConnection = async () => {
    updateSettings({ apiKey: apiKeyDraft, baseUrl: baseUrlDraft })
    setKeyEdited(false)
    setUrlEdited(false)

    setTestStatus('testing')
    setTestMessage('')
    if (!apiKeyDraft.trim()) { setTestStatus('failed'); setTestMessage('请先输入 API Key'); return }
    if (!settings.model.trim()) { setTestStatus('failed'); setTestMessage('请先填写模型名称'); return }

    try {
      const provider = settings.provider
      let url: string
      let body: Record<string, unknown>
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }

      const cleanBase = (baseUrlDraft || (provider === 'claude' ? 'https://api.anthropic.com' : provider === 'deepseek' ? 'https://api.deepseek.com/v1' : 'https://api.openai.com/v1')).replace(/\/+$/, '')

      if (provider === 'claude') {
        url = cleanBase.endsWith('/messages') ? cleanBase : cleanBase + '/messages'
        headers['x-api-key'] = apiKeyDraft
        headers['anthropic-version'] = '2023-06-01'
        body = { model: settings.model, max_tokens: 10, messages: [{ role: 'user', content: 'test' }] }
      } else {
        url = cleanBase.endsWith('/chat/completions') ? cleanBase : cleanBase + '/chat/completions'
        headers['Authorization'] = `Bearer ${apiKeyDraft}`
        body = { model: settings.model, max_tokens: 10, messages: [{ role: 'user', content: 'test' }] }
      }

      const response = await tryFetchWithProxy(url, 'POST', headers, 15000, body)

      if (response.ok) {
        // 测试通过时同步获取模型列表
        try {
          const modelsUrl = provider === 'claude'
            ? url.replace(/\/messages$/, '/models')
            : url.replace(/\/chat\/completions$/, '/models')

          const modelsResp = await tryFetchWithProxy(modelsUrl, 'GET', authHeaders(), 8000)

          if (modelsResp.ok) {
            const modelsData = await modelsResp.json()
            const list: { id: string }[] = Array.isArray(modelsData) ? modelsData : (modelsData.data || [])
            const ids = list.map((m) => m.id).filter(Boolean)
            if (ids.length > 0) updateSettings({ fetchedModels: ids })
          }
        } catch { /* 不影响测试结果 */ }

        setTestStatus('success')
        setTestMessage(`连接成功 · 模型：${settings.model}`)
        showToast('连接成功，配置已保存', 'success')
      } else {
        const text = await response.text().catch(() => '')
        setTestStatus('failed')
        setTestMessage(`连接失败 (${response.status})：${text.slice(0, 120)}`)
      }
    } catch (err: unknown) {
      setTestStatus('failed')
      const msg = err instanceof Error ? err.message : '未知错误'
      const hint = msg.includes('Failed to fetch') || msg.includes('fetch')
        ? '无法连接到 API，请检查网络、Base URL 或 Provider 类型'
        : msg
      setTestMessage(`连接失败：${hint}`)
    }
  }

  const hasEdited = keyEdited || urlEdited

  return (
    <div style={{ maxWidth: '100%', paddingBottom: 20 }}>
      <Toast msg={toast} onDone={() => setToast(null)} />

      {/* ────── LLM 配置 ────── */}
      <SettingsSection title="LLM 配置">
        <SettingsRow label="Provider" control={
          <select
            className="form-select"
            value={settings.provider}
            onChange={(e) => handleProviderChange(e.target.value)}
            style={{ width: '100%' }}
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        } />

        <SettingsRow
          label="API Key"
          hint="你的 API 密钥，安全存储在本地"
          control={
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="form-input"
                type={showKey ? 'text' : 'password'}
                placeholder="sk-..."
                value={apiKeyDraft}
                onChange={(e) => { setApiKeyDraft(e.target.value); setKeyEdited(true) }}
                style={{ flex: 1 }}
              />
              <button
                className="btn btn-secondary"
                style={{ padding: '8px 10px', fontSize: 13 }}
                onClick={() => setShowKey(!showKey)}
                title={showKey ? '隐藏' : '显示'}
              >
                {showKey ? '🙈' : '👁️'}
              </button>
            </div>
          }
        />

        <SettingsRow
          label="Base URL"
          hint="为空则使用 Provider 默认地址"
          control={
            <input
              className="form-input"
              placeholder={PROVIDERS.find(p => p.value === settings.provider)?.url || 'https://'}
              value={baseUrlDraft}
              onChange={(e) => { setBaseUrlDraft(e.target.value); setUrlEdited(true) }}
              style={{ width: '100%' }}
              disabled={settings.provider !== 'openai' && settings.provider !== 'custom'}
            />
          }
        />

        {hasEdited && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--border)', marginTop: 8 }}>
            <button className="btn btn-primary" onClick={saveCredentials} style={{ fontSize: 12, padding: '6px 18px' }}>
              保存凭据
            </button>
          </div>
        )}
      </SettingsSection>

      {/* ────── 已保存的模型 ────── */}
      <SettingsSection
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="21" x2="9" y2="9" />
            </svg>
            已保存的模型
          </div>
        }
        context={
          <button
            className={`btn ${fetchedModels.length > 0 ? 'btn-primary' : 'btn-secondary'}`}
            style={{ fontSize: 11, padding: '3px 10px', gap: 4 }}
            onClick={handleFetchModels}
            disabled={fetchingModels}
          >
            {fetchingModels ? '⏳' : '📥'} {fetchedModels.length > 0 ? '重新获取' : '从 API 获取'}
          </button>
        }
      >
        {/* 模型列表 */}
        {savedModels.length === 0 ? (
          <div style={{ padding: '12px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            还没有保存的模型。从下方添加或点击「从 API 获取」。
          </div>
        ) : (
          <div style={{ marginBottom: 10 }}>
            {savedModels.map((m) => (
              <ModelRow
                key={m.name}
                model={m}
                isActive={settings.model === m.name}
                onSelect={() => selectSavedModel(m.name)}
                onUpdate={(partial) => updateSavedModel(m.name, partial)}
                onDelete={() => removeSavedModel(m.name)}
              />
            ))}
          </div>
        )}

        {/* 添加模型按钮 + 面板 */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            ref={addBtnRef}
            className="btn btn-secondary"
            onClick={() => setAddPanelOpen(!addPanelOpen)}
            style={{ fontSize: 12, padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            添加模型
          </button>
        </div>

        {/* 添加面板 */}
        {addPanelOpen && (
          <div
            ref={panelRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              marginTop: 8,
              maxHeight: 360,
              display: 'flex', flexDirection: 'column',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
            }}
          >
            {/* 搜索已有模型 */}
            {fetchedModels.length > 0 && (
              <>
                <div style={{ padding: '8px 10px 4px', fontSize: 11, color: 'var(--text-muted)' }}>
                  从 API 列表中选择
                </div>
                <input
                  className="form-input" type="text"
                  placeholder="搜索模型…"
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                  autoFocus
                  style={{
                    margin: '0 8px 4px', padding: '6px 10px', fontSize: 12,
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-page)', outline: 'none',
                  }}
                />
                <div style={{ flex: '1 0 auto', overflowY: 'auto', padding: '0 6px 4px', maxHeight: 180 }}>
                  {(modelSearch
                    ? fetchedModels.filter(m => m.toLowerCase().includes(modelSearch.toLowerCase()))
                    : fetchedModels
                  ).length === 0 ? (
                    <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
                      无匹配模型
                    </div>
                  ) : (
                    (modelSearch
                      ? fetchedModels.filter(m => m.toLowerCase().includes(modelSearch.toLowerCase()))
                      : fetchedModels
                    ).map((id) => {
                      const alreadySaved = savedModels.some(m => m.name === id)
                      return (
                        <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button
                            onClick={() => !alreadySaved && addFromFetched(id)}
                            disabled={alreadySaved}
                            style={{
                              flex: 1, textAlign: 'left',
                              padding: '5px 10px', fontSize: 12,
                              borderRadius: 'var(--radius-sm)', border: 'none',
                              background: 'transparent',
                              color: alreadySaved ? 'var(--text-muted)' : 'var(--text)',
                              cursor: alreadySaved ? 'default' : 'pointer',
                              marginBottom: 1, opacity: alreadySaved ? 0.5 : 1,
                            }}
                          >
                            {id} {alreadySaved && '✓'}
                          </button>
                        </div>
                      )
                    })
                  )}
                </div>
                <div style={{ borderTop: '1px solid var(--border)', margin: '0 0 6px' }} />
              </>
            )}

            {/* 自定义输入 */}
            {fetchedModels.length === 0 && (
              <div style={{ padding: '8px 10px 4px', fontSize: 11, color: 'var(--text-muted)' }}>
                暂未获取模型列表，或直接输入模型名
              </div>
            )}
            <div style={{ display: 'flex', gap: 4, padding: '4px 8px 8px' }}>
              <input
                className="form-input" type="text"
                placeholder="输入模型名…"
                value={customModelInput}
                onChange={(e) => setCustomModelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customModelInput.trim()) {
                    addCustomModel()
                  }
                }}
                style={{ flex: 1, fontSize: 12, padding: '5px 8px' }}
              />
              <button
                className="btn btn-primary" style={{ fontSize: 12, padding: '5px 12px' }}
                onClick={addCustomModel}
              >
                添加
              </button>
            </div>
          </div>
        )}
      </SettingsSection>

      {/* ────── 底部：当前选中模型 + 测试连接 ────── */}
      <SettingsSection>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            当前模型：
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary)' }}>
            {settings.model || '（未选择）'}
          </span>
          {settings.model && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {settings.modelContextWindow.toLocaleString()} tokens
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <button
            className="btn btn-secondary"
            onClick={handleTestConnection}
            disabled={testStatus === 'testing'}
            style={{ flexShrink: 0 }}
          >
            {testStatus === 'testing' ? '⏳ 测试中…' : '🔌 保存并测试'}
          </button>

          {testMessage && (
            <div
              style={{
                flex: 1, padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                fontSize: 12,
                background: testStatus === 'success'
                  ? 'rgba(40,167,69,0.08)'
                  : 'rgba(220,53,69,0.08)',
                color: testStatus === 'success' ? 'var(--success, #28a745)' : 'var(--danger, #dc3545)',
              }}
            >
              {testMessage}
            </div>
          )}
        </div>
      </SettingsSection>
    </div>
  )
}
