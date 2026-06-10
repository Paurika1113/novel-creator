import { useState, useRef, useEffect, useCallback } from 'react'
import { useChatStore } from '../../stores/chatStore'
import { useEditorStore } from '../../stores/editorStore'
import { useBookStore } from '../../stores/bookStore'
import { useSettingsStore } from '../../stores/settingsStore'
import { useWorkflowStore } from '../../stores/workflowStore'
import { usePersonaStore } from '../../stores/personaStore'
import { streamChatWithTools } from '../../services/llm'
import { executeToolCall } from '../../services/toolExecutor'
import { calculateContextBudget, assembleContext, getContextReport } from '../../services/contextAssembler'
import { getAgentTools, buildSystemPrompt } from '../../services/skills'
import { buildMemoryContext } from '../../services/memoryContext'
import type { ChatMessage, SkillDef, SKILLS } from '../../types'
import type { LLMMessage } from '../../services/llm'

// ---- 工具结果折叠状态 ----
const toolCollapseState = new Map<string, Set<string>>() // msgKey -> set of toolIds

// ---- 斜杠命令系统 ----
const SLASH_COMMANDS = [
  { id: 'outline', icon: '📝', label: '生成大纲', prompt: '请为下一章生成详细大纲。先读取 status_card.md 和 master_outline.md 了解全书结构。每个章节有专属的 {chapters/N.outline.md} 文件，请使用 write_knowledge_file 工具写入对应章节的纲要文件。章纲格式：章节标题、场景设定、出场人物、情节节点、悬念铺设。' },
  { id: 'write', icon: '➕', label: '写新章', prompt: '请先调用 list_chapters 确认章节编号，再读取对应 chapters/{编号}.outline.md 的纲要，最后调用 write_chapter_content 直接写入 chapters/{编号}.md。不要使用 write_current_draft。' },
  { id: 'continue', icon: '✏️', label: '续写', prompt: '请读取当前草稿 chapter_draft.md，在末尾继续追加内容，保持叙事连贯。' },
  { id: 'review', icon: '📋', label: '审核草稿', prompt: '请从世界观一致性、大纲匹配度、前文连续性、文风一致性和文本质量五个维度审核当前草稿，输出结构化审核报告。' },
  { id: 'polish', icon: '🎨', label: '润色文风', prompt: '请读取当前草稿，从语言层、叙事层和结构层进行润色优化。完成后用 write_current_draft 覆盖原草稿。' },
  { id: 'world', icon: '🌍', label: '世界观', prompt: '请读取已归档章节，提取和整理世界观设定，生成或更新 world_model.md。' },
  { id: 'summarize', icon: '🔄', label: '摘要', prompt: '请读取已归档章节，重新生成章节摘要，更新 summary.md 和 status_card.md。' },
]
interface ActionButtonDef {
  id: string
  icon: string
  label: string
  skill: SkillDef['id'] | null  // 关联的 Skill，null 表示纯 UI 操作（如归档）
  prompt: string
  disabled?: boolean
}

