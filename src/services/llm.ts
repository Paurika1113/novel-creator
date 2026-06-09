/**
 * LLM API 服务 —— 支持 OpenAI 兼容 & Anthropic Claude 流式对话
 */

const PROVIDER_ENDPOINTS: Record<string, { base: string; chatPath: string }> = {
  claude: {
    base: 'https://api.anthropic.com',
    chatPath: '/v1/messages',
  },
  openai: {
    base: 'https://api.openai.com/v1',
    chatPath: '/chat/completions',
  },
  deepseek: {
    base: 'https://api.deepseek.com/v1',
    chatPath: '/chat/completions',
  },
  custom: {
    base: '',
    chatPath: '/chat/completions',
  },
}

// Model names are now read from settingsStore (user-configurable).
// These are fallbacks only.
const FALLBACK_MODELS: Record<string, string> = {
  claude: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  deepseek: 'deepseek-v4',
  custom: '',
}

export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
}

export interface LLMRequest {
  messages: LLMMessage[]
  model?: string
  tools?: ToolDefinition[]
  signal?: AbortSignal
  maxTokens?: number
}

export interface LLMDelta {
  type: 'delta' | 'done' | 'error' | 'tool_call'
  content?: string
  error?: string
  toolCalls?: Array<{
    id: string
    name: string
    arguments: Record<string, unknown>
  }>
}

function getEndpoint(provider: string) {
  return PROVIDER_ENDPOINTS[provider] || PROVIDER_ENDPOINTS.custom
}

/** 智能拼接 API URL：如果 baseUrl 已包含 apiPath，则不重复追加 */
function buildApiUrl(baseUrl: string, apiPath: string): string {
  const cleaned = baseUrl.replace(/\/+$/, '')
  if (cleaned.endsWith(apiPath)) return cleaned
  return cleaned + apiPath
}

/**
 * 开发环境下优先走 API 代理（规避 CORS），代理不可用时回退直连
 * 注意：streaming 场景下 direct 分支可能因 CORS 失败，建议用 npm run dev
 */
async function fetchWithProxy(url: string, options: RequestInit): Promise<Response> {
  const isLocalhost = typeof window !== 'undefined' &&
    window.location.hostname === 'localhost'
  if (isLocalhost) {
    try {
      // options.body 是调用方已 JSON.stringify 的字符串，
      // 代理的 JSON.stringify(body) 会再串化一次。
      // 需先 parse 回对象，让代理只串一次。
      let parsedBody: unknown = options.body
      if (typeof options.body === 'string') {
        try { parsedBody = JSON.parse(options.body) } catch { /* 非 JSON 字符串，保持原样 */ }
      }
      const proxyRes = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          method: options.method || 'POST',
          headers: (options.headers as Record<string, string>) || {},
          body: parsedBody || undefined,
        }),
        // 使用更长的超时时间，避免与 streamOpenAICompat 中的超时冲突
        signal: AbortSignal.timeout(300000), // 5分钟
      })
      if (proxyRes.status !== 404 && proxyRes.status !== 405) {
        return proxyRes
      }
    } catch (e) {
      console.warn('[fetchWithProxy] 代理请求失败，回退到直连:', e)
      // proxy 不可用，回退到直连
    }
  }
  return fetch(url, options)
}

function getDefaultModel(provider: string): string {
  // Fallback — the real model resolution happens in streamChat/chat with settings lookup
  return FALLBACK_MODELS[provider] || 'gpt-4o'
}

const DEFAULT_TIMEOUT_MS = 300000 // 5分钟默认超时

function createTimeoutSignal(signal?: AbortSignal, timeoutMs = DEFAULT_TIMEOUT_MS): AbortSignal {
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(new Error('请求超时')), timeoutMs)

  if (signal) {
    signal.addEventListener('abort', () => {
      clearTimeout(timeoutId)
      timeoutController.abort()
    })
  }

  return timeoutController.signal
}

/**
 * 流式调用 OpenAI 兼容 API（OpenAI / DeepSeek / 自定义）
 */
