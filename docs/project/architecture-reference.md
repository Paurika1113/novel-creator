# Novel Creator 架构参考手册

> 生成时间：2026-06-10 | 版本：v1.4.0
> 本文件记录项目全部变量、函数、数据流和架构模式, 作为开发参考和代码审查基准。

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术栈与依赖](#2-技术栈与依赖)
3. [目录结构总览](#3-目录结构总览)
4. [类型系统](#4-类型系统)
5. [状态管理 (Zustand Stores)](#5-状态管理)
6. [核心服务层](#6-核心服务层)
7. [工具库层](#7-工具库层)
8. [页面与组件](#8-页面与组件)
9. [数据流图](#9-数据流图)
10. [关键变量速查表](#10-关键变量速查表)
11. [函数索引](#11-函数索引)
12. [已知问题与风险点](#12-已知问题与风险点)

---

## 1. 项目概述

**Novel Creator** 是一款桌面 AI 小说创作工作台, 采用 IDE 式三栏布局 (文件树 | 编辑器 | AI 对话), 核心能力:

- **AI 辅助写作**: 4 种 Agent (续写/世界观/审稿/风格) + 自定义 Agent, 支持工具调用
- **动态记忆压缩**: T1-T4 四层压缩 + 三级水位线, 控制上下文预算
- **事件图谱**: LLM 驱动的章节事件提取, 追踪人物/线索/地点
- **版本管理**: 类 Git 的分支/提交/回溯系统
- **番茄小说导入**: 内置在线下载器, 支持搜索/预览/下载/导出

---

## 2. 技术栈与依赖

| 类别 | 技术 | 用途 |
|------|------|------|
| 框架 | React 18 + TypeScript | 前端 UI |
| 构建 | Vite 6 | 开发/构建 |
| 状态管理 | Zustand + persist 中间件 | 全局状态 + localStorage 持久化 |
| 存储 | localStorage (`nc:` prefix) | 文件内容/设置/对话 |
| LLM | OpenAI SDK 兼容 + Anthropic SSE | AI 对话流 (Claude/DeepSeek/OpenAI) |
| 开发服务 | Express 中间件 (scripts/dev.js) | CORS 代理 + 番茄下载 API |

---

## 3. 目录结构总览

```
src/
├── types/              # 类型定义 (2 文件)
├── lib/                # 工具库 (6 文件)
├── stores/             # Zustand 状态管理 (8 文件)
├── services/           # 核心业务服务 (11 文件)
├── pages/              # 页面组件 (4 文件)
└── components/         # UI 组件 (22 文件)
    ├── editor/         # 编辑器组件 (5)
    ├── git/            # 版本管理组件 (3)
    ├── layout/         # 布局组件 (1)
    ├── library/        # 作品库组件 (3)
    ├── settings/       # 设置组件 (7)
    └── ui/             # 通用 UI 组件 (2)

scripts/
├── dev.js              # Vite 开发服务器 + API 代理
├── tomatoDownloader.js # 番茄小说下载器 (纯 Node.js)
└── _tomato_charset.json # 字体映射表
```

---

## 4. 类型系统

### 4.1 核心类型 (`src/types/index.ts`)

| 类型 | 关键字段 | 用途 |
|------|---------|------|
| `Book` | id, title, type, chapterCount, currentBranch, createdAt, updatedAt | 书籍实体 |
| `BookType` | "light" \| "full" \| "original" | 书籍类型 |
| `Chapter` | id, bookId, number, title, content, summary, wordCount, status | 章节实体 |
| `Persona` | id, name, styleProfile, createdAt, boundBooks | 作者身份 |
| `StyleProfile` | lexical, narrative, structural, stylistic | 四维文风画像 |
| `StylisticTags` | tags[], preferences | 风格标签 |
| `KnowledgeFile` | name, path, type, content, updatedAt | 知识文件 |
| `KnowledgeFileType` | "world_model" \| "master_outline" \| "arc_outline" \| "chapter_outline" \| "style_fingerprint" \| "status_card" \| "brainstorm" \| "error_archive" \| "summary" \| "chapter_draft" \| "chapter" | 文件类型 |
| `AgentType` | "custom" \| "continuation" \| "world" \| "review" \| "style" | Agent 类型 |
| `AgentConfig` | id, type, name, systemPrompt, tools, maxRounds | Agent 配置 |
| `ChatMessage` | id, content, role, timestamp, status, toolCalls | 聊天消息 |
| `ToolCall` | id, name, args, result, status | 工具调用记录 |
| `WaterLevel` | level: 1\|2\|3, maxPercent, description | 水位线定义 |
| `CompressionLevel` | "T1" \| "T2" \| "T3" \| "T4" | 压缩层级 |
| `ThreadEvent` | id, chapter, summary, threadIds, characters, resolved | 事件节点 |
| `ThreadInfo` | id, name, type, status, color, summary, lastEvent, eventCount | 线索信息 |
| `DraftStatus` | "drafting" \| "review" \| "archived" | 草稿状态 |
| `ReviewReport` | items[], suggestions[], overallScore | 审稿报告 |
| `AppSettings` | provider, apiKey, model, modelContextWindow, compressionSensitivity, theme, authorName, authorBio | 全局设置 |

### 4.2 AGENT_CONFIGS 常量

```typescript
const AGENT_CONFIGS: Record<Exclude<AgentType, 'custom'>, AgentConfig> = {
  continuation: { id, type, name, systemPrompt, tools, maxRounds: 30 },
  world:        { ... },
  review:       { ... },
  style:        { ... },
}
```

---

## 5. 状态管理

### 5.1 各 Store 详解

#### `useBookStore` (`src/stores/bookStore.ts`)

**状态**:
```
books: Book[]              — 所有书籍
currentBookId: string|null — 当前选中的书籍
draftStatus: DraftStatus   — 当前章节的草稿状态
chapters: Chapter[]        — 章节列表
```

**方法**:
| 方法 | 签名 | 行为 |
|------|------|------|
| `createBook` | (title, type, description?, protagonist?) => Book | 新建书籍, 返回新书籍 |
| `deleteBook` | (id) => void | 删除书籍, 若当前书籍被删则切换 |
| `renameBook` | (id, title) => void | 重命名 |
| `duplicateBook` | (id) => Book | 深拷贝复杂对象 |
| `setCurrentBook` | (id) => void | 切换当前书籍 |
| `createChapter` | (bookId) => Chapter | 创建新章节 |
| `updateChapter` | (chapterId, data) => void | 更新章节 |
| `deleteChapter` | (chapterId) => void | 删除章节 |
| `setDraftStatus` | (status) => void | 更新草稿状态 |

#### `useEditorStore` (`src/stores/editorStore.ts`)

**状态** (persist middleware, key: "novel-creator-editor-store"):
```
currentBookId: string|null        — 当前书籍
currentFilePath: string|null      — 当前打开的文件路径
editorContent: string             — 编辑区文本内容
isDirty: boolean                  — 是否有未保存修改
isPreviewMode: boolean            — 预览模式
filesByBook: Record<string, KnowledgeFile[]>  — 按书籍隔离的文件树
```

**方法**:
| 方法 | 签名 | 行为 |
|------|------|------|
| `getCurrentFiles` | () => KnowledgeFile[] | 获取当前书籍的文件列表 |
| `setFiles` | (files) => void | 设置文件列表 + 持久化到 localStorage |
| `openFile` | (filePath, content?) => void | 打开文件, 优先从 localStorage 加载 |
| `setCurrentBook` | (bookId) => void | 切换书籍, 重置编辑器 |
| `updateContent` | (content) => void | 更新编辑器内容, 设置 isDirty=true |
| `saveContent` | () => void | 保存内容到 filesByBook 和 localStorage |
| `togglePreview` | () => void | 切换预览模式 |
| `reloadFromStorage` | (bookId) => void | 从 localStorage 重载文件列表 |

**数据流**:
```
用户编辑 → updateContent(content) → set({ editorContent: content, isDirty: true })
自动保存(timer) → saveContent() → 更新 filesByBook[bookId] + localStorage
文件树点击 → openFile(path) → setState({ editorContent, currentFilePath })
工具写入 → toolExecutor.updateFile() → setFiles() + setState({ editorContent })
```

#### `useChatStore` (`src/stores/chatStore.ts`)

**状态** (persist middleware, key: "novel-creator-chat-store"):
```
conversations: Record<AgentType, ChatMessage[]>  — 按 Agent 分组的对话
activeAgent: AgentType                             — 当前激活的 Agent
isStreaming: boolean                               — 是否正在流式输出
streamingMessageId: string|null                    — 正在流式的消息 ID
abortController: AbortController|null              — 取消控制器
```

**方法**:
| 方法 | 签名 | 行为 |
|------|------|------|
| `getActiveConversation` | () => ChatMessage[] | 读取当前对话 (用 get() 每次实时获取) |
| `setActiveAgent` | (agent) => void | 切换 Agent, 重置 streaming 状态 |
| `addMessage` | (message) => void | 追加消息, 创建新的消息 ID |
| `appendToLastMessage` | (agent, content) => void | 流式追加文本到最新助手消息 |
| `updateMessageContent` | (agent, msgId, content) => void | 替换指定消息的完整内容 |
| `updateMessageStatus` | (agent, msgId, status) => void | 更新消息状态 (sending/sent/error) |
| `clearConversation` | (agent?) => void | 清除对话历史 |
| `setStreaming` | (isStreaming, msgId?) => void | 设置流式状态 |
| `setAbortController` | (controller) => void | 设置/清除取消控制器 |
| `partialize` | — | 仅持久化 conversations + activeAgent |

#### `useMemoryStore` (`src/stores/memoryStore.ts`)

**状态**:
```
waterLevels: WaterLevel[]       — 水位线配置
events: ThreadEvent[]           — 事件列表
threads: ThreadInfo[]           — 线索列表
summaries: Record<string,ChapterSummary[]>  — 摘要库
memoryUsagePercent: number      — 记忆使用率 0-100
```

#### `usePersonaStore` (`src/stores/personaStore.ts`)

**状态**:
```
personas: Persona[]             — 所有作者身份
currentPersonaId: string|null   — 当前选中的身份
```

#### `useSettingsStore` (`src/stores/settingsStore.ts`)

**状态**: `AppSettings` 全部字段

#### `useWorkflowStore` (`src/stores/workflowStore.ts`)

**状态** (persist middleware):
```
phase: WorkflowPhase            — idle|outline|draft|review|archived
currentChapterNum: number       — 当前章节编号
currentChapterTitle: string     — 当前章节标题
outlineContent: string          — 大纲临时内容
draftContent: string            — 草稿临时内容
reviewReport: string            — 审稿报告
selectedText: string            — 选中的文本
history: {phase, action, timestamp}[]  — 操作历史
```

**方法**: `startOutline` / `confirmOutline` / `regenerateOutline` / `startDraft` / `confirmDraft` / `regenerateDraft` / `startReview` / `confirmReview` / `applyFix` / `archive` / `reset` / `setSelectedText` / `getCurrentActions`

#### `useGitStore` (`src/stores/gitStore.ts`)

**状态**:
```
branches: GitBranch[]           — 分支列表
commits: GitCommit[]            — 提交列表
currentDiff: GitDiff|null       — 当前差异
```

---

## 6. 核心服务层

### 6.1 `llm.ts` — LLM API 服务 (614 行)

**常量**:
```
PROVIDER_ENDPOINTS: Record<string, string>
  claude:   "https://api.anthropic.com/v1/messages"
  openai:   "https://api.openai.com/v1/chat/completions"
  deepseek: "https://api.deepseek.com/v1/chat/completions"
  custom:   "" (用户自定义)
```

**类型**:
| 类型 | 字段 | 用途 |
|------|------|------|
| `ToolDefinition` | name, description, input_schema | OpenAI 兼容工具定义 |
| `LLMMessage` | role, content, tool_calls, tool_call_id | 通用消息格式 |
| `LLMRequest` | model, messages, tools, max_tokens, temperature, stream | 请求体 |
| `LLMDelta` | type, content?, toolName?, toolArgs?, toolResult?, error? | 流式增量 |
| LLMDelta 的 type | "text" \| "tool_call" \| "tool_result" \| "tool_loop_continue" \| "done" \| "error" | 增量类型 |

**核心函数**:

| 函数 | 签名 | 行为 |
|------|------|------|
| `getProviderHeaders` | (provider, apiKey) => HeadersInit | 构建请求头 |
| `getProviderURL` | (provider, settings) => string | 获取端点 URL |
| `chat` | (messages, opts?) => Promise<string> | 非流式对话, 返回完整响应 |
| `streamChat` | (messages, opts?) => AsyncGenerator<LLMDelta> | 流式对话, yield text/tool_call/done/error |
| `streamChatWithTools` | (messages, systemPrompt, toolDefs, opts?) => AsyncGenerator<LLMDelta> | **带工具循环的流式对话** |

**`streamChatWithTools` 核心流程**:
```
1. 构建请求体 (含 tools 定义)
2. 对于 Claude: 使用 messages API + SSE 流
   - content_block_start (tool_use) → yield tool_call
   - content_block_delta (input_json_delta) → 累积 toolArgs
   - content_block_delta (text_delta) → yield text
   - content_block_stop / message_stop → 判断是否有 tool_use
3. 对于 OpenAI 兼容: 使用 /v1/chat/completions
   - delta.content → yield text
   - delta.tool_calls → 累积 arguments → yield tool_call
4. 若 hasToolCalls → yield tool_loop_continue → 执行工具 → 将结果作为 assistant message 追加
5. 循环至 maxRounds (默认 30) 或无更多 tool_calls
6. yield done
```

**关键实现细节**:
- `fetchWithProxy`: 先尝试 `/api/proxy` 中转, 失败则直连
- `choice?.finish_reason === "tool_calls"`: 判断是否需要工具调用
- Claude 的 `stop_reason === "tool_use"`: Claude 的工具调用结束信号

### 6.2 `agents.ts` — Agent 系统 (392 行)

**常量**:
```
TOOL_READ_FILE:    { name: "read_knowledge_file", ... }
TOOL_WRITE_FILE:   { name: "write_current_draft", ... }
TOOL_APPEND_FILE:  { name: "append_to_draft", ... }
TOOL_SEARCH_WEB:   { name: "search_web", ... }
```

**函数**:

| 函数 | 签名 | 行为 |
|------|------|------|
| `getAgentTools` | (agentType) => ToolDefinition[] | 返回各 Agent 的可用工具集 |
| `buildSystemPrompt` | (agentType, context) => string | 构建系统提示词 (带缓存) |
| `clearSystemPromptCache` | () => void | 清除提示词缓存 (书籍切换时) |
| `buildFileListHint` | (files) => string | 生成可读文件列表提示 |

**`buildSystemPrompt` 生成规则**:
```
Agent 类型         工具集
continuation      read_knowledge_file, write_current_draft, append_to_draft, search_web
world             read_knowledge_file
review            read_knowledge_file
style             read_knowledge_file
custom            全部工具
```

**系统提示词缓存**: `Map<string, string>`, 键为 `${agentType}:${contextHash}`, 避免每次请求重复构建

### 6.3 `toolExecutor.ts` — 工具执行器 (276 行)

**注册表模式**:
```typescript
const toolRegistry = new Map<string, ToolHandler>()
interface ToolHandler {
  execute: (args: Record<string, unknown>) => string | Promise<string>
  timeout?: number  // 默认 30s
}
```

**注册的工具** (模块加载时自动注册):
| 工具名 | 执行函数 | 说明 |
|--------|---------|------|
| `read_knowledge_file` | `readKnowledgeFile(fileName)` | 从 localStorage/filesByBook 读取文件内容 |
| `write_current_draft` | `writeCurrentDraft(content)` | 写入草稿 + 强制 setState 刷新编辑器 |
| `append_to_draft` | `appendToDraft(content)` | 追加到草稿末尾 |
| `read_chapter` | `readChapter(chapterId)` | 读取指定章节 |
| `search_and_replace` | `searchAndReplace(old, new, file?)` | 当前文件内查找替换 |
| `list_files` | `listFiles()` | 列出当前书籍所有文件 |
| `get_draft_status` | `getDraftStatus()` | 获取当前草稿状态和字数 |

**核心函数**:

| 函数 | 签名 | 行为 |
|------|------|------|
| `extractMainText` | (content, strict?) => string | 提取 `<Main text>...</Main text>` 标签内容 |
| `isPlaceholderText` | (text) => boolean | 检测占位文字 (正则 + 长度) |
| `executeWithTimeout` | (promise, timeoutMs) => Promise<T> | Promise.race 超时保护 |
| `registerTool` | (name, handler) => void | 注册工具 |
| `listRegisteredTools` | () => string[] | 列出已注册工具名 |
| `executeToolCall` | (name, args) => Promise<string> | 从注册表查找并执行工具 |
| `getCurrentBookId` | () => string | 辅助: 从 bookStore 获取当前书籍 ID |

**`updateFile` 完整数据流** (关键):
```
1. store.getState() 获取 filesByBook 快照
2. 查找或创建文件条目
3. store.setFiles(updatedFiles) ← 更新 Zustand store
4. localStorage.setItem(`nc:${bookId}:${path}`, content) ← 持久化
5. if (currentFilePath === path) → useEditorStore.setState({ editorContent, isDirty: false }) ← 强制刷新编辑器
```

### 6.4 `contextAssembler.ts` — 动态上下文装配 (189 行)

**类型**:
```
ContextBudget {
  total: number           — 模型总上下文窗口 (tokens)
  reserved: number        — 为 system prompt + response 保留
  available: number       — 可用于用户内容的 tokens
  userInput: number       — 用户当前消息 tokens
  historyBudget: number   — 分配给对话历史的 tokens
  contextBudget: number   — 分配给系统上下文 (文件内容) 的 tokens
}

ChapterContext {
  included: string[]      — 纳入上下文的文件路径
  excluded: string[]      — 容量不足被排除的文件路径
  totalTokens: number     — 实际消耗的 tokens
  budget: ContextBudget
}
```

**核心函数**:

| 函数 | 签名 | 行为 |
|------|------|------|
| `calculateContextBudget` | (settings, compressionSensitivity, chapters, userInput) => ContextBudget | 计算 token 预算分配 |
| `assembleContext` | (budget, chapters, persona, currentDraft, activeElements?, memoryContext?) => ChapterContext | 装配最终上下文 |
| `getContextReport` | (budget, result) => string | 生成人类可读的上下文报告 |

**`assembleContext` 装配优先级**:
```
Always Included (不受预算限制):
  - 总纲 (master_outline)
  - 世界观 (world_model)
  - 文风画像 (style_fingerprint)
  - 状态卡 (status_card)
  - 错误档案 (error_archive)
  - 记忆上下文 (memoryContext)

动态包含 (按优先级, 按预算依次添加):
  1. 当前章节大纲 (chapter_outline)
  2. 活跃事件 & 线索 (activeElements)
  3. 卷纲 (arc_outline)
  4. 灵感笔记 (brainstorm)
  5. 最近章节 (按时间倒序)
  6. 更早的章节
```

### 6.5 `compression.ts` — 动态记忆压缩 (254 行)

**函数**:

| 函数 | 签名 | 行为 |
|------|------|------|
| `generateT1Summary` | (content, chapter) => Promise<string> | 100-200 字摘要 (最轻) |
| `generateT2Summary` | (content, chapter) => Promise<string> | 200-400 字, 含关键情节 |
| `generateT3Summary` | (content, chapter) => Promise<string> | 400-600 字, 含人物+情节 |
| `generateT4Snapshot` | (content, chapter) => Promise<string> | 600-800 字, 完整快照 (最深) |
| `getTriggeredMilestones` | (chapters) => number[] | 返回触发压缩里程碑的章节索引 |
| `calculateMemoryUsage` | (chapters, window) => number | 计算记忆使用百分比 |
| `buidActiveElementsMd` | (events, threads) => string | 生成 Markdown 格式 |
| `getCompressionPlan` | (usagePercent, sensitivity) => string | 生成推荐压缩策略描述 |

### 6.6 `eventAnalysis.ts` — 事件图谱分析 (203 行)

**函数**: `analyzeChapterEvents` / `analyzeDraftEvents` / `buildActiveElementsMd`

**流程**: 调用 LLM 从章节内容提取 JSON → 解析事件/人物/线索 → 结构化存储

### 6.7 其余服务

| 文件 | 主要函数 | 用途 |
|------|---------|------|
| `analysis.ts` | `analyzeBookChapters`, `buildChaptersContent` | 四维文风分析 |
| `memoryContext.ts` | `buildMemoryContext` | ≤400 token 的浓缩记忆上下文 |
| `knowledgeInit.ts` | `getInitPrompt`, `generateKnowledgeFiles`, `streamInitChat` | 知识文件初始化向导 |
| `electronMock.ts` | `electronAPIMock` | 浏览器端 Electron API 模拟 |
| `tomatoImport.ts` | `searchTomatoNovels` 等 | 番茄小说导入 API |

---

## 7. 工具库层

| 文件 | 导出 | 用途 |
|------|------|------|
| `lib/id.ts` | `v4()` | UUID v4 生成器 |
| `lib/date.ts` | `formatRelativeTime`, `formatDateTime`, `formatShortDateTime` | 日期格式化 |
| `lib/storage.ts` | `saveFileContent`, `loadFileContent`, `removeFileContent`, `getStorageUsage` | 本地存储抽象 |
| `lib/persistence.ts` | `saveState`, `loadState`, `initPersistence` | Zustand 状态持久化桥接 |
| `lib/knowledgeTemplates.ts` | `WORLD_MODEL_TEMPLATE`, `MASTER_OUTLINE_TEMPLATE`, `BRAINSTORM_TEMPLATE` | 知识文件 Markdown 模板 |
| `lib/devStores.ts` | `exposeStores()` | 开发工具: 暴露所有 store 到 window |

---

## 8. 页面与组件

### 8.1 页面路由 (App.tsx)

```
PageId: "library" | "persona" | "editor" | "git"
```

| 页面 | 默认 |
|------|------|
| LibraryPage | 首页 |
| EditorPage | 创作台 (三栏布局) |
| PersonaPage | 作者身份管理 |
| GitPage | 版本管理 |

### 8.2 EditorPage 组件树

```
EditorPage
├── editor-topbar     (书籍信息 + 记忆使用率)
├── editor-body
│   ├── editor-panel-left
│   │   └── FileTree
│   ├── editor-drag-handle
│   ├── editor-panel-center
│   │   └── MarkdownEditor
│   ├── editor-drag-handle
│   └── editor-panel-right
│       └── ChatPanel
│           └── ActionBar
└── ArchiveModal
```

### 8.3 ChatPanel 数据流

```
sendToAI() useCallback:
  depends on: [agentType, messages, currentBookId, currentFilePath, currentFiles,
               personaContext, settings, compressionSensitivity, chapters, currentDraft,
               currentDraftType, workflow, memoryEvents, memoryThreads]

  执行流程:
  1. 计算上下文预算 (calculateContextBudget)
  2. 装配上下文 (assembleContext) + 记忆上下文 (buildMemoryContext)
  3. 选择对话历史 (token-budget-aware, 从最新向旧回溯)
  4. 构建 LLM 消息列表: [systemPrompt, ...selectedHistory, ...contextMessages]
  5. 获取工具定义 (getAgentTools)
  6. 流式对话 + 工具循环 (streamChatWithTools)

  流式增量处理:
  - delta.type === "text" → chatContent += text | cleanContent += text
  - delta.type === "tool_call" → yield 到 LLM 层的工具循环
  - delta.type === "tool_result" → chatContent += TOOL marker (折叠)
  - delta.type === "tool_loop_continue" → 追加空行
  - delta.type === "done" → 最终处理
  - delta.type === "error" → 显示错误

  完成后:
  - 无工具执行 → 直接写入编辑器文件
  - 有 write_current_draft/append_to_draft → 强制从 localStorage 刷新编辑器
  - cleanContent 安全兜底 (防止占位文字)
```

### 8.4 样式系统 (`src/index.css`)

CSS 变量定义在 `:root`:
```css
--primary, --primary-hover, --primary-active, --primary-light
--text-primary, --text-secondary, --text-muted
--bg-page, --bg-card, --bg-hover, --bg-input
--border, --border-light
--shadow-sm, --shadow-md, --radius-sm, --radius-md
--success, --warning, --danger, --info
--font-mono
```

---

## 9. 数据流图

### 9.1 AI 对话完整数据流

```
用户输入
  ↓
ChatPanel.handleSend()
  ↓
chatStore.addMessage (user message) + setStreaming(true)
  ↓
ChatPanel.sendToAI()
  ├→ contextAssembler.calculateContextBudget()
  ├→ contextAssembler.assembleContext()
  ├→ memoryContext.buildMemoryContext()
  ├→ agents.getAgentTools()
  ├→ chatStore (select history, token-budget-aware)
  └→ llm.streamChatWithTools()
       ├→ fetchWithProxy(/api/proxy ← dev.js 中间件 → 外部 API)
       ├→ yield LLMDelta
       │    ├→ text → appendToLastMessage (流式显示)
       │    ├→ tool_call → 内部循环
       │    │    └→ toolExecutor.executeToolCall()
       │    │         ├→ 写入 localStorage
       │    │         ├→ setFiles (更新文件树)
       │    │         └→ setState({ editorContent }) (刷新编辑器)
       │    └→ done
       └→ ChatPanel 完成回调
            ├→ updateMessageStatus (sent)
            ├→ setStreaming(false)
            ├→ 草稿写入后强制刷新编辑器 (localStorage → setState)
            └→ cleanContent 安全兜底
```

### 9.2 草稿写入数据流 (write_current_draft)

```
AI 调用 write_current_draft(content: "<Main text>...正文...</Main text>")
  ↓
toolExecutor.writeCurrentDraft(content)
  ├→ extractMainText(content, false)  // 提取标签内正文
  ├→ isPlaceholderText(extracted)    // 校验非占位文字
  └→ updateFile('drafts/chapter_draft.md', extracted, 'chapter_draft')
       ├→ editorStore.getState() → filesByBook 快照
       ├→ 查找/创建条目, 更新 content + updatedAt
       ├→ editorStore.setFiles(updatedFiles)
       ├→ localStorage.setItem(`nc:${bookId}:drafts/chapter_draft.md`, extracted)
       └→ if (currentFilePath === 'drafts/chapter_draft.md')
            └→ useEditorStore.setState({ editorContent: extracted, isDirty: false })
  ↓
ChatPanel.sendToAI() 完成后
  ├→ executedTools 检测到 write_current_draft
  ├→ localStorage.getItem 读取最新草稿
  ├→ 与 editorContent 对比
  └→ 不一致 → setState 强制刷新
```

---

## 10. 关键变量速查表

| 变量 | 作用域 | 类型 | 说明 |
|------|--------|------|------|
| `currentBookId` | useBookStore + useEditorStore | string\|null | 当前书籍 ID, 贯穿全书 |
| `filesByBook[bookId]` | useEditorStore | KnowledgeFile[] | 文件树数据 |
| `conversations[agentType]` | useChatStore | ChatMessage[] | 按 Agent 分组的对话 |
| `isStreaming` | useChatStore | boolean | 流式输出锁 |
| `abortController` | useChatStore | AbortController\|null | 取消当前请求 |
| `settings.provider` | useSettingsStore | string | AI 供应商 |
| `settings.compressionSensitivity` | useSettingsStore | number | 1-5 敏感度 |
| `workflow.phase` | useWorkflowStore | WorkflowPhase | 当前工作流阶段 |
| `systemPromptCache` | agents.ts 模块 | Map<string,string> | 提示词缓存 (TTL) |
| `toolRegistry` | toolExecutor.ts 模块 | Map<string,ToolHandler> | 工具注册表 |
| `executedTools[]` | ChatPanel.sendToAI | string[] | 本次对话执行的工具名列表 |
| `cleanContent` | ChatPanel.sendToAI | string | `<Main text>` 标签内的纯正文 |
| `chatContent` | ChatPanel.sendToAI | string | 聊天显示内容 (含工具标记) |
| `toolCallIndex` | ChatPanel.sendToAI | number | 工具调用序号 |

---

## 11. 函数索引

### 服务层函数索引

| 函数 | 文件 | 行 | 类型 |
|------|------|-----|------|
| `fetchWithProxy` | llm.ts | ~20 | async |
| `getProviderHeaders` | llm.ts | ~40 | sync |
| `getProviderURL` | llm.ts | ~60 | sync |
| `streamChat` | llm.ts | ~180 | async generator |
| `chat` | llm.ts | ~240 | async |
| `streamChatWithTools` | llm.ts | ~280 | async generator |
| `buildSystemPrompt` | agents.ts | ~50 | sync (cached) |
| `clearSystemPromptCache` | agents.ts | ~30 | sync |
| `getAgentTools` | agents.ts | ~80 | sync |
| `buildFileListHint` | agents.ts | ~20 | sync |
| `extractMainText` | toolExecutor.ts | ~25 | sync |
| `isPlaceholderText` | toolExecutor.ts | ~30 | sync |
| `executeWithTimeout` | toolExecutor.ts | ~15 | async |
| `registerTool` | toolExecutor.ts | ~10 | sync |
| `executeToolCall` | toolExecutor.ts | ~35 | async |
| `updateFile` | toolExecutor.ts | ~55 | sync |
| `readKnowledgeFile` | toolExecutor.ts | ~20 | sync |
| `writeCurrentDraft` | toolExecutor.ts | ~20 | sync |
| `appendToDraft` | toolExecutor.ts | ~25 | sync |
| `readChapter` | toolExecutor.ts | ~15 | sync |
| `searchAndReplace` | toolExecutor.ts | ~20 | sync |
| `listFiles` | toolExecutor.ts | ~10 | sync |
| `getDraftStatus` | toolExecutor.ts | ~15 | sync |
| `calculateContextBudget` | contextAssembler.ts | ~30 | sync |
| `assembleContext` | contextAssembler.ts | ~80 | sync |
| `getContextReport` | contextAssembler.ts | ~25 | sync |
| `generateT1Summary` | compression.ts | ~20 | async |
| `generateT2Summary` | compression.ts | ~25 | async |
| `generateT3Summary` | compression.ts | ~30 | async |
| `generateT4Snapshot` | compression.ts | ~35 | async |
| `getTriggeredMilestones` | compression.ts | ~20 | sync |
| `calculateMemoryUsage` | compression.ts | ~15 | sync |
| `buildChapterTimelineMd` | compression.ts | ~20 | sync |
| `buildArcSummaryMd` | compression.ts | ~15 | sync |
| `getCompressionPlan` | compression.ts | ~25 | sync |
| `analyzeChapterEvents` | eventAnalysis.ts | ~50 | async |
| `buildActiveElementsMd` | eventAnalysis.ts | ~30 | sync |
| `analyzeDraftEvents` | eventAnalysis.ts | ~20 | async |
| `buildMemoryContext` | memoryContext.ts | ~40 | sync |
| `analyzeBookChapters` | analysis.ts | ~40 | async |
| `buildChaptersContent` | analysis.ts | ~20 | sync |

### ChatPanel 内部函数

| 函数 | 行 | 类型 | 依赖 |
|------|-----|------|------|
| `toggleTool` | ~640 | useCallback | toolCollapseState |
| `renderTextLines` | ~650 | sync | — |
| `renderMessageContent` | ~675 | sync (React) | toggleTool |
| `sendToAI` | ~280 | useCallback | 13 deps |
| `handleStop` | ~230 | useCallback | abortController |
| `handleContinue` | ~240 | useCallback | sendToAI |
| `handleClearChat` | ~250 | useCallback | clearConversation |
| `handleAction` | ~260 | useCallback | sendToAI, setSelectedText |

---

## 12. 已知问题与风险点

### 12.1 类型安全

| 问题 | 文件 | 风险 |
|------|------|------|
| `extractJsonFromText` 贪婪正则 `/\{[\s\S]*\}/` | analysis.ts, eventAnalysis.ts | 高 — LLM 输出含多个 JSON 块时匹配错误 |
| `try/catch` 吞错误无日志 | 多处 | 中 — 生产调试困难 |
| `as` 类型断言 (20+ 处) | 多处 | 中 — 运行时类型不匹配 |
| `any` 类型 | ChatPanel.tsx, llm.ts | 低 — 失去 TS 保护 |

### 12.2 异步与并发

| 问题 | 文件 | 风险 |
|------|------|------|
| `sendToAI` 依赖 13 个变量, 频繁重建 | ChatPanel.tsx | 中 — 流进行中重建可能导致状态不一致 |
| `currentFiles` 依赖 `filesByBook` 每次变更触发 sendToAI 重建 | ChatPanel.tsx | 中 — 性能退化 |
| drag handler 闭包捕获陈旧 `leftWidth`/`rightWidth` | EditorPage.tsx | 低 — 仅影响保存精度 (1-2px) |
| `setFiles` + `openFile` 连续调用, 双次渲染 | EditorPage.tsx | 低 — useEffect 刚初始化时 |

### 12.3 数据持久化

| 问题 | 文件 | 风险 |
|------|------|------|
| 工具执行器写入后的编辑器刷新可能被 persist 中间件异步行为干扰 | toolExecutor.ts | 中 — 草稿不更新 |
| `generateDefaultFiles` 不持久化新建模板文件 | EditorPage.tsx | 低 — 依赖 Zustand 自动持久化 |
| localStorage 5-10MB 限制, 大量章节可能溢出 | 全局 | 中 — 需迁移到 IndexedDB |

### 12.4 边界条件

| 问题 | 位置 | 影响 |
|------|------|------|
| `book?.id` 为 undefined 时 useEffect 不触发 | EditorPage.tsx:180 | 低 — 有提前 guard |
| `currentFiles` 空数组 `length > 0` 检查缺失 | contextAssembler.ts | 低 — 设计上非空 |
| `isPlaceholderText` 正则可能误判 "草稿已更新" 等短词 | toolExecutor.ts | 低 — 有 length 前置检查 |
| streamChatWithTools 异常断开无清理逻辑 | llm.ts | 中 — 可能导致 isStreaming 锁死 |

### 12.5 UI/UX

| 问题 | 位置 | 影响 |
|------|------|------|
| 流式输出中切换 Agent 无保护 | ChatPanel.tsx | 中 — 消息可能混入错误对话 |
| 工具结果折叠后无法看到错误信息 (需要手动展开) | ChatPanel.tsx | 低 — 设计如此 |
| MarkdownEditor 渲染中文时 `renderMarkdown` 使用正则转义 | MarkdownEditor.tsx | 低 — 边界 case |