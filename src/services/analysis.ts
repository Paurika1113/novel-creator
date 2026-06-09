/**
 * 作者身份分析管线 —— 调用 LLM 执行四维文风分析
 */

import { chat } from './llm'
import type { StyleProfile, StylisticTags } from '../types'

const ANALYSIS_SYSTEM_PROMPT = `你是一位文学评论家，专攻中文叙事文本的风格分析。
你的任务是分析小说章节文本，从四个维度输出结构化的文风画像。

## 分析维度

### 1. 语言层 (lexical)
分析文本的词汇选择特征：
- 词汇丰富度：是否大量使用特定词汇
- 句式复杂度：长句多还是短句多，有无特殊句式
- 修辞手法：比喻、拟人、排比等使用频率
- 语言风格：口语化/书面化/诗化

### 2. 叙事层 (narrative)
分析叙事手法特征：
- 叙事视角：第一人称/第三人称有限/第三人称全知/多视角切换
- 时间处理：顺叙/倒叙/插叙/多线叙事
- 描写与对话比例：偏重描写还是对话驱动
- 心理描写：人物内心活动的呈现方式

### 3. 结构层 (structural)
分析文本结构特征：
- 章节节奏：信息密度分布
- 叙事节奏：快慢交替模式
- 情节布局：悬念设置、伏笔回收方式
- 段落长度：段落划分习惯

### 4. 风格标签 (stylistic)
用标签化方式概括风格：
- overallTendency: 整体风格倾向（如「白描」「华丽浓艳」「冷峻简洁」「古朴典雅」「口语诙谐」「写实细腻」）
- rhetoricPreference: 修辞偏好数组（如 ["比喻","排比","拟人"]）
- descriptionFocus: 描写偏向（如 ["人物外貌","环境氛围","动作","心理"]）
- narrativeDistance: 叙事距离（如「第三人称有限视角」「全知视角」「第一人称亲近叙事」）

## 输出格式
必须严格输出以下 JSON 格式，不要包含其他文字：
{
  "lexical": "语言层分析文字描述，100-300字",
  "narrative": "叙事层分析文字描述，100-300字",
  "structural": "结构层分析文字描述，100-300字",
  "stylistic": {
    "overallTendency": "整体风格倾向",
    "rhetoricPreference": ["修辞手法1", "修辞手法2"],
    "descriptionFocus": ["描写对象1", "描写对象2"],
    "narrativeDistance": "叙事距离描述"
  }
}`

interface AnalysisResult {
  lexical: string
  narrative: string
  structural: string
  stylistic: StylisticTags
}

/**
 * 分析单本书的所有章节内容，产出文风画像
 */
export async function analyzeBookChapters(
  chaptersContent: string,
  bookTitle: string,
): Promise<AnalysisResult> {
  const userPrompt = `请分析以下来自《${bookTitle}》的章节文本，输出四维文风画像。

---章节开始---
${chaptersContent.slice(0, 8000)}
---章节结束---

注意：如果章节内容较长，分析整体风格特征即可，不要逐章分析。`

  const result = await chat({
    messages: [
      { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    maxTokens: 4096,
  })

  return parseAnalysisResult(result)
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

  // 再尝试匹配最外层的大括号（非贪婪匹配嵌套结构）
  const braceMatch = text.match(/\{[\s\S]*\}/)
  if (braceMatch) {
    return braceMatch[0]
  }

  return null
}

/**
 * 解析 LLM 返回的 JSON 结果
 */
function parseAnalysisResult(raw: string): AnalysisResult {
  // 尝试提取 JSON
  const jsonStr = extractJsonFromText(raw)
  if (!jsonStr) {
    throw new Error('LLM 返回格式异常，无法解析分析结果')
  }

  try {
    const data = JSON.parse(jsonStr)

    return {
      lexical: data.lexical || '',
      narrative: data.narrative || '',
      structural: data.structural || '',
      stylistic: {
        overallTendency: data.stylistic?.overallTendency || '',
        rhetoricPreference: Array.isArray(data.stylistic?.rhetoricPreference)
          ? data.stylistic.rhetoricPreference
          : [],
        descriptionFocus: Array.isArray(data.stylistic?.descriptionFocus)
          ? data.stylistic.descriptionFocus
          : [],
        narrativeDistance: data.stylistic?.narrativeDistance || '',
      },
    }
  } catch {
    throw new Error('LLM 返回 JSON 解析失败')
  }
}

/**
 * 构建作者分析提示（从书籍内容中提取章节）
 */
export function buildChaptersContent(
  chapters: Array<{ title: string; content: string }>,
): string {
  return chapters
    .map((ch) => `## ${ch.title}\n\n${ch.content}`)
    .join('\n\n---\n\n')
}
