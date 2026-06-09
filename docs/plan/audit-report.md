# Novel Creator 全局审查报告

**审查日期**: 2026-06-09
**参考项目**: OpenHanako (HanaAgent) · DeepSeek GUI (Kun Runtime)
**范围**: AI 对话系统 · 记忆系统 · 工具调用 · 架构

---

## 一、总览：当前项目成熟度评估

| 维度 | 当前状态 | 目标状态（参考对标） | 差距 |
|------|----------|---------------------|------|
| **对话系统** | 流式多轮，支持工具循环 | 带 session 摘要、token 预算感知、多模型分层 | 中 |
| **记忆系统** | 基本的事件归档 + 无 session 间记忆 | 四层时间衰减 + FactStore FTS5 搜索 | 大 |
| **工具调用** | 7 个硬编码工具，直接读写 localStorage | 插件化工具系统 + 权限分级 + 审批流 | 大 |
| **System Prompt** | 拼接式，无缓存 | 指纹缓存、固定前缀命中模型 KV cache | 中 |
| **持久化** | Zustand + localStorage | SQLite WAL + FTS5 + 文件系统 | 大 |
| **测试** | 无 | 5656 个测试（OpenHanako） | 极大 |

---

## 二、AI 对话系统

### 发现的 7 个问题

#### 问题 1：历史消息硬编码截取

**现状**（ChatPanel.tsx）：
```typescript
const historyMessages = messages.slice(-10) // ❌ 硬编码 10 条
```

无论模型上下文窗口多大、当前已用多少 token，都只取最近 10 条。DeepSeek V4 有 1M token 时浪费容量，小窗口模型又可能超限。

**参考**：OpenHanako 的 `memory-ticker.ts` 使用 **turn-based 调度**——每 10 轮自动做滚动摘要。DeepSeek GUI 的 Kun 使用 `calculateContextBudget` 做 token 预算感知。

**修复方案**：
```
replace:
  messages.slice(-10)
with:
  tokenBudgetAwareSlice(messages, maxTokens) 
  // 从最新消息开始，累积 token 直到达预算上限
```

#### 问题 2：System Prompt 无缓存，Token 浪费

**现状**：`buildSystemPrompt` 每次请求都完整拼接——作者身份四维画像 + 作品信息 + Agent 指令 + 知识合规说明。这些内容每次请求都**完全相同**（除非换书/换作者）。

**参考**：
- **DeepSeek GUI 的 Kun**：固定 system prompt 前缀 + 工具 schema 规范化，利用 DeepSeek 原生 KV cache 命中。运行态报告 cache hit/miss。
- **OpenHanako**：`compile.ts` 每块输出附带 `.fingerprint` 文件，内容不变时直接 return "skipped"。

**修复方案**：
```typescript
// 缓存 system prompt，仅当 persona/book 变更时重新计算
const systemPromptCache = new Map<string, string>()
const cacheKey = `${agentType}:${persona?.id}:${bookTitle}`
if (systemPromptCache.has(cacheKey)) {
  return systemPromptCache.get(cacheKey)!
}
// ...build...
systemPromptCache.set(cacheKey, fullPrompt)
```

#### 问题 3：Claude 不支持工具调用

**现状**（llm.ts `streamClaude`）：只解析 `content_block_delta` 和 `message_stop`，完全没有处理 `tool_use` 类型的 `content_block`。使用 Claude 的模型无法执行任何工具。

**参考**：OpenHanako 基于 Pi SDK，统一了 OpenAI / Anthropic / Google 的多 Provider 调用。

**修复方案**：在 `streamClaude` 中添加 `content_block_start`（类型 `tool_use`）的解析，积累 tool_use 块，在 `message_stop` 时 yield `tool_call`。

#### 问题 4：无 session 摘要机制

**现状**：每次对话都是"干净开始"。连续 5 轮对话后，第 1 轮的内容还在原始消息列表中，无法被"浓缩"。

