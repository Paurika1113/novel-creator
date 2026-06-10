/**
 * 工具执行器 —— 在本地执行 AI 发出的工具调用
 * 
 * 工具通过注册表模式管理：registerTool(name, handler) 注册，
 * executeToolCall(name, args) 从注册表中查找并执行。
 * 新增工具只需一次注册调用，无需修改路由逻辑。
 */

import { useEditorStore } from '../stores/editorStore'
import { useBookStore } from '../stores/bookStore'
import type { KnowledgeFile } from '../types'

// ========================================
// 工具注册表
// ========================================

interface ToolHandler {
  execute: (args: Record<string, unknown>) => Promise<string> | string
  description?: string
}

const toolRegistry = new Map<string, ToolHandler>()

/**
 * 注册一个新工具到执行器
 * @param name 工具名（与 agents.ts 中的 ToolDefinition.function.name 一致）
 * @param handler 工具处理器（含 execute 方法）
 */
export function registerTool(name: string, handler: ToolHandler): void {
  toolRegistry.set(name, handler)
}

/**
 * 列出所有已注册的工具名
 */
export function listRegisteredTools(): string[] {
  return Array.from(toolRegistry.keys())
}

/**
 * 执行一个工具调用，返回工具执行结果文本
 * 内置 30 秒超时保护，避免 localStorage 异常卡死整个工具循环
 */
export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const handler = toolRegistry.get(name)
  if (!handler) {
    return `错误：未知工具 "${name}"。可用工具：${listRegisteredTools().join('、')}`
  }

  try {
    const result = await executeWithTimeout(handler.execute(args), 30000)
    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : '未知错误'
    return `❌ 工具 "${name}" 执行失败：${msg}`
  }
}

/**
 * 为 Promise 添加超时保护
 */
async function executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`执行超时 (${timeoutMs}ms)`)), timeoutMs)
  )
  return Promise.race([promise, timeoutPromise])
}

function getCurrentFiles(): KnowledgeFile[] {
  const store = useEditorStore.getState()
  return store.currentBookId
    ? store.filesByBook[store.currentBookId] || []
    : []
}

function getCurrentBookId(): string | null {
  return useEditorStore.getState().currentBookId
}

function findFile(predicate: (f: KnowledgeFile) => boolean): KnowledgeFile | undefined {
  return getCurrentFiles().find(predicate)
}

/**
 * 持久化文件内容到 localStorage
 */
function persistFile(path: string, content: string): void {
  const bookId = getCurrentBookId()
  if (!bookId) return
  try {
    localStorage.setItem(`nc:${bookId}:${path}`, content)
  } catch (e) {
    console.warn('Failed to persist file content:', e)
  }
}

/**
 * 从 AI 回复中提取 <Main text> 标签内的纯正文内容
 * strict=true：必须包含标签，否则返回 null（草稿写入专用）
 * strict=false（默认）：无标签时返回原始内容（知识文件写入）
 */
function extractMainText(raw: string, strict = false): string | null {
  const tagRegex = /<Main text>\s*([\s\S]*?)\s*<\/Main text>/i
  const match = raw.match(tagRegex)

  if (!match) {
    if (strict) return null // 严格模式：无标签 = 拒绝写入
    return raw.trim()       // 宽松模式：返回原内容
  }

  let extracted = match[1].trim()

  // 如果被代码块包裹，去掉最外层的 ```
  if (extracted.startsWith('```')) {
    const lines = extracted.split('\n')
    if (lines[0].trim().startsWith('```')) lines.shift()
    if (lines[lines.length - 1]?.trim() === '```') lines.pop()
    extracted = lines.join('\n').trim()
  }

  return extracted
}

