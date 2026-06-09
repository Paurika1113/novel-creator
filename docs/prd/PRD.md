# Novel Creator — 桌面端 AI 小说创作工作台 PRD

## 一、概述

**文档信息**

| 版本号 | 日期 | 作者 |
|--------|------|------|
| V 2.1.0 | 2026-06-09 | 马金辉 |

**版本历史**

| 版本 | 日期 | 变更 |
|------|------|------|
| V 2.0.0 | 2026-06-01 | 初始完整版 PRD，覆盖 10 个功能模块 |
| V 2.1.0 | 2026-06-09 | 更新：流式架构重构（工具循环下沉至服务层）、`<Main text>` 标签协议、ChatPanel 标签状态机、归档修复、proxy 超时调整、21+ bug 修复归档 |

### 1. 需求背景

- **目标用户现状**：长篇网文作者和专业写作者目前依赖 AI 聊天工具（ChatGPT、Claude、DeepSeek等）逐段生成内容，手动维护章节文件和设定笔记。创作资产分散在多个文档和聊天记录中，缺乏版本管理、文风一致性维护和结构化协作手段。开源项目 novel_agent (blackzhanzhan) 提供了完整的设计思路——Git 版本管理 + AI 辅助创作管线 + Markdown 知识文件系统——但重度依赖 Dify 服务平台、Flask 后端和 Docker 部署，普通作者难以安装使用。
- **核心痛点**：
  1. 创作资产缺乏版本管理——章节改来改去分不清哪个是最新版，想试两条剧情线只能复制文件夹
  2. AI 协作缺少结构化上下文——在聊天工具里聊过的世界观设定，下个 session 就丢了
  3. 文风一致性难以维持——长篇写到后面人物容易跑偏，前期设定忘了；AI 续写的文风和自己不像
  4. 现有方案部署门槛高——novel_agent 需要 Docker + Dify + Flask + 前端四套服务才能跑起来
- **当前问题汇总**：

| 问题点 | 问题描述 | 当前影响 |
|--------|----------|----------|
| 无版本管理 | 章节文件手动管理，难以回退和分支 | 剧情分支实验成本高，改错了难恢复 |
| AI 上下文碎片化 | 聊天工具中讨论的设定后续无法引用 | 每次续写需要重新描述上下文 |
| 文风一致性失控 | 世界观/人物/文风没有系统化管理 | 长篇写作中"崩人设"、情节漏洞、AI 续写风格不统一 |
| AI 无作者认知 | AI 不识别作者的个人写作特征 | AI 输出像"标准 AI 文"，没有个性 |
| 部署门槛高 | 依赖 Docker + Dify + Flask + 前后端 4 层 | 普通作者无法独立部署 |

### 2. 需求目标

- **业务目标**：
  1. 用 Electron 桌面端实现 novel_agent 的核心创作管线，去掉 Dify/Docker 依赖，做到下载即用
  2. 为每本书提供 Git 版本管理，让剧情分支和回退像 GitHub Desktop 一样直观
  3. 通过四维文风分析系统构建可复用的作者身份，让 AI 能模仿特定作者的文风进行写作
  4. 通过动态记忆压缩系统让 AI 在长篇写作中始终保持对已写内容的精准理解
- **成功标准**：

| 指标 | 当前状态 | 目标状态 |
|------|----------|----------|
| 安装步骤 | novel_agent 需配置 Docker + Dify + Flask + 前端 | 下载 exe → 安装 → 填 API Key → 开始创作 |
| 版本管理 | 用户手动管理文件版本 | 每本书自动 Git 管理，分支/历史/diff 可视化 |
| AI 上下文 | 聊天工具中零散对话 | 同一本书的 AI 对话历史持久化，续写自动加载上下文 |
| 文风一致性 | 无系统化管理 | 作者身份（四维文风分析）驱动 AI 写作底层人格 |
| 记忆压缩 | 无 | 基于模型上下文窗口 + 故事线程活跃度的动态记忆系统，不设固定上限 |
| 知识文件合规 | 无 | 续写 Agent 自律查阅 + 审核 Agent 他律交叉检查 |

### 3. 需求范围

- **包含**（P0）：
  - 书库管理：新建原创书、从本地文件导入已有作品
  - 作者身份管理：三种方式创建作者身份（从已有书籍分析 / 导入新书分析 / 手动自定义），四维文风分析管线（语言层/叙事层/结构层/风格标签），身份库查看/编辑/删除
  - Git 版本管理：每本书自动初始化为独立 Git 仓库，支持分支切换、提交历史、文件 diff、回退
  - 创作台：文件树 + Markdown 编辑器 + AI 聊天面板 + 底部动作台，顶部栏显示当前作者身份
  - AI 协作核心：三层 Agent 认知架构（基础身份 + 作者身份 + 作品特色），四个 Agent Profile（续写/世界观/审核/文风）
  - 知识文件合规机制：规范性知识文件不预注入，AI 通过查阅规则主动调用工具读取；审核 Agent 五级交叉审核
  - 正文交付流程：写下一章 / 续写本章 → 编辑 →（可选）审核 → 确认归档 → Git 提交
  - 动态记忆压缩系统：基于模型上下文窗口的三级水位线渐进压缩 + 故事线程活跃度优先级
  - 事件图谱与线程管理：归档时自动分析线程参与状态，维护 active_elements.md
  - API Key 配置
  - 扮演模式预留：动作台按钮位置、Agent Profile 能力字段、prompt 预设插槽
  - **`<Main text>` 标签协议**：AI 生成的正文必须包裹在 `<Main text>` 标签内，工具执行器强制提取，确保聊天文本与文件内容严格分离
  - **工具循环下沉**：工具调用循环在 LLM 服务层（`streamChatWithTools`）完成，React 组件只需处理流式 delta 事件，避免因组件重渲染导致请求被取消

- **包含**（P1）：
  - 平台导入（番茄小说等）

- **不包含**：
  - 扮演模式（当前版本不实现）
  - 团队协作/多人编辑
  - 云端同步
  - 人物关系图谱可视化
  - 滚动三章自动生产
  - 导出 Word/PDF/ePub
  - 作者身份多设备同步

### 4. 参考资料

| 文档名称 | 链接/说明 |
|----------|-----------|
| novel_agent 项目 | https://github.com/blackzhanzhan/novel_agent — 功能参考的主要来源 |
| technical-dossier | https://blackzhanzhan.github.io/novel_agent/ — 完整架构说明 |
| OpenHanako 项目 | https://github.com/liliMozi/openhanako — UI 设计参考（布局、配色、交互模式） |

## 二、页面结构

（V2.1.0 未变更页面结构，继承 V2.0.0 的导航层级和页面职责）

| 导航层级 | 页面名称 | 页面定位 | 入口 | 主要承载功能 |
|----------|----------|----------|------|--------------|
| 一级 | 作品库 | 项目入口与管理 | 左侧边栏默认选中 | 新建/导入/浏览/删除书籍 |
| 一级 | 作者身份 | 作者身份管理 | 左侧边栏 | 添加/编辑/删除作者身份，四维文风分析 |
| 一级 | 创作台 | 核心写作工作区 | 左侧边栏 | 文件树 + 编辑器 + AI 聊天 + 动作台 |
| 一级 | 版本管理 | Git 操作面板 | 左侧边栏 | 分支/历史/diff/回退 |
| 二级 | 设置页 | 全局配置 | 左侧边栏底部齿轮 | API Key、主题、压缩敏感度、关于 |
| 二级 | 新建/导入弹窗 | 作品创建 | 作品库页面触发 | 新建原创书/从文件导入 |
| 二级 | 作者身份详情页 | 身份查看与编辑 | 作者身份页面触发 | 四层文风画像查看/编辑、关联书籍列表 |

导航模式：左侧固定宽度边栏（约 200px），图标 + 文字标签。当前页面高亮。边栏底部固定设置入口。

**页面职责说明**（V2.1.0 无变化）

