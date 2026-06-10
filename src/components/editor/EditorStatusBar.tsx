import { useEditorStore } from '../../stores/editorStore'
import { useSettingsStore } from '../../stores/settingsStore'

export default function EditorStatusBar() {
  const { currentFilePath, editorContent, isDirty, filesByBook, currentBookId } = useEditorStore()
  const settings = useSettingsStore((s) => s.settings)

  const files = currentBookId ? (filesByBook[currentBookId] || []) : []
  const chapterFiles = files.filter((f) => f.type === 'chapter')
  const recentChapters = chapterFiles.slice(-3)
  const recentContent = recentChapters.reduce((sum, f) => sum + f.content.length, 0)

  const wordCount = editorContent.length
  const totalTokens = settings.modelContextWindow || 200000
  const estimatedTokens = Math.round((recentContent + wordCount + 5000) * 1.2)
  const percent = Math.min(Math.round((estimatedTokens / totalTokens) * 100), 99)

  const modelName = settings.model || '未配置'
  const fileName = currentFilePath ? currentFilePath.split('/').pop() || currentFilePath : '未打开'

  return (
    <div className="editor-statusbar">
      <span className="editor-statusbar-item">📄 {fileName}</span>
      <span className="editor-statusbar-divider" />
      <span className="editor-statusbar-item">📝 {(wordCount / 1000).toFixed(1)}k 字</span>
      <span className="editor-statusbar-divider" />
      <span className="editor-statusbar-item" style={{ color: isDirty ? 'var(--warning)' : 'var(--success)' }}>
        {isDirty ? '⊙ 未保存' : '✓ 已保存'}
      </span>
      <span className="editor-statusbar-spacer" />
      <span className="editor-statusbar-item">🤖 {modelName}</span>
      <span className="editor-statusbar-divider" />
      <span className="editor-statusbar-item">
        📊 {percent}% ctx
      </span>
    </div>
  )
}