function updateFile(path: string, content: string, fileType?: string): void {
  const store = useEditorStore.getState()
  const bookId = store.currentBookId || getCurrentBookId()
  if (!bookId) {
    console.warn('[toolExecutor] updateFile: no currentBookId, cannot save file:', path)
    return
  }

  const currentFiles = store.filesByBook[bookId] || []
  const existingIdx = currentFiles.findIndex((f) => f.path === path)

  let updatedFiles: KnowledgeFile[]
  if (existingIdx >= 0) {
    // 更新已有文件
    updatedFiles = [...currentFiles]
    updatedFiles[existingIdx] = {
      ...updatedFiles[existingIdx],
      content,
      updatedAt: new Date().toISOString(),
    }
  } else {
    // 创建新文件
    const newFile: KnowledgeFile = {
      name: path.split('/').pop()?.replace(/\.md$/, '') || path,
      path,
      type: (fileType as any) || 'other',
      content,
      updatedAt: new Date().toISOString(),
    }
    updatedFiles = [...currentFiles, newFile]
  }

  // 直接更新 Zustand store（不依赖 currentBookId）
  store.setFiles(updatedFiles)
  // 持久化到 localStorage
  try {
    localStorage.setItem(`nc:${bookId}:${path}`, content)
  } catch (e) {
    console.warn('Failed to persist file content:', e)
  }

  // 如果当前编辑器中打开的就是这个文件，强制刷新编辑器内容
  // 使用 setState 直接设置 editorContent，绕过 openFile 的 localStorage 读取
  const currentState = useEditorStore.getState()
  if (currentState.currentFilePath === path) {
    useEditorStore.setState({ editorContent: content, isDirty: false })
  }
}

function readKnowledgeFile(fileName: string): string {
  // Try matching by path, name, or path suffix
  const isFullPath = fileName.includes('/')
  const file =
    (isFullPath ? findFile((f) => f.path === fileName) : undefined) ||
    findFile((f) => f.name === fileName) ||
    findFile((f) => f.path.endsWith('/' + fileName)) ||
    findFile((f) => f.path.endsWith(fileName))

  if (!file) {
    const allNames = getCurrentFiles()
      .filter((f) =>
        ['world_model', 'master_outline', 'arc_outline', 'chapter_outline', 'status_card', 'summary', 'style_fingerprint', 'brainstorm', 'error_archive'].includes(f.type),
      )
      .map((f) => f.name)
    return `未找到文件 "${fileName}"。可用文件：${allNames.join('、')}`
  }

  // 优先从 localStorage 读取最新内容
  const bookId = getCurrentBookId()
  let content = file.content
  if (bookId) {
    try {
      const saved = localStorage.getItem(`nc:${bookId}:${file.path}`)
      if (saved !== null) content = saved
    } catch { /* ignore */ }
  }

  return content ? `## ${file.name}\n\n${content}` : `## ${file.name}\n\n（文件内容为空）`
}

function readCurrentDraft(): string {
  const file = findFile((f) => f.path === 'drafts/chapter_draft.md')
  if (!file) return '当前无草稿文件。'

  // 优先从 localStorage 读取
  const bookId = getCurrentBookId()
  let content = file.content
  if (bookId) {
    try {
      const saved = localStorage.getItem(`nc:${bookId}:${file.path}`)
      if (saved !== null) content = saved
    } catch { /* ignore */ }
  }

  return content || '（草稿为空）'
}

/**
 * 检查提取后的内容是否为占位文字（如 AI 输出 "正文内容如上所示" 等）
 */
function isPlaceholderText(text: string): boolean {
  const trimmed = text.trim()
  // 太短 → 明显不是正文
  if (trimmed.length < 50) return true
  // 匹配常见占位模式（整段文字匹配）
  const placeholderPatterns = [
    // 纯括号包裹的占位描述
    /^[（(]\s*(正文|内容|草稿|如上|参见|请见|详见)[\s\S]{0,30}[）)]\s*$/,
    // 以占位短语开头的单行描述（不允许后面有真实段落）
    /^(正文内容如上|内容如上所示|正文如上|请参阅上文|参见上文|已在上方输出|已在聊天中输出)(?![\s\S]{20,})/,
    // 完全由引用指示语组成的文本
    /^(如上所述|同上|详见上文|以下同上|内容同前)[\s\S]{0,10}$/,
  ]
  return placeholderPatterns.some((p) => p.test(trimmed))
}

function writeCurrentDraft(content: string): string {
  // write_current_draft 使用宽松模式：没有 <Main text> 标签时直接写原内容
  const extracted = extractMainText(content, false)
  if (!extracted || !extracted.trim()) {
    return '❌ 写入失败：内容为空。请提供要写入的正文内容。'
  }
  // 检测占位文字
  if (isPlaceholderText(extracted)) {
    return `❌ 写入失败：检测到占位文字（"${extracted.slice(0, 50)}..."），而非完整正文。请在 <Main text> 标签内放入**完整的小说正文**，不要使用"如上所示"等占位短语。`
  }
  updateFile('drafts/chapter_draft.md', extracted, 'chapter_draft')
  return `✅ 草稿已写入。正文长度：${extracted.length} 字符。`
}

