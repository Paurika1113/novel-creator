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

// -------- AI Agent --------
export type AgentType = 'continuation' | 'world' | 'review' | 'style'

export interface AgentConfig {
  type: AgentType
  label: string
  color: string
  icon: string
  description: string
}

export const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  continuation: {
    type: 'continuation',
    label: '续写',
    color: '#7c5cfc',
    icon: '✍️',
    description: '根据大纲续写章节内容',
  },
  world: {
    type: 'world',
    label: '世界观',
    color: '#2196F3',
    icon: '🌍',
    description: '提取和维护世界观设定',
  },
  review: {
    type: 'review',
    label: '审核',
    color: '#f44336',
    icon: '📋',
    description: '五级审核草稿质量',
  },
  style: {
    type: 'style',
    label: '文风',
    color: '#4CAF50',
    icon: '🎨',
    description: '分析文风一致性',
  },
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
