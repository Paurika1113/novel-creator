/**
 * Agent 系统提示词、工具定义、上下文装配器
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
          description: '文件名，如 world_model.md, master_outline.md, arc_outline.md, chapter_outline.md, status_card.md, summary.md, style_fingerprint.md, brainstorm.md, error_archive.md',
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
    description: '将完整的章节正文草稿写入 chapter_draft.md。⚠️ content 参数中必须包含 <Main text> 和 </Main text> 标签，只有标签内的纯正文才会被写入文件。标签外可以放简短说明，但正文必须完整包裹在标签内。',
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

// 各 Agent 的工具列表

const TOOL_WRITE_KNOWLEDGE: ToolDefinition = {
  type: 'function',
  function: {
    name: 'write_knowledge_file',
    description: '写入或覆盖一个知识文件的内容',
    parameters: {
      type: 'object',
      properties: {
        fileName: {
          type: 'string',
          description: '要写入的文件名（如 chapter_outline.md, arc_outline.md, world_model.md）',
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

const TOOLS_WRITER: ToolDefinition[] = [
  TOOL_READ_FILE,
  TOOL_READ_DRAFT,
  TOOL_WRITE_DRAFT,
  TOOL_APPEND_DRAFT,
  TOOL_LIST_CHAPTERS,
  TOOL_READ_CHAPTER,
  TOOL_WRITE_KNOWLEDGE,
]

const TOOLS_REVIEW: ToolDefinition[] = [
  TOOL_READ_FILE,
  TOOL_READ_DRAFT,
  TOOL_LIST_CHAPTERS,
  TOOL_READ_CHAPTER,
]

const TOOLS_WORLD: ToolDefinition[] = [
  TOOL_READ_FILE,
  TOOL_READ_DRAFT,
  TOOL_LIST_CHAPTERS,
  TOOL_READ_CHAPTER,
  {
    type: 'function',
    function: {
      name: 'write_knowledge_file',
      description: '写入或覆盖一个知识文件的内容',
      parameters: {
        type: 'object',
        properties: {
          fileName: {
            type: 'string',
            description: '要写入的文件名（如 world_model.md）',
          },
          content: {
            type: 'string',
            description: '文件全文 Markdown',
          },
        },
        required: ['fileName', 'content'],
      },
    },
  },
]

const TOOLS_STYLE: ToolDefinition[] = [
  TOOL_READ_FILE,
  TOOL_READ_DRAFT,
  TOOL_LIST_CHAPTERS,
  TOOL_READ_CHAPTER,
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
4. 使用中文回复，保持专业、精准、有建设性的语气`

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
 * 缓存 key = agentType + personaId + bookTitle
 * 相同输入重复拼接纯属浪费 token——模型每次收到的 system prompt 完全一样
 * 换书/换作者时缓存自动失效
 */
const systemPromptCache = new Map<string, { prompt: string; timestamp: number }>()
const SYSTEM_PROMPT_CACHE_TTL = 5 * 60 * 1000 // 5 分钟 TTL，防止极端情况下的内存泄漏

function buildSystemPromptCacheKey(args: {
  agentType: string
  persona: Persona | null
  bookTitle?: string
}): string {
  return `${args.agentType}:${args.persona?.id || 'nobody'}:${args.bookTitle || 'nobook'}`
}

/**
 * 获取各 Agent 的系统提示词（带缓存）
 */
