# Novel Creator 专属优化路线图

**定位**: 桌面端 AI 小说创作工作台
**核心用户**: 长篇网文作者
**本质**: 一个辅助写作的 IDE，不是通用 AI Agent 平台

---

## 一、项目本质分析

### 1.1 这个项目是什么

Novel Creator 是一个**写作 IDE**——核心工作流是：

```
设定世界观 → 规划大纲 → AI 协作写草稿 → 用户手动编辑 → 审核 → 归档 → Git 提交
```

每一步都在打磨**正文本身**。AI 是协作者，不是主角。

### 1.2 用户最在意的 3 件事

参照 PRD 中的核心痛点：

| 痛点 | 用户原话（PRD） | 在代码层面的对应 |
|------|----------------|-----------------|
| AI 上下文碎片化 | "在聊天工具里聊过的设定，下个 session 就丢了" | 无 session-to-session 记忆 |
| 文风一致性失控 | "长篇写到后面人物容易跑偏" | 作者身份系统 + 审核 Agent |
| AI 续写文风不统一 | "AI 续写的文风和自己不像" | 三层 Agent 认知架构 |

### 1.3 这个项目不需要什么

对比 OpenHanako 和 DeepSeek GUI，明确排除的优化方向：

| 不适用方向 | 原因 |
|-----------|------|
| **通用 Agent 平台** | 这是一个写作工具，不是数字助理 |
| **多 Agent 协作/频道** | 4 个写作 Agent 各司其职，不需要聊天 Agent 互相通信 |
| **插件系统** | 7 个写作工具够了，不需要第三方插件 |
| **MCP 协议** | 写作场景不需要连数据库/搜索引擎 |
| **手机连接/IM** | 这是桌面写作工具 |
| **自治 Agent** | AI 是听从指令的协作者，不是自主行动的 Agent |
| **跨会话用户记忆** | 不需要记忆用户私事，只需要记忆小说设定 |

---

## 二、按项目需求排序的优化方案

### 第一层：写作核心体验（P0 — 直接影响每章写作质量）

#### 优化 1：Session-to-Session 记忆注入

**当前问题**：每次打开应用开始新会话，AI 对上一轮讨论的大纲、设定的理解完全来自工具调用读取文件。这不是"记忆"，而是"每次从头读说明书"。

**用户痛点映射**：PRD 核心痛点 #1 ——"在聊天工具里聊过的设定，下个 session 就丢了"

**真正需要做什么**：
```
每次启动 Agent 对话时，组装一份"记忆上下文"注入 system prompt：
  ├─ 当前写作进度（第几章、写了多少字）
  ├─ 活跃故事线程及其状态
  ├─ 最近的剧情摘要（最近 3-5 章的关键事件）
  └─ 当前草稿状态（有无未归档草稿）
```

**实现路径**：
```
src/services/memoryContext.ts（新增）
  └─ buildMemoryContext(bookId) → 组装四块信息
  └─ 在 ChatPanel.sendToAI 的 systemPrompt 末尾注入

修改文件：ChatPanel.tsx（注入调用）、contextAssembler.ts（已有框架）
新增文件：memoryContext.ts
```

**影响**：用户每天开始写作时 AI 立刻"进入状态"，不需要先问"我们写到哪了"

**难度**：低（已有 contextAssembler 框架，主要是装配策略调整）

---

#### 优化 2：事件图谱从"归档时触发"改为"多级触发"

**当前问题**：事件分析只在归档时进行。但用户可能在草稿阶段写 2 天、30 轮对话才归档。这期间 AI 对草稿中产生的新事件一无所知。

**用户痛点映射**：AI 续写时可能忽略刚刚写下的伏笔——因为事件图谱还没更新

**真正需要做什么**：
```
触发层级：
  1. 草稿保存时（Ctrl+S / 自动保存 30s）
     → 检测草稿增量 → 如果有新内容，轻量调用 LLM 提取新事件
     → 更新 active_elements.md（追加新模式）
  
  2. 归档时（已有）
     → 保持现有的完整事件分析逻辑不变
```

**实现路径**：
```
src/services/eventAnalysis.ts（已有）
  └─ 新增 analyzeDraftEvents() - 轻量版，只分析增量
  └─ 新增增量检测逻辑

修改文件：MarkdownEditor.tsx（保存时触发）、eventAnalysis.ts
```

**影响**：AI 续写时能感知"你刚写的这个悬念"，续写质量提升

**难度**：中

---

#### 优化 3：System Prompt 缓存减少 Token 浪费

