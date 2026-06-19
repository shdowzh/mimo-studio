# MiMo Studio UI 重设计计划（已归档）

> **状态**：已归档。本计划为 2026-06-20 之前的旧版 UI 改造草案，实际最终交付的是 **OpenClaw 风格改造**，详见 [PROJECT.md](PROJECT.md) 的「V8 → V9 OpenClaw 风格重设计 + 新图标」章节。
>
> 本文档保留作为历史参考，其中「横向工程约定」「常见坑速查」仍具有可读性，但 Phase 2/3/4 的具体实现与最终代码不一致。

---

## 目录

- [总览](#总览)
- [设计原则与约束](#设计原则与约束)
- [Phase 1 已完成回顾](#phase-1-已完成回顾)
- [Phase 2：主导航与会话列表](#phase-2主导航与会话列表)
- [Phase 3：聊天主区重设计](#phase-3聊天主区重设计)
- [Phase 4：子页面打磨](#phase-4子页面打磨)
- [横向工程约定](#横向工程约定)
- [验收清单](#验收清单)

---

## 总览

| Phase | 范围 | 预估工作量 | 风险 | 影响 |
|---|---|---|---|---|
| Phase 1 ✅ | 视觉基建（tokens / 字号 / 原子组件 / 状态条） | 0.5 天 | 低 | 全站观感 |
| Phase 2 ✅ | Sidebar 可展开 + 会话列表分组/搜索 + 各 View 替换 TitleBar | 1.5 天 | 中（需迁移布局） | 导航专业度 |
| Phase 3 ✅ | 消息气泡重设计：头像、Step 折叠摘要、Tool 卡片精简、Input 升级 | 2 天 | 中（保持 SSE/Part 兼容） | 日常使用核心 |
| Phase 4 ✅ | Settings / Skills / Memory / MCP / Terminal / Onboarding 各页打磨 | 2 天（可并行） | 低 | 页面级别 |
| **OpenClaw 实际交付** | 以本计划为参考但最终改为 OpenClaw 风格：统一窗口框架、AppHeader、宽 Sidebar、双边气泡、 coral 品牌色、新图标 | — | — | 全站 |

**推进顺序建议**：Phase 2 → Phase 3 → Phase 4。Phase 4 各页可拆分独立 PR 并行。

**实际最终改造**：由于用户明确要求参考 OpenClaw 截图风格，最终分 4 个 PR 完成：窗口框架+Token、AppHeader+Sidebar、ChatView 消息/输入、各 View 收口+全局搜索+新图标。详细变更见 [PROJECT.md](PROJECT.md)。

**严禁事项**（保护 V7 的稳定性沉淀）：

- ✗ 不要改 `MessageList.tsx` 容器的 `flex-1 + minHeight: 0`（V7 修过的虚拟滚动高度坍塌问题）
- ✗ 不要把 `react-virtuoso` 加回来（V7 已经从 virtuoso 切到普通滚动 + auto-scroll，因为 flex 容器高度 0 时 virtuoso 不渲染）
- ✗ 不要在 SSE handler 里 mutate 入参 part / message 对象（V7 的 zustand 浅比较坑，必须不可变更新）
- ✗ 不要在 `messages` selector 里返回新数组引用（要么 memo 要么 getState；React 19 #185 报错的根因）
- ✗ 不要给 `mimo serve` 的 `/global/event` 注入密码（mimo serve 仅在空密码时放行 SSE 端点）
- ✗ 不要重新引入 `crossorigin` 属性到 index.html（V7 的自定义协议改造前置依赖）

---

## 设计原则与约束

### 视觉系统（Phase 1 已落地）

**色彩语义**：

| Token | 用途 | 反例 |
|---|---|---|
| `mc-bg` | 应用底色（顶层最暗/最亮的容器） | 不要用作卡片背景 |
| `mc-surface` | 卡片 / 输入框 / 弹层背景 | 不要嵌套两层 surface |
| `mc-elevated` | hover/active 态的临时背景 | 不要用作静态卡片背景 |
| `mc-hover` | 按钮/列表项 hover 时的轻覆盖 | 半透明，不要用作主背景 |
| `mc-border-subtle` | 卡片/区段的"分隔线"，弱视觉权重 | 主操作按钮的边框不要用 subtle |
| `mc-border` | 卡片/输入框的"边框"，可见但不抢眼 | 不要用作分隔线 |
| `mc-brand` | **唯一的强调色**：CTA 按钮 / 选中态指示 / 链接 | 不要用 mc-accent 替代 |
| `mc-accent` | 次要文本强调（罕见，多数场景用 mc-text-secondary） | 不要用作按钮主色 |
| `mc-success / warning / error` | 状态语义 | 不要混用，warning 不能用作 brand |

**字号**：
- 已收敛到 `text-2xs (11px) / text-xs (12px) / text-sm (13px) / text-base (14px) / text-lg (16px)`
- **新写代码禁止 `text-[Npx]` 任意值**；如必要必须先扩 tailwind config

**圆角**：
- Button: `rounded-md` (6px)
- Input/卡片: `rounded-lg` (8px)
- Modal/对话框: `rounded-xl` (12px)
- 标签 chip: `rounded` (4px)
- 头像/徽标: `rounded-full`

**间距**：用 tailwind 的 `gap-1/2/3/4` 和 `px-3/4` `py-1.5/2/3` 等标准刻度，避免 `gap-[5px]` 任意值。

### 共享原子组件（Phase 1 已建）

```
src/components/ui/
├── Button.tsx        — variant: brand | primary | secondary | ghost | danger
├── Input.tsx         — variant: underline | box
├── Modal.tsx         — title/width/onClose
├── Toast.tsx         — 全局 toast 列表
├── TitleBar.tsx      — 36px drag region + 标题 + 操作 + 副 tab（NEW）
├── Spinner.tsx       — tone: brand | muted（NEW）
├── StatusDot.tsx     — tone: success | warning | error | brand | muted（NEW）
└── EmptyHint.tsx     — icon/title/description/action（NEW）
```

**优先复用，禁止再写一份**：

| 场景 | 用 | 禁止 |
|---|---|---|
| 加载小转圈 | `<Spinner />` | `<Loader2 className="animate-spin" />` 直接写 |
| 状态点 | `<StatusDot tone="success" />` | `<span className="w-1.5 h-1.5 rounded-full bg-...">` |
| 空态 | `<EmptyHint icon=... title=... description=... />` | 自己写 flex 居中 + 图标 + 文字 |
| 视图顶栏 | `<TitleBar title=... actions=... subBar=... />` | 散落的 `<div className="h-[36px] drag" />` |
| 按钮 | `<Button variant="brand">` | 原生 `<button className="bg-... px-...">` |

### 主题兼容

5 套主题（dark / light / nord / catppuccin / one-dark）必须全部能看。改动时：
1. **不要写死颜色**（`#fff` / `bg-zinc-800` 全部禁止）
2. 新颜色必须先在 `globals.css` 5 个 selector 各加一行
3. 用 `bg-mc-*` / `text-mc-*` / `border-mc-*` 类名

---

## Phase 1 已完成回顾

> 接手开发者必读，理解新基建后再进入 Phase 2/3/4。

### 文件级改动

| 路径 | 性质 | 关键变化 |
|---|---|---|
| `src/styles/globals.css` | 修改 | 5 套主题加 `--brand` / `--brand-hover` / `--brand-soft`；调暗 dark 主题层级（base #09090b → surface #131316 → elevated #1f1f23）；滚动条 4px → 6px |
| `tailwind.config.js` | 修改 | 新增 `mc-brand` / `mc-brand-hover` / `mc-brand-soft` 颜色 token |
| `src/components/ui/Button.tsx` | 修改 | 新增 `variant="brand"`；`secondary` 边框改 subtle；加 focus-ring |
| `src/components/ui/Input.tsx` | 修改 | 新增 `variant="box"` 适配卡片内表单 |
| `src/components/ui/Modal.tsx` | 修改 | 弹出动画 fade-in → slide-up；标题分隔线改 subtle |
| `src/components/ui/TitleBar.tsx` | 新建 | 36px drag region + title + actions + subBar 的统一容器 |
| `src/components/ui/Spinner.tsx` | 新建 | brand/muted 双 tone |
| `src/components/ui/StatusDot.tsx` | 新建 | success/warning/error/brand/muted 五 tone + pulse |
| `src/components/ui/EmptyHint.tsx` | 新建 | 通用空态布局 |
| `src/components/Sidebar/NavItem.tsx` | 修改 | 激活态改用 brand-soft 背景 + brand 色图标 + brand 色侧条 |
| `src/views/ChatView/index.tsx` | 修改 | 删 4 条横幅，改用 `<ChatStatusBar />` 单一组件 |
| `src/views/ChatView/ChatStatusBar.tsx` | 新建 | 优先级整合 lastError > initError > initializing > offline |
| `src/views/ChatView/ChatHeader.tsx` | 修改 | 删除 Wifi/WifiOff 图标；用 StatusDot/Spinner；模型按钮加 border + bg-surface/60 看起来更像 chip |
| 全项目 | 批量 | `text-[9/10/11px]` 99 处全替换为 `text-2xs` |

### Phase 1 设计决策记录

1. **品牌色为什么选 indigo（dark）/ indigo（light）？**
   - 可读性：indigo-400/500 在两种主题下对比度都达标
   - 与现有截图差异化：原来是 zinc 灰蓝，几乎"无强调"；indigo 给出"AI 工具"的科技感而不是"开发者终端"的冷感
   - Nord/Catppuccin/One Dark 沿用各自原生强调色（cyan/purple/blue），保持主题一致性

2. **为什么 ChatStatusBar 用优先级而不是堆叠？**
   - 老设计：4 条同时可见，挤压主区。事实上 `lastError` 通常意味着 `initError` 已经发生，没必要重复
   - 新设计：用户一次只需要看一条最高优先级的信息；正常 Agent 模式不显示

3. **为什么 NavItem 激活态用 brand-soft 背景而不是 elevated？**
   - elevated 跟卡片背景同色，激活态视觉感弱
   - brand-soft 是品牌色 12% 透明，明显区分"当前在哪"

---

## Phase 2：主导航与会话列表

### 目标

让"我在哪、能去哪、对话历史"一眼可见。

### 任务清单（按优先级）

- [ ] T2.1 Sidebar 可展开（默认 52px，hover/锁定 220px）
- [ ] T2.2 Sidebar 分组（工作区 / 知识 / 系统）
- [ ] T2.3 Sidebar 底部状态徽标
- [ ] T2.4 ConversationList 搜索框
- [ ] T2.5 ConversationList 分组（今天/昨天/本周/更早）
- [ ] T2.6 ConversationList 右键菜单（重命名/置顶/复制ID/删除）
- [ ] T2.7 各 View 顶栏统一替换为 `<TitleBar />`

---

### T2.1 — Sidebar 可展开

**现状**：`src/components/Sidebar/index.tsx` 固定 52px，文字仅在 hover tooltip 中。

**目标**：

- 默认 52px（图标列）
- hover 进入边缘 4px 触发器 → 展开 220px 显示文字
- 顶部加 pin 按钮 → 锁定为 220px（持久化到 settings）

**实现要点**：

```tsx
// src/components/Sidebar/index.tsx
import { useState, useEffect } from 'react'
import { useUIStore } from '@/stores/uiStore'

export default function Sidebar() {
  const { sidebarCollapsed } = useUIStore()  // 持久化锁定状态
  const [hoverExpanded, setHoverExpanded] = useState(false)
  const expanded = !sidebarCollapsed || hoverExpanded
  
  return (
    <>
      {/* 触发热区：始终在 sidebar 右边 4px */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 z-10"
        onMouseEnter={() => setHoverExpanded(true)}
      />
      <aside
        onMouseLeave={() => setHoverExpanded(false)}
        className={`
          flex flex-col bg-mc-bg border-r border-mc-border-subtle select-none
          transition-[width] duration-200 ease-out
          ${expanded ? 'w-sidebar-expanded' : 'w-sidebar'}
        `}
      >
        {/* ... */}
      </aside>
    </>
  )
}
```

**NavItem 联动**（`src/components/Sidebar/NavItem.tsx`）：

接收 `expanded` prop；展开时显示完整 label，收起时只显示图标 + tooltip。

```tsx
interface NavItemProps {
  expanded?: boolean
  // ... 其他 props
}

return (
  <button className={`flex items-center gap-2.5 ${expanded ? 'w-full px-3 justify-start' : 'w-9 justify-center'} h-9 rounded-lg ...`}>
    <Icon size={17} />
    {expanded && <span className="text-xs flex-1 text-left">{label}</span>}
    {expanded && badge && <Badge>{badge}</Badge>}
  </button>
)
```

**持久化**：

- `uiStore.sidebarCollapsed` 已经有了，加 `pinned: boolean`
- 启动时从 SQLite settings 读取：
  ```ts
  // src/App.tsx
  useEffect(() => {
    if (!isElectron()) return
    getAPI().settings.get('sidebar-pinned').then(v => {
      if (v === 'true') useUIStore.getState().setPinned(true)
    })
  }, [])
  ```

**测试点**：

- ✅ hover 后展开应有 200ms 平滑过渡
- ✅ pin 后刷新应记忆状态
- ✅ tooltip 在展开模式下不应再显示（避免重复）

---

### T2.2 — Sidebar 分组

**目标**：把现有 5 个 NavItem 按语义分 3 组：

```
工作区
  - 聊天 (chat)
  - 终端 (terminal)

知识
  - 记忆 (memory)
  - 技能 (skills)
  - MCP (mcp)

系统
  - 设置 (settings) — 已在底部
```

**实现**：`src/components/Sidebar/index.tsx` 把 `NAV_ITEMS` 改为分组结构：

```tsx
const NAV_GROUPS = [
  {
    title: '工作区',
    items: [
      { id: 'chat', icon: MessageSquare, label: '聊天' },
      { id: 'terminal', icon: Terminal, label: '终端' },
    ],
  },
  {
    title: '知识',
    items: [
      { id: 'memory', icon: Brain, label: '记忆' },
      { id: 'skills', icon: Sparkles, label: '技能' },
      { id: 'mcp', icon: Plug, label: 'MCP' },
    ],
  },
] as const
```

收起模式：组间用 `<div className="h-px bg-mc-border-subtle mx-2 my-1" />` 分隔。  
展开模式：组前显示 `<div className="text-2xs text-mc-text-muted uppercase tracking-wider px-3 pt-3 pb-1">{title}</div>`。

---

### T2.3 — Sidebar 底部状态徽标

**目标**：

- 在「设置」按钮上方加一个"服务状态"徽标
- 收起：单个 StatusDot（success / warning / error）
- 展开：StatusDot + "Agent 在线" / "正在准备" / "离线" 文字
- 点击 → `setCurrentView('settings'); setSettingsTab('providers')`

**实现**：

```tsx
// src/components/Sidebar/ServerStatusBadge.tsx
import { useChatStore, selectors } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'
import StatusDot from '@/components/ui/StatusDot'

export default function ServerStatusBadge({ expanded }: { expanded: boolean }) {
  const isAgentMode = useChatStore(selectors.isAgentMode)
  const isInitializing = useChatStore(selectors.isInitializing)
  
  const { tone, label, hint } = (() => {
    if (isAgentMode) return { tone: 'success' as const, label: 'Agent 在线', hint: '工具调用 / 文件操作 / 权限均可用' }
    if (isInitializing) return { tone: 'brand' as const, label: '正在准备', hint: 'MiMo Serve 初始化中' }
    return { tone: 'warning' as const, label: '离线', hint: '点击配置 Provider' }
  })()
  
  return (
    <button
      onClick={() => {
        useUIStore.getState().setCurrentView('settings')
        useUIStore.getState().setSettingsTab('providers')
      }}
      title={hint}
      className={`flex items-center gap-2 ${expanded ? 'px-3 w-full justify-start' : 'w-9 justify-center'} h-8 rounded-md text-mc-text-muted hover:text-mc-text hover:bg-mc-hover transition-colors`}
    >
      <StatusDot tone={tone} pulse={isInitializing} />
      {expanded && <span className="text-xs">{label}</span>}
    </button>
  )
}
```

---

### T2.4 — ConversationList 搜索框

**位置**：`src/views/ChatView/ConversationList.tsx`

**目标**：在「+ 新建」按钮和列表之间加入搜索框，按 Cmd+K (Mac) / Ctrl+K (Win) 唤起 focus。

**实现**：

```tsx
import { Search, X } from 'lucide-react'
import { useState, useEffect, useRef, useMemo } from 'react'

const [query, setQuery] = useState('')
const inputRef = useRef<HTMLInputElement>(null)

useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      inputRef.current?.focus()
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [])

const filtered = useMemo(() => {
  const q = query.trim().toLowerCase()
  if (!q) return sessions
  return sessions.filter(s => (s.title || '').toLowerCase().includes(q))
}, [sessions, query])

// JSX:
<div className="px-2 pb-2">
  <div className="relative">
    <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-mc-text-muted" />
    <input
      ref={inputRef}
      type="text"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      placeholder="搜索对话 (Ctrl+K)"
      className="w-full pl-7 pr-7 py-1.5 text-xs bg-mc-surface border border-mc-border-subtle rounded-md focus:outline-none focus:border-mc-brand placeholder:text-mc-text-muted"
    />
    {query && (
      <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-mc-text-muted hover:text-mc-text">
        <X size={11} />
      </button>
    )}
  </div>
</div>
```

---

### T2.5 — ConversationList 分组

**目标**：按 session.time.updated 分四组：今天 / 昨天 / 本周 / 更早。

**实现**：

```tsx
function groupSessions(sessions: SessionInfo[]) {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfYesterday = startOfToday - 86400000
  const startOfWeek = startOfToday - now.getDay() * 86400000
  
  const buckets: Record<string, SessionInfo[]> = {
    今天: [], 昨天: [], 本周: [], 更早: [],
  }
  for (const s of sessions) {
    const t = s.time.updated
    if (t >= startOfToday) buckets.今天.push(s)
    else if (t >= startOfYesterday) buckets.昨天.push(s)
    else if (t >= startOfWeek) buckets.本周.push(s)
    else buckets.更早.push(s)
  }
  return buckets
}

// 渲染：
{Object.entries(groups).map(([label, items]) => items.length > 0 && (
  <div key={label} className="mb-2">
    <div className="px-3 py-1 text-2xs text-mc-text-muted uppercase tracking-wider sticky top-0 bg-mc-bg/95 backdrop-blur-sm">
      {label}
      <span className="ml-1.5 normal-case font-normal opacity-60">{items.length}</span>
    </div>
    {items.map(s => <SessionItem key={s.id} session={s} {...} />)}
  </div>
))}
```

---

### T2.6 — ConversationList 右键菜单

**目标**：会话项右键唤起菜单：重命名 / 置顶 / 复制 Session ID / 删除。

**最简实现**：自写 ContextMenu，不引入新依赖。

```tsx
// src/components/ui/ContextMenu.tsx
import { useEffect, useRef } from 'react'

interface MenuItem {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  danger?: boolean
}

interface Props {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('contextmenu', handler)
    window.addEventListener('keydown', e => e.key === 'Escape' && onClose())
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('contextmenu', handler)
    }
  }, [onClose])
  
  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[160px] py-1 bg-mc-surface border border-mc-border rounded-md shadow-xl animate-fade-in"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => { item.onClick(); onClose() }}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-mc-hover transition-colors ${item.danger ? 'text-mc-error' : 'text-mc-text-secondary hover:text-mc-text'}`}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  )
}
```

**SessionItem 集成**：

```tsx
const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

<div
  onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }) }}
  // ...
>
  {/* ... */}
</div>

{menu && (
  <ContextMenu
    x={menu.x}
    y={menu.y}
    onClose={() => setMenu(null)}
    items={[
      { label: '重命名', icon: <Edit size={11} />, onClick: () => onRename(session) },
      { label: session.pinned ? '取消置顶' : '置顶', icon: <Pin size={11} />, onClick: () => togglePin(session) },
      { label: '复制 ID', icon: <Copy size={11} />, onClick: () => navigator.clipboard.writeText(session.id) },
      { label: '删除', icon: <Trash2 size={11} />, danger: true, onClick: () => onDelete(session) },
    ]}
  />
)}
```

**置顶功能**：mimo serve 没有原生 pin 字段，前端在 SQLite 存 `pinned-sessions` 数组：

```ts
// src/stores/chatStore.ts 新增
pinnedSessionIds: string[]
loadPinnedSessions: () => Promise<void>
togglePin: (sessionID: string) => Promise<void>
```

实现：

```ts
loadPinnedSessions: async () => {
  if (!isElectron()) return
  const raw = await getAPI().settings.get('pinned-sessions')
  set({ pinnedSessionIds: raw ? JSON.parse(raw) : [] })
},
togglePin: async (sessionID) => {
  const cur = get().pinnedSessionIds
  const next = cur.includes(sessionID) ? cur.filter(id => id !== sessionID) : [...cur, sessionID]
  set({ pinnedSessionIds: next })
  if (isElectron()) await getAPI().settings.set('pinned-sessions', JSON.stringify(next))
},
```

排序时置顶项优先，再按 updated 倒序。

---

### T2.7 — 各 View 顶栏替换为 TitleBar

**目标**：消除散落的 `<div className="h-[36px] drag" />` + 第二行 header 的两层结构。

**示例迁移（MemoryView）**：

```tsx
// 改前
<div className="h-[36px] drag" />
<div className="flex items-center justify-between h-10 px-4 border-b border-mc-border-subtle">
  <div className="flex items-center gap-2">
    <Brain size={14} ... />
    <span>记忆</span>
  </div>
  <div>{tabs}</div>
</div>

// 改后
<TitleBar
  icon={Brain}
  title="记忆"
  actions={tabs}
/>
```

**需要迁移的文件**：

- `src/views/MemoryView/index.tsx`
- `src/views/SkillsView/index.tsx`
- `src/views/SettingsView/index.tsx`
- `src/views/McpView/index.tsx`
- `src/views/TerminalView/index.tsx`

**注意**：

- `ChatView` 用的是 `ChatHeader.tsx`，结构特殊（左对齐 session title + 右对齐模型选择器），**不要**强行改成 TitleBar。改 ChatHeader 内部用 36px drag 即可（已经是这样）。
- `SettingsView` 有两层 tab（顶部 + 设置子 tab），可以用 `TitleBar` 的 `subBar` prop。

---

## Phase 3：聊天主区重设计

### 目标

让 Agent 工作过程"既清晰又好看"。这是用户日常使用最频繁的页面。

### 任务清单

- [ ] T3.1 引入消息头像列布局
- [ ] T3.2 助手消息改 border-left 风格（不再 bubble）
- [ ] T3.3 StepBlock 折叠摘要
- [ ] T3.4 ToolCallCard 单行设计
- [ ] T3.5 ReasoningBlock 隐式化
- [ ] T3.6 MessageInput 升级（@ 菜单 + 模型 chip + 快捷键提示）
- [ ] T3.7 EmptyState 替换为最近 prompt + 项目模板
- [ ] T3.8 PermissionDialog 浮层升级

---

### T3.1 — 消息头像列布局

**现状**：用户消息在右、Assistant 在左，最大宽度 75%。

**目标**：统一改为左侧 28px 头像列 + 右侧消息列，**用户和助手都左对齐**（参考 Cursor / Cline / Claude.ai 的现代风格）。

**理由**：
- 长对话时左右气泡导致视线频繁横跳
- Agent 输出长（含 step / tool），75% 宽度限制反而压缩可读性
- 头像列让"谁说话"一眼可见

**实现**：

```tsx
// src/views/ChatView/MessageBubble.tsx
import { User, Bot } from 'lucide-react'

function Avatar({ role }: { role: 'user' | 'assistant' }) {
  if (role === 'user') {
    return (
      <div className="w-7 h-7 rounded-full bg-mc-elevated flex items-center justify-center shrink-0">
        <User size={14} className="text-mc-text-muted" />
      </div>
    )
  }
  return (
    <div className="w-7 h-7 rounded-full bg-mc-brand-soft flex items-center justify-center shrink-0">
      <Bot size={14} className="text-mc-brand" />
    </div>
  )
}

// 主组件：
return (
  <div className="flex gap-3 mb-5 animate-fade-in">
    <Avatar role={isUser ? 'user' : 'assistant'} />
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium text-mc-text">
          {isUser ? '你' : 'MiMo'}
        </span>
        {!isUser && message.info.model && (
          <span className="text-2xs text-mc-text-muted">
            {message.info.model.providerID} / {message.info.model.modelID}
          </span>
        )}
      </div>
      {/* 消息内容 */}
    </div>
  </div>
)
```

---

### T3.2 — 助手消息改 border-left（不再 bubble）

**目标**：长 step / tool / text 输出时，用左侧 2px 品牌色细线标识"这是一段连续的助手回复"，比 bubble 更轻量。

```tsx
// 用户消息：保留浅背景容器
{isUser ? (
  <div className="rounded-lg bg-mc-elevated px-3 py-2 inline-block max-w-full">
    <p className="text-sm whitespace-pre-wrap leading-relaxed">{textContent}</p>
  </div>
) : (
  // 助手消息：左侧 2px 细线 + 内边距
  <div className="border-l-2 border-mc-brand/30 pl-4 space-y-2">
    {/* preStep / steps / postStep */}
  </div>
)}
```

---

### T3.3 — StepBlock 折叠摘要

**现状**：每个 step 都默认展开，长任务（10+ step）滚动量爆炸。

**目标**：

- **正在执行**的 step：默认展开（最后一个未 finish 的）
- **已完成**的 step：默认折叠成单行摘要 `✓ 3 个工具 · 1.2s · 480 tokens`
- 点击展开/收起

**实现**：

```tsx
// MessageBubble.tsx 中
function StepBlock({ children, stepIndex, finish, totalSteps, isLastStep }: {
  children: React.ReactNode
  stepIndex: number
  finish?: StepFinishPart
  totalSteps: number
  isLastStep: boolean
}) {
  const isCompleted = !!finish
  // 默认：未完成或最后一个 step → 展开；其他已完成 → 折叠
  const [collapsed, setCollapsed] = useState(isCompleted && !isLastStep)
  
  const summary = useMemo(() => {
    if (!finish) return null
    const toolCount = React.Children.toArray(children).filter((c: any) => 
      c?.props?.part?.type === 'tool'
    ).length
    const duration = finish.time?.end && finish.time?.start
      ? `${((finish.time.end - finish.time.start) / 1000).toFixed(1)}s`
      : null
    const tokens = finish.tokens?.total
    return [
      toolCount > 0 ? `${toolCount} 个工具` : null,
      duration,
      tokens ? `${tokens} tokens` : null,
    ].filter(Boolean).join(' · ')
  }, [children, finish])
  
  return (
    <div className="my-1.5">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-1.5 text-2xs text-mc-text-muted hover:text-mc-text transition-colors px-1 py-0.5 rounded hover:bg-mc-hover"
      >
        {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
        {isCompleted ? <CheckCircle2 size={10} className="text-mc-success" /> : <Spinner size={10} />}
        <span className="font-medium">Step {stepIndex + 1}/{totalSteps}</span>
        {summary && collapsed && <span className="opacity-70">· {summary}</span>}
      </button>
      {!collapsed && (
        <div className="mt-1 pl-3 border-l border-mc-border-subtle space-y-1">
          {children}
          {finish && <MetaInfo part={finish} />}
        </div>
      )}
    </div>
  )
}
```

---

### T3.4 — ToolCallCard 单行设计

**现状**：每个 tool 占 2-3 行，连续 5 个堆叠很乱。

**目标**：

- 折叠态单行：`图标 工具名 · 摘要 · 状态徽标 · 耗时`
- 点击展开 input/output（保留现状）
- 多个连续 tool 视觉层级一致

**实现**：

```tsx
// src/views/ChatView/ToolCallCard.tsx
return (
  <div className="rounded-md border border-mc-border-subtle bg-mc-surface/40 overflow-hidden">
    <button
      className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-mc-hover transition-colors text-left"
      onClick={() => setExpanded(!expanded)}
    >
      {/* Tool 图标 */}
      <Icon size={12} className="text-mc-text-muted shrink-0" />
      
      {/* Tool 名 */}
      <span className="text-xs font-medium text-mc-text shrink-0">{formatToolName(part.tool)}</span>
      
      {/* 摘要 */}
      {summary && (
        <span className="text-2xs text-mc-text-muted truncate flex-1 font-mono">
          {summary}
        </span>
      )}
      
      {/* 状态徽标 — 用 StatusDot 替代图标 */}
      {state.status === 'pending' && <StatusDot tone="muted" pulse />}
      {state.status === 'running' && <Spinner size={10} />}
      {state.status === 'completed' && <CheckCircle2 size={11} className="text-mc-success shrink-0" />}
      {state.status === 'error' && <XCircle size={11} className="text-mc-error shrink-0" />}
      
      {/* 耗时 */}
      {(state.status === 'completed' || state.status === 'error') && (state as any).time && (
        <span className="text-2xs text-mc-text-muted shrink-0 font-mono">
          {Math.round(((state as any).time.end - (state as any).time.start) / 1000)}s
        </span>
      )}
      
      {/* 展开图标 */}
      <ChevronRight size={11} className={`text-mc-text-muted shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
    </button>
    
    {/* 详情面板 — 沿用现状 */}
    {expanded && <div className="border-t border-mc-border-subtle px-3 py-2">{/* ... */}</div>}
  </div>
)
```

---

### T3.5 — ReasoningBlock 隐式化

**现状**：默认显示一个"查看思考"按钮。

**目标**：

- **流式中**（reasoning 还在追加）：显示 `<Spinner /> 思考中...`
- **流式结束后**（开始有 step/text）：默认折叠成 `💭 思考了 12s` 一行斜体灰字，hover 才显示展开图标
- 用户主动点击才展开内容

**实现**：

```tsx
function ReasoningBlock({ text, isStreaming }: { text: string; isStreaming?: boolean }) {
  const [show, setShow] = useState(false)
  
  if (isStreaming) {
    return (
      <div className="flex items-center gap-1.5 text-2xs text-mc-text-muted italic mb-1.5">
        <Spinner size={10} tone="muted" />
        正在思考...
      </div>
    )
  }
  
  // 估算思考"时长"：用文字长度近似（无真实 timestamp）
  const wordCount = text.length
  
  return (
    <div className="mb-1.5 group">
      <button
        onClick={() => setShow(!show)}
        className="flex items-center gap-1.5 text-2xs text-mc-text-muted italic hover:text-mc-text transition-colors"
      >
        <Brain size={10} />
        思考过程 · {wordCount} 字
        <span className="opacity-0 group-hover:opacity-100 transition-opacity">
          {show ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </span>
      </button>
      {show && (
        <div className="mt-1.5 p-2.5 bg-mc-surface/50 rounded-md border-l-2 border-mc-brand/20 text-2xs text-mc-text-muted leading-relaxed font-mono max-h-[200px] overflow-y-auto whitespace-pre-wrap">
          {text}
        </div>
      )}
    </div>
  )
}
```

判断 `isStreaming`：从外部传入（MessageBubble 知道这条消息是不是仍在 busy 状态）。

---

### T3.6 — MessageInput 升级

**现状**：textarea + 发送按钮，无任何辅助入口。

**目标**：

- 左侧 `+` 按钮：弹出菜单（@ 技能 / 📎 附件 placeholder / 模板）
- 输入框聚焦时 ring 用 `mc-brand`
- 右下角小型「@当前模型」chip：点击直跳 ChatHeader 的 model picker
- 占位符暗示快捷键：`输入消息... (Enter 发送 · Shift+Enter 换行)`

**实现框架**：

```tsx
// src/views/ChatView/MessageInput.tsx
import { Plus, Send, Square, AtSign, Paperclip, FileCode } from 'lucide-react'
import { useChatStore } from '@/stores/chatStore'

const [menuOpen, setMenuOpen] = useState(false)
const currentModel = useChatStore(s => s.currentModel)
const currentProvider = useChatStore(s => s.currentProvider)

return (
  <div className="px-4 pb-4 pt-2">
    <div className="relative bg-mc-surface border border-mc-border-subtle rounded-xl focus-within:border-mc-brand/60 focus-within:ring-1 focus-within:ring-mc-brand/30 transition-all">
      
      {/* 顶部工具行 */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-mc-border-subtle/50">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="p-1 rounded text-mc-text-muted hover:text-mc-text hover:bg-mc-hover transition-colors"
          title="附加 / 引用"
        >
          <Plus size={13} />
        </button>
        {/* 后续可加：文件附件、@技能选择器 */}
      </div>
      
      {/* 文本框 */}
      <textarea ... className="w-full bg-transparent px-3 py-2 text-sm focus:outline-none resize-none" />
      
      {/* 底部工具行 */}
      <div className="flex items-center justify-between px-2 py-1.5 border-t border-mc-border-subtle/50">
        <button
          onClick={() => useUIStore.getState().setCurrentView('chat')} // 触发 ChatHeader picker，可考虑 store 加 openModelPicker action
          className="flex items-center gap-1.5 px-2 py-0.5 text-2xs text-mc-text-muted hover:text-mc-text hover:bg-mc-hover rounded transition-colors"
        >
          <AtSign size={10} />
          {currentProvider}/{currentModel || 'auto'}
        </button>
        
        <div className="flex items-center gap-2">
          <span className="text-2xs text-mc-text-muted">Enter 发送</span>
          {isBusy ? <button onClick={handleAbort}>...<Square /></button> : <button onClick={handleSubmit}>...<Send /></button>}
        </div>
      </div>
    </div>
  </div>
)

{menuOpen && <AttachMenu onClose={() => setMenuOpen(false)} />}
```

**附件菜单（先做骨架，feature 后续填充）**：

```tsx
function AttachMenu({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute bottom-full left-2 mb-1 w-48 bg-mc-surface border border-mc-border rounded-md shadow-xl z-10 py-1">
      <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-mc-hover" disabled>
        <Paperclip size={11} /> 附加文件 <span className="ml-auto text-2xs text-mc-text-muted">即将支持</span>
      </button>
      <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-mc-hover" disabled>
        <FileCode size={11} /> 引用代码片段 <span className="ml-auto text-2xs text-mc-text-muted">即将支持</span>
      </button>
      <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-mc-hover">
        <AtSign size={11} /> 选择技能 <span className="ml-auto text-2xs text-mc-text-muted">@</span>
      </button>
    </div>
  )
}
```

---

### T3.7 — EmptyState 替换为最近 prompt + 项目模板

**现状**：4 条硬编码的 `QUICK_PROMPTS`。

**目标**：

- 优先显示**最近 5 条用户 prompt 历史**（从 SQLite 读 `recent-prompts`）
- 没有历史时显示**项目级模板**（基于已发现的 skills 推断）
- 始终显示底部"安装 CLI / 配置 Key"卡片（已有逻辑保留）

**实现**：

```tsx
// src/lib/recentPrompts.ts (新建)
import { getAPI, isElectron } from '@/lib/ipc'

const KEY = 'recent-prompts'
const MAX = 20

export async function getRecentPrompts(): Promise<string[]> {
  if (!isElectron()) return []
  const raw = await getAPI().settings.get(KEY)
  return raw ? JSON.parse(raw) : []
}

export async function pushRecentPrompt(text: string) {
  if (!isElectron() || !text.trim()) return
  const list = await getRecentPrompts()
  const next = [text.trim(), ...list.filter(t => t !== text.trim())].slice(0, MAX)
  await getAPI().settings.set(KEY, JSON.stringify(next))
}
```

**在 `chatStore.sendMessage` 调用 `pushRecentPrompt`**。

**EmptyState 渲染**：

```tsx
const [recents, setRecents] = useState<string[]>([])
useEffect(() => { getRecentPrompts().then(setRecents) }, [])

// JSX:
{recents.length > 0 ? (
  <div>
    <p className="text-2xs text-mc-text-muted uppercase tracking-wider mb-2">最近</p>
    <div className="space-y-1">
      {recents.slice(0, 5).map((p) => (
        <button
          key={p}
          onClick={() => sendMessage(p)}
          className="w-full text-left px-3 py-2 text-xs text-mc-text-secondary bg-mc-surface/40 border border-mc-border-subtle rounded-md hover:border-mc-brand/40 hover:text-mc-text truncate transition-colors"
        >
          {p}
        </button>
      ))}
    </div>
  </div>
) : (
  // 老 QUICK_PROMPTS 兜底
)}
```

---

### T3.8 — PermissionDialog 浮层升级

**现状**：右下角 fixed，3 个 inline 按钮。

**目标**：

- 改用 brand 色描边（吸引视线）
- 顶部加权限分类图标：`bash` → Terminal、`write_file` → FileText、`read_file` → Eye
- 按钮区改用 `<Button variant="brand">仅本次</Button> <Button variant="secondary">始终</Button> <Button variant="danger">拒绝</Button>`
- 加入"差异预览"区域（如果是 write 类工具，显示路径）

实现保留现有逻辑，仅改样式。引用 Phase 1 的 Button：

```tsx
import Button from '@/components/ui/Button'
import { Shield, ShieldCheck, ShieldX } from 'lucide-react'

return (
  <div className="bg-mc-surface border border-mc-brand/40 rounded-xl shadow-2xl shadow-mc-brand/10 overflow-hidden animate-slide-up">
    <div className="flex items-center gap-2 px-4 py-2.5 bg-mc-brand-soft">
      <Shield size={14} className="text-mc-brand" />
      <span className="text-xs font-medium text-mc-text">Agent 请求权限</span>
    </div>
    {/* Body — 同前 */}
    <div className="grid grid-cols-3 border-t border-mc-border-subtle">
      <Button variant="brand" size="sm" onClick={...}>仅本次</Button>
      <Button variant="secondary" size="sm" onClick={...}>始终</Button>
      <Button variant="danger" size="sm" onClick={...}>拒绝</Button>
    </div>
  </div>
)
```

---

## Phase 4：子页面打磨

各页面互不依赖，可分独立 PR 并行。下面给出每页的"诊断 + 改造点 + 实现要点"。

### T4.1 — SettingsView

**现状问题**：

- Provider 卡片纵向单列、密度过高（一张卡 6 行内容）
- 主题预览缩略图过小、字段大小无实时预览
- 安装 CLI 卡片嵌套在 MiMo Serve 区域里，不显眼

**改造点**：

1. **整体布局**：换成左侧 tab 列 + 右侧内容区的两栏（替代当前顶部 tab）
2. **Provider 卡片改 2 列网格**：`grid-cols-1 lg:grid-cols-2 gap-3`
3. **Provider 卡片折叠态**：默认只显示 logo + 名 + 状态 + "配置"按钮；点击展开看 endpoint / model chips / API Key 输入
4. **主题预览**：每个主题缩略图放大到 120×80，hover 加阴影 + 1.05 scale
5. **字号滑块**：旁边加实时预览样例：「这是当前字号 14px 的样例文字」
6. **MiMo CLI 卡片**：单独一段，未安装时显示醒目的 "尚未安装 MiMo CLI" + 进度条

**示例：Provider 卡片折叠态**：

```tsx
function ProviderCard({ template, configured, ... }) {
  const [expanded, setExpanded] = useState(!configured)  // 已配置默认折叠
  
  return (
    <div className="mc-card overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-mc-hover/50 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-md bg-mc-elevated flex items-center justify-center shrink-0">
          {/* logo - 可后续加，先用 lucide 图标 */}
          <Shield size={14} className={configured ? 'text-mc-brand' : 'text-mc-text-muted'} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-mc-text">{template.name}</span>
            {configured && <StatusDot tone="success" />}
          </div>
          <p className="text-2xs text-mc-text-muted truncate">{template.endpoint}</p>
        </div>
        <ChevronDown size={12} className={`text-mc-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      
      {expanded && (
        <div className="px-4 pb-3 pt-1 border-t border-mc-border-subtle space-y-2">
          {/* model chips */}
          {/* API Key 输入框 */}
          {/* getKey 链接 */}
        </div>
      )}
    </div>
  )
}
```

---

### T4.2 — SkillsView

**现状问题**：

- 商店里 4 张特色卡片 `MODELSCOPE_FEATURED` 的 `skillUrl: ''`，点击就 fallback 到手动输入框，体验断裂
- 已发现的技能区域跟特色卡片堆在一起视觉混乱
- compose 内置技能 16+ 个，list view 一屏看不完

**改造点**：

1. **删除 fake `MODELSCOPE_FEATURED`** 或者填上真实 skillUrl（从 modelscope 找几个公开的可下载的）
2. **三栏布局**：左侧分类（"全部 / 内置 / 用户 / 商店"）+ 中间技能列表 + 右侧详情面板（点击技能后展示）
3. **技能详情面板**用 mc-card 显示：name / description / location / 完整 markdown 内容，配 Edit / Delete 按钮
4. **列表项**改紧凑列表（不是网格），密度更高

**布局骨架**：

```tsx
return (
  <div className="flex flex-col h-full">
    <TitleBar icon={Sparkles} title="技能" actions={<Button variant="ghost" size="sm" icon={<Download size={11} />}>下载</Button>} />
    <div className="flex flex-1 min-h-0">
      {/* 左侧分类 */}
      <aside className="w-40 border-r border-mc-border-subtle p-2 space-y-0.5">
        {CATEGORIES.map(c => (
          <button key={c.id} onClick={() => setCategory(c.id)} className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md ${selected === c.id ? 'bg-mc-brand-soft text-mc-brand' : 'text-mc-text-secondary hover:bg-mc-hover'}`}>
            <c.icon size={11} /> {c.label} <span className="ml-auto text-2xs opacity-60">{c.count}</span>
          </button>
        ))}
      </aside>
      
      {/* 中间列表 */}
      <div className="flex-1 overflow-y-auto p-2">
        {filteredSkills.map(s => <SkillRow key={s.name} skill={s} selected={selectedId === s.name} onClick={() => setSelectedId(s.name)} />)}
      </div>
      
      {/* 右侧详情 */}
      {selected && (
        <aside className="w-96 border-l border-mc-border-subtle overflow-y-auto p-4">
          <SkillDetailPanel skill={selected} />
        </aside>
      )}
    </div>
  </div>
)
```

---

### T4.3 — MemoryView

**现状问题**：

- 单一 textarea，无大纲导航
- 无"上次保存时间"反馈，长文档不安心
- USER.md 和 MEMORY.md 切换简单粗暴，无差异化提示

**改造点**：

1. **左侧大纲**：解析 markdown 的 `#` `##` 自动生成 outline，点击跳转
2. **右侧编辑器**：保留 textarea，但加底部状态栏「字数 · 最后保存 · Ctrl+S」
3. **顶部加快捷模板按钮**：「插入项目环境变量段」「插入用户偏好段」

**实现要点**：

```tsx
// 解析 outline
function parseOutline(md: string) {
  const lines = md.split('\n')
  return lines
    .map((line, i) => {
      const m = line.match(/^(#{1,3})\s+(.+)$/)
      if (!m) return null
      return { level: m[1].length, text: m[2], lineNo: i }
    })
    .filter(Boolean) as { level: number; text: string; lineNo: number }[]
}

// 跳转：
function jumpTo(lineNo: number) {
  const ta = textareaRef.current
  if (!ta) return
  const lines = ta.value.split('\n')
  const charPos = lines.slice(0, lineNo).join('\n').length
  ta.focus()
  ta.setSelectionRange(charPos, charPos)
  // 滚动到该行
  const lineHeight = parseFloat(getComputedStyle(ta).lineHeight)
  ta.scrollTop = lineNo * lineHeight - 100
}
```

底部状态栏：

```tsx
<div className="flex items-center justify-between px-4 py-1.5 border-t border-mc-border-subtle text-2xs text-mc-text-muted">
  <span>{content.length} 字符 · {countWords(content)} 词</span>
  <span>{lastSavedAt ? `已保存 ${formatTime(lastSavedAt)}` : '未保存'}</span>
  <span>Ctrl+S 保存</span>
</div>
```

加全局 Cmd+S/Ctrl+S 监听调 handleSave。

---

### T4.4 — McpView

**现状问题**：

- 列表 + 添加 modal 风格普通
- 状态指示器是 Lucide 的 `Circle`，无语义化

**改造点**：

1. **改两栏**：左侧服务器列表 + 右侧详情面板
2. **状态用 StatusDot**：running/stopped/error
3. **添加流程改 wizard**：3 步（类型 → 配置 → 验证）

跟 SkillsView 三栏类似，先做最简两栏。

---

### T4.5 — TerminalView

**现状问题**：

- 顶部只有 36px drag 占位，无任何工具
- 字号写死 13px，无切换
- 错误提示用 `AlertCircle` + 红色文字，跟整体风格不一致

**改造点**：

1. **顶部加工具条（subBar）**：模式标签（PTY / 本地）+ 字号选择 + 清屏按钮
2. **空态**：用 `<EmptyHint icon={Terminal} title="终端未启动" description="..." />`
3. **错误显示**：换成 brand-soft 的 inline 提示而非满屏占位

```tsx
<TitleBar
  icon={Terminal}
  title="终端"
  subBar={
    <>
      <span className="text-2xs text-mc-text-muted">{serverConnected ? 'PTY' : '本地 cmd'}</span>
      <span className="ml-2"><StatusDot tone={ptyReady ? 'success' : 'warning'} /></span>
      <div className="flex-1" />
      <select value={fontSize} onChange={...} className="text-2xs bg-transparent border border-mc-border-subtle rounded px-1.5 py-0.5">
        <option value="12">12px</option><option value="13">13px</option><option value="14">14px</option>
      </select>
      <button onClick={() => term.clear()} className="ml-1 px-2 py-0.5 text-2xs text-mc-text-muted hover:text-mc-text">清屏</button>
    </>
  }
/>
```

---

### T4.6 — Onboarding

**现状问题**：

- 三步进度条（横向圆点）跟整体设计语言不一致
- 安装日志用 `text-2xs` 字号过小不易读
- 缺少"返回上一步"

**改造点**：

1. **侧栏式进度**：左侧垂直步骤列（Welcome → Install → Config → Done），右侧内容
2. **安装日志区**：升级为 dark 终端样式的窗口（bg-#0a0a0a + 等宽字体）
3. **每步加返回按钮**

实现重点是结构而非具体代码，参考 Cursor / Cline 的 onboarding。

---

## 横向工程约定

### 命名

- 组件文件 PascalCase：`ChatStatusBar.tsx`
- 工具/store 文件 camelCase：`recentPrompts.ts`、`uiStore.ts`
- 类名 mc-* 前缀：`mc-bg`、`mc-brand`
- IPC 通道 `namespace:verb`：`mimo:startServer`

### 提交粒度

Phase 2/3/4 的每个任务（T2.1 / T3.1 ...）应作为**独立提交**，便于 cherry-pick / revert。提交信息建议：

```
feat(sidebar): T2.1 可展开侧边栏 + 持久化锁定状态
```

```
refactor(chat): T3.4 ToolCallCard 改单行紧凑布局
```

### 验收脚本

每个任务完成后必须跑：

```bash
npm run typecheck   # 必须通过
npm run lint        # 必须无 error（warning 暂可放过）
npm run build       # vite build 必须通过
npm run test        # 涉及 store 改动时必跑
```

任务完成时附上**截图前后对比**到 PR 描述。

### 主题验证

任何改动如果碰了颜色，必须切换 5 套主题分别截图：

```ts
// 控制台快速切换：
['dark','light','nord','catppuccin','one-dark'].forEach(t => {
  console.log(t)
  document.documentElement.dataset.theme = t
  // 拍一张
})
```

或者用 `useThemeStore.getState().setTheme(...)`。

### 不可变更新提醒

所有 SSE handler 和 zustand updater 必须返回新对象/数组，禁止 mutate：

```ts
// ❌ 错
state.messages[sessionID].push(msg)

// ✓ 对
set(s => ({ messages: { ...s.messages, [sessionID]: [...(s.messages[sessionID] || []), msg] } }))
```

### 测试新组件

任何新建的 `src/components/ui/*` 组件应带 props 文档（JSDoc）和最简 demo 注释。后续可考虑加 Storybook，目前手动测即可。

---

## 验收清单

### Phase 2 完成标志

- [x] Sidebar 默认收起 52px，hover 平滑展开 220px
- [x] Sidebar 锁定状态在重启后保留
- [x] Sidebar 三组分组显示（工作区/知识/系统）
- [x] 底部 ServerStatusBadge 反映实时连接状态
- [x] ConversationList 顶部搜索框，Cmd+K 唤起 focus
- [x] ConversationList 按时间分组（今天/昨天/本周/更早）
- [x] SessionItem 右键菜单（重命名/置顶/复制ID/删除）
- [x] 置顶 session 排在最上
- [x] 5 个 View 全部用 `<TitleBar />`，零散落 drag 占位 div
- [x] 5 套主题切换无视觉破绽
- [x] typecheck / lint / build / test 全过

### Phase 3 完成标志

- [x] 用户和 Assistant 消息都左对齐，左侧 28px 头像列
- [x] Assistant 消息用 `border-l-2 border-mc-brand/30 pl-4` 包裹
- [x] StepBlock 已完成的默认折叠成单行摘要
- [x] ToolCallCard 折叠态严格单行
- [x] ReasoningBlock 流式中显示「思考中」，结束后默认折叠成「思考过程 · N 字」
- [x] MessageInput 带左侧 + 菜单 + 右下角模型 chip + focus brand ring
- [x] EmptyState 优先显示最近 5 条 prompt 历史
- [x] PermissionDialog 用品牌色描边 + 用 `<Button>` 组件
- [x] 长对话（50+ 消息）滚动流畅
- [x] 5 套主题验证

### Phase 4 完成标志（每页独立）

- [x] **SettingsView**：左侧 tab 列、Provider 折叠卡片、主题预览放大、字号实时预览
- [x] **SkillsView**：三栏布局（左侧分类 + 中间列表 + 右侧详情）、详情面板可编辑/删除
- [x] **MemoryView**：左侧 outline、Cmd+S 保存、底部状态栏
- [x] **McpView**：StatusDot 状态、EmptyHint 空态、品牌色按钮
- [x] **TerminalView**：subBar 工具条、字号选择、清屏按钮
- [x] **Onboarding**：侧栏式进度、终端样式日志窗口、返回按钮

---

## 附录：常见坑速查

| 坑 | 症状 | 处理 |
|---|---|---|
| Zustand selector 返回新数组 | React 19 #185 报错 | `useMemo` 包裹 selector 结果，依赖项用 `[currentSessionID, allMessages]` |
| Flex 容器高度坍塌 | xterm / virtuoso 不渲染 | 父容器加 `flex-1 min-h-0` |
| SSE 事件丢失 | message.part.delta 后 `applyMergedDelta` 引用错 | 检查 `chatStore.ts` 是否 import |
| 主题切换字体闪烁 | 5 个 selector 漏改 | grep 同时改 5 处 |
| Electron prod 黑屏 | file:// + ESM CORS | 已通过 `mimo-app://` 自定义协议解决，不要回退 |
| Windows 路径处理 | path.normalize 把 /a/b 当绝对路径 | 用 `replace(/^\//, '')` 而非 normalize |

---

**最后更新**：Phase 4 完成时（2026-06-20）
**维护者**：当前页面接手开发者请把每个 Task 完成情况打勾，并在 PR 描述里附 before/after 截图。
