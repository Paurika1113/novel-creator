# Changelog

语义化版本格式：`大版本.中版本.小版本`

---

## [1.4.2] — 2026-06-09

### Fixed
- **浏览器编辑器显示不同步** — 修改 localStorage 后 React 组件未重新渲染，编辑器显示旧内容
  - `src/stores/editorStore.ts`: 添加 `zustand/persist` middleware，文件树数据（`filesByBook`、`currentFilePath`）持久化到 `novel-creator-editor-store`
  - `src/pages/EditorPage.tsx`: 修复 `setCurrentBook` 在初始化时覆盖已恢复编辑器状态的问题；`generateDefaultFiles` 现在从 `nc:{bookId}:{path}` 格式的 localStorage 加载已有内容
  - `src/components/editor/ActionBar.tsx`: `hasDraftContent` 检查现在也读取 `nc:{bookId}:drafts/chapter_draft.md` 的 localStorage 内容，确保审核/归档按钮正确启用
- **章节模块显示默认名称而非真实标题** — `generateDefaultFiles` 使用硬编码名称（"序章·星辰陨落"、"初遇"、"试炼之路"）
  - 新增 `extractChapterTitle()` 函数，从章节内容中提取 `# 第一章 XXX` 格式的标题
  - 已有文件时也会更新章节名称，从归档内容动态获取真实标题
- **版本管理显示假数据** — `GitPage.tsx` 的 `generateMockData` 生成虚假分支和提交（"dev/rewrite-ch3"、"exp/alt-ending" 等）
  - 删除假数据生成逻辑，新增 `buildRealCommitHistory()` 从 `nc:{bookId}:chapters/XXX.md` 读取已归档章节生成真实提交历史
  - 提交信息显示真实章节标题（如"📦 归档：第一章 宫宴反水"）
  - 新增 `generateChapterDiff()` 函数，支持选中提交后查看章节内容 diff 对比
- **AI 生成内容格式不匹配** — `knowledgeInit.ts` 的 `extractFile` 只支持 `--文件开始: filename--` 单一格式
  - 增强解析逻辑，支持 markdown 代码块格式、带 `#` 标题的多种格式变体
- **toolExecutor.ts 兼容性问题** — `filesByBook` 重构后多处代码仍引用旧的 `files` 属性
  - 修复 `getCurrentFiles()` 从 `store.filesByBook[store.currentBookId]` 获取文件列表
  - 修复 `updateFile()` 同时持久化到 localStorage（`nc:{bookId}:{path}`）

---

## [1.4.1] — 2026-06-08

### Fixed
- **P1-3: `editorStore.files` 未按书籍隔离** — 所有书籍的知识文件存储在同一个全局数组中，切换书籍时文件树会混在一起
  - `src/stores/editorStore.ts`: 重构为 `filesByBook: Record<string, KnowledgeFile[]>` 结构，按 `bookId` 隔离文件存储
  - 所有文件操作（`setFiles`/`addFile`/`removeFile`/`openFile`/`saveContent`）自动关联当前书籍
  - localStorage 持久化 key 改为 `nc:{bookId}:{filePath}` 格式，避免冲突
  - 新增 `setCurrentBook` 和 `getCurrentFiles` 方法
- **P1-5: 初始化时删除知识文件是全局操作** — 右键「初始化知识文件」会误删其他书籍的知识文件
  - 修复依赖 P1-3 的隔离机制：`removeFile` 现在只删除当前书籍的文件
  - `LibraryPage.tsx`: 先 `setCurrentBook(book.id)` 再执行 `removeFile`，确保只影响目标书籍
- `src/lib/persistence.ts`: 将 `editorStore` 纳入持久化系统，页面刷新后文件树状态不丢失
- `src/components/editor/FileTree.tsx`: 使用 `getCurrentFiles()` 获取当前书籍的文件列表
- `src/pages/EditorPage.tsx`: 同步 `bookStore.currentBookId` 到 `editorStore`
- `src/components/library/ImportModal.tsx` & `TomatoImportPanel.tsx`: 导入前先设置当前书籍

