/**
 * Skill 系统：工具定义、系统提示词、上下文装配器
 */

import type { KnowledgeFile, Persona, StyleProfile } from '../types'
import type { ToolDefinition } from './llm'

// ========================================
// 工具定义
// ========================================

/**
 * 知识文件读取工具 —— AI 按需主动读取
 * PRD 功能 8：知识文件合规机制 —— 规范性文件不预注入
 */
const TOOL_READ_FILE: ToolDefinition = {
  type: 'function',
  function: {
    name: 'read_knowledge_file',
    description: '读取一本书的规范性知识文件（world_model.md, master_outline.md, arc_outline.md, status_card.md 等）。不预注入上下文，AI 按需要主动调用此工具读取。',
    parameters: {
      type: 'object',
      properties: {
        fileName: {
          type: 'string',
          description: '文件名，如 world_model.md, master_outline.md, arc_outline.md, status_card.md, summary.md, style_fingerprint.md, brainstorm.md, error_archive.md。也支持完整路径如 chapters/001.outline.md。',
        },
      },
      required: ['fileName'],
    },
  },
}

const TOOL_READ_DRAFT: ToolDefinition = {
  type: 'function',
  function: {
    name: 'read_current_draft',
    description: '读取当前正在编辑的草稿（chapter_draft.md）的全部内容',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
}

const TOOL_WRITE_DRAFT: ToolDefinition = {
  type: 'function',
  function: {
    name: 'write_current_draft',
    description: '将内容写入草稿文件（drafts/chapter_draft.md）。注意：这是草稿文件，不是正式章节。写入正式章节正文请使用 write_chapter_content。⚠️ content 参数中必须包含 <Main text> 和 </Main text> 标签，只有标签内的纯正文才会被写入文件。',
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: '必须包含 <Main text> 和 </Main text> 标签。标签内是给读者阅读的完整叙事正文（场景+对话+情节，2000-5000字），标签外可以有一句简短说明。',
        },
      },
      required: ['content'],
    },
  },
}

const TOOL_APPEND_DRAFT: ToolDefinition = {
  type: 'function',
  function: {
    name: 'append_to_draft',
    description: '追加内容到当前草稿 chapter_draft.md 末尾',
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: '要追加的 Markdown 内容',
        },
      },
      required: ['content'],
    },
  },
}

