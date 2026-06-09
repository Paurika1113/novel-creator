/**
 * 事件图谱分析服务 —— LLM 驱动的事件/线程提取
 */

import { chat } from './llm'
import type { ThreadEvent } from '../types'

const ANALYSIS_PROMPT = `你是一位叙事分析专家，擅长从小说章节中提取事件图谱。

分析给出的章节，输出结构化的 JSON 数据。包含：
1. new_events: 本章发生的新事件
2. new_characters: 本章首次出场的人物
3. resolved_events: 本章得到解决的前置事件 ID
4. referenced_threads: 本章涉及的故事线程名
5. key_locations: 本章出现的关键地点

每个事件包含：
- type: 事件类型（conflict/dialogue/discovery/romance/action/worldbuilding）
- description: 一句话描述（20字以内）
- participants: 参与该事件的角色名列表
- threads: 该事件归属的故事线程名
- status: advancing（推进中）/ resolved（已解决）/ dormant（休眠）

## 输出格式
必须严格输出以下 JSON 格式，不要包含其他文字：
{
  "chapter": 1,
  "new_events": [
    {
      "id": "evt-001-01",
      "type": "conflict",
      "description": "简短描述",
      "participants": ["角色A"],
      "threads": ["线程名"],
      "status": "advancing"
    }
  ],
  "new_characters": [],
  "resolved_events": [],
  "referenced_threads": [],
  "key_locations": []
}`

interface EventAnalysisInput {
  chapterIndex: number
  chapterTitle: string
  chapterContent: string
  existingThreads?: Array<{ name: string; status: string }>
}

export interface EventAnalysisResult {
  chapter: number
  new_events: ThreadEvent[]
  new_characters: string[]
  resolved_events: string[]
  referenced_threads: string[]
  key_locations: string[]
}

/**
 * 分析章节事件
 */
export async function analyzeChapterEvents(
  input: EventAnalysisInput,
): Promise<EventAnalysisResult> {
  const threadContext = input.existingThreads?.length
    ? `已有故事线程：${input.existingThreads.map((t) => `[${t.status}] ${t.name}`).join('、')}`
    : '暂无已有故事线程。'

  const userPrompt = `## 章节信息
- 章节：第 ${input.chapterIndex} 章
- 标题：${input.chapterTitle}

${threadContext}

## 章节内容
${input.chapterContent.slice(0, 6000)}

请分析上述章节，提取事件图谱。`

  try {
    const result = await chat({
      messages: [
        { role: 'system', content: ANALYSIS_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      maxTokens: 4096,
    })

    return parseEventResult(result, input.chapterIndex)
  } catch (err) {
    console.warn('[事件分析失败]', err)
    // Return a minimal result on failure
    return {
      chapter: input.chapterIndex,
      new_events: [],
      new_characters: [],
      resolved_events: [],
      referenced_threads: ['主线'],
      key_locations: [],
    }
  }
}

/**
 * 从 LLM 返回的文本中提取 JSON
 * 支持 markdown 代码块包裹和普通 JSON 文本
 */
function extractJsonFromText(text: string): string | null {
  // 先尝试匹配 markdown 代码块
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }

  // 再尝试匹配最外层的大括号
  const braceMatch = text.match(/\{[\s\S]*\}/)
  if (braceMatch) {
    return braceMatch[0]
  }

  return null
}

function parseEventResult(raw: string, chapterIndex: number): EventAnalysisResult {
  const jsonStr = extractJsonFromText(raw)
  if (!jsonStr) {
    throw new Error('LLM 返回格式异常')
  }

  try {
    const data = JSON.parse(jsonStr)
    return {
      chapter: data.chapter || chapterIndex,
      new_events: (data.new_events || []).map((evt: Record<string, unknown>, i: number) => ({
        id: evt.id || `evt-${String(chapterIndex).padStart(3, '0')}-${String(i + 1).padStart(2, '0')}`,
        chapter: chapterIndex,
        type: (evt.type as ThreadEvent['type']) || 'dialogue',
        description: (evt.description as string) || '',
        participants: Array.isArray(evt.participants) ? evt.participants as string[] : [],
        threads: Array.isArray(evt.threads) ? evt.threads as string[] : ['主线'],
        status: (evt.status as ThreadEvent['status']) || 'advancing',
        new_characters: [],
        key_locations: [],
      })),
      new_characters: Array.isArray(data.new_characters) ? data.new_characters as string[] : [],
      resolved_events: Array.isArray(data.resolved_events) ? data.resolved_events as string[] : [],
      referenced_threads: Array.isArray(data.referenced_threads) && (data.referenced_threads as string[]).length > 0
        ? data.referenced_threads as string[]
        : ['主线'],
      key_locations: Array.isArray(data.key_locations) ? data.key_locations as string[] : [],
    }
  } catch {
    throw new Error('JSON 解析失败')
  }
}

/**
 * 构建 active_elements.md 内容
 */
export function buildActiveElementsMd(
  threads: Array<{ name: string; status: string; lastMentionedChapter: number; relatedChapters: number[] }>,
): string {
  const header = `# 当前活跃线程（第 ${Math.max(...threads.map((t) => t.lastMentionedChapter), 0)} 章）\n\n`
  const separator = '| 线程 | 状态 | 距上次提及 | 关联章节 |\n|------|------|----------|----------|\n'

  const rows = threads
    .filter((t) => t.status !== 'resolved') // skip resolved
    .sort((a, b) => {
      const order: Record<string, number> = { advancing: 0, dormant: 1 }
      return (order[a.status] ?? 99) - (order[b.status] ?? 99)
    })
    .map((t) => {
      const latestChapter = Math.max(...t.relatedChapters)
      const distance = latestChapter > 0 ? `ch-${latestChapter}` : '—'
      return `| ${t.name} | ${statusLabel(t.status)} | ${distance} | ${t.relatedChapters.slice(-3).join(', ')} |`
    })
    .join('\n')

  return header + separator + rows + '\n'
}

function statusLabel(s: string): string {
  const map: Record<string, string> = { advancing: '推进中', dormant: '休眠中', resolved: '已回收' }
  return map[s] || s
}