**参考**：**OpenHanako 的 `session-summary.ts`**——每个 session 一个 JSON 文件，格式为两节：`### 重要事实` + `### 事情经过`。滚动摘要：只取上次摘要之后的新消息做增量处理。工具调用被浓缩为一句话描述。

**修复方案**：
```typescript
// 每 N 轮对话后，对早期消息做 LLM 摘要压缩
// 压缩后的摘要替换原始消息列表的前半部分
if (messages.length > THRESHOLD && !summaryGenerated) {
  const summary = await generateSessionSummary(earlyMessages)
  messages = [{ role: 'system', content: `[对话摘要]\n${summary}` }, ...recentMessages]
}
```

#### 问题 5：Agent 切换时上下文不延续

**现状**：从"续写 Agent"切换到"审核 Agent"再切回来时，续写 Agent 的对话历史完全独立保存，但**不包含其他 Agent 的生产结果**（如审核报告）。

**参考**：OpenHanako 通过 **频道（Channel）** 实现 Agent 间协作。Agent 之间可以互相委派任务，共享上下文。

**修复方案**：
- 在切换 Agent 时，将当前 Agent 的"最后结论"（如草稿、大纲）注入目标 Agent 的上下文中
- 实现 `crossAgentContext: Record<string, string>` 缓存

#### 问题 6：对话不持久化到文件系统

**现状**：`chatStore.conversations` 只在 Zustand 内存中。HMR / 刷新后丢失。而 PRD 设计的 `.agent-conversations/*.jsonl` 从未实现。

**参考**：OpenHanako 每个 session 一个 JSON 文件（`memory/summaries/`），持久化存储。DeepSeek GUI 的 Kun 使用 append-only session log。

**修复方案**：
```typescript
// 在 addMessage 时同步写入文件系统
function persistMessage(msg: ChatMessage, agentType: string, bookId: string) {
  const line = JSON.stringify(msg) + '\n'
  // append to .agent-conversations/{agentType}.jsonl
}
```

#### 问题 7：Message 更新策略是全量替换

**现状**（chatStore.ts）：`updateMessageContent` 将整个 `content` 字段替换——不是追加。在流式输出时，这会导致每次 delta 都重新创建整个字符串。

**参考**：大多数流式实现使用 `appendToLastMessage`（拼接）而非替换。

**影响**：消息超长时（10K+ token），每次更新都复制整个 content 字符串，GC 压力大。

---

## 三、记忆系统

### 当前架构 vs 参考架构

```
当前 Novel Creator:
  memoryStore (Zustand) → events / threads / summaries
    └─ 只有归档时触发 LLM 分析
    └─ memoryUsagePercent 从未被调用（已修复）
    └─ 无 session 间记忆传递
    └─ 压缩只做了 T1 摘要

OpenHanako v3:
  compile.ts → today.md / week.md / longterm.md / facts.md
    ├─ 四层时间衰减（当天/本周/长期/事实）
    ├─ 指纹缓存（输出不变时跳过 LLM）
    ├─ 每 10 轮触发 + session 结束时触发
    ├─ FactStore (FTS5 全文搜索 + 标签匹配)
    └─ 深度记忆提取（每日一次，元事实→标签→FactStore）

DeepSeek GUI Kun:
  cache-first agent loop
    ├─ 稳定 system prompt 前缀
    ├─ append-only session log
    ├─ 上下文卫生（边界压缩）
    └─ cache hit/miss 统计 + Token 用量可视化
```

### 发现的核心问题

#### 问题 8：无 session-to-session 记忆

**现状**：用户今天写了 5 章退出，明天继续时，AI 对昨天讨论的设定毫无记忆——所有历史都在 `chapters/` 中，但**没有压缩过的记忆注入上下文**。

**参考**：OpenHanako 的 `compile.ts` 在每次 session 开始时调用 `assemble()`，从四块文件拼出 ≤2000 token 的记忆注入 system prompt。

