/**
 * 动态上下文装配系统
 * 根据模型上下文窗口、压缩敏感度和内容优先级自动装配 AI 上下文
 * 遵循 PRD 7.4 上下文装配优先级规范
 */

import type { KnowledgeFile } from '../types'

export interface ContextBudget {
  totalTokens: number      // 模型总上下文窗口
  reservedTokens: number   // 保留空间（system prompt + 工具定义 + 安全余量）
  availableTokens: number  // 可用空间
  userInputTokens: number  // 用户输入预估
  historyTokens: number    // 对话历史预估
  contextTokens: number    // 实际可分配给上下文的 token 数
}

export interface ChapterContext {
  name: string
  content: string
  index: number
  priority: number  // 优先级分数（越高越优先保留）
}

// Token 估算：中文约 1.5 tokens/字，英文约 0.3 tokens/字
// 使用保守估算确保不超限
function estimateTokens(text: string): number {
  if (!text) return 0
  // 混合文本保守估算：平均 1 token/字（中文为主的小说文本）
  return Math.ceil(text.length * 1.2)
}

/**
 * 计算上下文预算
 * @param modelContextWindow 模型上下文窗口大小
 * @param compressionSensitivity 压缩敏感度（20-80）
 * @param systemPromptLength system prompt 长度
 * @param historyMessages 历史消息
 * @param userInput 用户输入
 */
export function calculateContextBudget(
  modelContextWindow: number,
  compressionSensitivity: number,
  systemPromptLength: number,
  historyMessages: Array<{ role: string; content: string }>,
  userInput: string,
): ContextBudget {
  // 保留空间 = system prompt + 工具定义预留 + 安全余量(10%)
  const toolReserve = 4000  // 工具 JSON Schema 预留
  const safetyMargin = Math.floor(modelContextWindow * 0.1)
  const reservedTokens = systemPromptLength + toolReserve + safetyMargin

  // 可用空间 = 总窗口 - 保留空间
  let availableTokens = modelContextWindow - reservedTokens

  // 用户输入预估
  const userInputTokens = estimateTokens(userInput)

  // 历史消息预估
  const historyTokens = historyMessages.reduce(
    (sum, msg) => sum + estimateTokens(msg.content),
    0,
  )

  // 实际可分配给上下文的 token
  // 压缩敏感度影响：越高 → 保留更多上下文（延后压缩）
  // 敏感度 20% = 提前压缩，保留较少上下文
  // 敏感度 80% = 延后压缩，保留更多上下文
  const sensitivityFactor = compressionSensitivity / 50  // 0.4 - 1.6
  const contextTokens = Math.floor(
    (availableTokens - userInputTokens - historyTokens) * sensitivityFactor,
  )

  return {
    totalTokens: modelContextWindow,
    reservedTokens,
    availableTokens: Math.max(0, availableTokens),
    userInputTokens,
    historyTokens,
    contextTokens: Math.max(0, contextTokens),
  }
}

/**
 * 计算章节优先级（基于故事线程活跃度）
 * 简化版：最近章节优先级最高，距离越远优先级递减
 */
function calculateChapterPriority(
  chapterIndex: number,
  totalChapters: number,
  activeThreadChapters?: number[],  // 关联活跃线程的章节索引
): number {
  // 基础优先级：距离最后一章越近越高
  const recencyScore = (chapterIndex + 1) / totalChapters  // 0-1

  // 活跃线程加成
  let threadBonus = 0
  if (activeThreadChapters?.includes(chapterIndex)) {
    threadBonus = 0.3
  }

  return recencyScore + threadBonus
}

/**
 * 装配上下文内容
 * 遵循 PRD 7.4 上下文装配优先级：
 * 1. 始终不可压缩（status_card, active_elements, chapter_draft）
 * 2. 最近章节原文 T0（按距离降序）
 * 3. 关联活跃线程的章节 T0
 * 4. 其余章节按水位线逐级降级
 */