| 页面名称 | 用户目标 | 关键内容/组件 | 空状态 | 异常状态 |
|----------|----------|----------------|--------|----------|
| 作品库 | 查看所有书籍、新建或导入作品 | 书籍卡片网格（书名 + 类型 + 章节数 + 最后编辑时间 + Git 分支数 + 进度条）、新建按钮、导入按钮 | "还没有书，点击新建开始创作" + 大型新建按钮 + 导入按钮 | 加载失败：重试按钮 |
| 作者身份 | 创建和管理作者身份，查看和编辑文风分析结果 | 身份卡片网格（身份名 + 来源书籍数 + 创建时间 + 分析状态）、添加身份按钮、卡片右键菜单（编辑/删除）、详情页中的四层文风画像面板 | "还没有作者身份。导入作品并分析，或手动创建一个。" + 添加按钮 | 分析失败：分析状态显示"失败" + 重新分析按钮；加载失败：重试 |
| 创作台 | 完成一本书从设定到正文的完整创作 | 顶部栏（当前作者身份 + 书名 + 当前分支 + Agent切换 + 记忆使用状态）+ 文件树（左侧）+ 编辑器（中间）+ AI 聊天（右侧）+ 动作台（底部） | 未选择书籍时提示「请先在作品库选择一本书」 | AI 请求失败：错误提示 + 重试；文件加载失败：重试按钮 |
| 版本管理 | 管理书籍的 Git 分支和历史 | 分支列表 + 提交时间线 + 文件 diff 视图 + 切换/创建/合并分支操作 | 仅第一次提交时显示 | Git 操作失败：错误信息 |
| 设置（弹窗） | 配置应用参数 | Provider 下拉 + API Key 输入 + Base URL + 测试连接 + 压缩敏感度滑条 + 主题切换 + 关于 | — | 连接测试失败 |

**页面与功能映射**（V2.1.0 无变化）

| 功能名称 | 入口页面 | 过程页面 | 结果展示页面 |
|----------|----------|----------|--------------|
| 新建书籍 | 作品库 | 新建弹窗 | 跳转到创作台（自动初始化仓库） |
| 导入书籍 | 作品库 | 导入弹窗/文件选择器 | 跳转到创作台（或停留在作品库） |
| 添加作者身份（从已有书籍） | 作者身份 | 添加弹窗 → 选择书籍 → 分析进度 | 作者身份列表（新增卡片）+ 身份详情页 |
| 添加作者身份（导入新书分析） | 作者身份 | 添加弹窗 → 文件选择器 → 导入+分析进度 | 作者身份列表（新增卡片） |
| 添加作者身份（手动自定义） | 作者身份 | 添加弹窗 → 填写表单 | 作者身份列表（新增卡片） |
| 编辑作者身份 | 作者身份 | 身份详情页 | 面板内容更新 |
| AI 聊天创作 | 创作台 | AI 聊天面板 | 文件树中反映变更（新草稿/新文件） |
| 正文归档 | 创作台 | 动作台 → 确认弹窗 | 文件树更新（draft → chapters） |
| Git 分支管理 | 版本管理 | 分支操作面板 | 分支列表更新 |
| 知识文件管理 | 创作台 | 文件树中选择文件 → 编辑器 | 编辑器内容更新 |

## 三、功能列表

| 模块 | 功能名称 | 功能说明 | 优先级 |
|------|----------|----------|--------|
| 书库 | 书籍管理 | 用户可创建、导入、重命名、删除书籍 | P0 |
| 书库 | 书籍导入 | 从本地文件/文件夹导入已有作品（Markdown 章节文件） | P0 |
| 作者身份 | 作者身份创建 | 三种方式创建：从已有书籍分析 / 导入新书分析 / 手动自定义 | P0 |
| 作者身份 | 四维文风分析管线 | 分析产出语言层/叙事层/结构层/风格标签四层文风画像，非阻塞后台执行 | P0 |
| 作者身份 | 身份详情与编辑 | 查看/编辑四层文风画像内容，查看关联书籍列表 | P0 |
| 作者身份 | 身份库管理 | 重命名、删除作者身份 | P0 |
| Git | 版本管理 | 每本书独立 Git 仓库，支持分支/历史/diff/回退 | P0 |
| 创作台 | 文件树 | 浏览和管理书籍工作区的所有文件 | P0 |
| 创作台 | Markdown 编辑器 | 阅读和编辑 Markdown 文件（含预览模式） | P0 |
| 创作台 | AI 聊天面板 | 多 Agent 聊天（续写/世界观/审核/文风），支持 tool use 读写文件和 Git | P0 |
| 创作台 | 工具循环下沉 | 工具调用循环在 LLM 服务层（`streamChatWithTools`）完成，React 组件只处理流式 delta 事件 | P0 |
| 创作台 | `streamChatWithTools` | 内置工具循环的流式对话服务，自动管理 assistant/tool 消息的多轮交互，最多 5 轮 | P0 |
| 创作台 | `<Main text>` 标签协议 | AI 正文必须包裹在 `<Main text>` 标签中，工具执行器强制提取，标签外文字不写入文件 | P0 |
| 创作台 | 标签状态机（ChatPanel） | 流式解析 `<Main text>` 标签，分离聊天显示（chatContent）与编辑器内容（cleanContent），`toolExecuted` 标志防止聊天文字覆盖文件 | P0 |
| 创作台 | 三层 Agent 认知架构 | 基础身份 + 作者身份 + 作品特色三层约束驱动 Agent 生成 | P0 |
| 创作台 | 知识文件查阅合规机制 | 规范性文件不预注入，AI 按查阅规则主动调用工具读取 | P0 |
| 创作台 | 动作台 | 快捷操作面板（写下一章/续写本章/审核草稿/生成世界观/分析文风/确认归档 + 扮演模式预留按钮） | P0 |
| 创作台 | 正文交付 | 草稿 → 用户编辑 →（可选）审核 → 确认归档 → Git 提交 完整流程 | P0 |
| 记忆系统 | 事件图谱与线程管理 | 归档时自动分析章节参与的故事线程，构建事件图谱 | P0 |
| 记忆系统 | 动态记忆压缩 | 基于模型上下文窗口的三级水位线压缩，故事线程活跃度加权 | P0 |
| 创作台 | 审核 Agent | 五级审核（世界观一致性/大纲一致性/前文连续性/文风一致性/文本质量），输出结构化报告 | P0 |
| 知识文件 | 自动生成 | 从正文自动生成/重建知识文件（world_model、summary 等） | P0 |
| 知识文件 | 手动编辑 | 用户可直接在编辑器中修改知识文件 | P0 |
| 系统 | API Key 配置 | 配置 LLM API Key，支持多 Provider | P0 |
| 系统 | 模型上下文设置 | 模型上下文窗口识别 + 压缩敏感度调节滑条 | P0 |
| 系统 | 本地持久化 | 所有数据存储在本地文件系统和 localStorage（`nc:{bookId}:{path}` 键格式），localStorage 为权威数据源 | P0 |
| 系统 | 双层持久化 | Zustand store 维护运行时状态，localStorage 维护持久化内容（工具执行器直接写入） | P0 |
| 系统 | 代理超时保护 | 开发模式 API 代理超时 300 秒（5 分钟），前端请求同样 300 秒超时 | P0 |
| 系统 | 扮演模式预留 | 动作台预留按钮、Agent Profile 预留字段、prompt 预设插槽 | P0 |
| 书库 | 平台导入 | 番茄小说等平台作品导入 | P1 |

## 四、功能说明

### 功能 1：书籍管理

（V2.1.0 未变更）

**功能描述**

用户在作品库页面管理所有书籍的生命周期。每本书在本地对应一个独立的目录，内含 Git 仓库和工作区文件。

**用户流程**

```text
[打开应用 → 进入作品库]
  ↓
├─ [已有书籍] → 显示书籍卡片网格
│   ├─ 卡片内容：书名、类型标签、章节数、最后编辑时间、Git 分支数、阅读进度条
│   ├─ 点击卡片 → 进入该书的创作台
│   └─ 右键菜单：
│       ├─ 重命名 → 内联编辑 → Enter 确认 / Esc 取消
│       ├─ 复制 → 深拷贝整本书（含 Git 历史）
│       └─ 删除 → 二次确认弹窗 → 确认后删除整个书籍目录
│
└─ [无书籍 / 点击新建] → 弹出新建弹窗
    ├─ 书名（必填，2-50 字符）
    ├─ 小说类型（下拉：玄幻/都市/科幻/仙侠/历史/悬疑/言情/其他）
    ├─ 一句话简介（选填，0-200字）
    └─ 点击创建 → 创建书籍目录 → `git init` → 写入 metadata → 跳转到创作台

[导入操作]
  └─ 点击"导入"按钮 → 系统文件选择器
      ├─ 选择目录（从本地拖入一组 Markdown 章节文件）
      └─ 系统行为：
          1. 在 books/ 下创建书籍目录
          2. 将选中的 .md 文件按文件名排序导入 chapters/
          3. 生成 metadata.json
          4. git init + git add + git commit（初始提交）
          5. 进入创作台
```