**修复方案**：
```typescript
// 类似 OpenHanako 的 assemble()
function buildMemoryContext(bookId: string): string {
  return `
== 全书概要 ==
${readFile('summary/book_snapshot.md')}

== 活跃线程 ==
${readFile('summary/active_elements.md')}

== 近期章节摘要 ==
${readFile('summary/chapter_timeline.md')}
  `.trim()
}
```

#### 问题 9：事件图谱只有归档时分析，缺乏中间态

**现状**：`ArchiveModal.tsx` 的 stage 5 只在归档时调用 `analyzeChapterEvents()`。如果用户在草稿阶段写了大量新内容但没有归档，这些内容不会反映在事件图谱中。

**参考**：OpenHanako 的 `memory-ticker.ts` 是 **turn-based**——无论归档与否，每 10 轮对话自动触发滚动摘要 + 编译。DeepSeek GUI 的 Write 模式每次保存时触发上下文更新。

**修复方案**：在草稿保存（Ctrl+S / 自动保存）时，触发轻量级的事件更新：
```
草稿保存 → 检查是否有新内容 → 轻量 LLM 调用提取新事件 → 更新 active_elements.md
```

#### 问题 10：压缩缺乏指纹缓存

**现状**：`ArchiveModal.tsx` 的 stage 7 每次归档都调用 LLM 生成 T1 摘要，即使章节内容没变过。

**参考**：OpenHanako 的 `computeFingerprint()`——每个编译输出附带 sha256 指纹文件。下次比较指纹，相同则跳过。

**修复方案**：
```typescript
function shouldCompress(chapterPath: string, content: string): boolean {
  const fingerprint = crypto.createHash('sha256').update(content).digest('hex')
  const cached = localStorage.getItem(`nc:${bookId}:fingerprint:${chapterPath}`)
  if (cached === fingerprint) return false // 内容未变，跳过
  localStorage.setItem(`nc:${bookId}:fingerprint:${chapterPath}`, fingerprint)
  return true
}
```

#### 问题 11：没有活跃线程的持续追踪

**现状**：`active_elements.md` 只在归档时更新。用户在第 5 章写了一条埋伏笔，第 6 章结束时才归档，中间没人提醒 AI 这条伏笔。

**参考**：OpenHanako 的 **FactStore** 使用标签（tag）精确匹配 + FTS5 全文搜索。记忆搜索工具 `search_memory` 是两阶段策略：标签优先，FTS5 补充。

**修复方案**：
- 在续写 Agent 的 system prompt 中强调：每次续写前先读 `active_elements.md`
- 在草稿保存时触发轻量级线程状态检查

---

## 四、工具调用系统

### 当前架构 vs 参考架构

```
当前 Novel Creator:
  agents.ts → 7 个 ToolDefinition（硬编码）
  toolExecutor.ts → switch-case 路由
    └─ 直接调用 editorStore / bookStore
    └─ 无权限控制
    └─ 无超时
    └─ 无重试

OpenHanako:
  plugins/tools/*.js → 自动注册（namespace: pluginId_toolName）
    ├─ 两级权限：Restricted / Full-access
    ├─ toolCtx.stageFile() 登记文件
    └─ 插件声明 "trust": "full-access" 才激活

DeepSeek GUI Kun:
  MCP 协议 → 渐进发现
    ├─ mcp_search → mcp_describe → mcp_call
    ├─ 不把完整工具目录塞进 prompt
    └─ 上下文卫生（超长工具结果做边界压缩）
```

### 发现的核心问题

#### 问题 12：工具路由是硬编码 switch-case

**现状**：`toolExecutor.ts` 中 7 个工具通过 switch-case 路由，新增工具需要改两处代码（`agents.ts` 加定义 + `toolExecutor.ts` 加 case）。

