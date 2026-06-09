/**
 * 知识文件初始化向导
 * 新建书籍后弹出，AI 以编辑身份引导作者讨论世界观和全书大纲，
 * 讨论完成后自动生成三份知识文件
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import Modal from '../ui/Modal'
import { streamInitChat, generateKnowledgeFiles, type BookInfo, type GeneratedFiles } from '../../services/knowledgeInit'
import { useEditorStore } from '../../stores/editorStore'
import { useSettingsStore } from '../../stores/settingsStore'

interface Props {
  open: boolean
  bookInfo: BookInfo
  bookId: string
  onClose: () => void
  onComplete: () => void // 文件生成完成后的回调：关闭向导，跳转创作台
}

type Phase = 'initializing' | 'chatting' | 'generating' | 'done'

interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
}

export default function KnowledgeInitWizard({ open, bookInfo, bookId, onClose, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('initializing')
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [inputValue, setInputValue] = useState('')
  const [streamingContent, setStreamingContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedFiles, setGeneratedFiles] = useState<GeneratedFiles | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const messagesRef = useRef<ChatMsg[]>([])
  const addFile = useEditorStore((s) => s.addFile)
  const settings = useSettingsStore((s) => s.settings)

  // 同步 messages 到 ref，供 handleFinish 使用
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // 检查 API Key 是否已配置
  const hasApiKey = !!settings.apiKey

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // 初始化：发送系统提示词，获取 AI 第一个问题
  useEffect(() => {
    if (!open || !hasApiKey) return
    if (phase !== 'initializing') return

    const controller = new AbortController()
    abortRef.current = controller

    ;(async () => {
      try {
        setIsStreaming(true)
        const generator = await streamInitChat(bookInfo, [], controller.signal)
        let content = ''
        for await (const delta of generator) {
          if (delta.type === 'delta') {
            content += delta.content || ''
            setStreamingContent(content)
          } else if (delta.type === 'error') {
            setError(delta.error || '连接失败')
            setIsStreaming(false)
            return
          }
        }
        if (content) {
          setMessages([{ role: 'assistant', content }])
        }
        setStreamingContent('')
        setIsStreaming(false)
        setPhase('chatting')
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        setError((err as Error).message || '初始化失败')
        setIsStreaming(false)
      }
    })()

    return () => controller.abort()
    // phase 变化由初始化逻辑内部控制，bookInfo 在打开时稳定，避免重复触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hasApiKey, bookInfo])

  // 发送用户消息
  const handleSend = useCallback(async () => {
    const text = inputValue.trim()
    if (!text || isStreaming || !hasApiKey) return

    setInputValue('')
    // 使用函数式更新避免依赖 messages
    const userMsg: ChatMsg = { role: 'user', content: text }
    setMessages((prev) => {
      const newMessages = [...prev, userMsg]

      // 异步发送逻辑
      const controller = new AbortController()
      abortRef.current = controller

      ;(async () => {
        try {
          setIsStreaming(true)
          setStreamingContent('')
          const generator = await streamInitChat(bookInfo, newMessages, controller.signal)
          let content = ''
          for await (const delta of generator) {
            if (delta.type === 'delta') {
              content += delta.content || ''
              setStreamingContent(content)
            } else if (delta.type === 'error') {
              setError(delta.error || '请求失败')
              setIsStreaming(false)
              return
            }
          }
          if (content) {
            setMessages((prev2) => [...prev2, { role: 'assistant', content }])
          }
          setStreamingContent('')
          setIsStreaming(false)
        } catch (err) {
          if ((err as Error).name === 'AbortError') return
          setError((err as Error).message || '请求失败')
          setIsStreaming(false)
        }
      })()

      return newMessages
    })
  }, [inputValue, isStreaming, hasApiKey, bookInfo])

  // 键盘发送
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  // 完成讨论 → 生成知识文件
  const handleFinish = useCallback(async () => {
    if (isStreaming) return
    setPhase('generating')
    setError(null)

    try {
      // 使用函数式获取最新 messages，避免依赖
      const currentMessages = messagesRef.current
      const allMessages = currentMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }))
      const files = await generateKnowledgeFiles(bookInfo, allMessages)
      setGeneratedFiles(files)

      // 将知识文件写入 store（editorStore 已按书隔离，自动使用 currentBookId）
      const now = new Date().toISOString()

      addFile({
        name: '世界观设定',
        path: 'knowledge/world_model.md',
        type: 'world_model',
        content: files.world_model,
        updatedAt: now,
      })
      addFile({
        name: '总纲',
        path: 'knowledge/master_outline.md',
        type: 'master_outline',
        content: files.master_outline,
        updatedAt: now,
      })
      addFile({
        name: '灵感笔记',
        path: 'knowledge/brainstorm.md',
        type: 'brainstorm',
        content: files.brainstorm,
        updatedAt: now,
      })

      setPhase('done')
    } catch (err) {
      setError((err as Error).message || '生成知识文件失败')
      setPhase('chatting') // 让用户可以重试
    }
  }, [isStreaming, bookInfo, addFile])

  // 输入框内容变化
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputValue(e.target.value)
  }

  return (
    <Modal open={open} onClose={onClose} width={640}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: 520,
          fontFamily: 'var(--font-sans)',
        }}
      >
        {/* ---- 头部 ---- */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: 12,
            borderBottom: '1px solid var(--border-color)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>🤖</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
              知识文件初始化
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              · 《{bookInfo.title}》
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 18,
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              padding: '4px 8px',
              borderRadius: 4,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover-bg)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            ✕
          </button>
        </div>

        {/* ---- 状态栏 ---- */}
        {phase === 'chatting' && (
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              padding: '6px 0',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4CAF50', display: 'inline-block' }} />
            讨论中 · AI 会逐个提问，充分讨论后点击下方按钮生成知识文件
          </div>
        )}

        {/* ---- 消息区域 ---- */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: '12px 0',
          }}
        >
          {/* 未配置 API Key */}
          {!hasApiKey && phase === 'initializing' && (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 20px',
                color: 'var(--text-secondary)',
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 12 }}>🔑</div>
              <div style={{ fontSize: 14, marginBottom: 8 }}>请先在设置中配置 API Key</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                配置 API Key 后，AI 将引导你完成世界观和大纲的设定
              </div>
            </div>
          )}

          {/* 初始化加载 */}
          {hasApiKey && phase === 'initializing' && (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 20px',
                color: 'var(--text-secondary)',
              }}
            >
              <div style={{ fontSize: 14 }}>AI 正在准备第一个问题…</div>
            </div>
          )}

          {/* 对话消息 */}
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 8,
                flexDirection: msg.role === 'assistant' ? 'row' : 'row-reverse',
                alignItems: 'flex-start',
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  flexShrink: 0,
                  background: msg.role === 'assistant' ? 'var(--primary-bg)' : 'var(--hover-bg)',
                }}
              >
                {msg.role === 'assistant' ? '🤖' : '👤'}
              </div>
              <div
                style={{
                  maxWidth: '80%',
                  padding: '8px 12px',
                  borderRadius: 12,
                  fontSize: 13,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  background: msg.role === 'assistant' ? 'var(--hover-bg)' : 'var(--primary-bg)',
                  color: 'var(--text-primary)',
                }}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {/* 正在流式输出的消息 */}
          {(isStreaming || phase === 'initializing') && streamingContent && (
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  flexShrink: 0,
                  background: 'var(--primary-bg)',
                }}
              >
                🤖
              </div>
              <div
                style={{
                  maxWidth: '80%',
                  padding: '8px 12px',
                  borderRadius: 12,
                  fontSize: 13,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  background: 'var(--hover-bg)',
                  color: 'var(--text-primary)',
                }}
              >
                {streamingContent}
                <span
                  style={{
                    display: 'inline-block',
                    width: 2,
                    height: 14,
                    background: 'var(--text-primary)',
                    marginLeft: 2,
                    animation: 'blink 1s step-end infinite',
                    verticalAlign: 'middle',
                  }}
                />
              </div>
            </div>
          )}

          {/* 生成中 */}
          {phase === 'generating' && (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 20px',
              }}
            >
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>
                🧠 AI 正在根据讨论内容生成知识文件…
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                包括世界观设定、全书总纲和灵感笔记
              </div>
            </div>
          )}

          {/* 生成完成 */}
          {phase === 'done' && generatedFiles && (
            <div
              style={{
                padding: '20px 0',
              }}
            >
              <div
                style={{
                  textAlign: 'center',
                  fontSize: 16,
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  marginBottom: 16,
                }}
              >
                ✅ 知识文件生成完成
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { name: '世界观设定', icon: '🌍', file: 'world_model.md', preview: generatedFiles.world_model.slice(0, 80) + '…' },
                  { name: '全书总纲', icon: '📖', file: 'master_outline.md', preview: generatedFiles.master_outline.slice(0, 80) + '…' },
                  { name: '灵感笔记', icon: '💡', file: 'brainstorm.md', preview: generatedFiles.brainstorm.slice(0, 80) + '…' },
                ].map((item) => (
                  <div
                    key={item.file}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 14px',
                      background: 'var(--hover-bg)',
                      borderRadius: 8,
                    }}
                  >
                    <span style={{ fontSize: 20 }}>{item.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {item.preview}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                      {item.file}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 错误信息 */}
          {error && (
            <div
              style={{
                padding: '8px 12px',
                background: 'var(--error-bg, #ffebee)',
                color: '#c62828',
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              ⚠️ {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ---- 输入区域（chatting 阶段） ---- */}
        {phase === 'chatting' && (
          <div
            style={{
              borderTop: '1px solid var(--border-color)',
              paddingTop: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="输入你的想法…"
                rows={2}
                disabled={isStreaming || !hasApiKey}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  resize: 'none',
                  fontFamily: 'inherit',
                  outline: 'none',
                  opacity: isStreaming ? 0.6 : 1,
                }}
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || isStreaming}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: inputValue.trim() && !isStreaming ? 'var(--primary-color, #7c5cfc)' : 'var(--border-color)',
                  color: inputValue.trim() && !isStreaming ? '#fff' : 'var(--text-muted)',
                  cursor: inputValue.trim() && !isStreaming ? 'pointer' : 'default',
                  fontSize: 13,
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                }}
              >
                {isStreaming ? '…' : '发送'}
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                onClick={handleFinish}
                disabled={messages.length === 0 || isStreaming}
                style={{
                  padding: '8px 24px',
                  borderRadius: 8,
                  border: 'none',
                  background:
                    messages.length > 0 && !isStreaming ? '#4CAF50' : 'var(--border-color)',
                  color: messages.length > 0 && !isStreaming ? '#fff' : 'var(--text-muted)',
                  cursor: messages.length > 0 && !isStreaming ? 'pointer' : 'default',
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                🎯 完成讨论并生成知识文件
              </button>
            </div>
          </div>
        )}

        {/* ---- 完成阶段的操作按钮 ---- */}
        {phase === 'done' && (
          <div
            style={{
              borderTop: '1px solid var(--border-color)',
              paddingTop: 12,
              display: 'flex',
              justifyContent: 'center',
              gap: 12,
            }}
          >
            <button
              onClick={onComplete}
              style={{
                padding: '10px 32px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--primary-color, #7c5cfc)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              进入创作台
            </button>
          </div>
        )}

        {/* ---- generating 阶段禁用输入 ---- */}
        {phase === 'generating' && (
          <div
            style={{
              borderTop: '1px solid var(--border-color)',
              paddingTop: 12,
              textAlign: 'center',
              fontSize: 12,
              color: 'var(--text-muted)',
            }}
          >
            正在生成中，请稍候…
          </div>
        )}
      </div>

      {/* 光标闪烁动画 */}
      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </Modal>
  )
}
