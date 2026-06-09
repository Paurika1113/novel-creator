# Novel Creator — 星辰之痕

> 桌面端 AI 小说创作工作台 — 基于 novel_agent（blackzhanzhan）的功能设计  
> 将小说导入、世界观蒸馏、大纲协作、续写草稿、审核归档和剧情分支管理做成一套可维护的创作 IDE。

## 项目状态

**当前阶段**：P0 核心功能全部实现，可完整工作流闭环。  
**开发中**：P1 平台导入、UI 打磨、暗色主题完善。

---

## 快速启动

```bash
# 安装依赖
npm install

# 启动开发服务器（Vite 6）
node scripts/dev.js
# → 访问 http://localhost:5174/
```

开发服务器通过 Vite API（`createServer({ configFile: false })`）启动，绕过 esbuild 配置加载，兼容受限环境。

---

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | React 19 + TypeScript 5 |
| 构建 | Vite 6 + Babel JSX |
| 状态管理 | Zustand（localStorage 持久化） |
| 样式 | 纯 CSS 变量（无 Tailwind） |
| 桌面外壳 | Electron（`electron/main.cjs` + `electron/preload.cjs`） |
| AI 接入 | OpenAI 兼容 API + Anthropic Claude |
| 编辑器 | Markdown 原生的 `<textarea>` + 工具栏 |

### 为什么没有 Tailwind CSS？

Tailwind CSS v4 的 native oxide 模块依赖 `child_process.spawn`，在沙盒环境中不可用。项目使用纯 CSS 变量方案，在 `src/index.css` 中集中定义设计令牌：

```css
:root {
  --primary: #7c5cfc;
  --primary-hover: #6a48e8;
  --primary-bg: rgba(124, 92, 252, 0.10);
  --text-primary: #1a1a2e;
  --text-secondary: #6b6b80;
  --bg-page: #f5f5f8;
  --bg-sidebar: #16162a;
  --border: #e8e8ee;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --transition: 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}
```

---

## 核心功能

### 📚 作品库

- 新建书籍（自由输入类型 + 主角名）
- 从本地导入 `.md` 文件（文件名 `001-章名.md` 自动解析章节索引）
- 卡片网格展示（书籍类型 emoji、章节数、字数、分支数）
- 右键菜单：重命名 / 复制书籍 / 删除
- 深拷贝书籍（含章节、Git 分支/提交、事件图谱、线程数据）

### 👤 作者身份

- 多 Tag 创建对话框（从已有书籍 / 导入新书分析 / 手动自定义）
- 四维 LLM 风格分析管线（叙事视角 / 节奏密度 / 对话风格 / 描写偏好）
- 详情弹窗（四层风格编辑、合著/笔名管理）

### ✍️ 创作台

三栏布局，可拖拽调整栏宽：

```
┌──────────┬─────────────────────────────┬────────────┐
│ 文件树   │       Markdown 编辑器        │  聊天面板  │
│          │  ┌─────────────────────┐    │            │
│ master/  │  │ 粗体 斜体 H2 链接…  │    │  AI 消息   │
│  大纲    │  ├─────────────────────┤    │            │
│  章节1 ✓ │  │                     │    │ 输入框     │
│  章节2 ✓ │  │  编辑 / 预览 切换    │    │            │
│  当前草稿│  │                     │    │ 模型选择   │
│  世界观  │  │                     │    │            │
│  状态卡  │  └─────────────────────┘    │            │
│          │                             │            │
├──────────┴─────────────────────────────┴────────────┤
│   动作栏：写下一章 / 续写本章 / 审核 / 世界观 / 文风 / 归档  │
└──────────────────────────────────────────────────────┘
```

**顶栏**：书名 · 类型 · 分支 · 章节数 · 字数 · 🧠 记忆使用率（三色预警：40%黄 / 70%橙 / 85%红闪）

### 🔀 版本管理

- 分支列表（当前分支高亮）
- 提交时间线（模拟数据，含 mock hash/时间/作者）
- Diff 查看器
- 分支操作弹窗（新建/合并/回退）

### ✅ 正文交付流程

7 步自动归档流水线：

```
草稿 → 读取 → 分割 → 写入 chapters/ → 清空 → LLM 事件分析 → 状态卡更新 → 里程碑压缩 → Git 提交
```

每一步在弹窗中实时显示进度。

### 🧠 动态记忆压缩

四层压缩层级：

| 层级 | 粒度 | 说明 |
|------|------|------|
| T0 | 1:1 | 原始章节，完整保留 |
| T1 | 1章 → ~150字 | 单章核心事件摘要 |
| T2 | 5章 → ~400字 | 情节推进线 + 转折点 |
| T3 | 1弧 → ~800字 | 完整故事弧起承转合 |
| T4 | 全书 → ~2000字 | 全书快照（50章/100章触发） |

**里程碑自动压缩**：

| 章节数 | 动作 |
|--------|------|
| ≥10 | ch1-10 → T1 |
| ≥20 | ch1-10 → T2, ch11-20 → T1 |
| ≥30 | ch1-10 → T3, ch11-20 → T2, ch21-30 → T1 |
| ≥50 | 首次生成全书快照 |
| ≥100 | 刷新全书快照 |

### 🔗 事件图谱与线程管理

- LLM 自动提取章节事件（冲突/对话/发现/感情/动作/世界观）
- 维护活跃线程表（推进中 → 休眠中 → 已回收）
- 生成 `active_elements.md`（线程状态概览表）
- 更新 `status_card.md`（归档章数、线程摘要、新出场人物）

