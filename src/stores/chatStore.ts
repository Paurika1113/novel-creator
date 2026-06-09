import { create } from 'zustand'
import type { ChatMessage, AgentType } from '../types'
import { v4 } from '../lib/id'

interface ChatStore {
  // 各 Agent 的对话历史
  conversations: Record<AgentType, ChatMessage[]>
  activeAgent: AgentType
  isStreaming: boolean
  streamingMessageId: string | null // 当前流式消息的 ID
  abortController: AbortController | null // 用于取消请求

  // Agent 切换
  setActiveAgent: (agent: AgentType) => void

  // 消息操作
  addMessage: (agent: AgentType, message: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  appendToLastMessage: (agent: AgentType, content: string) => void
  updateMessageStatus: (agent: AgentType, messageId: string, status: ChatMessage['status']) => void
  clearConversation: (agent: AgentType) => void
  updateMessageContent: (agent: AgentType, messageId: string, content: string) => void

  // 流式输出
  setStreaming: (streaming: boolean) => void
  startStreaming: () => string // 创建新消息，返回 messageId
  stopStreaming: () => void
  cancelStreaming: () => void

  // 工具调用
  updateMessageToolCalls: (agent: AgentType, messageId: string, toolCalls: ChatMessage['toolCalls']) => void
  updateToolResult: (agent: AgentType, messageId: string, toolCallId: string, result: string, status: 'success' | 'error') => void

  // 获取当前 agent 的对话
  getActiveConversation: () => ChatMessage[]
}

const initialConversations: Record<AgentType, ChatMessage[]> = {
  continuation: [
    {
      id: 'system-init',
      role: 'system',
      content: '我是续写 Agent，我可以根据大纲和前文内容为你续写小说章节。请告诉我你要写什么。',
      agentType: 'continuation',
      timestamp: new Date().toISOString(),
      status: 'sent',
    },
  ],
  world: [
    {
      id: 'system-init-w',
      role: 'system',
      content: '我是世界观 Agent，我可以帮你提取和梳理小说中的世界观设定。',
      agentType: 'world',
      timestamp: new Date().toISOString(),
      status: 'sent',
    },
  ],
  review: [
    {
      id: 'system-init-r',
      role: 'system',
      content: '我是审核 Agent，我可以从世界观一致性、大纲匹配度、前文连续性、文风一致性和文本质量五个维度审阅你的草稿。',
      agentType: 'review',
      timestamp: new Date().toISOString(),
      status: 'sent',
    },
  ],
  style: [
    {
      id: 'system-init-s',
      role: 'system',
      content: '我是文风 Agent，我可以分析你的文风特征并与已绑定的作者身份进行比对。',
      agentType: 'style',
      timestamp: new Date().toISOString(),
      status: 'sent',
    },
  ],
}

export const useChatStore = create<ChatStore>((set, get) => ({
  conversations: initialConversations,
  activeAgent: 'continuation',
  isStreaming: false,
  streamingMessageId: null,
  abortController: null,

  setActiveAgent: (agent) => set({ activeAgent: agent }),

  addMessage: (agent, message) => {
    const newMsg: ChatMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      agentType: agent,
    }
    set((state) => ({
      conversations: {
        ...state.conversations,
        [agent]: [...(state.conversations[agent] || []), newMsg],
      },
    }))
  },

  appendToLastMessage: (agent, content) => {
    set((state) => {
      const msgs = state.conversations[agent] || []
      if (msgs.length === 0) return state
      const lastMsg = msgs[msgs.length - 1]
      const updated = {
        ...lastMsg,
        content: lastMsg.content + content,
      }
      return {
        conversations: {
          ...state.conversations,
          [agent]: [...msgs.slice(0, -1), updated],
        },
      }
    })
  },

  updateMessageContent: (agent, messageId, content) => {
    set((state) => ({
      conversations: {
        ...state.conversations,
        [agent]: (state.conversations[agent] || []).map((m) =>
          m.id === messageId ? { ...m, content } : m
        ),
      },
    }))
  },

  updateMessageStatus: (agent, messageId, status) => {
    set((state) => ({
      conversations: {
        ...state.conversations,
        [agent]: (state.conversations[agent] || []).map((m) =>
          m.id === messageId ? { ...m, status } : m
        ),
      },
    }))
  },

  clearConversation: (agent) => {
    set((state) => ({
      conversations: {
        ...state.conversations,
        [agent]: [],
      },
    }))
  },

  setStreaming: (streaming) => set({ isStreaming: streaming }),

  startStreaming: () => {
    const abortController = new AbortController()
    const agent = get().activeAgent
    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: 'assistant',
      content: '',
      agentType: agent,
      timestamp: new Date().toISOString(),
      status: 'sending',
    }

    set((state) => ({
      isStreaming: true,
      streamingMessageId: newMsg.id,
      abortController,
      conversations: {
        ...state.conversations,
        [agent]: [...(state.conversations[agent] || []), newMsg],
      },
    }))

    return newMsg.id
  },

  stopStreaming: () => {
    set({
      isStreaming: false,
      streamingMessageId: null,
      abortController: null,
    })
  },

  cancelStreaming: () => {
    const { abortController } = get()
    if (abortController) {
      abortController.abort()
    }
    set({
      isStreaming: false,
      streamingMessageId: null,
      abortController: null,
    })
  },

  updateMessageToolCalls: (agent, messageId, toolCalls) => {
    set((state) => ({
      conversations: {
        ...state.conversations,
        [agent]: (state.conversations[agent] || []).map((m) =>
          m.id === messageId ? { ...m, toolCalls, status: 'sent' } : m
        ),
      },
    }))
  },

  updateToolResult: (agent, messageId, toolCallId, result, status) => {
    set((state) => {
      const msgs = state.conversations[agent] || []
      return {
        conversations: {
          ...state.conversations,
          [agent]: msgs.map((m) => {
            if (m.id !== messageId || !m.toolCalls) return m
            return {
              ...m,
              toolCalls: m.toolCalls.map((tc) =>
                tc.id === toolCallId ? { ...tc, result, status } : tc
              ),
            }
          }),
        },
      }
    })
  },

  getActiveConversation: () => {
    const { conversations, activeAgent } = get()
    return conversations[activeAgent] || []
  },
}))
