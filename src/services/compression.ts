/**
 * 动态记忆压缩系统
 * 四层压缩层级 + 三级水位线 + 里程碑自动压缩
 */

import { chat } from './llm'
import { useMemoryStore } from '../stores/memoryStore'
import { useSettingsStore } from '../stores/settingsStore'
import type { ChapterSummary, CompressionLevel } from '../types'

// ========================================
// 提示词
// ========================================

const T1_SUMMARY_PROMPT = `你是一位小说摘要专家。为给定章节生成简明的摘要。

## 要求
- 长度：100-200 字
- 包含：核心事件、关键转折、重要对话或决策
- 格式：一段连贯的文字，不要分点
- 语言：中文
- 只输出摘要内容，不要加任何前缀或说明`

const T2_BLOCK_PROMPT = `你是一位小说摘要专家。为连续的多章内容生成块摘要。

## 要求
- 长度：300-500 字
- 包含：这几章的情节推进线、主要转折点、新出场的重要人物
- 格式：一段连贯的文字
- 语言：中文
- 只输出摘要内容`

const T3_ARC_PROMPT = `你是一位小说分析专家。为一个完整的故事弧生成深层摘要。

## 要求
- 长度：600-1000 字
- 包含：
  1. 该故事弧的起承转合
  2. 关键冲突和解决方案
  3. 人物的成长弧线
  4. 世界观的重要揭示
- 格式：使用 Markdown 小标题分层
- 语言：中文
- 只输出摘要内容`

const T4_SNAPSHOT_PROMPT = `你是一位小说分析专家。为整本书生成全书快照。

## 要求
- 长度：1500-2500 字
- 包含以下部分（用 Markdown 标题分层）：
  1. 全书概述
  2. 主要人物关系
  3. 世界观核心设定
  4. 主要故事弧线概览
  5. 当前剧情状态
- 语言：中文
- 只输出快照内容`

// ========================================
// 压缩函数
// ========================================

/**
 * 生成 T1 单章摘要
 */
export async function generateT1Summary(
  chapterIndex: number,
  chapterTitle: string,
  chapterContent: string,
): Promise<string> {
  try {
    const result = await chat({
      messages: [
        { role: 'system', content: T1_SUMMARY_PROMPT },
        {
          role: 'user',
          content: `## 第 ${chapterIndex} 章：${chapterTitle}\n\n${chapterContent.slice(0, 4000)}`,
        },
      ],
      maxTokens: 1024,
    })
    return result.trim()
  } catch {
    return `第 ${chapterIndex} 章：${chapterTitle}（摘要生成失败）`
  }
}

/**
 * 生成 T2 块摘要（多章）
 */
export async function generateT2Summary(
  startIndex: number,
  endIndex: number,
  chapters: Array<{ index: number; title: string; content: string }>,
): Promise<string> {
  const chapterText = chapters
    .map((ch) => `## 第 ${ch.index} 章：${ch.title}\n\n${ch.content.slice(0, 1500)}`)
    .join('\n\n')

  try {
    const result = await chat({
      messages: [
        { role: 'system', content: T2_BLOCK_PROMPT },
        {
          role: 'user',
          content: `第 ${startIndex} ~ ${endIndex} 章（共 ${chapters.length} 章）\n\n${chapterText.slice(0, 6000)}`,
        },
      ],
      maxTokens: 1024,
    })
    return result.trim()
  } catch {
    return `第 ${startIndex}-${endIndex} 章（摘要生成失败）`
  }
}

/**
 * 生成 T3 弧摘要
 */
export async function generateT3Summary(
  arcName: string,
  chapters: Array<{ index: number; title: string; content: string }>,
): Promise<string> {
  const chapterText = chapters
    .map((ch) => `### 第 ${ch.index} 章：${ch.title}\n\n${(ch.content || '').slice(0, 2000)}`)
    .join('\n\n')

  try {
    const result = await chat({
      messages: [
        { role: 'system', content: T3_ARC_PROMPT },
        {
          role: 'user',
          content: `## 故事弧：${arcName}\n\n包含章节：第 ${chapters[0].index} ~ ${chapters[chapters.length - 1].index} 章\n\n${chapterText.slice(0, 8000)}`,
        },
      ],
      maxTokens: 2048,
    })
    return result.trim()
  } catch {
    return `## ${arcName}\n\n（摘要生成失败）`
  }
}

/**
 * 生成 T4 全书快照
 */
export async function generateT4Snapshot(
  totalChapters: number,
  chapters: Array<{ index: number; title: string; content: string }>,
): Promise<string> {
  const overview = chapters
    .slice(0, 10)
    .map((ch) => `- 第${ch.index}章 ${ch.title}：${(ch.content || '').slice(0, 100)}`)
    .join('\n')

  try {
    const result = await chat({
      messages: [
        { role: 'system', content: T4_SNAPSHOT_PROMPT },
        {
          role: 'user',
          content: `全书共 ${totalChapters} 章\n\n前 10 章概览：\n${overview}\n\n如需要更多章节信息，请说明。`,
        },
      ],
      maxTokens: 4096,
    })
    return result.trim()
  } catch {
    return `# 全书快照\n\n共 ${totalChapters} 章\n（生成失败）`
  }
}