**当前问题**：`buildSystemPrompt` 每次请求都完整拼接。四维文风画像、作品信息、知识合规说明——这些内容占 prompt 的 60%，而且连续请求间完全不变。

**用户痛点映射**：Token 消耗大 → 成本高 → 用户可能不舍得用 AI

**真正需要做什么**：
```
缓存 key = agentType + personaId + bookTitle
缓存只在换书/换作者时失效

预估效果：
  - 每轮请求省 600-1500 token（文风画像+作品层+合规说明）
  - 按 1000 轮对话算，省 60万-150万 token
```

**实现路径**：
```
src/services/agents.ts（已有）
  └─ buildSystemPrompt 增加 Map 缓存
  └─ 缓存 key 计算 + 失效条件

修改文件：agents.ts
```

**影响**：降低 API 成本 30-50%，AI 响应速度稍有提升

**难度**：低（10 行代码）

---

#### 优化 4：对话历史持久化，避免刷新丢失

**当前问题**：`chatStore.conversations` 只在内存中。HMR、刷新、切页面后对话历史丢失。PRD 设计的 `.agent-conversations/*.jsonl` 从未实现。

**用户痛点映射**：聊了半小时的设定讨论，一次刷新全没了

**真正需要做什么**：
```
每条消息发送时同步写入 localStorage（带 bookId 隔离）：
  key = nc:{bookId}:conversation:{agentType}
  value = JSON 数组（保留最近 50 条）

初始化时从 localStorage 恢复
```

**实现路径**：
```
src/stores/chatStore.ts（已有）
  └─ addMessage 时同步持久化
  └─ 初始化时从 localStorage 恢复
  └─ 按 agentType 隔离

修改文件：chatStore.ts
```

**影响**：用户不会因为意外刷新丢失对话上下文

**难度**：低

---

### 第二层：写作流程优化（P1 — 提升用户体验和效率）

#### 优化 5：历史消息 Token 预算感知截取

**当前问题**：`messages.slice(-10)` 硬编码。DeepSeek V4 1M context 时浪费容量，128K 模型又可能超限。

**真正需要做什么**：
```
从 contextAssembler 获取可用 token 预算
从最新消息开始，累积 token 到预算上限
如果前面有已压缩的 session 摘要 → 优先保留摘要
```

**实现路径**：
```
src/services/contextAssembler.ts（已有 token 预算计算）
src/components/editor/ChatPanel.tsx（替换 slice(-10)）

修改文件：ChatPanel.tsx、contextAssembler.ts
```

**影响**：不同大小上下文的模型都能充分利用容量

**难度**：低

---

#### 优化 6：压缩指纹缓存去重

**当前问题**：每次归档都调用 LLM 生成 T1 摘要。用户可能改了个标点符号重新归档——LLM 重新算一遍摘要。

**真正需要做什么**：
```
章节内容 → sha256 指纹 → 存 localStorage
下次归档比较指纹 → 相同则跳过压缩

只在归档流程中检查，不增加独立组件
```

**实现路径**：
```
src/components/editor/ArchiveModal.tsx（stage 7 压缩前加指纹检查）
修改文件：ArchiveModal.tsx
```

**影响**：减少无效 LLM 调用，归档速度提升（内容不变时秒过）

**难度**：低

---

#### 优化 7：Claude 工具调用支持

**当前问题**：`streamClaude` 不解析 tool_use 块。使用 Claude 的模型无法执行任何工具读写文件。

**真正需要做什么**：
```
在 streamClaude 中：
  1. 解析 content_block_start（type: tool_use）
  2. 累积 tool_use 的 id、name、input
  3. 在 message_stop 时 yield tool_call 事件
```

**实现路径**：
```
src/services/llm.ts（streamClaude 函数）
修改文件：llm.ts（约 30 行新增解析逻辑）
```

**影响**：用户可以在 Claude 模型上使用 AI 协作功能

**难度**：低

---

### 第三层：代码可维护性（P2 — 对用户无直接影响，方便后续开发）

#### 优化 8：工具注册表模式

**当前问题**：7 个工具通过 switch-case 路由。每次新增工具要改两个文件（agents.ts + toolExecutor.ts）。

**真正需要做什么**：
```
const toolRegistry = new Map<string, ToolHandler>()
registerTool('read_knowledge_file', definition, handler)
executeToolCall → toolRegistry.get(name).handler(args)

保持 7 个工具不变，只改造路由层
```

**影响**：降低后续新增工具的门槛

**难度**：低

---

#### 优化 9：工具执行超时保护

**当前问题**：`executeToolCall` 无超时保护。localStorage 写满或异常可能挂起整个工具循环。

