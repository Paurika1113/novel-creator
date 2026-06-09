# Novel Creator — Design Tokens

> 统一设计 Token 体系。所有颜色、间距、圆角、阴影、字体、动画时长都在此定义。
> 与 `src/index.css` 中的 CSS 变量保持同步。

---

## 1. 色板 (Palette)

### 1.1 Light Theme (默认)

| Token | HEX | 用途 |
|-------|-----|------|
| `--primary` | `#7c5cfc` | 主色/强调色 |
| `--primary-hover` | `#6a48e8` | 主色悬停 |
| `--primary-active` | `#5a3cd4` | 主色点击 |
| `--primary-bg` | `rgba(124, 92, 252, 0.10)` | 主色背景/浅色态 |
| `--success` | `#28a745` | 成功态 |
| `--warning` | `#f0ad4e` | 警告态 |
| `--danger` | `#dc3545` | 危险/错误态 |
| `--danger-hover` | `#c82333` | 危险悬停 |
| `--text-primary` | `#1a1a2e` | 主要文字 |
| `--text-secondary` | `#6b6b80` | 次要文字 |
| `--text-muted` | `#999aaa` | 弱化文字/占位符 |
| `--bg-page` | `#f5f5f8` | 页面背景 |
| `--bg-card` | `#ffffff` | 卡片/面板背景 |
| `--bg-sidebar` | `#16162a` | 侧边栏背景（深色） |
| `--bg-input` | `#f8f8fb` | 输入框背景 |
| `--border` | `#e8e8ee` | 边框线 |
| `--border-focus` | `#7c5cfc` | 聚焦边框 |
| `--surface-hover` | `rgba(0,0,0,0.04)` | 悬停浅色覆盖 |
| `--selection` | `rgba(124,92,252,0.20)` | 文本选中背景 |

### 1.2 Agent 色

| Token | HEX | Agent |
|-------|-----|-------|
| `--agent-continuation` | `#7c5cfc` | 续写 Agent |
| `--agent-world` | `#2196F3` | 世界观 Agent |
| `--agent-review` | `#f44336` | 审核 Agent |
| `--agent-style` | `#4CAF50` | 文风 Agent |

---

## 2. 阴影 (Elevation)

| Token | 值 | 用途 |
|-------|-----|------|
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.06)` | 卡片/组件默认 |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.08)` | 下拉菜单/弹窗 |
| `--shadow-lg` | `0 12px 40px rgba(0,0,0,0.15)` | 模态框 |

---

## 3. 圆角 (Border Radius)

| Token | 值 | 用途 |
|-------|-----|------|
| `--radius-sm` | `6px` | 内联元素/输入框 |
| `--radius-md` | `10px` | 卡片/面板 |
| `--radius-lg` | `14px` | 模态框/大组件 |

---

## 4. 间距 (Spacing)

使用 4px 基准单位：

| Token | 值 | 用途 |
|-------|-----|------|
| `--space-1` | `4px` | 密集内边距 |
| `--space-2` | `8px` | 元素间距 |
| `--space-3` | `12px` | 组件内边距 |
| `--space-4` | `16px` | 卡片内边距 |
| `--space-5` | `20px` | 区域间距 |
| `--space-6` | `24px` | 大间距 |
| `--space-8` | `32px` | 超大间距 |

> 使用方式：`gap: var(--space-3)` 或 `padding: var(--space-4)`

---

## 5. 字体 (Typography)

| Token | 值 | 用途 |
|-------|-----|------|
| `--font-sans` | `'Inter', 'Noto Sans SC', -apple-system, sans-serif` | 正文 |
| `--font-mono` | `'JetBrains Mono', 'SF Mono', 'Fira Code', monospace` | 代码 |
| `--font-size-xs` | `11px` | 辅助文字 |
| `--font-size-sm` | `12px` | 次要文字/标签 |
| `--font-size-base` | `13px` | 默认正文 |
| `--font-size-md` | `14px` | 正文大号 |
| `--font-size-lg` | `15px` | 小标题 |
| `--font-size-xl` | `16px` | 标题 |
| `--font-size-2xl` | `18px` | 大标题 |

---

## 6. 动画 (Motion)

| Token | 值 | 用途 |
|-------|-----|------|
| `--transition` | `0.18s cubic-bezier(0.4, 0, 0.2, 1)` | 默认过渡 |
| `--transition-slow` | `0.3s cubic-bezier(0.4, 0, 0.2, 1)` | 弹窗/面板动画 |

---

## 7. 布局 (Layout)

| Token | 默认值 | 范围 | 用途 |
|-------|--------|------|------|
| panel-left-width | 240px | 180–420px | 左侧文件树面板 |
| panel-right-width | 340px | 200–500px | 右侧聊天面板 |
| sidebar-width | 200px | — | 左侧导航边栏 |

---

## 8. 层级 (Z-Index)

| 层级 | 值 | 用途 |
|------|-----|------|
| base | `0` | 默认内容 |
| sticky | `10` | 固定头部 |
| dropdown | `50` | 下拉菜单 |
| modal | `100` | 模态框 |
| toast | `200` | 全局提示 |

---

## 9. 组件样式配方 (Component Recipes)

### Button Primary
```
display: inline-flex
align-items: center
gap: 6px
padding: 8px 16px
border-radius: var(--radius-sm)
font-size: var(--font-size-base)
font-weight: 600
background: var(--primary)
color: #fff
transition: var(--transition)
hover: background var(--primary-hover)
active: background var(--primary-active)
```

### Button Secondary
```
display: inline-flex
align-items: center
gap: 6px
padding: 8px 16px
border-radius: var(--radius-sm)
font-size: var(--font-size-base)
font-weight: 500
border: 1px solid var(--border)
background: var(--bg-card)
color: var(--text-primary)
transition: var(--transition)
hover: background var(--bg-input)
```

### Card
```
background: var(--bg-card)
border: 1px solid var(--border)
border-radius: var(--radius-md)
padding: var(--space-4)
box-shadow: var(--shadow-sm)
```

### Input
```
width: 100%
padding: 8px 12px
border-radius: var(--radius-sm)
border: 1px solid var(--border)
background: var(--bg-input)
font-size: var(--font-size-md)
color: var(--text-primary)
focus: border-color var(--border-focus)
```

---

## 10. 编辑指南

- **修改 Token**：同时更新此文件和 `src/index.css` 中的对应 CSS 变量
- **新增 Token**：在此文件添加定义 → 在 `index.css` `:root` 中声明 → 使用 `var(--token-name)` 引用
- **不使用硬编码值**：任何颜色、间距、圆角都应通过 CSS 变量引用