### Performance & Stability
- **ChatPanel 全量订阅 store 导致重渲染** — `useChatStore()` 订阅整个 store，任何状态变化都触发全量重渲染
  - 改为 Zustand 选择器模式：`const isStreaming = useChatStore(s => s.isStreaming)`
  - `callLLM` 使用稳定的 store action 引用，避免依赖数组问题
- **ChatPanel `callLLM` 依赖数组不完整** — `editorStore.files` 每次渲染都变化导致 `callLLM` 重新创建
  - 使用 `useEditorStore(s => s.getCurrentFiles())` 选择器，配合精确依赖 `[..., editorFiles]`
- **LLM 请求缺少超时保护** — `streamOpenAICompat` 和 `streamClaude` 没有默认超时
  - 新增 `createTimeoutSignal()` 工具函数，默认 60 秒超时
  - 合并外部 `AbortSignal` 和超时信号，支持用户取消和超时同时生效
  - 添加 `response.body` 空值检查，避免运行时异常
  - SSE 解析添加 malformed line 计数器，连续 5 条异常时向用户报告
- **ArchiveModal 串行 LLM 调用阻塞** — 里程碑压缩阶段对每个章节串行调用 `generateT1Summary`
  - 改为分批并行执行，限制并发数为 3，显著缩短归档时间
- **localStorage 存储容量风险** — 小说内容存储在 localStorage（5-10MB 限制）
  - 新建 `src/lib/storage.ts` 存储抽象层：优先使用 Electron 文件系统 API，回退到 localStorage
  - 添加容量检测和友好错误提示
  - 新增 `getStorageUsage()` 获取存储使用估算

### Code Quality
- **MeTab 调用不存在的 `addPersona`** — 解构了不存在的方法，参数结构完全不匹配
  - 修正为 `createPersona(name)`，使用正确的签名
- **duplicateBook 跨 store 直接修改状态** — 直接修改 `memoryStore.events[newId]` 绕过 Zustand 不可变性
  - 改为通过 `useMemoryStore.setState((prev) => ({...}))` 函数式更新
- **JSON 解析逻辑脆弱** — `analysis.ts` 和 `eventAnalysis.ts` 使用简单正则提取 JSON
  - 新增 `extractJsonFromText()` 函数，支持 markdown 代码块包裹和普通 JSON 文本
- **KnowledgeInitWizard Hook 依赖问题** — 三处禁用 `react-hooks/exhaustive-deps`
  - `handleSend`: 使用函数式 `setMessages(prev => ...)` 避免依赖 `messages`
  - `handleFinish`: 使用 `useRef` 保存最新 `messages` 引用
  - 移除所有不必要的 ESLint 禁用注释
- **代码重复** — `formatDate` 在 4 个文件中重复定义
  - 新建 `src/lib/date.ts` 统一日期格式化：`formatRelativeTime` / `formatDateTime` / `formatShortDateTime`
  - `LibraryPage.tsx`、`PersonaPage.tsx`、`BranchList.tsx`、`CommitTimeline.tsx` 统一引用
- **类型安全** — `BookType` 定义为 `string` 而非联合类型，`TomatoImportPanel` 使用 `as any`
  - `BookType` 改为联合类型：`'玄幻' | '都市' | '科幻' | '仙侠' | '历史' | '悬疑' | '言情' | '其他'`
  - 移除 `TomatoImportPanel.tsx` 中的 `as any` 强制转换

---

## [1.4.0] — 2026-06-03

### Added
- **番茄小说在线导入**（P1 平台导入功能）— 输入 fanqienovel.com 书籍 ID 或 URL，即可搜索、预览并下载全书章节
  - `scripts/tomatoDownloader.js`: 纯 Node.js 番茄小说爬取引擎，无外部依赖
    - 字符集反混淆（`_decodeContent`）移植自 novel_agent
    - HTML 页面 + 官方 API 双策略抓取
    - 异步下载 + 进度轮询 + 质量检查
  - `scripts/_tomato_charset.json`: 番茄小说自定义字符映射表
  - `scripts/dev.js`: 新增 `/api/tomato/search`、`/api/tomato/book-info`、`/api/tomato/download`、`/api/tomato/download-progress` 四条路由
  - `src/services/tomatoImport.ts`: 前端 API 客户端
  - `src/components/library/TomatoImportPanel.tsx`: 完整导入面板（搜索→预览→下载→导入）
  - `src/pages/LibraryPage.tsx`: 顶部工具栏 + 空状态增加「🍅 番茄小说」按钮