function appendToDraft(content: string): string {
  // append_to_draft 使用宽松模式：没有 <Main text> 标签时直接追加原内容
  const extracted = extractMainText(content, false)
  if (!extracted || !extracted.trim()) {
    return '❌ 追加失败：内容为空。请提供要追加的正文内容。'
  }
  const file = findFile((f) => f.path === 'drafts/chapter_draft.md')
  const current = file?.content || ''
  const newContent = current + '\n\n' + extracted
  updateFile('drafts/chapter_draft.md', newContent, 'chapter_draft')
  return `✅ 已追加 ${extracted.length} 字符到草稿末尾。当前草稿总长度：${(current.length + extracted.length)} 字符。`
}

function listChapters(): string {
  const chapters = getCurrentFiles().filter((f) => f.type === 'chapter')
  if (chapters.length === 0) return '暂无已归档章节。'
  return chapters
    .map((f, i) => `${i + 1}. ${f.name} (${f.path})`)
    .join('\n')
}

function readChapter(index: number): string {
  const chapters = getCurrentFiles().filter((f) => f.type === 'chapter')
  const chapter = chapters[index - 1]
  if (!chapter) {
    return `未找到第 ${index} 章。共有 ${chapters.length} 个已归档章节。`
  }
  return `## ${chapter.name}\n\n${chapter.content || '（内容为空）'}`
}

function writeKnowledgeFile(fileName: string, content: string): string {
  const extracted = extractMainText(content)
  // fileName 含 "/" 时视为完整路径，否则自动补 knowledge/ 前缀
  const isFullPath = fileName.includes('/')

  // 优先按完整路径查找，否则按文件名查找
  const file = isFullPath
    ? findFile((f) => f.path === fileName)
    : findFile((f) => f.name === fileName) || findFile((f) => f.path.endsWith('/' + fileName))

  if (file) {
    // 如果已有文件但类型不对（如被旧版 writeKnowledgeFile 创建为 'other'），强制修正
    const effectiveType = file.path.match(/^chapters\/\d+\.md$/) ? 'chapter' : file.type
    // 修正文件树中的类型（即使 content 没变，类型也要改过来）
    if (effectiveType !== file.type) {
      const store = useEditorStore.getState()
      const bookId = store.currentBookId
      if (bookId) {
        const currentFiles = store.filesByBook[bookId] || []
        const idx = currentFiles.findIndex((f) => f.path === file.path)
        if (idx >= 0) {
          const updated = [...currentFiles]
          updated[idx] = { ...file, type: effectiveType as any, content: extracted, updatedAt: new Date().toISOString() }
          store.setFiles(updated)
        }
      }
      try {
        const bId = useEditorStore.getState().currentBookId
        if (bId) localStorage.setItem(`nc:${bId}:${file.path}`, extracted)
      } catch { /* ignore */ }
      // 如果编辑器正好打开此文件，刷新内容
      const cur = useEditorStore.getState()
      if (cur.currentFilePath === file.path) {
        useEditorStore.setState({ editorContent: extracted, isDirty: false })
      }
      return `✅ 文件 "${fileName}" 已更新（类型已修正）。正文长度：${extracted.length} 字符。`
    }
    updateFile(file.path, extracted, file.type)
  } else {
    const path = isFullPath ? fileName : `knowledge/${fileName}`

    // 根据路径模式推断 fileType
    let fileType: string = 'other'
    if (path.match(/\.outline\.md$/)) fileType = 'chapter_outline'
    else if (path.startsWith('drafts/')) fileType = 'chapter_draft'
    else if (path.match(/^chapters\/\d+\.md$/)) fileType = 'chapter'

    const store = useEditorStore.getState()
    const bookId = store.currentBookId
    if (bookId) {
      const currentFiles = store.filesByBook[bookId] || []
      const newFile: KnowledgeFile = {
        name: path.split('/').pop()?.replace(/\.md$/, '') || path,
        path,
        type: fileType as any,
        content: extracted,
        updatedAt: new Date().toISOString(),
      }
      store.setFiles([...currentFiles, newFile])
      try {
        localStorage.setItem(`nc:${bookId}:${path}`, extracted)
      } catch (e) {
        console.warn('Failed to persist file content:', e)
      }
      // 如果编辑器正好打开此路径，立即刷新
      const currentState = useEditorStore.getState()
      if (currentState.currentFilePath === path) {
        useEditorStore.setState({ editorContent: extracted, isDirty: false })
      }
      return `✅ 文件 "${path}" 已创建。正文长度：${extracted.length} 字符。`
    }
  }
  return `✅ 知识文件 "${fileName}" 已更新。正文长度：${extracted.length} 字符。`
}