### 🛠️ 知识文件合规

AI 代理通过工具函数按需读取知识文件（非预注入），包括：

- `read_knowledge_file` — 读取世界观/文风/大纲等知识文件
- `read_current_draft` / `write_current_draft` — 读写草稿
- `append_to_draft` — 追加内容到草稿末尾
- `list_chapters` / `read_chapter` — 已归档章节
- `write_knowledge_file` — 写入知识文件

### ⚙️ 系统设置

- LLM Provider 切换（OpenAI 兼容 / Anthropic / 自定义）
- API Key 显隐输入
- Base URL 配置
- 模型上下文窗口查看
- 压缩敏感度滑块
- 主题切换（浅色/深色，CSS 变量自动切换）
- 测试连接按钮
- 关于面板（版本号）

---

## 项目结构

```
novel-creator/
├── scripts/
│   └── dev.js                    # 自定义 Vite 开发服务器
├── electron/
│   ├── main.cjs                  # Electron 主进程（沙盒受限，需真机运行）
│   └── preload.cjs               # preload 脚本
├── docs/
│   ├── prd/PRD.md                # 产品需求文档
│   ├── plan/4week-plan.md        # 四周开发计划
│   └── design/
│       ├── ux-spec.md            # 交互设计规范
│       └── mockup-v4.html        # UI 原型（最新）
├── src/
│   ├── main.tsx                  # 入口
│   ├── App.tsx                   # 路由 + 设置弹窗
│   ├── index.css                 # 全局样式（~1600 行 CSS 变量）
│   ├── types/
│   │   └── index.ts              # 所有类型定义
│   ├── lib/
│   │   ├── id.ts                 # ID 生成
│   │   ├── persistence.ts        # Zustand localStorage 持久化
│   │   └── devStores.ts          # Dev 调试入口 (window.__stores)
│   ├── stores/                   # Zustand 状态管理
│   │   ├── bookStore.ts          # 书籍 CRUD + 章节
│   │   ├── editorStore.ts        # 编辑器文件状态
│   │   ├── chatStore.ts          # AI 聊天（流式、Abort）
│   │   ├── gitStore.ts           # Git 分支/提交
│   │   ├── personaStore.ts       # 作者身份
│   │   ├── memoryStore.ts        # 事件图谱 + 线程
│   │   └── settingsStore.ts      # 系统设置
│   ├── services/                 # 核心服务
│   │   ├── llm.ts                # LLM 流式调用（OpenAI + Anthropic）
│   │   ├── agents.ts             # Agent 系统提示 + 工具定义
│   │   ├── toolExecutor.ts       # 7 个知识合规工具
│   │   ├── analysis.ts           # 四维文风分析
│   │   ├── eventAnalysis.ts      # 事件图谱分析
│   │   ├── compression.ts        # 动态记忆压缩
│   │   └── electronMock.ts       # 浏览器环境 electronAPI mock
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Modal.tsx         # 通用弹窗
│   │   │   └── ContextMenu.tsx   # 右键菜单
│   │   ├── layout/
│   │   │   └── Sidebar.tsx       # 侧栏导航
│   │   ├── library/
│   │   │   └── ImportModal.tsx   # 书籍导入
│   │   ├── editor/
│   │   │   ├── FileTree.tsx      # 文件树
│   │   │   ├── MarkdownEditor.tsx # Markdown 编辑器
│   │   │   ├── ChatPanel.tsx     # AI 聊天面板
│   │   │   ├── ActionBar.tsx     # 动作栏（8 按钮）
│   │   │   └── ArchiveModal.tsx  # 归档弹窗（7 步流水线）
│   │   └── settings/
│   │       └── SettingsModal.tsx # 设置弹窗
│   └── pages/
│       ├── LibraryPage.tsx       # 作品库页
│       ├── EditorPage.tsx        # 创作台页
│       ├── GitPage.tsx           # 版本管理页
│       └── PersonaPage.tsx       # 作者身份页
├── package.json
└── README.md
```

---

## 架构亮点

### AI 代理系统

四类 Agent 各司其职，通过 tool use 与知识文件交互（非预注入）：

| Agent | 职责 | 记忆层级 |
|-------|------|---------|
| 续写（continuation） | 创作新章节、续写 | T0 原文 |
| 世界观（world） | 完善设定、补充条目 | T1 摘要 |
| 审核（review） | 逻辑/情节/连贯性检查 | T1 + T2 |
| 文风（style） | 润色、模仿作者笔法 | T1 + T2 |

三层认知递进：业务规则 → 知识文件 → 记忆系统（三级水位线渐进加载）。

### 状态持久化

所有 Zustand store 通过 `subscribe` + 节流（5 秒）自动写入 localStorage。关闭页面时通过 `beforeunload` 立即保存。持久化的状态包括：书籍、章节、作者身份、设置、当前选择、事件图谱、线程。

### 沙盒适配

开发环境受 sandbox 限制（`child_process.spawn` EPERM），对应策略：
- Vite dev server 用 API 模式启动（`configFile: false` 绕过 esbuild）
- 无 Tailwind（native oxide 模块需 spawn）
- Electron 二进制不可运行，但源码已写好（`electron/main.cjs` + `electron/preload.cjs`）
- 测试通过 `browser evaluate` + `window.__stores` 执行

---

## 开发命令

```bash
# 启动开发服务器
node scripts/dev.js

# 构建生产版本
npx vite build
```

---

## 许可证

MIT