- 新增 `.form-error` CSS 类

---

## [1.3.2] — 2026-06-03

### Fixed
- **文件内容未持久化，页面刷新后丢失** — editorStore 的 saveContent / openFile 都在内存操作，从未写入 localStorage
  - `editorStore.saveContent()`: 写入 `localStorage`（key `nc:{filePath}`）
  - `editorStore.openFile()`: 优先从 `localStorage` 读取已有内容，无则使用传入的默认内容
  - `editorStore.removeFile()`: 同步清除 localStorage 中的持久化内容
  - electronMock.ts 原有的 `writeFile/readFile` 方法从未被调用，现已打通

---

## [1.3.1] — 2026-06-03

### Fixed
- `llm.ts` `fetchWithProxy` body 传代理时未 parse 回对象，导致代理 `JSON.stringify` 二次串化，server 收到 `{{model}}` 模板字面量而非模型名（401 ModelError）

---

## [1.3.0] — 2026-06-03

### Fixed
- **P0-1: AI 对话不走 API 代理** — 开发模式下 LLM 请求被 CORS 拦截
  - `scripts/dev.js`: 代理改为流式转发（逐 chunk 推送），超时从 15s 提升至 60s
  - `src/services/llm.ts`: 新增 `fetchWithProxy()`，开发环境自动走代理，不可用时回退直连
  - 波及函数：`streamOpenAICompat`、`streamClaude`、`chat`
- **P0-2: esbuild 扫描缓存报错** — 清除 `node_modules/.vite` 后重启解决
- **P1-4: `addFile` 不排重** — `editorStore.addFile` 改为按 `path` 匹配，已有则替换、无则追加

---

## [1.2.0] — 2026-06-03

### Added
- 作品库右键菜单新增「初始化知识文件」功能
  - 移除该书已有的知识文件（世界观设定、总纲、灵感笔记）
  - 自动打开知识文件初始化向导，重新走一遍 AI 引导讨论流程
  - 兼容已有书籍的简介、主角名等基本信息

### Changed
- `LibraryPage.tsx` — 引入 `useEditorStore`，新增初始化菜单项与处理逻辑

---

## [1.1.0] — 2026-06-03

### Added
- `ProvidersTab.tsx` — 新增 `tryFetchWithProxy()` 辅助函数
  - 开发模式下优先走 API 代理中间件
  - 代理不可用时（404/405）自动回退到浏览器直连
  - 支持 GET/POST 双模式

### Fixed
- `llm.ts` — 新增 `buildApiUrl()` 函数，修复 base URL 已含 `/chat/completions` 或 `/v1/messages` 路径时的重复拼接 bug
  - 波及函数：`streamOpenAICompat`、`streamClaude`、`chat`
- `ProvidersTab.tsx` — 测试连接 URL 改用 `endsWith` 检测，不再无脑追加路径
- `ProvidersTab.tsx` — 修复 `tryFetchWithProxy` 中 POST body 被嵌套 `JSON.stringify` 导致 server 收到双串化内容的 bug
- `ProvidersTab.tsx` — 获取模型 404 时显示友好提示，支持手动输入模型名称

---

## [1.0.0] — 2026-06-01

### Added
- 项目初始化
- 书籍 CRUD（新建、重命名、复制、删除）
- 知识文件初始化向导（AI Q&A → 自动生成世界观设定 / 总纲 / 灵感笔记）
- 设置面板（OpenHanako 风格迁移）
  - 供应商配置（API Key + Base URL + 多模型管理）
  - 作者身份、主题、关于页面
- 创作台（文件树 + Markdown 编辑 + AI 聊天面板）
- 版本管理（Git 分支可视化）
- 作品库右键菜单（重命名 / 复制 / 删除）
