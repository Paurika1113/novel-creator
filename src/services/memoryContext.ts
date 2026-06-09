/**
 * 记忆上下文 —— 为 AI 提供跨会话的写作状态感知
 * 
 * 每次发起 AI 请求前，从当前书籍的已写文件和状态中
 * 组装一份简洁的"记忆上下文"，让 AI 了解当前写到哪了、
 * 有什么活跃的线索、以及最近章节发生了什么。
 * 
 * 对应 PRD 功能 7（动态记忆压缩）和功能 8（知识文件系统）
 */

import type { KnowledgeFile } from '../types'

/**
 * 构建记忆上下文文本
 * 输出 ≤ 400 token 的浓缩状态描述
 */
export function buildMemoryContext(
  files: KnowledgeFile[],
  options: {
    chapterCount: number
    wordCount: number
  },
): string {
  const { chapterCount, wordCount } = options

  const parts: string[] = []

  // 1. 写作进度
  parts.push(`## 写作进度
- 已归档章节: ${chapterCount} 章
- 总字数: ${(wordCount / 10000).toFixed(1)} 万字
- 当前阶段: ${getCurrentPhase(files)}`)

  // 2. 活跃故事线程（从 active_elements.md 提取概要）
  const activeElementsFile = files.find((f) => f.path === 'summary/active_elements.md')
  if (activeElementsFile?.content) {
    // 只取线程概览部分，限制长度
    const threadLines = extractThreadSummary(activeElementsFile.content)
    if (threadLines) {
      parts.push(`## 活跃故事线程\n${threadLines}`)
    }
  }

  // 3. 最近一章的标题和关键词
  const chapters = files.filter((f) => f.type === 'chapter').sort((a, b) => b.path.localeCompare(a.path))
  const lastChapter = chapters[0]
  if (lastChapter) {
    const preview = lastChapter.content?.slice(0, 200).replace(/#/g, '').trim() || ''
    parts.push(`## 最近一章\n- 章节: ${lastChapter.name}\n- 开头: ${preview}${preview.length >= 200 ? '…' : ''}`)
  }

  // 4. 当前草稿状态
  const draftFile = files.find((f) => f.path === 'drafts/chapter_draft.md')
  if (draftFile?.content) {
    const draftLen = draftFile.content.length
    parts.push(`## 当前草稿\n状态: ${draftLen > 0 ? `有未归档草稿（${draftLen} 字）` : '无未归档草稿'}`)
  } else {
    parts.push(`## 当前草稿\n状态: 无未归档草稿`)
  }

  return parts.join('\n\n')
}

/**
 * 从 active_elements.md 中提取线程摘要
 */
function extractThreadSummary(content: string): string | null {
  // 尝试找到线程表部分（兼容 LF 和 CRLF 行尾）
  const tableMatch = content.match(/\| 线程.*\|.*\r?\n\|[-| ]+\|[\s\S]*?(?=\r?\n\r?\n|\r?\n#|$)/)
  if (tableMatch) {
    const lines = tableMatch[0].split(/\r?\n/).slice(0, 6) // 最多取 5 行 + 表头
    return lines.join('\n')
  }

  // 无表格时取前 200 字
  const plain = content.replace(/#/g, '').trim().slice(0, 200)
  return plain || null
}

/**
 * 根据文件推断当前写作阶段
 */
function getCurrentPhase(files: KnowledgeFile[]): string {
  const draft = files.find((f) => f.path === 'drafts/chapter_draft.md')
  const chapters = files.filter((f) => f.type === 'chapter')

  if (draft?.content) return '草稿写作中'
  if (chapters.length === 0) return '尚未开始'
  return '准备下一章'
}