const TOOL_LIST_CHAPTERS: ToolDefinition = {
  type: 'function',
  function: {
    name: 'list_chapters',
    description: '列出已归档的所有正式章节文件',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
}

const TOOL_READ_CHAPTER: ToolDefinition = {
  type: 'function',
  function: {
    name: 'read_chapter',
    description: '读取某一章已归档的正文内容',
    parameters: {
      type: 'object',
      properties: {
        index: {
          type: 'number',
          description: '章节索引（从 1 开始）',
        },
      },
      required: ['index'],
    },
  },
}

const TOOL_WRITE_KNOWLEDGE: ToolDefinition = {
  type: 'function',
  function: {
    name: 'write_knowledge_file',
    description: '写入或覆盖一个知识文件的内容。写入章节专属纲要时使用完整路径如 chapters/004.outline.md，AI 会自动识别为章节纲要类型。写入章节正文不要用此工具，请用 write_chapter_content。',
    parameters: {
      type: 'object',
      properties: {
        fileName: {
          type: 'string',
          description: '要写入的文件名（如 arc_outline.md, world_model.md）。写入章节专属纲要时使用完整路径如 chapters/004.outline.md。',
        },
        content: {
          type: 'string',
          description: '文件全文 Markdown',
        },
      },
      required: ['fileName', 'content'],
    },
  },
}

const TOOL_WRITE_CHAPTER: ToolDefinition = {
  type: 'function',
  function: {
    name: 'write_chapter_content',
    description: '直接写入章节正文到 chapters/NNN.md 文件。⚠️ content 参数中必须包含 <Main text> 和 </Main text> 标签，只有标签内的纯叙事正文才会被写入。这是写入章节正文的唯一正确工具，不要用 write_current_draft 或 write_knowledge_file 写章节正文。',
    parameters: {
      type: 'object',
      properties: {
        chapterIndex: {
          type: 'number',
          description: '章节编号，从 1 开始。例如第4章传 4，会自动对应到 chapters/004.md。使用前可先调用 list_chapters 确认当前章节编号。',
        },
        content: {
          type: 'string',
          description: '必须包含 <Main text> 和 </Main text> 标签。标签内是给读者阅读的完整叙事正文（场景+对话+情节，2000-5000字），标签外可以有一句简短说明。',
        },
      },
      required: ['chapterIndex', 'content'],
    },
  },
}

const TOOLS_WRITER: ToolDefinition[] = [
  TOOL_READ_FILE,
  TOOL_READ_DRAFT,
  TOOL_WRITE_DRAFT,
  TOOL_APPEND_DRAFT,
  TOOL_LIST_CHAPTERS,
  TOOL_READ_CHAPTER,
  TOOL_WRITE_KNOWLEDGE,
  TOOL_WRITE_CHAPTER,
]

// ========================================
// 提示词构建器
// ========================================

// 三层认知架构的底座提示 —— 不依赖具体书籍
const BASE_IDENTITY_PROMPT = `你是 Novel Creator 创作工作台中的 AI 创作助手。
你的核心价值是帮助作者高效完成长篇小说的创作，而不是替你代写。

## 核心工作原则
1. 不要预置任何小说正文内容到上下文中。规范件（world_model, outline 等）和已归档章节需要通过工具主动读取
2. 你的每一步推理都和写作者充分透明，不要替用户做决定
3. 所有输出维持高质量 Markdown 格式
4. 使用中文回复，保持专业、精准、有建设性的语气
5. 生成的正文严格遵守汉语标点规范：句号一律用全角句号(。)，逗号用全角逗号(，)，引号用全角双引号("")，省略号用六个点(……)，破折号用两个长横(——)。禁止使用英文句点(.)、英文逗号(,)、三点省略号(...)。`

/**
 * 根据作者身份和 StyleProfile 构建作者身份层提示
 */
function buildPersonaPrompt(persona: Persona | null): string {
  if (!persona) return ''

  const { styleProfile } = persona
  return `## 当前绑定作者身份：${persona.name}

该作者身份的四维文风画像如下，续写时请尽量保持这些风格特征的一致性：

### 语言层
${styleProfile.lexical || '（未分析）'}

### 叙事层
${styleProfile.narrative || '（未分析）'}

### 结构层
${styleProfile.structural || '（未分析）'}

### 风格标签
- 整体倾向：${styleProfile.stylistic.overallTendency || '（未分析）'}
- 修辞偏好：${styleProfile.stylistic.rhetoricPreference?.join('、') || '（未分析）'}
- 描写重心：${styleProfile.stylistic.descriptionFocus?.join('、') || '（未分析）'}
- 叙事距离：${styleProfile.stylistic.narrativeDistance || '（未分析）'}`
}

/**
 * 根据书籍特征构建作品特色层提示
 */
function buildBookPrompt(bookTitle: string, bookType: string, mainCharacter: string): string {
  return `## 当前作品信息
- 书名：${bookTitle}
- 类型：${bookType}
- 主角：${mainCharacter}

创作时请围绕主角展开剧情，保持类型题材的文体特征。`
}

/**
 * System Prompt 缓存
 * 缓存 key = personaId + bookTitle
 * 换书/换作者时缓存自动失效
 */
const systemPromptCache = new Map<string, { prompt: string; timestamp: number }>()
const SYSTEM_PROMPT_CACHE_TTL = 5 * 60 * 1000 // 5 分钟 TTL，防止极端情况下的内存泄漏

function buildSystemPromptCacheKey(args: {
  persona: Persona | null
  bookTitle?: string
}): string {
  return `${args.persona?.id || 'nobody'}:${args.bookTitle || 'nobook'}`
}

/**
 * 获取统一的系统提示词（带缓存）
 * Skill 设计取代 Agent 后，所有对话共享同一套系统提示词
 */
export function buildSystemPrompt(args: {
  persona: Persona | null
  bookTitle?: string
  bookType?: string
  mainCharacter?: string
}): string {
  const { persona, bookTitle = '', bookType = '', mainCharacter = '' } = args

  // 检查缓存
  const cacheKey = buildSystemPromptCacheKey({ persona, bookTitle })
  const cached = systemPromptCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < SYSTEM_PROMPT_CACHE_TTL) {
    return cached.prompt
  }

  // 底座
  const parts: string[] = [BASE_IDENTITY_PROMPT]

  // 作者身份层
  const personaPrompt = buildPersonaPrompt(persona)
  if (personaPrompt) parts.push(personaPrompt)

  // 作品层
  if (bookTitle) {
    parts.push(buildBookPrompt(bookTitle, bookType, mainCharacter))
  }

  // 统一助手层（合并原各 Agent 专有提示的精华）
  parts.push(`## 你是全栈写作助手

你可以执行以下所有任务，根据用户的具体指令自动选择合适的行为模式：

### 大纲规划
- 读取 status_card.md 和 master_outline.md 了解进度
- 每个章节有专属的纲要文件: chapters/编号.outline.md (如 chapters/004.outline.md)
- 生成章纲时使用 write_knowledge_file 写入对应的 chapters/编号.outline.md，AI 会自动识别类型
- 还可更新 arc_outline.md（卷纲）
- 章纲格式：章节标题、场景设定、出场人物、情节节点、悬念铺设

### 章节续写
- 通过 list_chapters 确认当前进度和章节编号
- 读取最近一章保持连续性
- 调用 write_chapter_content 直接写入章节正文到 chapters/NNN.md（注意: 不是 write_current_draft）
- write_chapter_content 的参数: chapterIndex（章节编号）+ content（含 Main text 标签的正文）
- 每章 2000-5000 字，结尾保持悬念

### 草稿审核
- 世界观一致性、大纲匹配度、前文连续性、文风一致性、文本质量五维审稿

### 风格润色
- 语言层（词汇、句式、修辞）、叙事层（视角、节奏）、结构层

### 语言规范
- 标点符号严格遵守《标点符号用法》（GB/T 15834）汉语规范：
  - 句号用（。）不用（.），逗号用（，）不用（,）
  - 引号使用全角双引号（""），引号内再用引号使用全角单引号（''）
  - 省略号用（……）（两个中文省略号，即六个点），不用（...）或（。。）
  - 破折号用（——）（两个中文长横），不用（-）或（--）
  - 书名号用（《》），不用引号代替
  - 冒号、分号、问号、叹号、顿号使用正确的中文字符
  - 中英文混排时，中文与英文之间不加空格
- 数字使用：中文文本中的数字优先使用汉字（一、二、三），年份/百分比等可使用阿拉伯数字（2023年、50%）
- 全角/半角：正文一律使用全角中文标点，英文、数字使用半角字符

### 世界观构建
- 提取已归档章节中的设定，更新 world_model.md`)

  // 知识合规说明
  parts.push(`## 知识文件查阅规范
1. 规范性文件（world_model.md, master_outline.md, arc_outline.md 等）**不预置到上下文中**
2. 当需要参考世界观设定时，调用 read_knowledge_file 工具读取
3. 当需要续写时，先读取 status_card.md 了解当前状态
4. 已归档章节通过 read_chapter 按需读取，不要一次读取多章`)

  const fullPrompt = parts.join('\n\n')

  // 写入缓存
  systemPromptCache.set(cacheKey, { prompt: fullPrompt, timestamp: Date.now() })

  return fullPrompt
}