**异常路径**、**状态机**、**字段规范**、**文案规范** 同 V2.0.0。

---

### 功能 2：作者身份管理

（V2.1.0 未变更）

**功能描述**

用户在作者身份页面创建和管理作者身份。作者身份是 Agent 写作的底层人格——它定义了 AI 模仿哪位作者的文风来执笔。每个作者身份包含四层文风画像：语言层、叙事层、结构层、风格标签。支持三种创建方式。

**用户流程**、**异常路径**、**状态机**、**字段规范**、**文案规范** 同 V2.0.0。

---

### 功能 3：版本管理（Git）

（V2.1.0 未变更）

**功能描述**

每本书自动初始化一个独立 Git 仓库。用户在版本管理页面可视化查看和管理分支、提交历史和文件变更。

**用户流程**、**异常路径**、**状态机**、**字段规范**、**文案规范** 同 V2.0.0。

---

### 功能 4：创作台——文件树与编辑器

（V2.1.0 更新了文件树说明，明确了 localStorage 的权威数据源角色）

**功能描述**

创作台是用户的核心工作区。左侧文件树展示书籍工作区的所有文件，中间为 Markdown 编辑器（支持编辑和预览），右侧为 AI 聊天面板，底部为动作台。顶部栏显示当前激活的作者身份、书名、Git 分支和当前 Agent 信息。

**文件树结构**

每本书的工作区目录映射为文件树，文件内容通过 Zustand store 和 localStorage 双层持久化。localStorage 的键格式为 `nc:{bookId}:{path}`，是文件内容的权威数据源——工具执行器直接写入 localStorage，编辑器 `openFile()` 优先从 localStorage 加载。

```
📁 {书名}/
├── 📁 chapters/                  # 正式章节目录
│   ├── 001-第一章.md
│   └── ...
├── 📁 summary/                   # 压缩记忆文件
│   ├── book_snapshot.md          # 全书快照（T4）
│   ├── arc_summary.md            # 按故事弧组织的深层摘要（T3）
│   ├── chapter_timeline.md       # 逐章/逐块时间线摘要（T1/T2）
│   └── active_elements.md        # 当前活跃线程列表
├── 📄 chapter_draft.md           # 当前续写草稿
├── 📄 master_outline.md          # 总纲
├── 📄 arc_outline.md             # 篇章大纲
├── 📄 chapter_outline.md         # 当前章节大纲
├── 📄 world_model.md             # 世界观设定
├── 📄 status_card.md             # 当前状态卡
├── 📄 style_fingerprint.md       # 文风指纹（由作者身份文风画像写入）
├── 📄 brainstorm.md              # 灵感池
├── 📄 error_archive.md           # 审核错误归档
├── 📄 summary.md                 # 摘要
├── 📁 .agent-conversations/      # AI 对话历史
│   ├── continuation-agent.jsonl
│   ├── world-agent.jsonl
│   ├── review-agent.jsonl
│   └── style-agent.jsonl
└── 📁 .events/                   # 事件图谱数据（不可见）
    ├── threads.json              # 线程索引
    └── ch-NNN-events.json        # 逐章事件标注
```

**用户流程**

```text
[进入创作台]
  ↓
顶部栏：[当前作者身份 ▼  书名 | 玄幻 | master | 续写 Agent ▼ | 📖 记忆使用: 32%]
  ├─ 作者身份下拉：切换当前书的激活作者身份
  ├─ 书名点击：跳转到作品库
  ├─ Git 分支点击：跳转到版本管理
  └─ Agent 下拉：切换当前聊天面板的 Agent（续写/世界观/审核/文风）

├─ 文件树：点击文件 → 中间编辑器加载内容
│   ├─ .md 文件 → Markdown 编辑（WYSIWYG）+ 预览切换
│   ├─ .json 文件 → 只读模式展示
│   └─ 加载策略：优先从 localStorage（nc:{bookId}:{path}）加载，fallback 到 state
│
├─ 编辑器操作：
│   ├─ 保存：Ctrl+S / Cmd+S → 写入文件系统 + localStorage
│   ├─ 自动保存：内容变更后 30s 无操作 → 自动写入
│   └─ 预览/编辑切换：Toggle 按钮
│
├─ AI 聊天面板：见功能 5
│
└─ 动作台：见功能 6
```

---

### 功能 5：创作台——AI 聊天面板及 Agent 认知架构

（V2.1.0 重大更新：新增 `<Main text>` 标签协议、标签状态机、工具循环下沉等架构变更）

**功能描述**

AI 聊天面板是用户与 AI 协作的核心界面。四个 Agent Profile（续写/世界观/审核/文风）通过 Tab 切换，每个 Agent 的生成行为由三层认知架构驱动。

#### 5.1 三层 Agent 认知架构

Agent 的生成行为由三层约束组合驱动：

```
[ 作者身份 ]            ← 可选，由四维文风分析获得，替换基础身份
    ↓ 激活时替换
[ 基础身份 ]            ← 出厂默认，始终存在，无作者身份时的兜底风格
        +
[ 作品特色 ]            ← 当前书的语境约束（类型/视角/基调/特殊规则）
        ↓
    Agent 生成
```

- **基础身份**：Agent 出厂自带的通用写作风格底座。什么作者身份都没有导入时，Agent 使用基础身份写作。基础身份有一套完整但通用的作者特征描述（现代白话文、中等节奏、通用叙事）
- **作者身份**：用户通过文风分析获得的作者画像。一旦在创作台顶部栏选择激活某个作者身份，它就替换基础身份作为 Agent 的底层写作人格。四层文风画像（语言层/叙事层/结构层/风格标签）全部注入 system prompt 区块 A
- **作品特色**：当前书的语境约束——类型、视角、基调、叙事距离、特殊规则等。独立于作者身份存在。同一套作者身份切换到不同书，作品特色跟着变
- **作者身份与作品特色是正交关系**，同时生效

**System Prompt 组装（运行时时动态拼接）**（V2.1.0 更新：`buildSystemPrompt` 改为从 `agents.ts` 服务层导入，含 ~100 行完整指令）：

```
=== 区块 A：作者身份或基础身份 ===
[当激活作者身份时：注入四层文风画像的完整描述]
[当未激活时：注入基础身份的默认写作风格描述]

=== 区块 B：作品特色 ===
本书信息：
- 类型：[玄幻/都市/科幻/仙侠/...]
- 主线视角：[第一人称/第三人称有限/...]
- 基调：[紧张/抒情/幽默/...]
- 特殊约束：[本作特有的写作注意事项]

=== 区块 C：角色职责 ===
[每个 Agent 不同的职责描述，见下文各 Agent Profile]

=== 区块 D：记忆与上下文策略 ===
[教导 AI 何时使用什么工具获取什么信息的规则]
[知识文件查阅规则：哪些文件需要主动调用 read_file 读取]
[压缩系统说明：当前可用上下文使用率、各水位线行为]

=== 区块 E：可用工具 JSON Schema ===
[当前 Agent 可调用的工具列表]
```

`buildSystemPrompt` 函数签名（V2.1.0 更新）：
```typescript
export function buildSystemPrompt(args: {
  agentType: string
  persona: Persona | null
  bookTitle?: string
  bookType?: string
  mainCharacter?: string
}): string
```

#### 5.2 Agent Profiles

**续写 Agent**

| 项目 | 内容 |
|------|------|
| 职责 | 写下一章 / 续写本章 / 修改草稿 |
| 核心工具 | read_knowledge_file / read_current_draft / write_current_draft / append_to_draft / list_chapters / read_chapter / write_knowledge_file（共 7 个） |
| 区块 C 关键指令 | 写下一章前必须按顺序执行：read status_card → read master_outline → list_chapters → 更新 chapter_outline → 读取最近一章 → write_current_draft。严格遵循作者身份和作品特色的写作约束 |
| `<Main text>` 协议 | 正文必须包裹在 `<Main text>` 和 `</Main text>` 标签内。生成新草稿或修改草稿后必须调用 `write_current_draft` 传入带标签的完整正文。标签外的文字（如分析、说明）不会被写入文件 |
| 区块 D 知识文件规则 | 写下一章前必须调用 read_file("master_outline.md") 和 read_file("arc_outline.md")；涉及世界观设定时调用 read_file("world_model.md") |