**真正需要做什么**：
```
async function executeWithTimeout(fn, 30s):
  return Promise.race([fn(), rejectAfter(30s)])
```

**影响**：防止工具调用卡死对话

**难度**：低

---

### 明确不做的优化

| 原审查中的建议 | 不做的理由 |
|---------------|-----------|
| **独立 Agent Runtime（进程分离）** | 写作工具不需要后台 Agent。用户写作时就在前台。成本和复杂度 > 收益 |
| **IndexedDB 替代 localStorage** | 小说工作台的文件量（100 章 × 5K ≈ 500K）远未达到 localStorage 5MB 上限。当前架构够用 |
| **Agent 间上下文桥接** | 4 个 Agent 职责分明，不需要互相"看见"对方的对话。审核报告通过文件传递即可 |
| **单元测试覆盖** | 项目处于早期快速迭代阶段，加测试会拖慢开发速度。等 API 稳定后再加 |
| **工具返回格式统一** | 7 个工具返回各不相同但 AI 都能理解。格式化后反而可能引入兼容问题 |
| **工具权限控制** | 单用户桌面应用，所有工具都是用户授权的，不需要权限系统 |
| **Session 滚动摘要** | 写作会话短（设定讨论 → 写草稿 → 审核），10 轮以内结束，不需要滚动摘要 |

---

## 三、分阶段落地计划

### 第一阶段：P0（预计 2-3 天）

```
Day 1:
  [System Prompt 缓存] → agents.ts 加 Map 缓存 → 构建测试 → commit
  [对话历史持久化] → chatStore.ts 加 localStorage 持久化 → 构建测试 → commit

Day 2:
  [Session-to-Session 记忆] → memoryContext.ts 新建 + ChatPanel.tsx 注入 → 构建测试 → commit
  [Claude 工具调用] → llm.ts streamClaude 加 tool_use 解析 → 构建测试 → commit

Day 3:
  [记忆压缩指纹缓存] → ArchiveModal.tsx 加指纹检查 → 构建测试 → commit
  [多级事件触发] → eventAnalysis.ts 加轻量版 + MarkdownEditor.tsx 触发 → 构建测试 → commit
```

### 第二阶段：P1（预计 1-2 天）

```
Day 4:
  [历史消息预算截取] → ChatPanel.tsx 替换 slice(-10) → 构建测试 → commit
  [工具注册表模式] → toolExecutor.ts 重构 Map 路由 + registerTool → 构建测试 → commit

Day 5:
  [工具执行超时] → llm.ts 加 executeWithTimeout → 构建测试 → commit
```

### 第三阶段：UI 打磨（按需）

```
在 P0/P1 完成后：
  - 每个 Agent 的快捷操作按钮做可视化区分（颜色、图标）
  - 创作台顶部栏加入记忆注入状态的指示
  - 工具调用耗时可视化（气泡显示 ⏱ 0.3s）
```

---

## 四、每个优化的价值量化

| 优化 | 对写作质量的直接影响 | 对写作流畅度的直接影响 | 对成本的直接影响 |
|------|---------------------|----------------------|----------------|
| Session-to-Session 记忆 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐ |
| 多级事件触发 | ⭐⭐⭐⭐ | ⭐⭐ | ⭐ |
| System Prompt 缓存 | ⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 对话历史持久化 | ⭐ | ⭐⭐⭐⭐⭐ | — |
| Token 预算截取 | ⭐⭐ | ⭐ | ⭐⭐⭐ |
| 压缩指纹缓存 | — | ⭐⭐⭐ | ⭐⭐⭐ |
| Claude 工具调用 | ⭐⭐⭐ | ⭐⭐⭐ | — |
| 工具注册表 | — | — | —（开发者收益） |
| 工具超时 | — | ⭐⭐⭐⭐ | — |

---

## 五、最终建议执行顺序

按"对用户的价值 × 实施难度"排序：

```
1. System Prompt 缓存          ← 10 分钟，立刻省钱
2. 对话历史持久化               ← 15 分钟，不再丢记录
3. Session-to-Session 记忆     ← 2 小时，AI 记住昨天说了什么
4. Claude 工具调用             ← 1 小时，扩展模型选择
5. 压缩指纹缓存                ← 30 分钟，归档更快
6. 多级事件触发                ← 2 小时，草稿阶段就有事件感知
7. 历史消息预算截取             ← 1 小时，自适应上下文
8. 工具注册表                  ← 1 小时，代码整洁
9. 工具执行超时                ← 30 分钟，防止卡死
```

总计：约 **9 个独立的修改**，每个都是构建 → commit → push 的循环。