async function* streamOpenAICompat(
  request: LLMRequest,
  baseUrl: string,
  apiKey: string,
  model: string,
): AsyncGenerator<LLMDelta> {
  const url = buildApiUrl(baseUrl, '/chat/completions')

  const body: Record<string, unknown> = {
    model,
    messages: request.messages.map((m) => {
      const msg: Record<string, unknown> = { role: m.role, content: m.content }
      if (m.tool_calls) msg.tool_calls = m.tool_calls
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id
      return msg
    }),
    stream: true,
    max_tokens: request.maxTokens || 16384,
  }

  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools
  }

  // 合并外部 signal 和默认超时
  const combinedSignal = createTimeoutSignal(request.signal)

  const response = await fetchWithProxy(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: combinedSignal,
  })

  if (!response.ok) {
    let errorBody = ''
    try {
      errorBody = await response.text()
    } catch { /* ignore */ }
    yield {
      type: 'error',
      error: `API 请求失败 (${response.status}): ${errorBody.slice(0, 200)}`,
    }
    return
  }

  if (!response.body) {
    yield { type: 'error', error: '响应体为空' }
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let malformedLineCount = 0

  // Tool call accumulator: index → { id, name, arguments }
  const toolAccum = new Map<number, { id: string; name: string; arguments: string }>()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      if (trimmed === 'data: [DONE]') {
        yield { type: 'done' }
        return
      }
      if (!trimmed.startsWith('data: ')) continue

      try {
        const data = JSON.parse(trimmed.slice(6))
        const choice = data.choices?.[0]

        if (!choice) continue

        // Content delta (from streaming text response)
        if (choice.delta?.content) {
          yield { type: 'delta', content: choice.delta.content }
        }

        // Tool call chunks — accumulate across streaming chunks
        if (choice.delta?.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            const idx = tc.index ?? 0
            if (!toolAccum.has(idx)) {
              toolAccum.set(idx, { id: '', name: '', arguments: '' })
            }
            const acc = toolAccum.get(idx)!
            if (tc.id) acc.id = tc.id
            if (tc.function?.name) acc.name = tc.function.name
            if (tc.function?.arguments) acc.arguments += tc.function.arguments
          }
          continue
        }

        // Finish reason
        if (choice.finish_reason && choice.finish_reason !== 'null') {
          if (choice.finish_reason === 'tool_calls' && toolAccum.size > 0) {
            // Yield accumulated tool calls all at once
            const calls = Array.from(toolAccum.values()).map((tc) => ({
              id: tc.id,
              name: tc.name,
              arguments: tc.arguments ? JSON.parse(tc.arguments) : {},
            }))
            yield { type: 'tool_call', toolCalls: calls }
          }
          yield { type: 'done' }
          return
        }
      } catch {
        malformedLineCount++
        if (malformedLineCount >= 5) {
          yield { type: 'error', error: '流式数据异常：连续多条 malformed JSON，请检查网络或 API 服务状态' }
          return
        }
      }
    }
  }

  // If there are accumulated tool calls at the end, yield them
  if (toolAccum.size > 0) {
    const calls = Array.from(toolAccum.values()).map((tc) => ({
      id: tc.id,
      name: tc.name,
      arguments: tc.arguments ? JSON.parse(tc.arguments) : {},
    }))
    yield { type: 'tool_call', toolCalls: calls }
  }

  yield { type: 'done' }
}

/**
 * 流式调用 Anthropic Claude API
 */