**世界观 Agent**

| 项目 | 内容 |
|------|------|
| 职责 | 构建和维护世界观设定，写入 world_model.md |
| 核心工具 | read_knowledge_file / read_current_draft、list_chapters / read_chapter / write_knowledge_file（4 读 + 1 写） |
| 区块 C 关键指令 | 从已归档章节提取地理/势力/规则/历史等设定，确保与已有设定不冲突。世界观需结构化：地理 / 势力 / 规则体系 / 关键历史 / 特殊概念 |
| 区块 D 知识文件规则 | 修改前必须先读 world_model.md 现有内容；跨章检索确认一致性 |

**审核 Agent**

| 项目 | 内容 |
|------|------|
| 职责 | 审查草稿是否违反规范性文件，输出结构化审核报告 |
| 核心工具 | read_knowledge_file / read_current_draft / list_chapters / read_chapter（4 个只读工具） |
| 区块 C 关键指令 | **五级审核优先级**① 世界观一致性 ② 大纲一致性 ③ 前文连续性 ④ 文风一致性 ⑤ 文本质量。每个违规必须引用原文证据和规范依据。不改写草稿 |
| 区块 D 知识文件规则 | 审查前必须按顺序执行：read_file(chapter_draft) → batch_read(规范性文件) → 必要时 read_chapter / search_chapters → read_file(status_card) |
| 输出格式 | 结构化报告：致命违规 / 重要违规 / 建议，三个审核结论（✅ 通过 / ⚠️ 建议修改 / ❌ 未通过）。违规写入 error_archive.md |

审核结论的后续联动：
- ✅ 通过 → 无操作
- ⚠️ 建议修改 → 用户自行决定是否修改
- ❌ 未通过 → 用户可手动编辑 / 在聊天中要求续写 Agent 修改 / 忽略（标记"已驳回"）

错误归档 `error_archive.md` 的追加格式：

```
# 错误归档

## 审核 2026-06-15 — 第 8 章草稿
- 状态：❌ 未修复 / ✅ 已修复 / 已驳回
- 致命违规：0
- 重要违规：1（世界观冲突·北境地貌）
- 建议：2
- 审核 Agent：{model}
---
```

**文风 Agent**

| 项目 | 内容 |
|------|------|
| 职责 | 维护文风一致性，分析文本是否符合作者身份的文风画像特征 |
| 核心工具 | read_knowledge_file / read_current_draft / list_chapters / read_chapter（4 个只读工具） |
| 区块 C 关键指令 | 当用户写作偏离文风画像时，给出精确到句子的修改建议。可分析多章间文风变化趋势 |

#### 5.3 架构变更：工具循环下沉与 `<Main text>` 标签协议

V2.1.0 对 AI 通信架构进行了两项核心变更，解决了若干关键 bug：

##### 5.3.1 工具循环下沉（`streamChatWithTools`）

**问题**：旧架构的工具调用循环在 React 组件的 `useCallback` 中实现。AI 第一次请求返回 tool_calls → 组件执行工具 → 发起第二次请求。这期间组件因 `updateMessageContent` 多次重渲染，导致 `useCallback` 闭包失效，第二次 `fetch` 被浏览器取消（`ERR_ABORTED`）。

**方案**：工具循环逻辑从 React 组件下沉到 `src/services/llm.ts` 的 `streamChatWithTools` 函数中。

```
新架构：
  ChatPanel.sendToAI()
    → streamChatWithTools() ★ 只调用一次，返回 AsyncGenerator
         ├─ 第 1 轮：发送消息 → AI 返回 tool_calls
         ├─ 执行工具（回调 executeToolCall）
         ├─ 将 assistant + tool 消息追加到内部 messages
         ├─ 第 2 轮：发送完整消息列表 → AI 返回内容
         ├─ ...（最多 5 轮）
         └─ AI 无 tool_calls → yield { type: 'done' }
    → ChatPanel 单个 for await 循环处理所有 delta 事件
```

```typescript
async function* streamChatWithTools(
  request: LLMRequest,
  toolExecutor: (name: string, args: Record<string, unknown>) => Promise<string>,
  options?: { provider?, apiKey?, baseUrl?, maxRounds = 5 }
): AsyncGenerator<LLMDelta & { toolName?, toolResult? }>
```

**delta 事件类型**：

| 类型 | 触发时机 | ChatPanel 处理 |
|------|----------|----------------|
| `delta` / `content` | AI 生成流式文本 | 标签状态机处理 |
| `tool_call` | AI 返回 tool_calls | streamChatWithTools 内部处理 |
| `tool_result` | 工具执行完毕 | 追加到 chatContent（聊天显示） |
| `tool_loop_continue` | 一轮工具执行完毕 | 追加分割线 |
| `done` | 无更多工具调用 | 结束循环 |
| `error` | 出错或超 maxRounds | 显示错误 |

##### 5.3.2 `<Main text>` 标签协议

**问题**：AI 的回复内容同时包含正文和聊天分析文字，两者混在一起写入文件。

**方案**：AI 正文必须包裹在 `<Main text>` 和 `</Main text>` 标签中。`extractMainText()` 工具函数在写入时强制提取标签内内容。

```typescript
function extractMainText(raw: string, strict = false): string | null {
  const tagRegex = /<Main text>\s*([\s\S]*?)\s*<\/Main text>/i
  const match = raw.match(tagRegex)
  if (!match) {
    if (strict) return null  // 严格模式：拒绝写入
    return raw.trim()         // 宽松模式：兼容知识文件写入
  }
  // 提取标签内内容，去掉代码块包裹
  return extracted
}
```

使用规则：
- `write_current_draft` 和 `append_to_draft`：`strict=true`——无标签时拒绝写入并返回错误提示
- `write_knowledge_file`：`strict=false`——无标签时兼容返回原始内容

##### 5.3.3 ChatPanel 标签状态机

`ChatPanel.sendToAI()` 内部维护一个流式标签状态机，在工具调用前实时分离聊天显示内容和编辑器内容：

```
状态变量: inTag, tagClosed, toolExecuted
cleanContent = ""   → 保存到编辑器的纯正文
chatContent = ""    → 显示在聊天窗口的内容

遇到 "<Main text>" 开标签:
  → 开标签前的内容 → chatContent（聊天显示）
  → inTag = true
标签内 (inTag === true):
  → 正文追加到 cleanContent
  → chatContent 不更新（正文不在聊天窗口显示）
遇到 "</Main text>" 闭标签:
  → 标签内正文追加到 cleanContent
  → inTag = false
  → chatContent += "[正文已写入 chapter_draft.md]"
  → 闭标签后内容 → chatContent（聊天显示）
标签外:
  → 内容追加到 chatContent，实时更新聊天窗口
```

**`toolExecuted` 标志**：

```
初始: toolExecuted = false

收到第一个 type='tool_result':
  → toolExecuted = true

流式更新阶段:
  !toolExecuted + outline 阶段 + outline 文件 → updateContent(cleanContent) 实时同步
  !toolExecuted + draft 阶段 → 跳过 updateContent（文件由工具写入）
  toolExecuted → 完全跳过 updateContent（文件已在工具中写入）

流结束后:
  !toolExecuted → updateContent + saveContent 持久化到 localStorage
  toolExecuted → 不执行 saveContent（工具已写入文件）
```

#### 5.4 知识文件查阅合规机制

**核心原则**：规范性知识文件不预注入上下文，AI 通过系统提示中的查阅规则主动调用工具读取。

**区块 D 中的规则模板（所有 Agent 共享）**（V2.1.0 新增文件清单提示函数 `buildFileListHint`）：