**参考**：OpenHanako 的插件系统自动扫描 `tools/` 目录，按命名空间自动注册。

**修复方案**：改为注册表模式：
```typescript
const toolRegistry = new Map<string, ToolHandler>()

export function registerTool(name: string, handler: ToolHandler): void {
  toolRegistry.set(name, handler)
}

registerTool('read_knowledge_file', { handler: readKnowledgeFile, ... })
registerTool('write_current_draft', { handler: writeCurrentDraft, ... })

// executeToolCall 简化为：
export async function executeToolCall(name: string, args: Record<string, unknown>) {
  const tool = toolRegistry.get(name)
  if (!tool) return `错误：未知工具 "${name}"`
  return tool.handler(args)
}
```

#### 问题 13：无工具调用权限控制

**现状**：任何 Agent 都可以调用 `write_current_draft` 和 `write_knowledge_file`。审核 Agent 即使只有只读工具，如果未来扩展或 prompt 注入，可能执行写操作。

**参考**：DeepSeek GUI 三档权限：只读 → 写入需审批 → 完全访问。OpenHanako 两级：Restricted（默认）/ Full-access（需要用户明确开启）。

**修复方案**：在 `getAgentTools` 基础上，增加权限声明：
```typescript
const TOOLS_WRITER = {
  tools: [...],
  permissions: { read: true, write: true, execute: false }
}
const TOOLS_REVIEW = {
  tools: [...],
  permissions: { read: true, write: false, execute: false }
}
// 执行时检查权限：
if (!permissions.write) return '❌ 当前 Agent 无写入权限'
```

#### 问题 14：工具执行无超时机制

**现状**：`executeToolCall` 是 async 函数，但没有任何超时保护。如果 `localStorage.setItem` 抛异常（存储满），可能挂起。

**参考**：DeepSeek GUI 的 `fetchWithProxy` 使用 `AbortSignal.timeout(300000)`。

**修复方案**：
```typescript
async function executeWithTimeout(fn: () => Promise<string>, timeoutMs = 30000): Promise<string> {
  const timeout = new Promise<string>((_, reject) =>
    setTimeout(() => reject(new Error('工具执行超时')), timeoutMs)
  )
  return Promise.race([fn(), timeout])
}
```

#### 问题 15：工具返回结构不统一

**现状**：不同工具的返回格式不一致——`read_knowledge_file` 返回 `## 文件名\n\n内容`，`list_chapters` 返回纯文本列表，`write_current_draft` 返回 `✅ 草稿已写入。正文长度：X 字符。`

**问题**：AI 难以一致地理解工具返回的内容。特别是失败了返回的是 `❌` 开头 vs 正常返回。

**修复方案**：统一工具返回格式：
```typescript
interface ToolResult {
  success: boolean
  data?: string
  error?: string
  metadata?: { contentLength?: number; filePath?: string }
}
```

---

## 五、架构问题

### 问题 16：无独立 Agent Runtime

**现状**：所有 Agent 逻辑跑在 React 组件（`ChatPanel.tsx`）中。`streamChatWithTools` 虽然下沉到服务层，但流式事件在组件中处理。组件重渲染可能导致流中断。

**参考**：
- **OpenHanako**：Agent 运行在独立 Node.js 进程（Hono HTTP/WS 服务），Electron 通过 WebSocket 通信。
- **DeepSeek GUI**：Kun 是独立 TypeScript 运行时（`kun serve`），通过 HTTP + SSE 边界通信。

**建议**：当前阶段不需要完全进程分离，但应该：
1. 将 `streamChatWithTools` 的调用从 `ChatPanel.tsx` 移到独立的 `AgentService` 类
2. AgentService 通过 EventEmitter 向 React 组件推送事件
3. 这样 Agent 可以在用户切换页面时继续后台运行

### 问题 17：LocalStorage 容量瓶颈

