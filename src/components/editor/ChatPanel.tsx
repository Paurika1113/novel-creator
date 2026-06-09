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
import { getAgentTools, buildSystemPrompt } from '../../services/agents'
import { buildMemoryContext } from '../../services/memoryContext'
import type { ChatMessage } from '../../types'
import type { LLMMessage } from '../../services/llm'

// ---- Dynamic action buttons based on selected file type ----
interface ActionButtonDef {
  id: string
  icon: string
  label: string
  agent: 'continuation' | 'review' | 'world' | 'style' | null
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
    // Chapter selected: show 下一章, 重写
    const nextChapterNum = chapterIndex + 1
    return [
      {
        id: 'next_chapter',
        icon: '➕',
        label: '下一章',
        agent: 'continuation',
        prompt: `当前选中的是第${chapterIndex}章「${currentFileName}」。请为**第${nextChapterNum}章**生成详细大纲。

**执行步骤**：
1. 读取 status_card.md 和 master_outline.md 了解当前进度
2. 读取 chapter_outline.md（如为空则新建）
3. 如果是某卷的第一章，先读取 arc_outline.md（如为空则先生成卷纲）
4. 使用 write_knowledge_file 更新 chapter_outline.md，写入**第${nextChapterNum}章**的详细大纲

**重要**：
- 只生成章纲，不要生成草稿
- 章纲生成后，用户会在聊天窗口与你讨论确认
- 讨论结束后，用户会点击"生成草稿"按钮让你撰写正文
- 你正在创作的是第${nextChapterNum}章，不是第${chapterIndex}章`,
      },
      {
        id: 'rewrite_chapter',
        icon: '🔄',
        label: '重写',
        agent: 'continuation',
        prompt: '请重新撰写当前章节，在保持核心情节不变的前提下优化叙事节奏、人物描写和语言风格。',
      },
    ]
  }

  if (isDraft) {
    // Draft selected: show 重写, 续写, 审核, 归档
    const buttons: ActionButtonDef[] = [
      {
        id: 'rewrite',
        icon: '🔄',
        label: '重写',
        agent: 'continuation',
        prompt: '请重新撰写当前草稿，在保持核心情节不变的前提下优化叙事节奏、人物描写和语言风格。',
      },
    ]

    if (hasDraftContent) {
      buttons.push(
        {
          id: 'continue',
          icon: '✏️',
          label: '续写',
          agent: 'continuation',
          prompt: '请读取当前草稿 chapter_draft.md，在末尾继续追加内容，保持叙事连贯。',
        },
        {
          id: 'review',
          icon: '📋',
          label: '审核',
          agent: 'review',
          prompt: '请从世界观一致性、大纲匹配度、前文连续性、文风一致性和文本质量五个维度审核当前草稿，输出结构化审核报告。',
        },
        {
          id: 'archive',
          icon: '✅',
          label: '归档',
          agent: null,
          prompt: '',
        },
      )
    }

    return buttons
  }

  // Chapter outline file selected: show 生成草稿 button
  if (currentFilePath === 'knowledge/chapter_outline.md' || currentFileType === 'chapter_outline') {
    const nextChapterNum = chapterIndex + 1
    return [
      {
        id: 'generate_draft',
        icon: '📝',
        label: '生成草稿',
        agent: 'continuation',
        prompt: `请根据 chapter_outline.md 中的第${nextChapterNum}章大纲，撰写完整的章节正文草稿。

**执行步骤**：
1. 读取 chapter_outline.md 获取第${nextChapterNum}章的详细大纲
2. 读取最近一章（第${chapterIndex}章）的结尾内容，保持连续性
3. 使用 write_current_draft 撰写第${nextChapterNum}章的完整正文草稿

**要求**：
- 严格遵循大纲中的场景设定、人物出场和情节推进
- 每章 2000-5000 字
- 结尾保持悬念或推进感`,
      },
      {
        id: 'modify_outline',
        icon: '✏️',
        label: '修改章纲',
        agent: 'continuation',
        prompt: '请根据我们的讨论，修改 chapter_outline.md 中的章节大纲。使用 write_knowledge_file 更新。',
      },
    ]
  }

  // Default / knowledge file selected: show basic actions
  return [
    {
      id: 'continue',
      icon: '✏️',
      label: '续写',
      agent: 'continuation',
      prompt: '请根据当前文件内容继续创作。',
    },
    {
      id: 'review',
      icon: '📋',
      label: '审核',
      agent: 'review',
      prompt: '请审核当前文件内容的质量和一致性。',
    },
  ]
}

