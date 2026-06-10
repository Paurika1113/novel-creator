// ========================================
// Novel Creator — 核心类型定义
// ========================================

// -------- 书籍 --------
export interface Book {
  id: string
  title: string
  type: BookType
  description: string
  mainCharacter: string // 主角名
  createdAt: string
  updatedAt: string
  chapterCount: number
  wordCount: number
  gitBranchCount: number
  readingProgress: number // 0-100
  boundPersonaId: string | null // 绑定的作者身份 ID
  currentBranch: string
}

export type BookType = '玄幻' | '都市' | '科幻' | '仙侠' | '历史' | '悬疑' | '言情' | '其他'

// -------- 章节 --------
export interface Chapter {
  index: number
  title: string
  fileName: string // e.g. "001-第一章.md"
  wordCount: number
  createdAt: string
  updatedAt: string
}

// -------- 作者身份 (Persona) --------
export interface Persona {
  id: string
  name: string
  createdAt: string
  sourceBookIds: string[]
  analysisStatus: 'idle' | 'analyzing' | 'completed' | 'failed'
  styleProfile: StyleProfile
  manualOverrides: Record<keyof StyleProfile, boolean>
}

export interface StyleProfile {
  lexical: string          // 语言层描述
  narrative: string        // 叙事层描述
  structural: string       // 结构层描述
  stylistic: StylisticTags // 风格标签
}

export interface StylisticTags {
  overallTendency: string
  rhetoricPreference: string[]
  descriptionFocus: string[]
  narrativeDistance: string
}

// -------- 知识文件 --------
export interface KnowledgeFile {
  name: string
  path: string
  type: KnowledgeFileType
  content: string
  updatedAt: string
}

export type KnowledgeFileType =
  | 'world_model'
  | 'style_fingerprint'
  | 'master_outline'
  | 'arc_outline'
  | 'chapter_outline'
  | 'status_card'
  | 'brainstorm'
  | 'error_archive'
  | 'summary'
  | 'chapter_draft'
  | 'chapter'
  | 'other'

// -------- Git --------
export interface GitCommit {
  hash: string
  message: string
  author: string
  date: string
  branch: string
}

export interface GitBranch {
  name: string
  isCurrent: boolean
  commitCount: number
  lastCommitDate: string
}

export interface GitDiff {
  filePath: string
  additions: number
  deletions: number
  hunks: DiffHunk[]
}

export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  content: string
}

// -------- AI Agent / Skill --------
export type AgentType = 'continuation' | 'world' | 'review' | 'style'

/** @deprecated 保留用于类型兼容 */
export interface AgentConfig {
  type: AgentType
  label: string
  color: string
  icon: string
  description: string
}

/** Skill 替代 Agent：用户通过提示词触发，不再需要切换 Agent 标签页 */
export type SkillId = 'outline' | 'write_chapter' | 'continue_draft' | 'review_draft' | 'polish_style' | 'world_build' | 'summarize'

export interface SkillDef {
  id: SkillId
  icon: string
  label: string
  prompt: string                     // 发送给 AI 的用户指令
  needsDraft: boolean                // 是否需要当前有草稿
  needsChapters: boolean             // 是否需要已有归档章节
  primary: boolean                   // 是否为主操作按钮
}

