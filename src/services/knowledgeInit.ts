/**
 * 知识文件初始化服务
 * 1. 提供 AI Q&A 对话的系统提示词
 * 2. 讨论结束后调用 LLM 生成三份知识文件
 */

import { streamChat, type LLMMessage, type LLMDelta } from './llm'
import { WORLD_MODEL_TEMPLATE, MASTER_OUTLINE_TEMPLATE, BRAINSTORM_TEMPLATE } from '../lib/knowledgeTemplates'

export interface BookInfo {
  title: string
  type: string
  description: string
  mainCharacter: string
}

/**
 * 返回初始化阶段的系统提示词
 * AI 将以编辑身份引导作者讨论和完善设定
 */
export function getInitPrompt(info: BookInfo): string {
  return `你是一位资深的小说编辑，正在帮助一位作者为一本新书构建世界观和全书大纲。

## 书籍信息
- 书名：《${info.title}》
- 类型：${info.type || '未指定'}
- 主角：${info.mainCharacter || '未指定'}
- 简介：${info.description || '暂无'}

## 你的角色
你是编辑，任务是**引导**作者思考和完善设定。多追问细节，让作者把想法说清楚，而不是替作者创作。

## 对话规则
1. **一次只问一个问题**，提问后等待作者回答。如果回答模糊则追问细节。
2. **充分讨论**当前话题，当作者表示可以继续（"下一个""继续""好了"等）再进入下一个话题。
3. **话题覆盖顺序**：
   - 世界类型与核心设定
   - 力量体系或科技水平（如果有）
   - 地理与势力分布
   - 关键人物（主要角色、派系）
   - 故事主线（核心冲突、主角目标）
   - 篇章规划（全书分几个阶段）
4. **讨论过程中不要输出文件内容**，只输出问题和讨论回复。
5. **每条回复保持简洁**，不要长篇大论。
6. 当作者说"完成讨论"或"生成知识文件"时，以 "--开始生成文件--" 作为最后一条消息结束。
7. 用中文交流。`
}

/**
 * 知识文件生成结果
 */
export interface GeneratedFiles {
  world_model: string
  master_outline: string
  brainstorm: string
}

/**
 * 将对话消息收集起来，调用 LLM 生成三份知识文件
 * 返回结构化文件内容
 */
export async function generateKnowledgeFiles(
  bookInfo: BookInfo,
  messages: Array<{ role: string; content: string }>,
): Promise<GeneratedFiles> {
  const synthesisPrompt = `基于以下作者与编辑的对话，为小说《${bookInfo.title}》生成三份知识文件。

## 书籍信息
- 书名：《${bookInfo.title}》
- 类型：${bookInfo.type || '未指定'}
- 主角：${bookInfo.mainCharacter || '未指定'}
- 简介：${bookInfo.description || '暂无'}

## 输出格式
你必须严格按照以下格式输出，不要包含任何额外文字或说明。每个文件用标记包裹：

--文件开始: world_model.md--
内容
--文件结束--

--文件开始: master_outline.md--
内容
--文件结束--

--文件开始: brainstorm.md--
内容
--文件结束--

## 要求
- world_model.md 至少包含：世界观概述、力量体系/科技水平、地理与势力、关键人物、基础规则
- master_outline.md 至少包含：故事梗概、主线脉络、篇章规划、预计篇幅
- brainstorm.md 收集对话中出现的零散想法和待探索方向
- 内容必须基于对话中作者明确认可的设定，不要自行添加或臆想
- 使用中文，格式工整`

  const llmMessages: LLMMessage[] = [
    { role: 'system', content: synthesisPrompt },
    ...messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ]

  // 使用 streamChat 收集完整响应（兼容 Claude 等非 OpenAI 服务）
  const generator = streamChat({ messages: llmMessages, maxTokens: 8192 })
  let fullResponse = ''

  for await (const delta of generator) {
    if (delta.type === 'delta') {
      fullResponse += delta.content || ''
    } else if (delta.type === 'error') {
      throw new Error(delta.error || '生成知识文件失败')
    }
  }

  // 解析三份文件内容 —— 支持多种格式变体
  function extractFile(content: string, filename: string): string | null {
    // 尝试匹配标准格式: --文件开始: filename--
    const standardPattern = new RegExp(`--文件开始:\s*${filename}--\\n?([\\s\\S]*?)--文件结束--`)
    const standardMatch = content.match(standardPattern)
    if (standardMatch?.[1]?.trim()) return standardMatch[1].trim()

    // 尝试匹配 markdown 代码块格式: ```markdown 或 ```
    const codeBlockPattern = new RegExp(`\\\`\\\`\\\`(?:markdown)?\\n?([\\s\\S]*?)\\\`\\\`\\\``)
    const codeBlockMatch = content.match(codeBlockPattern)
    if (codeBlockMatch?.[1]?.trim()) return codeBlockMatch[1].trim()

    // 尝试匹配带 # 的标题格式（AI 可能直接输出 markdown 内容）
    // 如果内容包含多个 # 标题，尝试按文件名关键词提取
    if (content.includes('#')) {
      // 对于 world_model，查找包含"世界观"的部分
      if (filename === 'world_model.md') {
        const worldMatch = content.match(/#\s*世界观[\s\S]*?(?=#\s*(?:全书总纲|故事梗概|灵感笔记|$))/)
        if (worldMatch) return worldMatch[0].trim()
      }
      // 对于 master_outline，查找包含"总纲"或"故事梗概"的部分
      if (filename === 'master_outline.md') {
        const outlineMatch = content.match(/#\s*(?:全书总纲|故事梗概)[\s\S]*?(?=#\s*(?:灵感笔记| brainstorm|$))/)
        if (outlineMatch) return outlineMatch[0].trim()
      }
      // 对于 brainstorm，查找包含"灵感"的部分
      if (filename === 'brainstorm.md') {
        const brainMatch = content.match(/#\s*灵感[\s\S]*$/)
        if (brainMatch) return brainMatch[0].trim()
      }
    }

    return null
  }

  const worldModelContent = extractFile(fullResponse, 'world_model.md')
  const masterOutlineContent = extractFile(fullResponse, 'master_outline.md')
  const brainstormContent = extractFile(fullResponse, 'brainstorm.md')

  // 如果解析失败，记录日志以便调试
  if (!worldModelContent || !masterOutlineContent || !brainstormContent) {
    console.warn('[KnowledgeInit] 文件解析可能不完整:', {
      hasWorldModel: !!worldModelContent,
      hasMasterOutline: !!masterOutlineContent,
      hasBrainstorm: !!brainstormContent,
      responsePreview: fullResponse.slice(0, 500),
    })
  }

  return {
    world_model: worldModelContent || WORLD_MODEL_TEMPLATE,
    master_outline: masterOutlineContent || MASTER_OUTLINE_TEMPLATE,
    brainstorm: brainstormContent || BRAINSTORM_TEMPLATE,
  }
}

/**
 * 流式聊天，用于 KnowledgeInitWizard 的 Q&A 阶段
 * 将消息列表 + 初始化系统提示词发给 LLM，逐个 yield delta
 */
export async function streamInitChat(
  info: BookInfo,
  messages: Array<{ role: string; content: string }>,
  signal?: AbortSignal,
): Promise<AsyncGenerator<LLMDelta>> {
  const systemContent = getInitPrompt(info)

  const llmMessages: LLMMessage[] = [
    { role: 'system', content: systemContent },
    ...messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  ]

  return streamChat({ messages: llmMessages, signal })
}
