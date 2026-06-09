# Novel Creator — 项目维护指南

下一个人接手项目时，按此文档逐项阅读，了解项目结构、架构决策和维护流程。

---

## 一、项目概览

Novel Creator 是一个桌面端 AI 小说创作工作台，支持世界观构建、章节写作、AI 辅助对话、版本管理。前端 React + TypeScript，状态管理 Zustand，存储 localStorage，打包 Electron。

---

## 二、技术栈速览

| 层 | 技术 | 说明 |
|----|------|------|
| UI 框架 | React 19 | — |
| 语言 | TypeScript | 全量类型 |
| 构建 | Vite 6 | 无独立 vite.config.ts，所有配置在 `scripts/dev.js` inline |
| 状态管理 | Zustand 5 | 每个 Store 一个文件，持久化通过 localStorage |
| 样式 | Inline style + CSS 变量 | 全局 CSS 变量定义在 `src/index.css`，各组件用 inline style |
| 桌面 | Electron | 主进程在 `electron/main.cjs`，预加载 `electron/preload.cjs` |
| AI | OpenAI 兼容 API | 多 Provider 支持（OpenAI、Claude、DeepSeek、自定义） |

---

## 三、目录结构与必读文件

```
novel-creator/
├── CHANGELOG.md          ← 版本更新日志（每次修改必须更新）
├── ISSUES.md             ← 已知问题清单（新增问题必须记录）
├── package.json          ← 版本号在这里（每次修改必须更新）
├── README.md             ← 项目简介
│
├── scripts/
│   └── dev.js            ← [必读] 开发服务器配置 + API 代理中间件
│                          └─ 内含 /api/proxy 转发，用于绕过浏览器 CORS
│
├── src/
│   ├── types/
│   │   └── index.ts      ← [必读] 所有核心类型：Book, Chapter, KnowledgeFile, AppSettings 等
│   │
│   ├── stores/           ← [必读] Zustand 状态管理
│   │   ├── bookStore.ts     ├── 书籍 CRUD（createBook / deleteBook / duplicateBook）
│   │   ├── editorStore.ts   ├── 文件树 + 编辑器内容（全局数组，非按书隔离 —— 已知问题）
│   │   ├── settingsStore.ts ├── 设置持久化（provider / apiKey / baseUrl / savedModels）
│   │   ├── gitStore.ts      ├── Git 分支与提交
│   │   └── memoryStore.ts   └── 记忆事件与线程
│   │
│   ├── services/
│   │   ├── llm.ts            ← [必读] LLM 调用核心
│   │   │                      ├── buildApiUrl() — URL 防双拼（有坑，改时注意）
│   │   │                      ├── streamOpenAICompat() — 流式 OpenAI 兼容
│   │   │                      ├── streamClaude() — 流式 Claude
│   │   │                      ├── chat() — 非流式（用于测试连接）
│   │   │                      └── streamChat() — 统一入口
│   │   ├── knowledgeInit.ts  ← [必读] 知识文件初始化服务
│   │   │                      ├── getInitPrompt() — AI 编辑话术模板
│   │   │                      ├── streamInitChat() — Q&A 流式对话
│   │   │                      └── generateKnowledgeFiles() — 讨论后生成三文件
│   │   ├── analysis.ts       ← 风格分析（作者身份）
│   │   └── knowledgeTemplates.ts ← 世界观/总纲/灵感笔记 默认模板
│   │
│   ├── pages/
│   │   ├── LibraryPage.tsx   ← [必读] 作品库（书籍卡片网格 + 右键菜单）
│   │   ├── EditorPage.tsx    ← [必读] 创作台（三栏布局 + 文件合并逻辑）
│   │   ├── GitPage.tsx       ← 版本管理
│   │   └── PersonaPage.tsx   ← 作者身份
│   │
│   ├── components/
│   │   ├── settings/
│   │   │   ├── SettingsPanel.tsx       ← 设置面板主布局
│   │   │   ├── SettingsNav.tsx         ← 左导航
│   │   │   ├── SettingsSection.tsx     ← Section 卡片
│   │   │   ├── SettingsRow.tsx         ← 表单行
│   │   │   └── tabs/
│   │   │       ├── ProvidersTab.tsx    ← [必读] 供应商配置（凭据编辑态 + 模型管理 + tryFetchWithProxy）
│   │   │       ├── MeTab.tsx           ← 作者身份
│   │   │       ├── InterfaceTab.tsx    ← 主题
│   │   │       └── AboutTab.tsx        ← 版本信息
│   │   ├── library/
│   │   │   ├── KnowledgeInitWizard.tsx  ← [必读] 知识文件初始化向导（5 阶段状态机）
│   │   │   └── ImportModal.tsx         ← 导入弹窗
│   │   ├── editor/
│   │   │   ├── FileTree.tsx            ← 文件树
│   │   │   ├── MarkdownEditor.tsx      ← 编辑器
│   │   │   ├── ChatPanel.tsx           ← AI 聊天面板
│   │   │   ├── ActionBar.tsx           ← 底部动作栏
│   │   │   └── ArchiveModal.tsx        ← 归档弹窗
│   │   └── ui/
│   │       ├── Modal.tsx               ← [必读] 通用弹窗（header 按需渲染，settings 用 bodyStyle）
│   │       └── ContextMenu.tsx          ← 右键菜单
│   │
│   └── index.css           ← [必读] 全局 CSS 变量 + 组件样式
│
├── electron/
│   ├── main.cjs            ← Electron 主进程入口
│   └── preload.cjs         ← 预加载脚本
│
└── docs/
    ├── plan/
    │   └── 4week-plan.md   ← 4 周开发计划
    ├── prd/
    │   └── PRD.md          ← 产品需求文档
    └── design/
        └── mockup-v*.html  ← 设计稿
```