async function* streamClaude(
  request: LLMRequest,
  baseUrl: string,
  apiKey: string,
  model: string,
): AsyncGenerator<LLMDelta> {
  const url = buildApiUrl(baseUrl, '/v1/messages')

  // Claude 的 system 消息要单独提取
  const systemMsg = request.messages.find((m) => m.role === 'system')
  const nonSystemMsgs = request.messages.filter((m) => m.role !== 'system')

  const body: Record<string, unknown> = {
    model,
    messages: nonSystemMsgs.map((m) => {
      // Claude 不支持 tool role，需要转成 assistant
      if (m.role === 'tool') {
        return {
          role: 'assistant',
          content: `[工具调用结果: ${m.tool_call_id}]\n${m.content}`,
        }
      }
      return { role: m.role, content: m.content }
    }),
    max_tokens: request.maxTokens || 16384,
    stream: true,
  }

  if (systemMsg) {
    body.system = systemMsg.content
  }

  // Claude 也支持 tool definitions
  if (request.tools && request.tools.length > 0) {
    body.tools = request.tools
  }

  // 合并外部 signal 和默认超时
  const combinedSignal = createTimeoutSignal(request.signal)

  const response = await fetchWithProxy(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: combinedSignal,
  })

  if (!response.ok) {
    let errorBody = ''
    try {
      errorBody = await response.text()
    } catch { /* ignore */ }
    yield {
      type: 'error',
      error: `Claude API 请求失败 (${response.status}): ${errorBody.slice(0, 200)}`,
    }
    return
  }

  if (!response.body) {
    yield { type: 'error', error: '响应体为空' }
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let malformedLineCount = 0

  // Tool call accumulation for Claude
  let currentEvent = ''
  const toolAccum = new Map<number, { id: string; name: string; arguments: string }>()
  let accumulatedContent = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      // Track current event type from "event:" lines
      if (trimmed.startsWith('event: ')) {
        currentEvent = trimmed.slice(7).trim()
        continue
      }

      if (!trimmed.startsWith('data: ')) continue

      // Claude SSE: data: {...}
      try {
        const data = JSON.parse(trimmed.slice(6))

        // content_block_start — may be text or tool_use
        if (data.type === 'content_block_start') {
          const block = data.content_block
          if (block?.type === 'tool_use') {
            // Start accumulating a tool call
            const idx = data.index ?? 0
            toolAccum.set(idx, {
              id: block.id || '',
              name: block.name || '',
              arguments: block.input ? JSON.stringify(block.input) : '',
            })
          }
          // If it's a text block without delta handling, capture initial text
          if (block?.type === 'text' && block.text) {
            accumulatedContent += block.text
            yield { type: 'delta' as const, content: block.text }
          }
          continue
        }

        // content_block_delta — either text or input_json_delta
        if (data.type === 'content_block_delta') {
          const delta = data.delta
          if (delta?.type === 'text' && delta.text) {
            accumulatedContent += delta.text
            yield { type: 'delta' as const, content: delta.text }
          }
          if (delta?.type === 'input_json_delta' && delta.partial_json) {
            const idx = data.index ?? 0
            if (!toolAccum.has(idx)) {
              toolAccum.set(idx, { id: '', name: '', arguments: '' })
            }
            const acc = toolAccum.get(idx)!
            acc.arguments += delta.partial_json
          }
          continue
        }

        // message_delta — may contain stop_reason and usage info
        if (data.type === 'message_delta') {
          if (data.delta?.stop_reason === 'tool_use' || data.delta?.stop_reason === 'end_turn') {
            // Will yield tools at message_stop
          }
          continue
        }

        // message_stop — end of stream
        if (data.type === 'message_stop') {
          // Yield accumulated tool calls if any
          if (toolAccum.size > 0) {
            const calls = Array.from(toolAccum.values()).map((tc) => {
              let parsedArgs: Record<string, unknown> = {}
              try {
                parsedArgs = tc.arguments ? JSON.parse(tc.arguments) : {}
              } catch { /* partial JSON, use empty */ }
              return { id: tc.id, name: tc.name, arguments: parsedArgs }
            })
            yield { type: 'tool_call' as const, toolCalls: calls }
          }
          yield { type: 'done' as const }
          return
        }

        if (data.type === 'error') {
          yield { type: 'error' as const, error: data.error?.message || 'Claude 未知错误' }
          return
        }
      } catch {
        malformedLineCount++
        if (malformedLineCount >= 5) {
          yield { type: 'error', error: '流式数据异常：连续多条 malformed JSON，请检查网络或 API 服务状态' }
          return
        }
      }
    }
  }

  // If there are accumulated tool calls at the end, yield them
  if (toolAccum.size > 0) {
    const calls = Array.from(toolAccum.values()).map((tc) => {
      let parsedArgs: Record<string, unknown> = {}
      try {
        parsedArgs = tc.arguments ? JSON.parse(tc.arguments) : {}
      } catch { /* partial JSON */ }
      return { id: tc.id, name: tc.name, arguments: parsedArgs }
    })
    yield { type: 'tool_call' as const, toolCalls: calls }
  }

  yield { type: 'done' }
}