// ========================================
// 里程碑检测
// ========================================

interface Milestone {
  chapters: number
  type: 't1' | 't2' | 't3' | 't4'
  label: string
}

const MILESTONES: Milestone[] = [
  { chapters: 10, type: 't1', label: '前 10 章做 T1 摘要' },
  { chapters: 20, type: 't2', label: 'ch1-10 降级 T2，新章做 T1' },
  { chapters: 30, type: 't3', label: 'ch1-10 降级 T3，ch11-20 降级 T2，新章做 T1' },
  { chapters: 50, type: 't4', label: '首次生成全书快照' },
  { chapters: 100, type: 't4', label: '刷新全书快照' },
]

/**
 * 检查是否需要执行里程碑压缩
 * 返回当前章节数触发的所有里程碑
 */
export function getTriggeredMilestones(chapterCount: number, previousMilestone: number): Milestone[] {
  return MILESTONES.filter((m) => m.chapters <= chapterCount && m.chapters > previousMilestone)
}

/**
 * 计算可用上下文使用率
 */
export function calculateMemoryUsage(totalTokens: number): number {
  const { settings } = useSettingsStore.getState()
  const windowSize = settings.modelContextWindow || 200000
  const sensitivity = settings.compressionSensitivity / 100 // 0.2 ~ 0.8

  // 压缩敏感度影响水位线位置
  // sensitivity 低 → 提前压缩（水位线降低）, 高 → 延后压缩（水位线升高）
  const adjustedMild = 0.4 * (1 + (sensitivity - 0.5))
  const adjustedModerate = 0.7 * (1 + (sensitivity - 0.5))
  const adjustedDeep = 0.85 * (1 + (sensitivity - 0.5))

  const usage = totalTokens / windowSize

  if (usage >= adjustedDeep) return 3  // deep
  if (usage >= adjustedModerate) return 2  // moderate
  if (usage >= adjustedMild) return 1  // mild
  return 0  // none
}

// ========================================
// 文件生成
// ========================================

/**
 * 构建 chapter_timeline.md 内容
 */
export function buildChapterTimelineMd(summaries: ChapterSummary[]): string {
  const header = '# 章节时间线\n\n'
  const entries = summaries
    .sort((a, b) => b.chapterIndex - a.chapterIndex)
    .map((s) => {
      const levelTag = `[${s.level}]`
      return `### 第 ${s.chapterIndex} 章 ${levelTag}\n\n${s.summary}\n`
    })
    .join('\n')

  return header + entries
}

/**
 * 构建 arc_summary.md 内容
 */
export function buildArcSummaryMd(arcs: Array<{ name: string; summary: string }>): string {
  const header = '# 故事弧摘要\n\n'
  const entries = arcs
    .map((a) => `## ${a.name}\n\n${a.summary}\n`)
    .join('\n')

  return header + entries
}

/**
 * 计算给定章节数应该做哪种压缩
 * 返回需要生成摘要的章节索引范围
 */
export function getCompressionPlan(
  chapterCount: number,
  existingSummaries: ChapterSummary[],
): Array<{
  level: CompressionLevel
  startChapter: number
  endChapter: number
}> {
  const plan: Array<{ level: CompressionLevel; startChapter: number; endChapter: number }> = []

  if (chapterCount >= 10) {
    const existing10 = existingSummaries.find(
      (s) => s.chapterIndex >= 1 && s.chapterIndex <= 10 && s.level === 'T1',
    )
    if (!existing10) {
      plan.push({ level: 'T1', startChapter: 1, endChapter: Math.min(10, chapterCount) })
    }
  }

  if (chapterCount >= 20) {
    const existing1to10T2 = existingSummaries.find(
      (s) => s.chapterIndex >= 1 && s.chapterIndex <= 10 && s.level === 'T2',
    )
    if (!existing1to10T2) {
      plan.push({ level: 'T2', startChapter: 1, endChapter: 10 })
    }

    const existing11to20T1 = existingSummaries.find(
      (s) => s.chapterIndex >= 11 && s.chapterIndex <= 20 && s.level === 'T1',
    )
    if (!existing11to20T1) {
      plan.push({ level: 'T1', startChapter: 11, endChapter: Math.min(20, chapterCount) })
    }
  }

  if (chapterCount >= 30) {
    const existing1to10T3 = existingSummaries.find(
      (s) => s.chapterIndex >= 1 && s.chapterIndex <= 10 && s.level === 'T3',
    )
    if (!existing1to10T3) {
      plan.push({ level: 'T3', startChapter: 1, endChapter: 10 })
    }
    const existing11to20T2 = existingSummaries.find(
      (s) => s.chapterIndex >= 11 && s.chapterIndex <= 20 && s.level === 'T2',
    )
    if (!existing11to20T2) {
      plan.push({ level: 'T2', startChapter: 11, endChapter: 20 })
    }
    const existing21to30T1 = existingSummaries.find(
      (s) => s.chapterIndex >= 21 && s.chapterIndex <= 30 && s.level === 'T1',
    )
    if (!existing21to30T1) {
      plan.push({ level: 'T1', startChapter: 21, endChapter: Math.min(30, chapterCount) })
    }
  }

  return plan
}