```
=== 区块 D：本书知识文件与查阅规则 ===

以下文件是你写作时必须遵守的规范。它们不在你的上下文中自动加载，
你需要主动调用工具查阅。每个文件的查阅条件如下：

【world_model.md — 世界观规范】
查阅条件（满足任意一条即必须调用）：
- 即将写到的场景涉及某个地理区域、势力、规则体系或特殊概念
- 正文中需要引用某个世界设定
- 用户提到"按世界观来说……"或"这个设定在世界上是不是……"

【master_outline.md — 全书总纲】
查阅条件：
- 用户要求「写下一章」时必须查阅以确认章节位置
- 用户询问后续剧情走向
- 写作内容偏离了总纲方向

【arc_outline.md — 篇章大纲】
查阅条件：
- 进入新篇章弧时
- 当前章节的故事弧走向不明确时

【chapter_outline.md — 当前章节大纲】
查阅条件：
- 此文件存在时，写本章前必须先读
- 用户对本章方向有新的讨论和调整后，重新读取

【status_card.md — 当前状态卡】
访问策略：
- 每个写作会话开始时系统自动注入第一级上下文（始终可及）
- 不需要工具调用

【chapters/ — 历史章节】
查阅条件：
- 需要回顾前文情节时
- 需要确保人物/事件的一致性时
- 用户问"之前是不是写过……"时
```

**用户修改知识文件后的通知机制**（V2.1.0 无变化）：

```
用户在编辑器中保存了 world_model.md 或 master_outline.md 等知识文件
  ↓
系统检测到文件变更
  ↓
向当前 AI 聊天会话注入一条系统消息：
  "📌 {文件名} 已被用户手动更新，下次写作/审核时请重新读取。"
  ↓
Agent 在后续需要时重新调用 read_file("{文件名}")
```

#### 5.5 扮演模式预留

当前版本不实现扮演模式功能。预留以下拓展点：

| 预留项 | 位置 | 状态 | 说明 |
|--------|------|------|------|
| 动作台按钮 | 动作台底部，排在"确认归档"之后 | 禁用态，tooltip "即将推出" | 预留 UI 位置，点击无反应 |
| Agent Profile 字段 | 各 Agent 的配置文件 | `capabilities: { roleplay: boolean }` | 预留角色扮演能力开关 |
| prompt 预设插槽 | 聊天面板底部预设列表 | 预留两条："进入扮演模式"和"退出扮演模式" | 预留 prompt 文案位置 |
| system prompt 插槽 | 区块 C 末尾 | 预留角色设定上下文插槽 | 未来可注入角色背景描述 |

所有预留确保：未来增加扮演模式时不需要改动已有数据结构和页面布局。

#### 5.6 用户流程

（V2.1.0 更新：流程中增加了 `<Main text>` 标签协议和工具循环的说明。）

```text
[创作台 → 右侧 AI 聊天面板]
  ↓
顶部 Agent 切换 Tab：续写 | 世界观 | 审核 | 文风
  ↓
[聊天对话区域]
  ├─ 用户输入 → 点击发送 / Enter
  │   ↓
  ├─ 系统调用相应 Agent 的动态组装 prompt
  │   ├─ 区块 A：（基础身份 / 已激活的作者身份）
  │   ├─ 区块 B：（当前书的作品特色）
  │   ├─ 区块 C：（Agent 专属职责）
  │   ├─ 区块 D：（记忆策略 + 知识文件查阅规则）
  │   └─ 区块 E：（工具定义）
  │   ↓
  ├─ streamChatWithTools 处理整个工具调用周期
  │   ├─ 第 1 轮：流式输出（含 <Main text> 标签内正文）
  │   ├─ AI 返回 tool_calls → 执行工具 → 追加结果
  │   ├─ 第 2~N 轮：继续流式输出（最多 5 轮）
  │   └─ 最终 yield done
  │   ↓
  ├─ ChatPanel 标签状态机实时处理：
  │   ├─ 标签内正文 → cleanContent（编辑器）
  │   ├─ 标签外文字 → chatContent（聊天窗口）
  │   ├─ 工具日志 → chatContent（聊天窗口）
  │   └─ 标签关闭后 → 聊天显示"[正文已写入 chapter_draft.md]"
  │
  └─ 用户可继续对话或查看文件树中的变化

[context management]
  ├─ 每个 Agent 维护独立的对话历史
  ├─ 对话历史持久化到本地文件（.agent-conversations/{agent-name}.jsonl）
  ├─ 每次请求自动携带该 Agent 的完整历史
  └─ 超长时自动裁剪（最早的消息 → 摘要压缩 → 保留最近 N 轮完整对话）

[底部操作栏 - 快捷文本预设]
  ├─ 「写下一章」
  ├─ 「续写本章」
  ├─ 「审核当前草稿」
  ├─ 「生成世界观草稿」
  ├─ 「分析文风特征」
  └─ 「（预留）进入扮演模式」→ 禁用态
```

**异常路径**（V2.1.0 新增代理超时异常处理）：

| 异常场景 | 触发条件 | 处理方式 | 用户反馈 |
|----------|----------|----------|----------|
| API Key 未配置 | 用户发送消息时无有效 Key | 弹出引导提示 | "请先在设置中配置 API Key" + 跳转按钮 |
| API 调用超时 | LLM 无响应超过 300s（代理 300s） | 终止请求，提示重试 | "请求超时，请检查网络后重试" + 重试 |
| Tool 调用失败 | 文件写入失败 / Git 操作失败 | 告知用户具体错误 | 气泡显示「⚠️ 写入失败：原因」 |
| Token 超限 | 对话历史超过上下文窗口 + 压缩至极限 | 自动裁剪后重试，告知用户 | 「对话历史较长，已自动压缩早期内容」 |
| 连续 3 次 API 失败 | 三次请求均失败 | 停止自动重试，提示降级 | "AI 服务暂时不可用，请过段时间再试" |
| 代理 401 | API Key 无效或代理认证失败 | 提示检查配置 | "API 认证失败，请检查 API Key 和 Base URL" |
| 标签提取失败 | AI 未使用 `<Main text>` 标签 | 工具执行器返回错误提示 | AI 收到错误提示后重新构建带标签的内容 |

---

### 功能 6：创作台——动作台与正文交付

（V2.1.0 更新：归档流程修正了章节编号逻辑和内容源优先级）

**功能描述**

动作台位于创作台底部，提供一站式快捷操作按钮。正文交付是核心工作流：AI 书写的草稿（chapter_draft.md）需要经过用户审校和确认后，才归档为正式章节。

**用户流程——正文交付**（V2.1.0 更新归档流程细节）：

```text
[写作会话开始]
  ↓
┌─ 用户点击「写下一章」（条件：无未归档草稿）
│   续写 Agent 自主查阅 master_outline / arc_outline 等 → 生成新章节
│   写入 chapter_draft.md（通过 write_current_draft 工具，含 <Main text> 标签）
│   文件树标记「📝 草稿就绪」
│
├─ 用户点击「续写本章」（条件：chapter_draft.md 不为空）
│   续写 Agent 从 draft 末尾继续追加内容
│
├─ 用户阅读草稿，手动编辑修改（Ctrl+S 保存）
│
├─ (可选) 用户点击「审核草稿」
│   审核 Agent batch_read 规范性文件 + 草稿 → 输出结构化报告
│
├─ 用户点击「确认归档」
│   ├─ 弹窗确认：「将当前草稿归档为正式章节？」
│   ├─ 确认 → 系统行为（ArchiveModal，9 阶段流水线）：
│   │   1. 读取草稿：从 localStorage（nc:{bookId}:drafts/chapter_draft.md）读取，fallback 到 store
│   │   2. 计算章节编号：currentChapterNum（workflowStore）优先，fallback 到 book.chapterCount + 1
│   │   3. 写入 chapters/：创建 KnowledgeFile({path: chapters/XXX.md, type: 'chapter'})
│   │   4. 清空草稿：清空 chapter_draft.md content + 删除 localStorage draft 条目
│   │   5. LLM 分析新章节 → 产出 events.json
│   │   6. 更新 status_card.md + active_elements.md + memoryStore.threads
│   │   7. 检查是否到达章节里程碑 → 触发动态压缩（并发限制 3，批量生成 T1 摘要）
│   │   8. 模拟 git add + git commit
│   │   9. 递增 book.chapterCount = nextChapterIndex（通过 setState 函数式更新）
│   │   → Toast「归档成功」
│   └─ 取消 → 留在编辑状态
│
└─ 用户不满意 → 在聊天面板中要求续写 Agent 重写或手动修改
```

