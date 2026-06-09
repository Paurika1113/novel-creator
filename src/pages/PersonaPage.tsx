import { useState, useMemo } from 'react'
import { usePersonaStore } from '../stores/personaStore'
import { useBookStore } from '../stores/bookStore'
import { useEditorStore } from '../stores/editorStore'
import { useSettingsStore } from '../stores/settingsStore'
import { analyzeBookChapters, buildChaptersContent } from '../services/analysis'
import Modal from '../components/ui/Modal'
import ContextMenu from '../components/ui/ContextMenu'
import type { ContextMenuItem } from '../components/ui/ContextMenu'
import type { Persona } from '../types'

type CreateTab = 'from-books' | 'import-file' | 'manual'

const analysisStates: Record<string, string> = {
  idle: '待分析',
  analyzing: '分析中…',
  completed: '已分析',
  failed: '分析失败',
}

export default function PersonaPage() {
  const {
    personas,
    createPersona,
    deletePersona,
    renamePersona,
    setAnalysisStatus,
    updateStyleProfile,
    updateStylisticTags,
  } = usePersonaStore()
  const { books, currentBookId } = useBookStore()
  const filesByBook = useEditorStore((s) => s.filesByBook)
  const editorBookId = useEditorStore((s) => s.currentBookId)
  const { settings } = useSettingsStore()

  // 获取当前书籍的文件列表（兼容 editorStore 和 bookStore 的 currentBookId）
  const activeBookId = currentBookId || editorBookId
  const files = useMemo(() => {
    if (!activeBookId) return []
    return filesByBook[activeBookId] || []
  }, [filesByBook, activeBookId])

  // 右键菜单
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; personaId: string } | null>(null)

  // 新建弹窗
  const [showCreate, setShowCreate] = useState(false)
  const [createTab, setCreateTab] = useState<CreateTab>('from-books')
  const [newName, setNewName] = useState('')
  const [selectedBooks, setSelectedBooks] = useState<string[]>([])

  // 详情页
  const [detailPersona, setDetailPersona] = useState<Persona | null>(null)
  const [editingField, setEditingField] = useState<keyof Persona['styleProfile'] | null>(null)
  const [editValue, setEditValue] = useState('')

  // ---- 分析管线 ----
  async function runAnalysis(personaId: string) {
    const persona = personas.find((p) => p.id === personaId)
    if (!persona) return

    setAnalysisStatus(personaId, 'analyzing')

    try {
      // 收集章节内容
      const sourceChapters = files
        .filter((f) => f.type === 'chapter' && f.content)
        .slice(0, 10)

      if (sourceChapters.length === 0) {
        // 无实际章节内容时，做一次快速的基础分析
        const quickProfile = {
          lexical: '暂无分析数据——请先归档章节后再进行文风分析。',
          narrative: '暂无分析数据。',
          structural: '暂无分析数据。',
        }
        updateStyleProfile(personaId, quickProfile)
        updateStylisticTags(personaId, {
          overallTendency: '待分析',
          rhetoricPreference: [],
          descriptionFocus: [],
          narrativeDistance: '',
        })
        setAnalysisStatus(personaId, 'completed')
        return
      }

      const book = persona.sourceBookIds[0]
        ? books.find((b) => b.id === persona.sourceBookIds[0])
        : null

      const chaptersContent = buildChaptersContent(
        sourceChapters.map((f) => ({
          title: f.name,
          content: f.content,
        })),
      )

      const result = await analyzeBookChapters(
        chaptersContent,
        book?.title || '未命名作品',
      )

      updateStyleProfile(personaId, {
        lexical: result.lexical,
        narrative: result.narrative,
        structural: result.structural,
      })
      updateStylisticTags(personaId, result.stylistic)
      setAnalysisStatus(personaId, 'completed')
    } catch (err: unknown) {
      console.error('[分析失败]', err)
      setAnalysisStatus(personaId, 'failed')
    }
  }

  // ---- 新建 ----
  function handleCreate() {
    if (!newName.trim()) return
    const persona = createPersona(newName.trim(), createTab === 'from-books' ? selectedBooks : [])

    setShowCreate(false)
    setNewName('')
    setSelectedBooks([])

    if (createTab === 'manual') {
      setAnalysisStatus(persona.id, 'completed')
    } else if (createTab === 'from-books') {
      // 自动开始分析
      runAnalysis(persona.id)
    }
  }

  // ---- 右键菜单 ----
  const contextItems: ContextMenuItem[] = contextMenu
    ? [
        {
          label: '查看详情',
          icon: '👁️',
          onClick: () => {
            const p = personas.find((p) => p.id === contextMenu.personaId)
            if (p) setDetailPersona(p)
          },
        },
        {
          label:
            personas.find((p) => p.id === contextMenu.personaId)?.analysisStatus === 'analyzing'
              ? '分析中…'
              : '重新分析文风',
          icon: '🔄',
          disabled: personas.find((p) => p.id === contextMenu.personaId)?.analysisStatus === 'analyzing',
          onClick: () => runAnalysis(contextMenu.personaId),
        },
        { label: '---', onClick: () => {} },
        {
          label: '重命名',
          icon: '✏️',
          onClick: () => {
            const p = personas.find((p) => p.id === contextMenu.personaId)
            if (p) {
              const name = prompt('重命名作者身份', p.name)
              if (name?.trim()) renamePersona(p.id, name.trim())
            }
          },
        },
        {
          label: '删除',
          icon: '🗑️',
          danger: true,
          onClick: () => {
            if (confirm('确定删除这个作者身份？不会影响已绑定的书籍。')) {
              deletePersona(contextMenu.personaId)
            }
          },
        },
      ]
    : []

  // ---- 详情面板编辑 ----
  function startEdit(field: keyof Persona['styleProfile']) {
    if (!detailPersona) return
    setEditingField(field)
    setEditValue(detailPersona.styleProfile[field] as string)
  }

  function saveEdit() {
    if (!detailPersona || !editingField) return
    updateStyleProfile(detailPersona.id, { [editingField]: editValue })
    setDetailPersona({
      ...detailPersona,
      styleProfile: { ...detailPersona.styleProfile, [editingField]: editValue },
    })
    setEditingField(null)
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <h1 className="page-title">作者身份</h1>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <span>＋</span> 添加身份
          </button>
        </div>
      </div>

      {personas.length > 0 ? (
        <div className="book-grid">
          {personas.map((persona) => (
            <div
              key={persona.id}
              className="persona-card"
              onClick={() => setDetailPersona(persona)}
              onContextMenu={(e) => {
                e.preventDefault()
                setContextMenu({ x: e.clientX, y: e.clientY, personaId: persona.id })
              }}
            >
              <div className="persona-card-header">
                <div className="persona-avatar">
                  {persona.name.charAt(0)}
                </div>
                <div className="persona-card-info">
                  <div className="persona-card-name">{persona.name}</div>
                  <div className="persona-card-source">
                    {persona.sourceBookIds.length > 0
                      ? `基于 ${persona.sourceBookIds.length} 本书`
                      : '手动创建'}
                  </div>
                </div>
              </div>

              <div className="persona-card-status">
                <span className={`status-badge status-${persona.analysisStatus}`}>
                  {analysisStates[persona.analysisStatus]}
                </span>
                {persona.analysisStatus === 'idle' && (
                  <button
                    className="btn btn-sm btn-secondary"
                    style={{ marginLeft: 8 }}
                    onClick={(e) => {
                      e.stopPropagation()
                      runAnalysis(persona.id)
                    }}
                  >
                    开始分析
                  </button>
                )}
                {persona.analysisStatus === 'failed' && (
                  <button
                    className="btn btn-sm btn-secondary"
                    style={{ marginLeft: 8 }}
                    onClick={(e) => {
                      e.stopPropagation()
                      runAnalysis(persona.id)
                    }}
                  >
                    重试
                  </button>
                )}
              </div>

              {persona.analysisStatus === 'completed' && (
                <div className="persona-card-preview">
                  <div className="preview-line">
                    <span className="preview-label">语言层</span>
                    <span className="preview-value">
                      {persona.styleProfile.lexical.slice(0, 40) || '待编辑'}
                    </span>
                  </div>
                  <div className="preview-line">
                    <span className="preview-label">风格</span>
                    <span className="preview-value">
                      {persona.styleProfile.stylistic.overallTendency || '待设置'}
                    </span>
                  </div>
                </div>
              )}

              {persona.analysisStatus === 'analyzing' && (
                <div className="persona-card-preview">
                  <div className="preview-line" style={{ color: 'var(--primary)', fontSize: 12 }}>
                    ⏳ LLM 正在分析文风特征…
                  </div>
                </div>
              )}

              <div className="persona-card-time">
                创建于 {formatDate(persona.createdAt)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">👤</div>
          <p className="empty-text">还没有作者身份。导入作品并分析，或手动创建一个。</p>
          <div className="empty-actions">
            <button className="btn btn-primary btn-lg" onClick={() => setShowCreate(true)}>
              <span>＋</span> 添加作者身份
            </button>
          </div>
        </div>
      )}

      {/* 新建身份弹窗 */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="添加作者身份" width={520}>
        <div className="tabs">
          <button
            className={`tab ${createTab === 'from-books' ? 'active' : ''}`}
            onClick={() => setCreateTab('from-books')}
          >
            从已有书籍
          </button>
          <button
            className={`tab ${createTab === 'import-file' ? 'active' : ''}`}
            onClick={() => setCreateTab('import-file')}
          >
            导入新书分析
          </button>
          <button
            className={`tab ${createTab === 'manual' ? 'active' : ''}`}
            onClick={() => setCreateTab('manual')}
          >
            手动自定义
          </button>
        </div>

        <div className="form-group" style={{ marginTop: 16 }}>
          <label className="form-label">身份名称 <span className="form-required">*</span></label>
          <input
            className="form-input"
            placeholder="如「金庸风骨」「鲁迅笔锋」"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={30}
          />
        </div>

        {createTab === 'from-books' && (
          <div className="form-group">
            <label className="form-label">选择分析来源的书籍</label>
            {books.length === 0 ? (
              <div className="form-hint">暂无书籍，请先在作品库创建或导入作品</div>
            ) : (
              <div className="checkbox-list">
                {books.map((book) => (
                  <label key={book.id} className="checkbox-item">
                    <input
                      type="checkbox"
                      checked={selectedBooks.includes(book.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedBooks([...selectedBooks, book.id])
                        } else {
                          setSelectedBooks(selectedBooks.filter((id) => id !== book.id))
                        }
                      }}
                    />
                    <span>{book.title}</span>
                    <span className="checkbox-meta">{book.chapterCount}章</span>
                  </label>
                ))}
              </div>
            )}
            <div className="form-hint">选择多本书可提取共性特征</div>
          </div>
        )}

        {createTab === 'import-file' && (
          <div className="form-group">
            <label className="form-label">导入文件</label>
            <div className="import-area">
              <div className="import-area-icon">📄</div>
              <div className="import-area-text">选择包含章节的 Markdown 文件或文件夹</div>
              <button className="btn btn-secondary btn-sm" onClick={() => alert('文件选择器将在 Electron 环境中可用')}>
                选择文件
              </button>
            </div>
            <div className="form-hint">支持 .md 文件，文件名格式：001-标题.md 或 第一章.md</div>
          </div>
        )}

        {createTab === 'manual' && (
          <div className="form-hint" style={{ marginTop: 16 }}>
            创建后可以在详情页中逐层编辑文风画像
          </div>
        )}

        <div className="form-actions">
          <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>取消</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={!newName.trim()}>
            {createTab === 'manual' ? '创建' : '创建并分析'}
          </button>
        </div>
      </Modal>

      {/* 详情面板 */}
      {detailPersona && (
        <Modal
          open={true}
          onClose={() => { setDetailPersona(null); setEditingField(null) }}
          title={detailPersona.name}
          width={600}
        >
          <div className="persona-detail">
            <div className="detail-section">
              <div className="detail-section-title">基本信息</div>
              <div className="detail-meta">
                <span>创建时间：{formatDate(detailPersona.createdAt)}</span>
                <span>
                  分析状态：
                  <span className={`status-badge status-${detailPersona.analysisStatus}`}>
                    {analysisStates[detailPersona.analysisStatus]}
                  </span>
                  {detailPersona.analysisStatus === 'failed' && (
                    <button
                      className="btn btn-sm btn-secondary"
                      style={{ marginLeft: 8 }}
                      onClick={() => runAnalysis(detailPersona.id)}
                    >
                      重试
                    </button>
                  )}
                  {detailPersona.analysisStatus === 'analyzing' && (
                    <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--primary)' }}>
                      ⏳ 分析中…
                    </span>
                  )}
                  {detailPersona.analysisStatus === 'completed' && (
                    <button
                      className="btn btn-sm btn-secondary"
                      style={{ marginLeft: 8 }}
                      onClick={() => runAnalysis(detailPersona.id)}
                    >
                      重新分析
                    </button>
                  )}
                </span>
                <span>
                  来源：{detailPersona.sourceBookIds.length > 0
                    ? `${detailPersona.sourceBookIds.length} 本书`
                    : '手动创建'}
                </span>
              </div>
            </div>

            <div className="detail-section">
              <div className="detail-section-title">四维文风画像</div>
              {(['lexical', 'narrative', 'structural', 'stylistic'] as const).map((field) => (
                <div key={field} className="profile-layer">
                  <div className="profile-layer-header">
                    <span className="profile-layer-label">{fieldLabels[field]}</span>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => {
                        if (editingField === field) {
                          saveEdit()
                        } else {
                          startEdit(field)
                        }
                      }}
                    >
                      {editingField === field ? '保存' : '编辑'}
                    </button>
                  </div>
                  {editingField === field ? (
                    <textarea
                      className="form-textarea"
                      rows={4}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={saveEdit}
                      autoFocus
                    />
                  ) : (
                    <div className="profile-layer-content">
                      {field === 'stylistic'
                        ? renderStylisticTags(detailPersona.styleProfile.stylistic)
                        : (detailPersona.styleProfile[field] || '（空，点击编辑添加内容）')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* 右键菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

const fieldLabels = {
  lexical: '语言层',
  narrative: '叙事层',
  structural: '结构层',
  stylistic: '风格标签',
}

function renderStylisticTags(tags: { overallTendency?: string; rhetoricPreference?: string[]; descriptionFocus?: string[]; narrativeDistance?: string }) {
  return (
    <div className="style-tags">
      <div className="style-tag-row">
        <span className="style-tag-label">整体倾向</span>
        <span className="style-tag-value">{tags.overallTendency || '未设置'}</span>
      </div>
      <div className="style-tag-row">
        <span className="style-tag-label">修辞偏好</span>
        <div className="style-tags-list">
          {(tags.rhetoricPreference?.length ? tags.rhetoricPreference : ['未设置']).map((t, i) => (
            <span key={i} className="style-chip">{t}</span>
          ))}
        </div>
      </div>
      <div className="style-tag-row">
        <span className="style-tag-label">描写侧重</span>
        <div className="style-tags-list">
          {(tags.descriptionFocus?.length ? tags.descriptionFocus : ['未设置']).map((t, i) => (
            <span key={i} className="style-chip">{t}</span>
          ))}
        </div>
      </div>
      <div className="style-tag-row">
        <span className="style-tag-label">叙事距离</span>
        <span className="style-tag-value">{tags.narrativeDistance || '未设置'}</span>
      </div>
    </div>
  )
}

import { formatDateTime } from '../lib/date'

// 使用统一的日期格式化工具
function formatDate(iso: string) {
  return formatDateTime(iso)
}