/**
 * 清空 system prompt 缓存（换书/换作者时手动调用）
 */
export function clearSystemPromptCache(): void {
  systemPromptCache.clear()
}

/**
 * Skill 模式下所有对话共享完整工具集
 */
export function getAgentTools(): ToolDefinition[] {
  return TOOLS_WRITER
}

export function buildFileListHint(files: KnowledgeFile[]): string {
  const knowledgeFiles = files.filter((f) =>
    ['world_model', 'master_outline', 'arc_outline', 'status_card', 'summary', 'style_fingerprint', 'brainstorm', 'error_archive'].includes(f.type),
  )

  if (knowledgeFiles.length === 0) return ''

  const lines = knowledgeFiles.map(
    (f) => `- \`${f.name}\` — ${getFileTypeLabel(f.type)}`,
  )

  return `## 可读取的知识文件\n${lines.join('\n')}\n\n使用 \`read_knowledge_file\` 工具按需读取。`
}

function getFileTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    world_model: '世界观设定',
    style_fingerprint: '文风指纹',
    master_outline: '全书总纲',
    arc_outline: '篇章大纲',
    chapter_outline: '当前章节大纲',
    status_card: '当前状态卡',
    summary: '章节摘要',
    brainstorm: '灵感池',
    error_archive: '错误归档',
  }
  return labels[type] || type
}