**现状**：所有文件内容、配置、对话历史都存 localStorage。章节内容多时（100 章 × 5000 字 = 50 万字 ≈ 1MB），接近 localStorage 5MB 上限。

**建议**：过渡方案：仅将必要的元数据存 localStorage，章节文件内容存 `IndexedDB` 或文件系统。

### 问题 18：无测试覆盖

**现状**：项目中没有测试文件。核心逻辑（`llm.ts` 的流式解析、`toolExecutor.ts` 的工具执行、`contextAssembler.ts` 的预算计算）都没有测试。

**参考**：OpenHanako 有 5656 个 Vitest 测试用例。DeepSeek GUI 的 agent 目录有 `*.test.ts` 文件。

---

## 六、按影响力和实施难度排序的优化清单

| 优先级 | 建议 | 领域 | 影响 | 难度 | 参考来源 |
|--------|------|------|------|------|----------|
| P0 | **System Prompt 缓存 + 固定前缀** | 对话 | Token 节省 30-50% | 低 | DeepSeek GUI Kun |
| P0 | **历史消息 token 预算感知截取** | 对话 | 避免上下文溢出 | 低 | contextAssembler |
| P0 | **Claude 工具调用支持** | 对话 | 扩展模型兼容性 | 低 | OpenHanako Pi SDK |
| P0 | **工具注册表模式** | 工具 | 降低新增工具门槛 | 低 | OpenHanako 插件系统 |
| P1 | **Session 摘要机制** | 对话 | 长上下文场景质量 | 中 | OpenHanako session-summary.ts |
| P1 | **工具权限控制** | 工具 | 安全防护 | 中 | DeepSeek GUI / OpenHanako |
| P1 | **对话持久化到 .agent-conversation/** | 对话 | 会话持久化 | 中 | PRD 设计要求 |
| P1 | **指纹缓存去重压缩** | 记忆 | 减少无效 LLM 调用 | 中 | OpenHanako compile.ts |
| P1 | **草稿保存时触发轻量事件更新** | 记忆 | 实时事件图谱 | 中 | OpenHanako turn-based |
| P2 | **工具返回格式统一** | 工具 | AI 解析准确性 | 低 | - |
| P2 | **工具执行超时** | 工具 | 健壮性 | 低 | DeepSeek GUI |
| P2 | **Agent Service 解耦** | 架构 | 后台 Agent 运行 | 高 | OpenHanako Hub |
| P2 | **IndexedDB 替代 localStorage** | 架构 | 存储容量 | 中 | - |
| P3 | **单元测试覆盖** | 质量 | 代码可靠性 | 中 | OpenHanako 5656 tests |
| P3 | **Agent 间上下文桥接** | 对话 | 跨 Agent 协作 | 高 | OpenHanako Channel |

---

## 七、对标项目关键差异速查

| 维度 | Novel Creator | DeepSeek GUI Kun | OpenHanako |
|------|---------------|------------------|------------|
| **Agent Runtime** | UI 线程内 | 独立 HTTP/SSE 服务 | 独立 Node.js 进程 (Hono) |
| **System Prompt** | 每次拼接 | 固定前缀 + 指纹 | 四块独立编译 + 指纹 |
| **工具系统** | 7 个硬编码 | MCP 渐进发现 | 插件化 + 两级权限 |
| **记忆** | 事件归档 | Cache-first loop | 四层时间衰减 + FactStore |
| **持久化** | localStorage | 文件系统 | SQLite WAL |
| **测试** | 无 | 部分测试 | 5656 测试用例 |
| **UI 设计** | 基础三栏 | 完整设计 Token 文档 | Electron + React 19 |
| **上下文压缩** | 简化版 | 上下文卫生 | 指纹缓存 + 滚动摘要 |
| **多 Provider** | OpenAI + Claude | DeepSeek 主 | Pi SDK 统一多 Provider |
| **权限控制** | 无 | 三档权限 | 两级权限 + PathGuard |