**动作台按钮列表**（V2.1.0 无变化）

| 按钮 | 触发行为 | 前置条件 | 状态 |
|------|----------|----------|------|
| ➕ 写下一章 | 调用续写 Agent 按大纲生成下一章全篇草稿 | 无未归档草稿（draft 为空或刚归档） | 始终可见 |
| ✏️ 续写本章 | 调用续写 Agent 从当前 draft 末尾追加 | chapter_draft.md 不为空 | 始终可见 |
| 📋 审核草稿 | 调用审核 Agent 审查当前 draft | chapter_draft.md 有内容 | 始终可见 |
| 🌍 生成世界观 | 调用世界观 Agent 生成/重建 world_model.md | 有已归档章节 | 始终可见 |
| 🎨 分析文风 | 调用文风 Agent 分析文风并更新 style_fingerprint | 有已归档章节 | 始终可见 |
| ✅ 确认归档 | 将 draft 归档为正式章节 | chapter_draft.md 有内容 | 仅在有新草稿时激活 |
| 🔄 重新生成摘要 | 重建 summary.md | 有已归档章节 | 始终可见 |
| 🎭 扮演模式 | （预留）未来版本功能 | — | 禁用态，tooltip "即将推出" |

**状态机——正文交付**（V2.1.0 无变化）

| 状态名称 | 进入条件 | 退出条件 | 用户可见表现 |
|----------|----------|----------|--------------|
| 空闲 | 无草稿 | 触发写下一章/续写本章 | 动作台无特殊标记 |
| 草稿就绪 | AI 新写入 chapter_draft.md / 用户写了部分 | 开始编辑/确认归档 | 文件树标记「📝」+ 动作台提示 |
| 用户编辑中 | 用户打开草稿编辑 | 保存/取消 | 编辑器正常编辑 |
| 审核中 | 点击审核草稿 | 审核完成 | 聊天面板显示审核过程 |
| 确认归档中 | 点击确认归档 | 归档成功/失败 | 确认弹窗 → 进度 |
| 已归档 | 归档成功完成 | 无（进入空闲） | Toast「归档成功」+ Git 提交 |

#### ArchiveModal 修正（V2.1.0）

V2.1.0 修正了归档流程中的两个核心 bug：

**Bug 1：章节编号错误**。旧代码为 `(book?.chapterCount || 0) + 1`，当 `chapterCount = 0`（从未归档过）时始终生成"第1章"。

```typescript
// ❌ 旧
const nextChapterIndex = (book?.chapterCount || 0) + 1

// ✅ 新
const nextChapterIndex = currentChapterNum || (book?.chapterCount || 0) + 1
```

**Bug 2：内容源不一致**。Zustand store 的 `draftFile.content` 在 HMR/刷新后可能丢失，导致取到过期内容。

```typescript
// ❌ 旧
const content = draftFile.content

// ✅ 新
const draftContent = localStorage.getItem(`nc:${currentBookId}:drafts/chapter_draft.md`)
  || draftFile?.content || ''
```

**Bug 3：chapterCount 不递增**。归档完成后 `book.chapterCount` 不变，下次归档仍是同一编号。

```typescript
// ✅ 新增
if (currentBookId) {
  useBookStore.setState((s) => ({
    books: s.books.map((b) =>
      b.id === currentBookId ? { ...b, chapterCount: nextChapterIndex } : b
    ),
  }))
}
```

**Bug 4：localStorage 草稿残留**。归档后 localStorage 中的草稿不会自动清除。

```typescript
// ✅ 新增
if (currentBookId) {
  localStorage.removeItem(`nc:${currentBookId}:drafts/chapter_draft.md`)
}
```

---

### 功能 7：动态记忆压缩系统

（V2.1.0 未变更）

**功能描述**

系统为每本书自动维护一套动态记忆压缩系统。以模型的原生上下文窗口为第一优先级的记忆空间，不设固定压缩上限。按模型能力设定水位线，基于故事线程活跃度进行渐进式压缩。

#### 7.1 四层压缩层级

| 层级 | 名称 | 粒度 | 说明 |
|------|------|------|------|
| T0 | 原文 | 1 : 1 | 原始章节，完整保留在 `chapters/`，永不删除 |
| T1 | 章摘要 | 1 章 → ~150 字 | 单章核心事件 + 关键引文 |
| T2 | 块摘要 | 5 章 → ~400 字 | 五章内的情节推进线 + 转折点 |
| T3 | 弧摘要 | 1 弧 → ~800 字 | 完整故事弧的起承转合 |

#### 7.2 三级水位线

压缩触发由模型上下文窗口决定，不是固定字数：

```
可用上下文 = 模型最大上下文 - 保留空间

保留空间包含：system prompt + 对话历史 + 当前用户输入 + 安全余量(10%)

水位线1（轻度压缩）：可用上下文已占用 ≥40%
  → 对完全不关联任何活跃线程的最旧章节做 T3 压缩

水位线2（中度压缩）：可用上下文已占用 ≥70%
  → 对不活跃线程的旧章节做 T2 压缩

水位线3（深度压缩）：可用上下文已占用 ≥85%
  → 对最旧且不关联活跃线程的章节做 T3，仅保留故事框架 + 活跃线程原文
```

#### 7.3 故事线程与事件图谱

**核心思想**：压缩优先级由故事线程活跃度决定，而非纯距离。

**归档时自动处理**（V2.1.0 无变更）：

```
用户确认归档新章节
  ↓
LLM 分析新章节 → 产出结构化的 events.json：
{
  "chapter": 8,
  "new_events": [
    { "id": "evt-008-01", "type": "conflict", "description": "主角与宗门长老正面冲突",
      "participants": ["主角", "大长老"], "threads": ["宗门内斗"], "status": "advancing" }
  ],
  "new_characters": [],
  "resolved_events": ["evt-003-01"],
  "referenced_threads": ["宗门内斗", "身世之谜"],
  "key_locations": ["议事堂"]
}
  ↓
更新 threads.json（累计线程索引）
  ↓
更新 active_elements.md（当前活跃线程列表）
```

**active_elements.md 内容（示例）**：

```
# 当前活跃线程（第 47 章）

| 线程 | 状态 | 距上次提及 | 关联章节 |
|------|------|----------|----------|
| 身世之谜 | 推进中 | ch-45 | 3, 12, 27 |
| 宗门内斗 | 推进中 | ch-47 | 23, 31, 44 |
| 秘境钥匙 | 休眠中 | ch-30 | 5, 15 |
| 主角与师妹的感情线 | 新开启 | ch-47 | 47 |
| 边疆战事 | 已回收 | — | 6, 16, 38 |
```

#### 7.4 上下文装配优先级

（V2.1.0 更新：确认 `assembleContext` 实现遵循此规范。）

```
[第一级：始终不可压缩]          ← 每个写作会话全量注入
  ├─ status_card.md（当前状态卡，~300字）
  ├─ active_elements.md（活跃线程列表，~200字）
  └─ chapter_draft.md（当前草稿，变量）

[第二级：最近章节原文 T0]       ← 按距离降序注入
  ├─ 上一章全量
  ├─ 上两章全量
  └─ ……直到水位线

[第三级：关联活跃线程的章节 T0]  ← 跨距离按线程优先级注入
  优先级：推进中 > 新开启 > 休眠中 > 已回收
  上限：最多保留 20 章的 T0

[第四级：其余章节]               ← 按水位线逐级降级
  排序依据：线程活跃度 + 距离 + 重要性因子
  用户手动标记「重要」的章节获得永久 +1 优先级权重
```

**Token 估算**：`Math.ceil(text.length * 1.2)`（中文为主小说文本的保守估算）

**预算计算**（V2.1.0 确认当前实现）：
- `reservedTokens` = systemPrompt长度 + 4000(工具预留) + 10% safetyMargin
- `availableTokens` = modelContextWindow - reservedTokens
- `contextTokens` = (availableTokens - userInputTokens - historyTokens) * sensitivityFactor
- sensitivityFactor = compressionSensitivity / 50（范围 0.4 ~ 1.6）

#### 7.5 不同模型的实际效果