/**
 * 流式对话入口
 * 根据 provider 自动选择不同 API 实现
 */
export async function* streamChat(
  request: LLMRequest,
  options?: {
    provider?: string
    apiKey?: string
    baseUrl?: string
  },
): AsyncGenerator<LLMDelta> {
  const { provider, apiKey, baseUrl } = options || {}

  // 从 settings store 读取配置
  const { useSettingsStore } = await import('../stores/settingsStore')
  const settings = useSettingsStore.getState().settings

  const resolvedProvider = provider || settings.provider || 'openai'
  const resolvedApiKey = apiKey || settings.apiKey
  const resolvedBaseUrl = baseUrl || settings.baseUrl
  const resolvedModel = request.model || settings.model || getDefaultModel(resolvedProvider)

  // 最终 baseUrl：provider 默认 + 用户覆盖
  const endpoint = getEndpoint(resolvedProvider)
  const finalBaseUrl = resolvedBaseUrl || endpoint.base

  if (!finalBaseUrl) {
    yield {
      type: 'error',
      error: 'Base URL 未配置，请在设置中填写 API 地址',
    }
    return
  }

  if (!resolvedApiKey) {
    yield {
      type: 'error',
      error: 'API Key 未配置，请在设置中填写',
    }
    return
  }

  if (resolvedProvider === 'claude') {
    yield* streamClaude(request, finalBaseUrl, resolvedApiKey, resolvedModel)
  } else {
    yield* streamOpenAICompat(request, finalBaseUrl, resolvedApiKey, resolvedModel)
  }
}

/**
 * 非流式聊天（用于简单请求，如测试连接）
 */