export default function ChatPanel({ onArchive }: { onArchive?: () => void }) {
  const {
    getActiveConversation,
    addMessage,
    setStreaming,
    isStreaming,
    activeAgent,
    setActiveAgent,
    streamingMessageId,
    startStreaming,
    stopStreaming,
    appendToLastMessage,
    updateMessageContent,
  } = useChatStore()

  const messages = getActiveConversation()

  const { currentBookId, currentFilePath, filesByBook, openFile, updateContent, saveContent } = useEditorStore()
  const { books } = useBookStore()
  const { settings } = useSettingsStore()
  const { provider, model, apiKey, baseUrl, savedModels } = settings
  const workflow = useWorkflowStore()

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingMessageId])

  // Auto-focus input when not streaming
  useEffect(() => {
    if (!isStreaming) {
      inputRef.current?.focus()
    }
  }, [isStreaming])

  // Determine current file type
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

  // Calculate chapter index for "next chapter" button
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

  // ---- Core: send message to AI and stream response ----
  const sendToAI = useCallback(async (agentType: string, userContent: string) => {
    if (isStreaming) return

    const msgId = startStreaming()
    const tools = getAgentTools(agentType)

    try {
      const book = books.find((b) => b.id === currentBookId)
      const { personas } = usePersonaStore.getState()
      const persona = currentBookId ? personas.find((p) => p.id === book?.boundPersonaId) || null : null
      const systemPrompt = buildSystemPrompt({
        agentType,
        persona,
        bookTitle: book?.title,
        bookType: book?.type,
        mainCharacter: book?.mainCharacter,
      })
      const history = messages.slice(-10)
      // selectedHistory 对外暴露，所有 Agent 共用（续写 Agent 动态截取，其余用默认 slice）
      let selectedHistory: typeof messages = history

      // Dynamic context assembly
      let contextPrompt = ''
      if (agentType === 'continuation' && currentBookId) {
        const chapterFiles = currentFiles.filter((f) => f.type === 'chapter')
        const { settings } = useSettingsStore.getState()
        const budget = calculateContextBudget(
          settings.modelContextWindow || 200000,
          settings.compressionSensitivity || 40,
          systemPrompt.length,
          history,
          userContent,
        )

        // Token-budget-aware history selection: instead of hardcoded slice(-10),
        // walk backwards from newest message, accumulating tokens until budget limit
        const historyTokenBudget = Math.max(Math.floor(budget.availableTokens * 0.15), 2000)
        let tokenSoFar = 0
        selectedHistory = []
        for (let i = messages.length - 1; i >= 0; i--) {
          const msg = messages[i]
          const msgTokens = Math.ceil(msg.content.length * 1.2) + 50 // 50 = message overhead
          if (tokenSoFar + msgTokens > historyTokenBudget) break
          tokenSoFar += msgTokens
          selectedHistory.unshift(msg)
        }

        // Recalculate budget with selected history
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
          ? `\n\n## 前文参考\n${contextResult.contextText}\n\n请基于以上前文，继续创作下一章。`
          : ''
        console.log('[ContextAssembly]', getContextReport(adjustedBudget, contextResult))
      }

      // 记忆上下文 —— 跨会话感知，所有 Agent 都受益
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
        ...(agentType === 'continuation' && currentBookId ? selectedHistory : history)
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user', content: userContent },
      ]

      let cleanContent = ''   // 编辑器保存（纯内容，仅标签内）
      let chatContent = ''    // 聊天显示（不含正文，只含标签外分析和工具日志）

      // 使用内置工具循环的流式对话 —— 整个工具调用回合由 LLM 层处理
      const stream = streamChatWithTools(
        {
          messages: llmMessages,
          temperature: 0.7,
          tools: tools.length > 0 ? tools : undefined,
        },
        // 工具执行回调
        async (name, args) => executeToolCall(name, args),
        { provider, apiKey, baseUrl, maxRounds: 30 }
      )

      // 标签提取状态机：仅提取 <Main text> 到 </Main text> 之间的内容到 cleanContent
      let inTag = false       // 当前是否在 <Main text> 标签内
      let tagClosed = false   // 标签已关闭（聊天窗口不需要显示标签内正文）
      let toolExecuted = false // 工具执行后停止更新编辑器

      for await (const delta of stream) {
        if (delta.type === 'error') {
          chatContent += `\n❌ ${delta.error}`
          updateMessageContent(agentType as any, msgId, chatContent)
          break
        }
        if ((delta.type === 'delta' || delta.type === 'content') && delta.content) {
          // 流式提取：仅标签内的内容才写入 cleanContent
          let chunk = delta.content

          if (chunk.includes('<Main text>')) {
            inTag = true
            // 开标签前的内容 → 聊天
            const beforeTag = chunk.replace(/<Main text>[\s\S]*/, '')
            if (beforeTag) {
              chatContent += beforeTag
              updateMessageContent(agentType as any, msgId, chatContent)
            }
            // 移除开标签，剩余进入标签内模式
            chunk = chunk.replace(/.*<Main text>/s, '')
            if (!chunk) continue
          }
          if (chunk.includes('</Main text>')) {
            const match = chunk.match(/([\s\S]*?)<\/Main text>/s)
            if (match && match[1]) {
              cleanContent += match[1]   // 标签内正文 → 编辑器
            }
            inTag = false
            tagClosed = true
            chatContent += '\n\n[正文已写入 chapter_draft.md]\n\n'
            updateMessageContent(agentType as any, msgId, chatContent)
            // 闭标签后的内容 → 聊天
            const afterTag = chunk.replace(/[\s\S]*?<\/Main text>/s, '')
            if (afterTag) {
              chatContent += afterTag
              updateMessageContent(agentType as any, msgId, chatContent)
            }
            continue
          }
          if (inTag) {
            cleanContent += chunk   // 标签内正文 → 编辑器
          } else {
            chatContent += chunk    // 标签外文字 → 聊天
            updateMessageContent(agentType as any, msgId, chatContent)
          }

          // 实时同步：只有大纲阶段同步，草稿阶段完全由工具写入
          if (!toolExecuted) {
            if (workflow.phase === 'outline' && currentFilePath === 'knowledge/chapter_outline.md') {
              updateContent(cleanContent)
            }
            // 草稿阶段：不做任何 updateContent —— 文件完全由 write_current_draft 工具写入
          }
        }
        if (delta.type === 'tool_result') {
          toolExecuted = true
          chatContent += `\n\n[工具: ${delta.toolName}]\n${delta.toolResult}`
          updateMessageContent(agentType as any, msgId, chatContent)
        }
        if (delta.type === 'tool_loop_continue') {
          chatContent += '\n\n---\n'
          updateMessageContent(agentType as any, msgId, chatContent)
        }
      }

      // 保存工作流状态
      if (workflow.phase === 'outline' && cleanContent) {
        workflow.outlineContent = cleanContent
      } else if (workflow.phase === 'draft' && cleanContent) {
        workflow.draftContent = cleanContent
      }

      // 非工具写入场景：AI 聊天输出的内容需要写入编辑器文件
      if (!toolExecuted) {
        const contentToSave = cleanContent || chatContent.trim()
        if (contentToSave) {
          if (workflow.phase === 'outline' && currentFilePath === 'knowledge/chapter_outline.md') {
            updateContent(contentToSave)
            saveContent()
          } else if (workflow.phase === 'draft' && currentFilePath === 'drafts/chapter_draft.md') {
            updateContent(contentToSave)
            saveContent()
          }
        }
      }

      stopStreaming()
    } catch (error) {
      updateMessageContent(agentType as any, msgId, `❌ 请求失败：${error instanceof Error ? error.message : '未知错误'}`)
      stopStreaming()
    }
  }, [isStreaming, messages, provider, apiKey, baseUrl, currentBookId, books, currentFiles, startStreaming, stopStreaming, updateMessageContent, workflow, currentFilePath, updateContent, saveContent])

  // ---- Send message from input ----
  const handleSend = useCallback(async () => {
    if (!input.trim() || isStreaming) return

    const userContent = input.trim()
    addMessage(activeAgent, { role: 'user', content: userContent })
    setInput('')
    await sendToAI(activeAgent, userContent)
  }, [input, isStreaming, activeAgent, addMessage, setInput, sendToAI])

  // ---- Handle workflow action button click ----
  const handleWorkflowAction = useCallback(async (actionId: string) => {
    const chapterFiles = currentFiles.filter((f) => f.type === 'chapter')
    const lastChapter = chapterFiles[chapterFiles.length - 1]

    switch (actionId) {
      case 'regenerate_outline':
        // Regenerate outline
        workflow.regenerateOutline()
        addMessage('continuation', { role: 'user', content: '请重新生成第' + workflow.currentChapterNum + '章的大纲。' })
        await sendToAI('continuation', '请重新生成第' + workflow.currentChapterNum + '章的大纲。')
        break

      case 'rewrite_selection':
        // Rewrite selected text
        if (workflow.selectedText) {
          addMessage('continuation', { role: 'user', content: `请重写以下内容：\n\n${workflow.selectedText}` })
          await sendToAI('continuation', `请重写以下内容：\n\n${workflow.selectedText}`)
        }
        break

      case 'confirm_outline':
        // Confirm outline and proceed to draft phase
        workflow.confirmOutline(workflow.outlineContent)
        // Open draft file
        openFile('drafts/chapter_draft.md', '')
        addMessage('continuation', { role: 'user', content: '大纲已确认。请根据大纲生成章节正文草稿。' })
        await sendToAI('continuation', '大纲已确认。请根据大纲生成章节正文草稿。')
        break

      case 'regenerate_draft':
        // Regenerate draft
        workflow.regenerateDraft()
        addMessage('continuation', { role: 'user', content: '请重新生成章节正文草稿。' })
        await sendToAI('continuation', '请重新生成章节正文草稿。')
        break

      case 'confirm_draft':
        // Confirm draft and proceed to review phase
        workflow.confirmDraft(workflow.draftContent)
        addMessage('review', { role: 'user', content: '请审核当前章节草稿。' })
        await sendToAI('review', '请审核当前章节草稿。')
        break

      case 'auto_fix':
        // Auto fix based on review report
        addMessage('continuation', { role: 'user', content: `请根据以下审核报告修改草稿：\n\n${workflow.reviewReport}` })
        await sendToAI('continuation', `请根据以下审核报告修改草稿：\n\n${workflow.reviewReport}`)
        break

      case 'archive':
        // Archive chapter
        workflow.archive()
        onArchive?.()
        break

      case 'next_chapter':
        // Start next chapter workflow
        workflow.reset()
        const nextChapterNum = currentChapterIndex + 1
        workflow.startOutline(nextChapterNum, `第${nextChapterNum}章`)
        // Note: openFile is called after AI response in handleActionClick
        break

      case 'reset_workflow':
        // Reset workflow to idle
        workflow.reset()
        break
    }
  }, [workflow, currentFiles, addMessage, sendToAI, openFile, onArchive, currentChapterIndex])

  // ---- Handle action button click ----
  const handleActionClick = useCallback(async (action: ActionButtonDef) => {
    if (action.id === 'archive') {
      onArchive?.()
      return
    }
    if (!action.agent) return

    // Workflow-aware button handling
    if (action.id === 'next_chapter') {
      // Start outline workflow
      const nextChapterNum = currentChapterIndex + 1
      workflow.startOutline(nextChapterNum, `第${nextChapterNum}章`)
    }

    setActiveAgent(action.agent)
    addMessage(action.agent, { role: 'user', content: action.prompt })
    await sendToAI(action.agent, action.prompt)
    
    // After AI response, open the outline file
    if (action.id === 'next_chapter') {
      const outlinePath = 'knowledge/chapter_outline.md'
      openFile(outlinePath, '')
    }
  }, [onArchive, setActiveAgent, addMessage, sendToAI, workflow, currentChapterIndex, openFile])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ---- Render message content ----
  function renderMessageContent(content: string) {
    const lines = content.split('\n')
    return lines.map((line, i) => {
      if (line.startsWith('# ')) {
        return <h3 key={i} className="chat-message-heading">{line.slice(2)}</h3>
      }
      if (line.startsWith('## ')) {
        return <h4 key={i} className="chat-message-heading">{line.slice(3)}</h4>
      }
      if (line.startsWith('- ')) {
        return <li key={i} className="chat-message-list-item">{line.slice(2)}</li>
      }
      if (line.startsWith('> ')) {
        return <blockquote key={i} className="chat-message-quote">{line.slice(2)}</blockquote>
      }
      if (line.trim() === '') {
        return <div key={i} style={{ height: 8 }} />
      }
      return <p key={i} className="chat-message-paragraph">{line}</p>
    })
  }

  const activeBook = currentBookId ? books.find((b) => b.id === currentBookId) : null

  return (
    <div className="chat-panel">
      {/* Messages */}
      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon">🤖</div>
            <div className="chat-empty-title">
              {activeAgent
                ? `${activeAgent === 'continuation' ? '续写' : activeAgent === 'review' ? '审核' : activeAgent === 'world' ? '世界观' : activeAgent === 'style' ? '文风' : 'AI'} 助手`
                : 'AI 创作助手'}
            </div>
            <div className="chat-empty-subtitle">
              {activeBook
                ? `当前作品：${activeBook.title}`
                : '选择一本书开始创作'}
            </div>
            <div className="chat-empty-hint">
              输入指令或点击下方按钮开始创作
            </div>
          </div>
        )}

        {messages.map((msg, index) => (
          <div
            key={index}
            className={`chat-message ${msg.role === 'user' ? 'user' : 'assistant'}`}
          >
            <div className="chat-message-avatar">
              {msg.role === 'user' ? '👤' : '🤖'}
            </div>
            <div className="chat-message-content">
              {renderMessageContent(msg.content)}
            </div>
          </div>
        ))}

        {/* Streaming cursor on last message */}
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

      {/* Input area */}
      <div className="chat-input-area">
        {/* Workflow action buttons — above input */}
        <div className="chat-action-buttons">
          {workflow.phase !== 'idle' && workflow.phase !== 'archived' ? (
            // Workflow mode: show workflow actions
            workflow.getCurrentActions().map((action) => (
              <button
                key={action.id}
                className={`chat-action-btn${action.variant === 'primary' ? ' active' : ''}`}
                onClick={() => handleWorkflowAction(action.id)}
                disabled={isStreaming || action.disabled}
              >
                {action.icon} {action.label}
              </button>
            ))
          ) : (
            // Normal mode: show file-based actions
            actionButtons.map((action) => (
              <button
                key={action.id}
                className={`chat-action-btn${action.id === 'next_chapter' || action.id === 'continue' ? ' active' : ''}`}
                onClick={() => handleActionClick(action)}
                disabled={isStreaming || action.disabled}
              >
                {action.icon} {action.label}
              </button>
            ))
          )}
        </div>

        {/* Input row */}
        <div className="chat-input-row">
          <input
            ref={inputRef}
            type="text"
            className="chat-input"
            placeholder={
              workflow.phase === 'outline' ? '与 AI 讨论大纲，或输入修改指令...' :
              workflow.phase === 'draft' ? '与 AI 讨论草稿，或输入修改指令...' :
              workflow.phase === 'review' ? '查看审核报告，或输入修改要求...' :
              '输入指令，跟 AI 一起创作'
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
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

        {/* Model selector */}
        <div className="chat-model-selector">
          <select
            className="chat-model-select"
            value={model || ''}
            onChange={(e) => {
              const selectedModel = e.target.value
              const found = savedModels.find((sm) => sm.name === selectedModel)
              useSettingsStore.getState().updateSettings({
                model: selectedModel,
                modelContextWindow: found?.contextWindow || 200000,
              })
            }}
          >
            {savedModels.length === 0 ? (
              <option value="">请先配置模型</option>
            ) : (
              savedModels.map((sm) => (
                <option key={sm.name} value={sm.name}>
                  {sm.name}
                </option>
              ))
            )}
          </select>
        </div>
      </div>
    </div>
  )
}
