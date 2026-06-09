# Known Issues

项目已知问题与待修复 bugs 记录。按优先级排序。

---

## P0 — 阻塞（影响核心功能正常使用）

### 1. 开发模式下 AI 对话不走 API 代理

- **影响范围**：KnowledgeInitWizard（知识文件初始化）、创作台 AI 聊天
- **根因**：`src/services/llm.ts` / `src/services/knowledgeInit.ts` 中的 API 请求直接 fetch 远端地址，未经过 `dev.js` 的 `/api/proxy` 中间件。浏览器因 CORS 策略拦截跨域响应
- **状态**：✅ **已修复**（v1.3.0）
  - `dev.js`: 代理改为流式转发（64KB chunk），超时提升至 60s
  - `llm.ts`: 加入 `fetchWithProxy()` 函数，开发环境自动走代理，代理不可用时回退直连

### 2. esbuild 依赖扫描缓存报错

- **影响范围**：开发服务器启动日志
- **根因**：`ProvidersTab.tsx` 中 `tryFetchWithProxy` 函数曾临时被插入在 `CONTEXT_PRESETS` 数组内部，导致 esbuild 预扫描时语法错误。虽然代码已修复，但 esbuild 缓存可能仍报 `Expected "]" but found "{"` 警告
- **影响**：不影响运行，仅日志噪音
- **文件**：`src/components/settings/tabs/ProvidersTab.tsx:42`
- **状态**：✅ **已修复**（v1.3.0）— 清除 `node_modules/.vite` 缓存后重启

---

## P1 — 设计瑕疵（不影响运行但可能导致数据异常）

### 3. `editorStore.files` 未按书籍隔离

- **描述**：所有书籍的知识文件存储在同一个全局数组中，文件路径不含 bookId 前缀。切换不同书籍时，文件树会显示所有书的文件混在一起
- **风险**：在多书并行编辑场景下，用户可能误操作其他书籍的文件
- **文件**：`src/stores/editorStore.ts`
- **修复方案**：重构为 `filesByBook: Record<string, KnowledgeFile[]>` 结构，按 `bookId` 隔离文件存储；localStorage key 改为 `nc:{bookId}:{filePath}`
- **状态**：✅ **已修复**（v1.4.1）

### 4. `addFile` 不排重（已修复）

- **描述**：`addFile` 直接将文件 push 到 `files` 数组尾部，不检查路径是否已存在。KnowledgeInitWizard 重复运行时会导致文件重复添加
- **风险**：重复执行初始化向导后，文件树中出现同名条目
- **文件**：`src/stores/editorStore.ts`
- **状态**：✅ **已修复**（v1.3.0）— `addFile` 改为按 `path` 匹配，已有则替换、无则追加

### 5. 初始化时删除知识文件是全局操作

- **描述**：右键「初始化知识文件」调用 `removeFile('knowledge/world_model.md')` 删除该路径的文件。如果多本书共用同一文件路径（目前就是），会意外删除其他书籍的文件
- **根因**：与 #3 同源——文件未按书隔离
- **修复方案**：依赖 P1-3 的隔离机制，`removeFile` 现在只删除当前书籍的文件；`LibraryPage.tsx` 先 `setCurrentBook(book.id)` 再执行删除
- **状态**：✅ **已修复**（v1.4.1）

---

## P2 — 增强建议（非 bug，可优化）

（暂无）