---

## 四、维护流程

### 4.1 日常修改流程

```
1. 改代码
2. 浏览器验证（npm run dev 或 npm run dev:renderer）
   └─ 确保不出现白屏/黑屏
3. 判断版本号变更类型：
   └─ 大版本（X）：破坏性重构、框架升级、UI 整体重做
   └─ 中版本（Y）：新功能、模块新增
   └─ 小版本（Z）：bug 修复、样式微调
4. 更新 package.json 中的 version
5. 更新 CHANGELOG.md（按 Added / Changed / Fixed / Removed 分类）
6. 如果发现新 bug 或设计问题，更新 ISSUES.md
```

### 4.2 新增功能流程

```
1. 了解现有类型定义（src/types/index.ts）
2. 如果是状态相关，先评估现有 Store 是否需要扩展
3. 组件使用 inline style，CSS 变量统一在 src/index.css 定义
4. 所有 LLM 调用走 src/services/llm.ts 中的 streamChat()
5. 开发模式下如需跨域请求，确保走 /api/proxy（参考 ProvidersTab.tsx 的 tryFetchWithProxy）
6. 测试时用 npm run dev（带代理），打包后用 Electron 验证
```

### 4.3 修复 Bug 流程

```
1. 在 ISSUES.md 找到对应条目，标记为修复中
2. 修完后更新 CHANGELOG.md（Fixed 分类）
3. 更新 ISSUES.md 对应条目状态为 ✅ 已修复
4. 小版本 +1
```

---

## 五、关键架构决策（必读）

### 5.1 凭据编辑态模式

API Key 和 Base URL 不立即持久化。编辑后显示「保存凭据」按钮，点击才写 localStorage。由 ProvidersTab 内部的 `apiKeyDraft` / `baseUrlDraft` 本地状态 + `keyEdited` / `urlEdited` 脏标记追踪。

### 5.2 URL 防双拼

`llm.ts` 中的 `buildApiUrl()` 会检查 base URL 是否已以目标路径结尾（如 `/chat/completions`），是则不再拼接。`ProvidersTab.tsx` 的测试连接也用了同样的 `endsWith` 检测。两个文件各有一份，改一处时要同步另一处。

### 5.3 代理 vs 直连

`tryFetchWithProxy()` 在 `ProvidersTab.tsx` 中定义，逻辑：
1. 检测 localhost → 先发 POST 到 `/api/proxy`
2. 代理返回 404/405 → 判定代理不存在 → 回退到浏览器直连
3. 其他状态码（包括远端返回的 404）→ 代理生效，取代理结果

`llm.ts` 目前没有走代理，开发模式下 AI 对话受 CORS 限制（ISSUES.md #1）。

### 5.4 知识文件初始化时机

新建书籍弹窗关闭后独立弹出 KnowledgeInitWizard（非内嵌在新建弹窗内）。AI 一次问一个问题，用户输入后继续，充分讨论后点「完成讨论并生成知识文件」进入生成阶段。

### 5.5 编辑器文件合并逻辑

`EditorPage.tsx` 的 `useEffect` 判断：
- `files.length === 0` → 生成默认文件（含模板内容）
- `files.length > 0` → 保留已有文件，补充缺失的文件类型

确保向导生成的内容不会被默认模板覆盖。

### 5.6 设置面板布局

固定尺寸 720×560，左导航 + 右内容面板。关闭按钮在标题栏右侧，不在 Modal header 中。`Modal.tsx` 无 `title` 时不渲染 header。

---

## 六、常用命令

```bash
# 开发（带 API 代理，推荐）
npm run dev

# 仅渲染层（不带代理，CORS 受限）
npm run dev:renderer

# 构建
npm run build

# Electron 打包
npm run electron:build
```

---

## 七、快速定位指南

| 你想做什么 | 看哪个文件 |
|-----------|-----------|
| 改书籍数据结构 | `src/types/index.ts` + `src/stores/bookStore.ts` |
| 改 LLM 调用方式 | `src/services/llm.ts` |
| 改知识文件生成逻辑 | `src/services/knowledgeInit.ts` |
| 改设置页 UI | `src/components/settings/tabs/ProvidersTab.tsx` |
| 改文件树 | `src/stores/editorStore.ts` + `src/components/editor/FileTree.tsx` |
| 改版本号 | `package.json` + `CHANGELOG.md` |
| 登记新 bug | `ISSUES.md` |
| 了解完整功能清单 | `docs/prd/PRD.md` |