export function buildSystemPrompt(args: {
  agentType: string
  persona: Persona | null
  bookTitle?: string
  bookType?: string
  mainCharacter?: string
}): string {
  const { agentType, persona, bookTitle = '', bookType = '', mainCharacter = '' } = args

  // 检查缓存
  const cacheKey = buildSystemPromptCacheKey({ agentType, persona, bookTitle })
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

  // Agent 专有层
  const agentPrompt = getAgentSpecificPrompt(agentType)
  if (agentPrompt) parts.push(agentPrompt)

  // 知识合规说明
  parts.push(`## 知识文件查阅规范
1. 规范性文件（world_model.md, master_outline.md, arc_outline.md 等）**不预置到上下文中**
2. 当需要参考世界观设定时，调用 read_knowledge_file 工具读取
3. 当需要续写时，先读取 status_card.md 了解当前状态，再调用 read_current_draft 读取草稿
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
 * 各 Agent 专有提示
 */
function getAgentSpecificPrompt(agentType: string): string {
  switch (agentType) {
    case 'continuation':
      return `## 你的角色：续写 Agent

你的职责是根据大纲和已有内容，为作者创作下一章或续写当前章节。

### 工作流程
1. 首先调用 read_knowledge_file 读取 status_card.md 了解当前写作进度
2. 读取 master_outline.md（全书总纲）了解全书结构
3. 调用 list_chapters 获取已归档章节列表，确定当前进度
4. **生成/更新大纲（关键步骤）**：
   - 调用 read_knowledge_file 读取 chapter_outline.md（当前章纲）
   - 如果当前是某卷的第一章，还需读取 arc_outline.md（卷纲）。若卷纲为空，**必须先使用 write_knowledge_file 生成该卷的卷纲**，再生成章纲
   - 使用 write_knowledge_file 更新 chapter_outline.md，写入**下一章**的详细大纲（包含：场景、人物、情节推进、悬念设置）
5. 读取最近一章（上一章）内容以保持连续性
6. 根据生成的大纲，调用 write_current_draft 撰写**下一章**草稿

### 重要规则
- **必须明确知道当前章节编号**：通过 list_chapters 和 status_card.md 确认
- **生成的是下一章，不是当前章**：如果已有3章，你应该创作第4章
- 章纲中必须明确标注章节编号（如：第4章）
- 草稿写入 chapter_draft.md，这是新章节的草稿，不是修改已有章节

### 大纲格式要求
**章纲（chapter_outline.md）格式**：
\`\`\`
# 第X章：章节标题

## 场景设定
- 时间：
- 地点：
- 氛围：

## 出场人物
- 主要人物及目标

## 情节推进
1. 开端：
2. 发展：
3. 高潮：
4. 结尾/悬念：

## 与前后文的关联
- 承接：
- 伏笔：
\`\`\`

**卷纲（arc_outline.md）格式**（仅每卷第一章需要）：
\`\`\`
# 第X卷：卷标题

## 卷概要
- 核心冲突：
- 情感主线：

## 本卷章节规划
- 第X章 ~ 第Y章：
- 每章的核心事件（简述）

## 卷终目标
- 人物成长：
- 剧情推进：
\`\`\`

### 创作要求
- 每章 2000-5000 字，必须是**完整的叙事正文**（场景描写+人物对话+情节推进），**严禁**写成概要、大纲、分析报告或章节规划
- **正文格式要求（极其重要）**：你可以在聊天中先说一句简短总结，但**小说正文本身必须用一对标签包裹**，工具执行引擎会只提取标签内的内容写入文件：

\`\`\`
<Main text>
# 第X章：标题

（你的正文从这里开始...）
</Main text>
\`\`\`

- **不要**把标签放在代码块（\\\`\\\`\\\`）里面，标签就是纯文本
- 标签外的文字（如"好的，以下是大纲…"）不会被写入文件，你可以自由使用
- 每一章结尾保持悬念或推进感
- 对话自然，符合人物性格设定
- 描写有画面感，不堆砌空洞形容词
- 保持与前文一致的视角和叙事手法
- 生成完草稿后，调用 write_current_draft 将**完整正文（含 <Main text> 标签）**写入 chapter_draft.md
- 修改已有草稿后，同样必须调用 write_current_draft 写入**完整修改后**的正文（包含 <Main text> 标签），不要只输出修改片段
- **禁止**在聊天中长篇描述草稿内容、列出篇幅统计、总结亮点——直接调用 write_current_draft 写入正文即可

### ⚠️ write_current_draft 调用铁律（违反将导致内容丢失）
- content 参数中 <Main text> 标签内必须包含**100%完整的小说正文**，一个字都不能少
- **绝对禁止**使用占位文字如"如上所示"、"内容同上"、"正文已在上方输出"、"请参见上文"等
- 聊天中可以说一句简短提示（如"正在重写草稿…"），但**正文的全部内容必须原样放入标签内**
- 标签内不是"引用"或"参见"聊天内容，而是**把正文完整复制到标签里**`

    case 'review':
      return `## 你的角色：审核 Agent

你的职责是从五个维度审核草稿质量，输出结构化报告。

### 五级审核标准
1. **世界观一致性**：检查是否有与 world_model.md 冲突的描写
2. **大纲匹配度**：检查是否偏离 master_outline.md 的路线规划
3. **前文连续性**：检查与前文在人物、事件、时间线上有无矛盾
4. **文风一致性**：检查与已绑定的作者身份文风是否一致
5. **文本质量**：检查错别字、语病、逻辑漏洞

### 工作流程
1. 读取 world_model.md, master_outline.md, arc_outline.md
2. 阅读最近 3 章归档章节和当前草稿
3. 输出结构化的审核报告
4. 每个维度给出评分（1-5）、是否通过、问题列表、改进建议`

    case 'world':
      return `## 你的角色：世界观 Agent

你的职责是从已写章节中提取、梳理和维护小说的世界观设定。

### 世界观文件结构（world_model.md）
\`\`\`
# 世界观设定

## 地理
- 列出所有重要地点及其特征

## 势力
- 列出所有组织/势力及其关系

## 力量体系
- 修真等级 / 魔法体系 / 科技水平等

## 种族 / 物种
- 不同种族的特征和关系

## 规则
- 世界运转的核心规则和限制
\`\`\`

### 工作流程
1. 列出所有已归档章节
2. 逐章阅读，提取世界观要素
3. 产出或更新 world_model.md`

    case 'style':
      return `## 你的角色：文风 Agent

你的职责是分析作者文字的风格特征，维护 style_fingerprint.md。

### 分析维度
1. **语言层**：词汇偏好、句式复杂度、方言/术语使用
2. **叙事层**：视角选择、时间处理、描写与对话的比例
3. **结构层**：章节长度规律、叙事节奏、悬念布局
4. **风格标签**：整体倾向、修辞偏好、描写重心、叙事距离

### 工作流程
1. 读取已归档章节
2. 从多个维度分析文风特征
3. 产出风格分析报告`

    default:
      return ''
  }
}

/**
 * 将知识文件列表映射为可供 AI 读取的文件清单提示
 */
/**
 * 根据 Agent 类型返回对应的工具列表
 */
export function getAgentTools(agentType: string): ToolDefinition[] {
  switch (agentType) {
    case 'continuation': return TOOLS_WRITER
    case 'review': return TOOLS_REVIEW
    case 'world': return TOOLS_WORLD
    case 'style': return TOOLS_STYLE
    default: return []
  }
}

export function buildFileListHint(files: KnowledgeFile[]): string {
  const knowledgeFiles = files.filter((f) =>
    ['world_model', 'master_outline', 'arc_outline', 'chapter_outline', 'status_card', 'summary', 'style_fingerprint', 'brainstorm', 'error_archive'].includes(f.type),
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