export async function chat(
  request: LLMRequest,
  options?: {
    provider?: string
    apiKey?: string
    baseUrl?: string
  },
): Promise<string> {
  const { provider, apiKey, baseUrl } = options || {}
  const { useSettingsStore } = await import('../stores/settingsStore')
  const settings = useSettingsStore.getState().settings

  const resolvedProvider = provider || settings.provider || 'openai'
  const resolvedApiKey = apiKey || settings.apiKey
  const resolvedBaseUrl = baseUrl || settings.baseUrl
  const resolvedModel = request.model || settings.model || getDefaultModel(resolvedProvider)
  const endpoint = getEndpoint(resolvedProvider)
  const finalBaseUrl = resolvedBaseUrl || endpoint.base

  if (!resolvedApiKey) {
    throw new Error('API Key 未配置')
  }

  const url = buildApiUrl(finalBaseUrl, '/chat/completions')
  const response = await fetchWithProxy(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${resolvedApiKey}`,
    },
    body: JSON.stringify({
      model: resolvedModel,
      messages: request.messages,
      max_tokens: request.maxTokens || 1024,
    }),
    signal: request.signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`API 请求失败 (${response.status}): ${text.slice(0, 200)}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || ''
}

/**
 * 带工具调用循环的流式对话
 * 
 * 与 streamChat 不同，这个函数在内部处理工具调用的完整循环：
 *   1. 发送消息给 AI
 *   2. AI 返回内容 → 流式输出给调用者
 *   3. AI 返回 tool_calls → 调用 toolExecutor 执行工具
 *   4. 将工具结果追加到消息列表
 *   5. 继续发送消息给 AI（回到步骤 2）
 *   6. AI 不再有 tool_calls → 结束
 * 
 * 最多循环 maxRounds 次防止无限循环。
 * 调用者只需要一个 for await 循环即可处理所有 delta 事件。
 */
export async function* streamChatWithTools(
  request: LLMRequest,
  toolExecutor: (name: string, args: Record<string, unknown>) => Promise<string>,
  options?: {
    provider?: string
    apiKey?: string
    baseUrl?: string
    maxRounds?: number
  },
): AsyncGenerator<LLMDelta & { toolName?: string; toolResult?: string }> {
  const { provider, apiKey, baseUrl, maxRounds = 10 } = options || {}
  
  const { useSettingsStore } = await import('../stores/settingsStore')
  const settings = useSettingsStore.getState().settings

  const resolvedProvider = provider || settings.provider || 'openai'
  const resolvedApiKey = apiKey || settings.apiKey
  const resolvedBaseUrl = baseUrl || settings.baseUrl
  const resolvedModel = request.model || settings.model || getDefaultModel(resolvedProvider)

  const endpoint = getEndpoint(resolvedProvider)
  const finalBaseUrl = resolvedBaseUrl || endpoint.base

  if (!finalBaseUrl) {
    yield { type: 'error', error: 'Base URL 未配置，请在设置中填写 API 地址' }
    return
  }

  if (!resolvedApiKey) {
    yield { type: 'error', error: 'API Key 未配置，请在设置中填写' }
    return
  }

  // 工作副本，工具循环中会不断追加 assistant / tool 消息
  const messages: LLMMessage[] = [...request.messages]
  
  for (let round = 0; round < maxRounds; round++) {
    // 单次流式调用
    const req: LLMRequest = {
      ...request,
      messages,
    }

    let hasToolCalls = false
    let roundContent = ''
    const toolAccum: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = []

    // 根据 provider 选择流式实现
    const stream = resolvedProvider === 'claude'
      ? streamClaude(req, finalBaseUrl, resolvedApiKey, resolvedModel)
      : streamOpenAICompat(req, finalBaseUrl, resolvedApiKey, resolvedModel)

    for await (const delta of stream) {
      if (delta.type === 'error') {
        yield delta
        return
      }
      if ((delta.type === 'delta' || delta.type === 'content') && delta.content) {
        roundContent += delta.content
        yield { type: 'delta' as const, content: delta.content }
      }
      if (delta.type === 'tool_call' && delta.toolCalls) {
        hasToolCalls = true
        toolAccum.push(...delta.toolCalls)
        // 通知 UI：即将执行工具
        yield { type: 'content' as const, content: '' }
      }
      // done 事件由生成器自然结束处理
    }

    if (!hasToolCalls) {
      // AI 没有更多工具调用 → 对话结束
      yield { type: 'done' as const }
      return
    }

    // 构建 assistant 消息（带 tool_calls）
    messages.push({
      role: 'assistant',
      content: roundContent,
      tool_calls: toolAccum.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    })

    // 逐个执行工具
    for (const tc of toolAccum) {
      try {
        const result = await toolExecutor(tc.name, tc.arguments)
        yield { type: 'tool_result' as any, toolName: tc.name, toolResult: result }

        messages.push({
          role: 'tool',
          content: result,
          tool_call_id: tc.id,
        })
      } catch (toolError) {
        const errorMsg = `工具执行失败: ${toolError instanceof Error ? toolError.message : '未知错误'}`
        yield { type: 'tool_result' as any, toolName: tc.name, toolResult: `❌ ${errorMsg}` }

        messages.push({
          role: 'tool',
          content: errorMsg,
          tool_call_id: tc.id,
        })
      }
    }

    // 通知 UI：工具循环继续
    yield { type: 'tool_loop_continue' as any }
  }

  // 超出最大轮次
  yield { type: 'error', error: `达到最大工具调用轮次 (${maxRounds})，请简化指令后重试` }
}
