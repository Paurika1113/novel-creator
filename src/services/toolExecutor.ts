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
 */
export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const handler = toolRegistry.get(name)
  if (!handler) {
    return `错误：未知工具 "${name}"。可用工具：${listRegisteredTools().join('、')}`
  }
  return handler.execute(args)
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
}

function readKnowledgeFile(fileName: string): string {
  // Try matching by name or path suffix
  const file =
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

function writeCurrentDraft(content: string): string {
  const extracted = extractMainText(content, true)
  if (extracted === null) {
    return '❌ 写入失败：未找到 <Main text> 标签。请将小说正文包裹在 <Main text> 和 </Main text> 之间，不要直接在 content 参数中传分析报告、篇幅统计或聊天文字。'
  }
  updateFile('drafts/chapter_draft.md', extracted, 'chapter_draft')
  return `✅ 草稿已写入。正文长度：${extracted.length} 字符。`
}

function appendToDraft(content: string): string {
  const extracted = extractMainText(content, true)
  if (extracted === null) {
    return '❌ 追加失败：未找到 <Main text> 标签。请将小说正文包裹在 <Main text> 和 </Main text> 之间。'
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
  // Find the file by name
  const file =
    findFile((f) => f.name === fileName) ||
    findFile((f) => f.path.endsWith('/' + fileName))

  if (file) {
    updateFile(file.path, extracted, file.type)
  } else {
    // Add new knowledge file
    const path = `knowledge/${fileName}`
    updateFile(path, extracted, 'other')
  }
  return `✅ 知识文件 "${fileName}" 已更新。正文长度：${extracted.length} 字符。`
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