function getActionButtons(
  currentFilePath: string | null,
  currentFileType: string | null,
  currentFileName: string | null,
  hasDraftContent: boolean,
  chapterIndex: number,
): ActionButtonDef[] {
  const isChapter = currentFilePath?.startsWith('chapters/') || currentFileType === 'chapter'
  const isDraft = currentFilePath === 'drafts/chapter_draft.md' || currentFileType === 'chapter_draft'

  if (isChapter) {
    const nextChapterNum = chapterIndex + 1
    return [
      {
        id: 'next_chapter',
        icon: '➕',
        label: '下一章',
        skill: 'outline',
        prompt: `当前选中的是第${chapterIndex}章「${currentFileName}」。请为**第${nextChapterNum}章**生成详细大纲。

**执行步骤**：
1. 读取 status_card.md 和 master_outline.md 了解当前进度
2. 读取 chapters/${String(nextChapterNum).padStart(3, '0')}.outline.md（如为空则新建）
3. 如果是某卷的第一章，先读取 arc_outline.md（如为空则先生成卷纲）
4. 使用 write_knowledge_file 写入 chapters/${String(nextChapterNum).padStart(3, '0')}.outline.md，写入**第${nextChapterNum}章**的详细大纲

**重要**：
- 只生成章纲，不要生成草稿
- 章纲生成后，用户会在聊天窗口与你讨论确认
- 讨论结束后，用户会点击"生成草稿"按钮让你用 write_chapter_content 写入正文
- 你正在创作的是第${nextChapterNum}章，不是第${chapterIndex}章`,



      },
      {
        id: 'rewrite_chapter',
        icon: '🔄',
        label: '重写',
        skill: 'write_chapter',
        prompt: '请重新撰写当前章节，在保持核心情节不变的前提下优化叙事节奏、人物描写和语言风格。',
      },
    ]
  }

  if (isDraft) {
    const buttons: ActionButtonDef[] = [
      {
        id: 'rewrite',
        icon: '🔄',
        label: '重写',
        skill: 'write_chapter',
        prompt: '请重新撰写当前草稿，在保持核心情节不变的前提下优化叙事节奏、人物描写和语言风格。',
      },
    ]

    if (hasDraftContent) {
      buttons.push(
        {
          id: 'continue',
          icon: '✏️',
          label: '续写',
          skill: 'continue_draft',
          prompt: '请读取当前草稿，在末尾继续追加内容，保持叙事连贯。',
        },
        {
          id: 'review',
          icon: '📋',
          label: '审核',
          skill: 'review_draft',
          prompt: '请从世界观一致性、大纲匹配度、前文连续性、文风一致性和文本质量五个维度审核当前草稿，输出结构化审核报告。',
        },
        {
          id: 'archive',
          icon: '✅',
          label: '归档',
          skill: null,
          prompt: '',
        },
      )
    }

    return buttons
  }

  // Chapter outline file selected
  if (currentFileType === 'chapter_outline') {
    const match = currentFilePath?.match(/chapters\/(\d+)\.outline\.md$/)
    const chNum = match ? parseInt(match[1], 10) : chapterIndex + 1
    return [
      {
        id: 'generate_draft',
        icon: '📝',
        label: '生成草稿',
        skill: 'write_chapter',
        prompt: `请根据当前章节大纲，撰写完整的章节正文。

**执行步骤**：
1. 读取当前章节的纲要文件（${currentFilePath}）获取详细大纲
2. 读取最近一章（第${chNum}章）的结尾内容，保持连续性
3. 使用 write_chapter_content (chapterIndex=${chNum}) 直接写入 chapters/${String(chNum).padStart(3, '0')}.md

**要求**：
- 严格遵循大纲中的场景设定、人物出场和情节推进
- 每章 2000-5000 字
- 结尾保持悬念或推进感
- 不要使用 write_current_draft，用 write_chapter_content 直接写入章节文件`,
      },
      {
        id: 'modify_outline',
        icon: '✏️',
        label: '修改章纲',
        skill: 'outline',
        prompt: `请根据我们的讨论，修改当前章节的纲要文件 ${currentFilePath}。使用 write_knowledge_file 工具写入更新后的内容。`,
      },
    ]
  }

  // Default
  return [
    {
      id: 'continue',
      icon: '✏️',
      label: '续写',
      skill: 'continue_draft',
      prompt: '请根据当前文件内容继续创作。',
    },
    {
      id: 'review',
      icon: '📋',
      label: '审核',
      skill: 'review_draft',
      prompt: '请审核当前文件内容的质量和一致性。',
    },
  ]
}

