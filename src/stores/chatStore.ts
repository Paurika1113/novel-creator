import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChatMessage } from '../types'

interface ChatStore {
  // 统一对话历史（不再按 Agent 分组）
  conversation: ChatMessage[]
  isStreaming: boolean
  streamingMessageId: string | null
  abortController: AbortController | null

  // 消息操作（不再需要 agent 参数）
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  appendToLastMessage: (content: string) => void
  updateMessageContent: (messageId: string, content: string) => void
  updateMessageStatus: (messageId: string, status: ChatMessage['status']) => void
  clearConversation: () => void

  // 流式输出
  setStreaming: (streaming: boolean) => void
  startStreaming: () => string
  stopStreaming: () => void
  cancelStreaming: () => void

  // 工具调用
  updateMessageToolCalls: (messageId: string, toolCalls: ChatMessage['toolCalls']) => void
  updateToolResult: (messageId: string, toolCallId: string, result: string, status: 'success' | 'error') => void

  // 获取对话
  getConversation: () => ChatMessage[]
}

const initialConversation: ChatMessage[] = [
  {
    id: 'system-init',
    role: 'system',
    content: '我是你的写作助手，可以帮助你进行大纲规划、章节续写、草稿审核、风格润色和世界观构建。直接告诉我你需要什么即可。',
    timestamp: new Date().toISOString(),
    status: 'sent',
  },
]

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      conversation: initialConversation,
      isStreaming: false,
      streamingMessageId: null,
      abortController: null,

      addMessage: (message) => {
        const newMsg: ChatMessage = {
          ...message,
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: new Date().toISOString(),
        }
        set((state) => ({
          conversation: [...state.conversation, newMsg],
        }))
      },

      appendToLastMessage: (content) => {
        set((state) => {
          const msgs = state.conversation
          if (msgs.length === 0) return state
          const lastMsg = msgs[msgs.length - 1]
          const updated = { ...lastMsg, content: lastMsg.content + content }
          return { conversation: [...msgs.slice(0, -1), updated] }
        })
      },

      updateMessageContent: (messageId, content) => {
        set((state) => ({
          conversation: state.conversation.map((m) =>
            m.id === messageId ? { ...m, content } : m
          ),
        }))
      },

      updateMessageStatus: (messageId, status) => {
        set((state) => ({
          conversation: state.conversation.map((m) =>
            m.id === messageId ? { ...m, status } : m
          ),
        }))
      },

      clearConversation: () => {
        set({ conversation: [] })
      },

      setStreaming: (streaming) => set({ isStreaming: streaming }),

      startStreaming: () => {
        const abortController = new AbortController()
        const newMsg: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role: 'assistant',
          content: '',
          timestamp: new Date().toISOString(),
          status: 'sending',
        }

        set((state) => ({
          isStreaming: true,
          streamingMessageId: newMsg.id,
          abortController,
          conversation: [...state.conversation, newMsg],
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

      updateMessageToolCalls: (messageId, toolCalls) => {
        set((state) => ({
          conversation: state.conversation.map((m) =>
            m.id === messageId ? { ...m, toolCalls, status: 'sent' } : m
          ),
        }))
      },

      updateToolResult: (messageId, toolCallId, result, status) => {
        set((state) => ({
          conversation: state.conversation.map((m) => {
            if (m.id !== messageId || !m.toolCalls) return m
            return {
              ...m,
              toolCalls: m.toolCalls.map((tc) =>
                tc.id === toolCallId ? { ...tc, result, status } : tc
              ),
            }
          }),
        }))
      },

      getConversation: () => {
        return get().conversation
      },
    }),
    {
      name: 'nc:chat-store',
      // 只持久化对话历史
      partialize: (state) => ({
        conversation: state.conversation,
      }),
    }
  )
)