| 模型 | 上下文 | 压缩启动线（40%） | 预计前多少章全 T0 |
|------|--------|------------------|-------------------|
| DeepSeek V4 | 1M tokens | ~400K tokens | ~80-100 章 |
| Claude Sonnet 4 | 200K tokens | ~80K tokens | ~15-20 章 |
| GPT-4o | 128K tokens | ~51K tokens | ~10-12 章 |

#### 7.6 用户设置项

在设置页中，Model 配置区增加**压缩敏感度滑条**：

| 设置项 | 默认值 | 范围 | 说明 |
|--------|--------|------|------|
| 压缩敏感度 | 40% | 20%–80% | 调高→延后压缩（保留更多原文）；调低→提前压缩（释放空间给对话历史） |

**状态栏显示**（创作台顶部栏右侧）：

```
📖 记忆使用: 32% · 距轻度压缩还有 ≈12 章
```

当水位线触发时，AI 回复末尾自动出现提示：

```
📌 注：当前上下文使用率达 45%，后续章节将开始选择性压缩以保持记忆质量
```

#### 7.7 里程碑自动压缩

```
章节数达到 10 章 → ch1-10 做 T1
章节数达到 20 章 → ch1-10 降级 T2，ch11-20 做 T1
章节数达到 30 章 → ch1-10 降级 T3（入弧），ch11-20 降级 T2，ch21-30 做 T1
章节数达到 50 章 → 首次生成 book_snapshot.md（T4）
章节数达到 100 章 → 全书快照刷新
```

#### 7.8 事件图谱文件结构

```
{book_id}/
├── summary/
│   ├── book_snapshot.md           # T4：全书快照（≥50章生成）
│   ├── arc_summary.md             # T3：按故事弧组织的深层摘要
│   ├── chapter_timeline.md        # T1→T2：逐章/逐块时间线摘要
│   └── active_elements.md         # 当前活跃线程 + 关联章节
├── status_card.md                 # 始终在上下文的当前状态卡
├── chapters/
│   └── ch-NNN-events.json         # 每章事件/线程标注（用户不可见，系统维护）
├── .events/
│   ├── threads.json               # 累计线程索引
│   └── event_registry.json        # 全量事件注册表
└── chapters/                      # 原文永久保留
```

---

### 功能 8：创作知识文件系统

（V2.1.0 未变更）

**功能描述**

系统为每本书自动维护一套知识文件。用户可通过文件树查看和编辑这些文件，也可通过动作台触发自动生成/重建。

**文件说明**

| 文件名 | 内容 | 生成方式 | 编辑权限 |
|--------|------|----------|----------|
| world_model.md | 世界观设定（势力、地理、规则等） | AI 从章节中提取 / 重建管线 | 手动 + 自动 |
| style_fingerprint.md | 文风特征（从作者身份文风画像注入） | 选择作者身份时自动写入 | 手动（覆盖） |
| master_outline.md | 全书总纲（章节级路线图） | AI 生成 / 用户讨论 | 手动 |
| arc_outline.md | 篇章大纲（故事弧线） | AI 生成 / 用户讨论 | 手动 |
| chapter_outline.md | 当前章节大纲 | AI 生成 / 用户讨论 | 手动 |
| status_card.md | 当前状态卡（已写章节、活跃角色、待回收伏笔等） | 归档时自动更新 | 自动 + 手动 |
| brainstorm.md | 灵感池（零散想法、待探索方向） | 用户与 AI 讨论时沉淀 | 手动 |
| error_archive.md | 错误归档（审核发现的问题记录） | 审核 Agent 写入 | 自动 + 手动 |
| summary.md | 已归档章节的摘要 | 摘要管线自动生成 | 自动 |

---

### 功能 9：设置与 API Key 配置

（V2.1.0 更新了代理超时说明）

**用户流程**

```text
[侧边栏底部 → 齿轮图标 → 设置弹窗]
  ↓
├─ LLM 配置区：
│   ├─ Provider 下拉：Claude / OpenAI 兼容 / DeepSeek / 自定义
│   ├─ API Key 输入（密码模式）
│   ├─ Base URL 输入（OpenAI 兼容时可用，默认自动填充）
│   ├─ 模型上下文窗口识别：自动显示该模型的可用上下文（如 "1,000,000 tokens"）
│   ├─ 压缩敏感度滑条：20% ←──●──→ 80% · 当前 40% —— 调高延后压缩，调低提前压缩
│   └─ 「测试连接」按钮 → 调用简单接口验证 Key 有效性
│       ├─ 成功：「✅ 连接成功 · 可用上下文：1,000,000 tokens」
│       └─ 失败：「❌ 连接失败：{原因}」
│
├─ 主题切换：
│   └─ 亮色 / 暗色 / 跟随系统
│
└─ 关于：
    ├─ 版本号
    ├─ 项目地址（GitHub 链接）
    ├─ 数据存储位置（显示路径 + 打开文件夹按钮）
    └─ 技术栈信息
```

**代理超时说明**：开发模式通过 Vite /api/proxy 代理转发 LLM 请求以规避 CORS。代理超时和前端请求超时均为 **300 秒（5 分钟）**，确保工具调用多轮循环有充足时间完成。

**异常路径**：

| 异常场景 | 触发条件 | 处理方式 | 用户反馈 |
|----------|----------|----------|----------|
| API Key 无效 | 连接测试或发送消息时 | 提示重新配置 | "API Key 无效，请在设置中重新配置" |
| 网络断开 | 请求失败 | 所有 AI 按钮置灰，自动检测恢复 | Toast「网络连接已断开」 |

---

### 功能 10：首次启动引导

（V2.1.0 未变更）

**首次启动判断**：

应用启动时检测 config.json 是否存在且包含有效 API Key：

```
[启动]
  ├─ config.json 不存在 → 弹出设置弹窗强制引导
  ├─ API Key 为空 → 弹出设置弹窗引导
  └─ API Key 有效 → 进入作品库（默认页）
```

**引导流程**：

```text
首次启动 → 设置弹窗（背景半透明遮罩）
  ├─ 用户填写 Provider + API Key
  ├─ 点击「测试连接」→ 显示结果
  ├─ 点击「保存并开始」→ 关闭弹窗 → 进入作品库
  └─ 点击「取消」→ 弹窗关闭，页面上方显示黄色横幅
       "⚠️ 请配置 API Key 以使用 AI 功能" + [去设置] 按钮
```

**未配置 Key 时的行为**：

用户未配置 API Key 时使用任何 AI 功能，弹出 Toast "请先配置 API Key" → 2 秒后自动跳转设置弹窗。

## 五、文件与数据架构

### 5.1 存储目录结构

```
{user-data-dir}/
├── books/
│   ├── {book-id}/
│   │   ├── .git/                    # 独立 Git 仓库
│   │   ├── .gitignore               # 忽略 .agent-conversations/、.events/、import_report.json
│   │   ├── metadata.json            # 书名、类型、创建时间等
│   │   ├── chapters/                # 正式章节
│   │   │   ├── 001-第一章.md
│   │   │   └── ch-NNN-events.json   # 逐章事件标注
│   │   ├── chapter_draft.md         # 当前续写草稿
│   │   ├── master_outline.md
│   │   ├── arc_outline.md
│   │   ├── chapter_outline.md
│   │   ├── world_model.md
│   │   ├── status_card.md
│   │   ├── style_fingerprint.md
│   │   ├── brainstorm.md
│   │   ├── error_archive.md
│   │   ├── summary.md
│   │   ├── summary/                 # 压缩记忆文件
│   │   │   ├── book_snapshot.md
│   │   │   ├── arc_summary.md
│   │   │   ├── chapter_timeline.md
│   │   │   └── active_elements.md
│   │   ├── .events/                 # 事件图谱数据
│   │   │   ├── threads.json
│   │   │   └── event_registry.json
│   │   ├── .agent-conversations/    # AI 对话历史（Git 忽略）
│   │   │   ├── continuation-agent.jsonl
│   │   │   ├── world-agent.jsonl
│   │   │   ├── review-agent.jsonl
│   │   │   └── style-agent.jsonl
│   │   └── import_report.json       # 导入报告（Git 忽略）
│   └── ...
├── personas/                        # 作者身份库
│   ├── {persona-id}/
│   │   ├── metadata.json            # 名称、创建时间、分析来源书籍列表
│   │   ├── style_profile.json       # 四层文风画像（结构化）
│   │   └── manual_overrides.json    # 用户手动覆盖记录
│   └── ...
└── config.json                      # 全局配置（API Key、主题等）
```