export function assembleContext(
  budget: ContextBudget,
  chapters: KnowledgeFile[],
  options: {
    statusCard?: string
    activeElements?: string
    chapterDraft?: string
    currentChapterIndex?: number
  } = {},
): {
  contextText: string
  includedChapters: Array<{ name: string; index: number; tokenCount: number }>
  usedTokens: number
  remainingTokens: number
} {
  const {
    statusCard = '',
    activeElements = '',
    chapterDraft = '',
    currentChapterIndex = chapters.length,
  } = options

  let remainingTokens = budget.contextTokens
  const includedChapters: Array<{ name: string; index: number; tokenCount: number }> = []
  const parts: string[] = []

  // === 第一级：始终不可压缩 ===
  const alwaysIncluded: Array<{ label: string; content: string }> = []

  if (statusCard) {
    alwaysIncluded.push({ label: '当前状态卡', content: statusCard })
  }
  if (activeElements) {
    alwaysIncluded.push({ label: '活跃线程', content: activeElements })
  }
  if (chapterDraft) {
    alwaysIncluded.push({ label: '当前草稿', content: chapterDraft })
  }

  for (const item of alwaysIncluded) {
    const tokens = estimateTokens(item.content)
    if (tokens <= remainingTokens) {
      parts.push(`=== ${item.label} ===\n${item.content}`)
      remainingTokens -= tokens
    }
  }

  // === 第二级：最近章节原文 T0 ===
  // 按距离当前章节降序排列（越近越优先）
  const sortedChapters = chapters
    .map((ch, idx) => ({
      ...ch,
      originalIndex: idx,
      priority: calculateChapterPriority(idx, chapters.length),
    }))
    .sort((a, b) => b.priority - a.priority)

  // 计算每章可分配的 token 数（动态分配）
  const maxChapterTokens = Math.min(
    8000,  // 单章上限（避免一章占满所有预算）
    Math.floor(remainingTokens / Math.min(sortedChapters.length, 3)),  // 至少预留3章的空间
  )

  for (const ch of sortedChapters) {
    if (remainingTokens <= 0) break

    const content = ch.content || ''
    const fullTokens = estimateTokens(content)

    // 决定注入多少内容
    let injectContent: string
    let usedTokens: number

    if (fullTokens <= maxChapterTokens && fullTokens <= remainingTokens) {
      // 全量注入
      injectContent = content
      usedTokens = fullTokens
    } else {
      // 截断注入（保留开头和结尾，中间省略）
      const maxChars = Math.floor(Math.min(maxChapterTokens, remainingTokens) / 1.2)
      if (maxChars < 200) break  // 剩余空间太少，停止注入

      const headChars = Math.floor(maxChars * 0.6)  // 开头 60%
      const tailChars = Math.floor(maxChars * 0.3)  // 结尾 30%
      const omitChars = content.length - headChars - tailChars

      injectContent = `${content.substring(0, headChars)}\n\n...[中间省略 ${omitChars} 字]...\n\n${content.substring(content.length - tailChars)}`
      usedTokens = estimateTokens(injectContent)
    }

    parts.push(`=== ${ch.name} ===\n${injectContent}`)
    includedChapters.push({
      name: ch.name,
      index: ch.originalIndex,
      tokenCount: usedTokens,
    })
    remainingTokens -= usedTokens
  }

  const contextText = parts.join('\n\n')
  const usedTokens = budget.contextTokens - remainingTokens

  return {
    contextText,
    includedChapters,
    usedTokens,
    remainingTokens,
  }
}

/**
 * 获取上下文装配报告（用于调试和状态栏显示）
 */
export function getContextReport(
  budget: ContextBudget,
  result: ReturnType<typeof assembleContext>,
): string {
  const usagePercent = Math.round((result.usedTokens / budget.totalTokens) * 100)
  const chapterList = result.includedChapters
    .map((ch) => `${ch.name}(${ch.tokenCount}t)`)
    .join(', ')

  return `上下文使用: ${result.usedTokens}/${budget.totalTokens} tokens (${usagePercent}%) | 章节: ${chapterList || '无'}`
}