export const SKILLS: SkillDef[] = [
  {
    id: 'write_chapter',
    icon: '➕',
    label: '写新章',
    prompt: `请根据全书总纲和当前进度，撰写全新的一章。
执行步骤：
1. 先读取 status_card.md 了解当前写作进度
2. 读取 master_outline.md 了解全书规划
3. 读取 chapter_outline.md 获取本章大纲（如有）
4. 撰写新章节正文，用 <Main text> 标签包裹
5. 完成后调用 write_current_draft 写入草稿`,
    needsDraft: false,
    needsChapters: false,
    primary: true,
  },
  {
    id: 'continue_draft',
    icon: '✏️',
    label: '续写',
    prompt: `请读取当前草稿 chapter_draft.md，在末尾继续追加内容，保持叙事连贯。
先用 append_to_draft 追加，完成后调用 write_current_draft 保存。`,
    needsDraft: true,
    needsChapters: false,
    primary: false,
  },
  {
    id: 'review_draft',
    icon: '📋',
    label: '审核',
    prompt: `请从以下五个维度审核当前草稿，输出结构化审核报告：
1. 世界观一致性
2. 大纲匹配度
3. 前文连续性（需读取最近章节）
4. 文风一致性
5. 文本质量
如有问题，给出具体修改建议。`,
    needsDraft: true,
    needsChapters: false,
    primary: false,
  },
  {
    id: 'polish_style',
    icon: '🎨',
    label: '润色',
    prompt: `请读取当前草稿，从语言层（词汇、句式、修辞）、叙事层（视角、节奏、描写比例）和结构层（段落、悬念）进行润色优化。
完成后用 write_current_draft 覆盖原草稿。`,
    needsDraft: true,
    needsChapters: false,
    primary: false,
  },
  {
    id: 'world_build',
    icon: '🌍',
    label: '世界观',
    prompt: `请读取已归档章节，提取和整理世界观设定，生成或更新 world_model.md。
包含：世界背景、势力分布、力量体系、关键地点、特殊规则等。`,
    needsDraft: false,
    needsChapters: true,
    primary: false,
  },
  {
    id: 'outline',
    icon: '📝',
    label: '大纲',
    prompt: `请为下一章生成详细大纲，写入 chapter_outline.md。
包含：章节概要、主要场景、出场人物、关键情节节点、与前后章节的衔接。`,
    needsDraft: false,
    needsChapters: false,
    primary: false,
  },
  {
    id: 'summarize',
    icon: '🔄',
    label: '摘要',
    prompt: `请读取已归档章节，重新生成章节摘要，更新 summary.md 和 status_card.md。`,
    needsDraft: false,
    needsChapters: true,
    primary: false,
  },
]

/** @deprecated 保留用于类型兼容，新代码请用 SKILLS */
export const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  continuation: { type: 'continuation', label: '续写', color: '#7c5cfc', icon: '✍️', description: '根据大纲续写章节内容' },
  world: { type: 'world', label: '世界观', color: '#2196F3', icon: '🌍', description: '提取和维护世界观设定' },
  review: { type: 'review', label: '审核', color: '#f44336', icon: '📋', description: '五级审核草稿质量' },
  style: { type: 'style', label: '文风', color: '#4CAF50', icon: '🎨', description: '分析文风一致性' },
}

// -------- AI 对话消息 --------
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  agentType: AgentType
  timestamp: string
  toolCalls?: ToolCall[]
  status?: 'sending' | 'sent' | 'error'
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
  result?: string
  status: 'pending' | 'success' | 'error'
}

// -------- 记忆压缩系统 --------
export interface WaterLevel {
  mild: number      // 默认 0.4
  moderate: number  // 默认 0.7
  deep: number      // 默认 0.85
}

export type CompressionLevel = 'T0' | 'T1' | 'T2' | 'T3' | 'T4'

export interface ChapterSummary {
  chapterIndex: number
  level: CompressionLevel
  summary: string
}

export interface ThreadEvent {
  id: string
  chapter: number
  type: 'conflict' | 'dialogue' | 'discovery' | 'romance' | 'action' | 'worldbuilding'
  description: string
  participants: string[]
  threads: string[]
  status: 'advancing' | 'resolved' | 'dormant'
  new_characters: string[]
  key_locations: string[]
}

export interface ThreadInfo {
  name: string
  status: 'advancing' | 'dormant' | 'resolved'
  lastMentionedChapter: number
  relatedChapters: number[]
}

// -------- 正文交付状态 --------
export type DraftStatus = 'idle' | 'draft_ready' | 'editing' | 'reviewing' | 'archiving' | 'archived'

export interface ReviewReport {
  worldview: ReviewItem
  outline: ReviewItem
  continuity: ReviewItem
  style: ReviewItem
  quality: ReviewItem
}

export interface ReviewItem {
  score: number // 1-5
  passed: boolean
  issues: string[]
  suggestions: string[]
}

// -------- 设置 --------

/** 一个已保存的模型配置 */
export interface SavedModel {
  name: string
  contextWindow: number
}

export interface AppSettings {
  provider: string
  apiKey: string
  baseUrl: string
  model: string // 当前选中的模型名
  modelContextWindow: number // tokens, 当前选中的上下文窗口
  savedModels: SavedModel[]   // 保存的模型列表（同一 API Key 下）
  compressionSensitivity: number // 20-80, default 40
  theme: 'light' | 'dark' | 'system'
  fetchedModels: string[] // 从 /v1/models 获取的模型列表
  authorName: string
  authorBio: string
  authorAvatar: string
}