/**
 * 直接写入章节正文文件 chapters/NNN.md
 * 使用严格模式（需要 <Main text> 标签），内容会被注入对应的章节文件
 */
function writeChapterContent(chapterIndex: number, content: string): string {
  const path = `chapters/${String(chapterIndex).padStart(3, '0')}.md`

  // 严格模式：必须包含 <Main text> 标签
  const extracted = extractMainText(content, true)
  if (!extracted || !extracted.trim()) {
    return '❌ 写入失败：content 参数中必须包含 <Main text> 和 </Main text> 标签，只有标签内的纯正文才会被写入。'
  }
  // 检测占位文字
  if (isPlaceholderText(extracted)) {
    return `❌ 写入失败：检测到占位文字（"${extracted.slice(0, 50)}..."），而非完整正文。请在 <Main text> 标签内放入**完整的小说正文**。`
  }

  const store = useEditorStore.getState()
  const bookId = store.currentBookId
  if (!bookId) return '❌ 写入失败：未选中任何作品。'

  const currentFiles = store.filesByBook[bookId] || []
  const existing = currentFiles.find((f) => f.path === path)

  let name = `第${chapterIndex}章`
  // 查找对应章节的纲要文件，尝试从中提取标题
  const outlinePath = `chapters/${String(chapterIndex).padStart(3, '0')}.outline.md`
  const outlineFile = currentFiles.find((f) => f.path === outlinePath)
  if (outlineFile) {
    name = outlineFile.name.replace(/·纲要$/, '')
  }

  const now = new Date().toISOString()
  let updatedFiles: KnowledgeFile[]

  if (existing) {
    // 更新已有章节
    updatedFiles = [...currentFiles]
    const idx = currentFiles.indexOf(existing)
    updatedFiles[idx] = { ...existing, content: extracted, updatedAt: now }
  } else {
    // 创建新章节文件
    const newFile: KnowledgeFile = {
      name,
      path,
      type: 'chapter',
      content: extracted,
      updatedAt: now,
    }
    updatedFiles = [...currentFiles, newFile]
  }

  store.setFiles(updatedFiles)
  try {
    localStorage.setItem(`nc:${bookId}:${path}`, extracted)
  } catch (e) {
    console.warn('Failed to persist file content:', e)
  }

  // 如果编辑器正好打开此文件，刷新内容
  const currentState = useEditorStore.getState()
  if (currentState.currentFilePath === path) {
    useEditorStore.setState({ editorContent: extracted, isDirty: false })
  }

  return `✅ 第${chapterIndex}章正文已直接写入 ${path}。正文长度：${extracted.length} 字符。不需要再归档。`
}

// ========================================
// 工具注册（模块加载时自动注册）
// ========================================

registerTool('read_knowledge_file', {
  execute: (args) => readKnowledgeFile(args.fileName as string),
  description: '读取规范性知识文件',
})

registerTool('read_current_draft', {
  execute: () => readCurrentDraft(),
  description: '读取当前草稿',
})

registerTool('write_current_draft', {
  execute: (args) => writeCurrentDraft(args.content as string),
  description: '写入当前草稿',
})

registerTool('append_to_draft', {
  execute: (args) => appendToDraft(args.content as string),
  description: '追加到草稿末尾',
})

registerTool('list_chapters', {
  execute: () => listChapters(),
  description: '列出已归档章节',
})

registerTool('read_chapter', {
  execute: (args) => readChapter(Number(args.index)),
  description: '读取某章正文',
})

registerTool('write_knowledge_file', {
  execute: (args) => writeKnowledgeFile(args.fileName as string, args.content as string),
  description: '写入知识文件',
})

registerTool('write_chapter_content', {
  execute: (args) => writeChapterContent(Number(args.chapterIndex), args.content as string),
  description: '直接写入章节正文到 chapters/NNN.md',
})