### 5.2 双层持久化策略（V2.1.0 新增）

系统采用双层持久化策略，localStorage 为权威数据源：

| 层 | 技术 | 作用 | 读写方 | 键格式 |
|---|------|------|--------|--------|
| 运行时 | Zustand store | 维护 UI 所需状态（`filesByBook`、`currentBookId` 等），确保 React 响应式更新 | 组件读写 | 直接 store 访问 |
| 持久化 | localStorage | 维护文件内容，是崩溃恢复/刷新后的权威数据源 | 工具执行器写入，`openFile()` 优先读取 | `nc:{bookId}:{path}` |

**写入策略**：
- 工具执行器（`toolExecutor.updateFile`）：同时更新 Zustand store + 持久化到 localStorage
- 编辑器保存（`editorStore.saveContent`）：持久化到 localStorage `nc:{currentBookId}:{currentFilePath}`
- `removeFile`：从 Zustand store 移除 + 清除对应的 localStorage 条目

**读取优先级**（所有文件读取函数）：
1. localStorage (`nc:{bookId}:{path}`) 优先
2. Zustand store (`filesByBook[bookId]`) fallback

### 5.3 作者身份数据结构

```json
{
  "id": "persona-uuid",
  "name": "金庸风骨",
  "createdAt": "2026-06-01T12:00:00Z",
  "sourceBooks": ["book-id-1", "book-id-2"],
  "analysisStatus": "completed",
  "styleProfile": {
    "lexical": { "language-layer-description": "..." },
    "narrative": { "narrative-layer-description": "..." },
    "structural": { "structural-layer-description": "..." },
    "stylistic": {
      "overallTendency": "白描",
      "rhetoricPreference": ["暗喻", "留白"],
      "descriptionFocus": ["动作", "环境"],
      "narrativeDistance": "有限叙事"
    }
  },
  "manualOverrides": {
    "lexical": false,
    "narrative": true,
    "structural": false,
    "stylistic": false
  }
}
```

### 5.4 Git 策略

| 项目 | 策略 |
|------|------|
| 频率 | 每次确认归档后自动 commit；知识文件变更后自动 commit |
| 提交信息格式 | `归档：第 X 章` / `更新：world_model.md` / `导入：初始提交` |
| 分支命名 | 用户自由命名，默认 master |
| 忽略文件 | .agent-conversations/、.events/、import_report.json |

## 六、V2.1.0 Bug Fixes 汇总

### 架构级修复

| # | 问题 | 根因 | 修复 |
|---|------|------|------|
| 1 | **工具调用后第二次请求被取消 (ERR_ABORTED)** | React 闭包失效，`sendToAI` 在第一次请求后因渲染重建 | 工具循环下沉到 `streamChatWithTools` 服务层，React 只管理单次流 |
| 2 | **AI 聊天文字覆盖工具写入的草稿** | `fullContent` 含正文+工具日志+分析文字，`updateContent` 将全部内容写入文件 | 增加 `toolExecuted` 标志，工具执行后完全跳过编辑器更新 |
| 3 | **AI 回复写入文件含分析报告而非正文** | 本地精简版 `buildSystemPrompt` 仅 3 行指令，未告知 AI 工具使用规则 | 删除本地函数，改为导入 `agents.ts` 的完整版（~100 行） |
| 4 | **生成概览而非正文** | `write_current_draft` 工具描述和续写提示词未明确禁止概览 | 强化工具描述：要求 `<Main text>` 标签 + 严禁写概览/统计/亮点总结 |
| 5 | **标签外分析文字写入文件** | `extractMainText` 无标签时兜底返回原始内容 | 增加 `strict` 参数，草稿写入强制要求标签，无标签则拒绝 |
| 6 | **正文标签内容在聊天窗口显示** | `fullContent` 单一变量同时用于聊天显示和编辑器同步 | 标签状态机：`chatContent`（聊天）与 `cleanContent`（编辑器）分离 |

### 归档修复

| # | 问题 | 根因 | 修复 |
|---|------|------|------|
| 7 | **归档生成"第1章"而非"第4章"** | `book.chapterCount` 为 0（从未归档过） | 优先 `workflowStore.currentChapterNum` |
| 8 | **归档内容与显示不一致** | Zustand store HMR 后丢失，`draftFile.content` 读过期内容 | 优先从 localStorage 读取 |
| 9 | **归档后 chapterCount 不递增** | 无递增逻辑 | 归档完成时 `setState` 更新 `chapterCount` |
| 10 | **归档后 localStorage 残留旧草稿** | 只清空 Zustand store | 归档时 `removeItem` 清除 localStorage 草稿 |

### 数据持久化修复

| # | 问题 | 根因 | 修复 |
|---|------|------|------|
| 11 | **文件内容刷新后丢失** | 只维护 Zustand runtime state | 所有 `updateFile` 调用同时写 localStorage |
| 12 | **文件操作未按书籍隔离** | 全局 files 数组无 bookId 前缀 | 重构为 `filesByBook: Record<string, KnowledgeFile[]>`，localStorage key `nc:{bookId}:{path}` |
| 13 | **删除知识文件为全局操作** | `removeFile` 无书籍过滤 | 依赖 `currentBookId` 隔离 |

### 通信与性能修复

| # | 问题 | 根因 | 修复 |
|---|------|------|------|
| 14 | **AI 请求被 CORS 拦截** | 直接调用第三方 API 域名 | 开发模式 `/api/proxy` 代理转发 |
| 15 | **代理超时不足** | 代理超时 60s，工具多轮循环不够 | 改为 300s（5 分钟） |
| 16 | **代理 body 双串化导致 401** | 前端 JSON.stringify → 代理 JSON.stringify 两次 | `fetchWithProxy` 将 body parse 回对象再传代理 |
| 17 | **LLM 请求无超时保护** | `fetch` 无超时配置 | 新增 `createTimeoutSignal()`，默认 300s 超时 |
| 18 | **ChatPanel 全量订阅导致重渲染** | `useChatStore()` 订阅整个 store | 改为 Zustand 选择器模式 |

### 编辑器与 UI 修复

| # | 问题 | 根因 | 修复 |
|---|------|------|------|
| 19 | **编辑器内容与文件显示不同步** | 修改 localStorage 后 React 未更新 | `zustand/persist` middleware，`saveContent()` 持久化 |
| 20 | **章节模块显示默认标题** | `generateDefaultFiles` 硬编码 | `extractChapterTitle()` 从内容提取 `# 第X章 XXX` |
| 21 | **版本管理显示假数据** | `generateMockData` 生成虚假分支 | 从已归档章节生成真实提交历史 |

## 七、开发环境与技术栈

（V2.1.0 更新了代理超时等配置）

| 组件 | 技术 | 版本/说明 |
|------|------|-----------|
| 前端框架 | React + Vite | Vite 开发服务器，端口 5174 |
| 状态管理 | Zustand | 8 个独立 store，部分使用 `zustand/persist` |
| 语言 | TypeScript | 严格模式 |
| AI 通信 | 原生 `fetch` + SSE | 流式解析，支持 OpenAI 兼容和 Claude |
| 代理 | Vite 中间件 | `/api/proxy` 路由，流式转发，超时 300 秒 |
| 桌面端 | Electron | 打包分发 |
| 版本管理 | simple-git（模拟） | 归档时模拟 Git 提交 |

## PRD 自检清单

- [x] **异常交互**：每个功能的用户流程包含异常路径，不限于成功路径
- [x] **状态机**：关键功能的状态完整列出，进入和退出条件明确
- [x] **字段规范**：有用户输入的字段均列出类型、必填、长度、校验、错误提示
- [x] **文案规范**：空状态、加载、成功、失败、权限、网络异常六类场景文案齐全
- [x] **流程图**：用户流程包含分支和异常分支
- [x] **页面结构**：核心页面、导航层级、页面职责、功能入口和结果页面已明确
- [x] **数据架构**：存储结构、数据结构、Git 策略已定义
- [x] **架构变更记录**：V2.1.0 的两次核心架构变更已记录（工具循环下沉 + 标签协议）
- [x] **Bug 修复归档**：V2.1.0 修复的全部 bug 已分门别类记录