export default function ChatPanel({ onArchive }: { onArchive?: () => void }) {
  const {
    addMessage,
    setStreaming,
    isStreaming,
    streamingMessageId,
    startStreaming,
    stopStreaming,
    appendToLastMessage,
    updateMessageContent,
    clearConversation,
  } = useChatStore()

  const messages = useChatStore((s) => s.conversation)

  const { currentBookId, currentFilePath, filesByBook, openFile, updateContent, saveContent } = useEditorStore()
  const { books } = useBookStore()
  const { settings } = useSettingsStore()
  const { provider, model, apiKey, baseUrl, savedModels } = settings
  const workflow = useWorkflowStore()

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingMessageId])

  useEffect(() => {
    if (!isStreaming) {
      inputRef.current?.focus()
    }
  }, [isStreaming])

  // Current file context
  const currentFiles = currentBookId ? (filesByBook[currentBookId] || []) : []
  const currentFile = currentFiles.find((f) => f.path === currentFilePath)
  const currentFileType = currentFile?.type || null

  const draftFile = currentFiles.find((f) => f.type === 'chapter_draft')
  let draftContent = draftFile?.content || ''
  if (currentBookId && !draftContent.trim()) {
    try {
      const saved = localStorage.getItem(`nc:${currentBookId}:drafts/chapter_draft.md`)
      if (saved !== null) draftContent = saved
    } catch { /* ignore */ }
  }
  const hasDraftContent = draftContent.trim().length > 0

  const chapterFiles = currentFiles.filter((f) => f.type === 'chapter')
  const currentChapterIndex = currentFile?.type === 'chapter'
    ? chapterFiles.findIndex((f) => f.path === currentFilePath) + 1
    : 0

  const actionButtons = getActionButtons(
    currentFilePath,
    currentFileType,
    currentFile?.name || null,
    hasDraftContent,
    currentChapterIndex,
  )

  // ---- Core: send message to AI ----
  const sendToAI = useCallback(async (userContent: string) => {
    if (isStreaming) return

    const msgId = startStreaming()
    // 所有 Skill 共用完整工具集
    const tools = getAgentTools()

    try {
      const book = books.find((b) => b.id === currentBookId)
      const { personas } = usePersonaStore.getState()
      const persona = currentBookId ? personas.find((p) => p.id === book?.boundPersonaId) || null : null
      const systemPrompt = buildSystemPrompt({
        persona,
        bookTitle: book?.title,
        bookType: book?.type,
        mainCharacter: book?.mainCharacter,
      })
      const history = messages.slice(-10)
      let selectedHistory: typeof messages = history

      // Dynamic context assembly (always enabled, not only for continuation)
      let contextPrompt = ''
      if (currentBookId) {
        const chapterFiles = currentFiles.filter((f) => f.type === 'chapter')
        const { settings } = useSettingsStore.getState()
        const budget = calculateContextBudget(
          settings.modelContextWindow || 200000,
          settings.compressionSensitivity || 40,
          systemPrompt.length,
          history,
          userContent,
        )

        // Token-budget-aware history
        const historyTokenBudget = Math.max(Math.floor(budget.availableTokens * 0.15), 2000)
        let tokenSoFar = 0
        selectedHistory = []
        for (let i = messages.length - 1; i >= 0; i--) {
          const msg = messages[i]
          const msgTokens = Math.ceil(msg.content.length * 1.2) + 50
          if (tokenSoFar + msgTokens > historyTokenBudget) break
          tokenSoFar += msgTokens
          selectedHistory.unshift(msg)
        }

        const adjustedBudget = calculateContextBudget(
          settings.modelContextWindow || 200000,
          settings.compressionSensitivity || 40,
          systemPrompt.length,
          selectedHistory,
          userContent,
        )
        const contextResult = assembleContext(adjustedBudget, chapterFiles, {
          statusCard: currentFiles.find((f) => f.path === 'knowledge/status_card.md')?.content,
          activeElements: currentFiles.find((f) => f.path === 'summary/active_elements.md')?.content,
          chapterDraft: currentFiles.find((f) => f.path === 'drafts/chapter_draft.md')?.content,
          currentChapterIndex: chapterFiles.length,
        })
        contextPrompt = contextResult.contextText
          ? `\n\n## 前文参考\n${contextResult.contextText}\n\n请基于以上前文继续创作。`
          : ''
        console.log('[ContextAssembly]', getContextReport(adjustedBudget, contextResult))
      }

      // Memory context for cross-session awareness
      let memoryPrompt = ''
      if (currentBookId && currentFiles.length > 0) {
        const memoryCtx = buildMemoryContext(currentFiles, {
          chapterCount: currentFiles.filter((f) => f.type === 'chapter').length,
          wordCount: currentFiles.reduce((sum, f) => sum + f.content.length, 0),
        })
        if (memoryCtx) {
          memoryPrompt = `\n\n## 当前书籍状态\n${memoryCtx}`
        }
      }

      const llmMessages: LLMMessage[] = [
        { role: 'system', content: systemPrompt + contextPrompt + memoryPrompt },
        ...(currentBookId ? selectedHistory : history)
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: userContent },
      ]

      let cleanContent = ''
      let chatContent = ''
      let toolCallIndex = 0
      const executedTools: string[] = []

      const stream = streamChatWithTools(
        { messages: llmMessages, temperature: 0.7, tools: tools.length > 0 ? tools : undefined },
        async (name, args) => executeToolCall(name, args),
        { provider, apiKey, baseUrl, maxRounds: 30 }
      )

      let inTag = false
      let tagClosed = false
      let toolExecuted = false

      for await (const delta of stream) {
        if (delta.type === 'error') {
          chatContent += `\n❌ ${delta.error}`
          updateMessageContent(msgId, chatContent)
          break
        }
        if ((delta.type === 'delta' || delta.type === 'content') && delta.content) {
          let chunk = delta.content

          if (chunk.includes('<Main text>')) {
            inTag = true
            const beforeTag = chunk.replace(/<Main text>[\s\S]*/, '')
            if (beforeTag) {
              chatContent += beforeTag
              updateMessageContent(msgId, chatContent)
            }
            chunk = chunk.replace(/.*<Main text>/s, '')
            if (!chunk) continue
          }
          if (chunk.includes('</Main text>')) {
            const match = chunk.match(/([\s\S]*?)<\/Main text>/s)
            if (match && match[1]) {
              cleanContent += match[1]
            }
            inTag = false
            tagClosed = true
            chatContent += '\n\n[正文已写入 chapter_draft.md]\n\n'
            updateMessageContent(msgId, chatContent)
            const afterTag = chunk.replace(/[\s\S]*?<\/Main text>/s, '')
            if (afterTag) {
              chatContent += afterTag
              updateMessageContent(msgId, chatContent)
            }
            continue
          }
          if (inTag) {
            cleanContent += chunk
          } else {
            chatContent += chunk
            updateMessageContent(msgId, chatContent)
          }

          if (!toolExecuted) {
            if (workflow.phase === 'outline' && currentFileType === 'chapter_outline') {
              updateContent(cleanContent)
            }
          }
        }
        if (delta.type === 'tool_result') {
          toolExecuted = true
          executedTools.push(delta.toolName)
          const toolId = `t${toolCallIndex++}`
          chatContent += `\n\n<!--TOOL:${delta.toolName}:${toolId}:${msgId}-->\n${delta.toolResult}\n<!--TOOL_END:${toolId}-->\n\n`
          updateMessageContent(msgId, chatContent)
        }
        if (delta.type === 'tool_loop_continue') {
          if (toolCallIndex > 0) {
            chatContent += '\n\n'
            updateMessageContent(msgId, chatContent)
          }
        }
      }

      // Save workflow state
      if (workflow.phase === 'outline' && cleanContent) {
        workflow.outlineContent = cleanContent
      } else if (workflow.phase === 'draft' && cleanContent) {
        workflow.draftContent = cleanContent
      }

      // Non-tool write path
      if (!toolExecuted) {
        const contentToSave = cleanContent || chatContent.trim()
        if (contentToSave) {
          if (workflow.phase === 'outline' && currentFileType === 'chapter_outline') {
            updateContent(contentToSave)
            saveContent()
          } else if (workflow.phase === 'draft' && currentFilePath === 'drafts/chapter_draft.md') {
            updateContent(contentToSave)
            saveContent()
          }
        }
      }

      // Force editor refresh after tool writes
      const hasDraftWrite = executedTools.some((t) =>
        t === 'write_current_draft' || t === 'append_to_draft'
      )
      if (hasDraftWrite) {
        const draftContent = (() => {
          try {
            return localStorage.getItem(`nc:${currentBookId}:drafts/chapter_draft.md`) || ''
          } catch { return '' }
        })()
        if (draftContent && draftContent.trim()) {
          const editorState = useEditorStore.getState()
          if (editorState.editorContent !== draftContent) {
            useEditorStore.setState({ editorContent: draftContent, isDirty: false })
          }
        }
        if (cleanContent && cleanContent.trim().length > 50) {
          const draftLen = draftContent.trim().length
          const streamLen = cleanContent.trim().length
          if (streamLen > draftLen * 2) {
            useEditorStore.setState({ editorContent: cleanContent, isDirty: false })
            const store = useEditorStore.getState()
            const files = store.filesByBook[currentBookId!] || []
            const idx = files.findIndex((f) => f.path === 'drafts/chapter_draft.md')
            if (idx >= 0) {
              const updated = [...files]
              updated[idx] = { ...updated[idx], content: cleanContent, updatedAt: new Date().toISOString() }
              store.setFiles(updated)
            }
            saveContent()
          }
        }
      }

      stopStreaming()
    } catch (error) {
      updateMessageContent(msgId, `❌ 请求失败：${error instanceof Error ? error.message : '未知错误'}`)
      stopStreaming()
    }
  }, [isStreaming, messages, provider, apiKey, baseUrl, currentBookId, books, currentFiles, startStreaming, stopStreaming, updateMessageContent, workflow, currentFilePath, updateContent, saveContent])

  // ---- Send from input ----
  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return

    const userContent = input.trim()
    addMessage({ role: 'user', content: userContent })
    setInput('')
    await sendToAI(userContent)
  }, [input, isStreaming, addMessage, setInput, sendToAI])

  // ---- Workflow action ----
  const handleWorkflowAction = useCallback(async (actionId: string) => {
    const chapterFiles = currentFiles.filter((f) => f.type === 'chapter')

    switch (actionId) {
      case 'regenerate_outline':
        workflow.regenerateOutline()
        addMessage({ role: 'user', content: '请重新生成第' + workflow.currentChapterNum + '章的大纲。' })
        await sendToAI('请重新生成第' + workflow.currentChapterNum + '章的大纲。')
        break

      case 'rewrite_selection':
        if (workflow.selectedText) {
          addMessage({ role: 'user', content: `请重写以下内容：\n\n${workflow.selectedText}` })
          await sendToAI(`请重写以下内容：\n\n${workflow.selectedText}`)
        }
        break

      case 'confirm_outline':
        workflow.confirmOutline(workflow.outlineContent)
        openFile('drafts/chapter_draft.md', '')
        addMessage({ role: 'user', content: '大纲已确认。请根据大纲生成章节正文草稿。' })
        await sendToAI('大纲已确认。请根据大纲生成章节正文草稿。')
        break

      case 'regenerate_draft':
        workflow.regenerateDraft()
        addMessage({ role: 'user', content: '请重新生成章节正文草稿。' })
        await sendToAI('请重新生成章节正文草稿。')
        break

      case 'confirm_draft':
        workflow.confirmDraft(workflow.draftContent)
        addMessage({ role: 'user', content: '请审核当前章节草稿。' })
        await sendToAI('请审核当前章节草稿。')
        break

      case 'auto_fix':
        addMessage({ role: 'user', content: `请根据以下审核报告修改草稿：\n\n${workflow.reviewReport}` })
        await sendToAI(`请根据以下审核报告修改草稿：\n\n${workflow.reviewReport}`)
        break

      case 'archive':
        workflow.archive()
        onArchive?.()
        break

      case 'next_chapter':
        workflow.reset()
        workflow.startOutline(currentChapterIndex + 1, `第${currentChapterIndex + 1}章`)
        break

      case 'reset_workflow':
        workflow.reset()
        break
    }
  }, [workflow, currentFiles, addMessage, sendToAI, openFile, onArchive, currentChapterIndex])

  // ---- Skill button click ----
  const handleActionClick = useCallback(async (action: ActionButtonDef) => {
    if (action.id === 'archive') {
      onArchive?.()
      return
    }
    if (!action.skill) return

    if (action.id === 'next_chapter') {
      const nextChapterNum = currentChapterIndex + 1
      workflow.startOutline(nextChapterNum, `第${nextChapterNum}章`)
    }

    addMessage({ role: 'user', content: action.prompt })
    await sendToAI(action.prompt)

    if (action.id === 'next_chapter') {
      const nextNum = currentChapterIndex + 1
      const outlinePath = `chapters/${String(nextNum).padStart(3, '0')}.outline.md`
      openFile(outlinePath, '')
    }
  }, [onArchive, addMessage, sendToAI, workflow, currentChapterIndex, openFile])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ---- Tool collapse ----
  const toggleTool = useCallback((msgKey: string, toolId: string) => {
    if (!toolCollapseState.has(msgKey)) {
      toolCollapseState.set(msgKey, new Set())
    }
    const set = toolCollapseState.get(msgKey)!
    if (set.has(toolId)) {
      set.delete(toolId)
    } else {
      set.add(toolId)
    }
    setExpandedTools((prev) => {
      const next = new Map(prev)
      next.set(msgKey, new Set(set))
      return next
    })
  }, [])

  function renderTextLines(text: string) {
    const lines = text.split('\n')
    return lines.map((line, i) => {
      if (line.startsWith('# ')) return <h3 key={i} className="chat-message-heading">{line.slice(2)}</h3>
      if (line.startsWith('## ')) return <h4 key={i} className="chat-message-heading">{line.slice(3)}</h4>
      if (line.startsWith('- ')) return <li key={i} className="chat-message-list-item">{line.slice(2)}</li>
      if (line.startsWith('> ')) return <blockquote key={i} className="chat-message-quote">{line.slice(2)}</blockquote>
      if (line.trim() === '') return <div key={i} style={{ height: 8 }} />
      return <p key={i} className="chat-message-paragraph">{line}</p>
    })
  }

  function renderMessageContent(content: string, msgIndex: number) {
    const msgKey = `${msgIndex}`
    const expandedSet = toolCollapseState.get(msgKey) || new Set<string>()
    const toolRegex = /<!--TOOL:([^:]+):([^:]+):([^-]+)-->\n([\s\S]*?)\n<!--TOOL_END:\2-->/g

    const segments: Array<{ type: 'text' | 'tool'; content?: string; toolName?: string; toolId?: string }> = []
    let lastIdx = 0
    let match: RegExpExecArray | null
    while ((match = toolRegex.exec(content)) !== null) {
      if (match.index > lastIdx) {
        segments.push({ type: 'text', content: content.slice(lastIdx, match.index) })
      }
      segments.push({ type: 'tool', content: match[4], toolName: match[1], toolId: match[2] })
      lastIdx = match.index + match[0].length
    }
    if (lastIdx < content.length) {
      segments.push({ type: 'text', content: content.slice(lastIdx) })
    }

    if (segments.length === 0) return renderTextLines(content)

    return segments.map((seg, i) => {
      if (seg.type === 'tool') {
        const isExpanded = expandedSet.has(seg.toolId!)
        const toolName = seg.toolName!
        const toolContent = seg.content || ''
        const firstLine = toolContent.split('\n')[0]?.trim().slice(0, 80) || ''
        return (
          <div key={i} className="chat-tool-result">
            <div className="chat-tool-result-header" onClick={() => toggleTool(msgKey, seg.toolId!)} title="点击展开/折叠">
              <span className="chat-tool-result-caret">{isExpanded ? '▼' : '▶'}</span>
              <span className="chat-tool-result-icon">🔧</span>
              <span className="chat-tool-result-name">{toolName}</span>
              {!isExpanded && firstLine && <span className="chat-tool-result-preview">{firstLine}</span>}
            </div>
            {isExpanded && <div className="chat-tool-result-body">{renderTextLines(toolContent)}</div>}
          </div>
        )
      }
      if (!seg.content?.trim()) return null
      return <div key={i}>{renderTextLines(seg.content!)}</div>
    })
  }

  const [, setExpandedTools] = useState<Map<string, Set<string>>>(new Map())
  const activeBook = currentBookId ? books.find((b) => b.id === currentBookId) : null

  // ---- 斜杠命令 ----
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [slashIndex, setSlashIndex] = useState(0)
  const slashMenuRef = useRef<HTMLDivElement>(null)

  // ---- ContextBar: 计算上下文状态 ----
  const getContextBarInfo = useCallback(() => {
    const totalTokens = settings.modelContextWindow || 200000
    const chapterFiles = currentFiles.filter((f) => f.type === 'chapter')
    const recentChapters = chapterFiles.slice(-3)
    const recentContent = recentChapters.reduce((sum, f) => sum + f.content.length, 0)
    const draftLen = draftContent.length || 0
    const estimatedTokens = Math.round((recentContent + draftLen + 5000) * 1.2)
    const percent = Math.min(Math.round((estimatedTokens / totalTokens) * 100), 99)
    return { totalTokens, estimatedTokens, percent }
  }, [currentFiles, draftContent, settings.modelContextWindow])

  const [showContextBar, setShowContextBar] = useState(true)

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setInput(val)
    // 输入 / 时弹出斜杠命令菜单（同时处理快速输入情况）
    if (val.startsWith('/')) {
      setShowSlashMenu(true)
      setSlashIndex(0)
    } else if (showSlashMenu) {
      setShowSlashMenu(false)
    }
  }

  function selectSlashCommand(cmd: typeof SLASH_COMMANDS[0]) {
    setInput(cmd.prompt)
    setShowSlashMenu(false)
    if (inputRef.current) inputRef.current.focus()
  }

  function handleSlashKeyDown(e: React.KeyboardEvent) {
    if (!showSlashMenu) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSlashIndex((prev) => (prev + 1) % SLASH_COMMANDS.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSlashIndex((prev) => (prev - 1 + SLASH_COMMANDS.length) % SLASH_COMMANDS.length)
    } else if (e.key === 'Enter' && showSlashMenu) {
      e.preventDefault()
      selectSlashCommand(SLASH_COMMANDS[slashIndex])
    } else if (e.key === 'Escape') {
      setShowSlashMenu(false)
    }
  }

  // 点击菜单外关闭
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (slashMenuRef.current && !slashMenuRef.current.contains(e.target as Node)) {
        setShowSlashMenu(false)
      }
    }
    if (showSlashMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showSlashMenu])

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon">🤖</div>
            <div className="chat-empty-title">AI 创作助手</div>
            <div className="chat-empty-subtitle">
              {activeBook ? `当前作品：${activeBook.title}` : '选择一本书开始创作'}
            </div>
            <div className="chat-empty-hint">
              输入指令或点击下方 Skill 按钮开始创作
            </div>
          </div>
        )}

        {messages.map((msg, index) => (
          <div key={index} className={`chat-message ${msg.role === 'user' ? 'user' : 'assistant'}`}>
            <div className="chat-message-avatar">{msg.role === 'user' ? '👤' : '🤖'}</div>
            <div className="chat-message-content">{renderMessageContent(msg.content, index)}</div>
          </div>
        ))}

        {isStreaming && (
          <div className="chat-message assistant">
            <div className="chat-message-avatar">🤖</div>
            <div className="chat-message-content">
              <span className="chat-message-cursor">▊</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        {/* ---- ContextBar ---- */}
        {showContextBar && (() => {
          const ctx = getContextBarInfo()
          return (
            <div className="chat-context-bar" onClick={() => setShowContextBar(false)} title="点击隐藏">
              <span className="chat-context-bar-label">📊 上下文</span>
              <div className="chat-context-bar-track">
                <div
                  className="chat-context-bar-fill"
                  style={{ width: `${ctx.percent}%` }}
                />
              </div>
              <span className="chat-context-bar-text">
                {ctx.estimatedTokens.toLocaleString()} / {ctx.totalTokens.toLocaleString()}
                <span style={{ marginLeft: 4, opacity: 0.7 }}>({ctx.percent}%)</span>
              </span>
            </div>
          )
        })()}

        {/* ---- Slash command menu ---- */}
        {showSlashMenu && (
          <div className="chat-slash-menu" ref={slashMenuRef}>
            {SLASH_COMMANDS.map((cmd, i) => (
              <div
                key={cmd.id}
                className={`chat-slash-item${i === slashIndex ? ' active' : ''}`}
                onClick={() => selectSlashCommand(cmd)}
                onMouseEnter={() => setSlashIndex(i)}
              >
                <span className="chat-slash-item-icon">{cmd.icon}</span>
                <span className="chat-slash-item-label">{cmd.label}</span>
                <span className="chat-slash-item-cmd">/{cmd.id}</span>
              </div>
            ))}
          </div>
        )}

        <div className="chat-input-row">
          {showSlashMenu && (
            <span className="chat-input-slash-indicator">/</span>
          )}
          <input
            ref={inputRef}
            type="text"
            className="chat-input"
            placeholder={
              workflow.phase === 'outline' ? '与 AI 讨论大纲，或输入 / 呼出命令...' :
              workflow.phase === 'draft' ? '与 AI 讨论草稿，或输入 / 呼出命令...' :
              workflow.phase === 'review' ? '查看审核报告，或输入修改要求...' :
              '输入 / 呼出命令，或直接跟 AI 对话'
            }
            value={input}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              handleSlashKeyDown(e)
              if (!showSlashMenu) handleKeyDown(e)
            }}
            disabled={isStreaming}
          />
          <button
            className="chat-send-btn"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
          >
            {isStreaming ? '■' : '➤'}
          </button>
        </div>
      </div>
    </div>
  )
}