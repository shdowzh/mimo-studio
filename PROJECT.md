# MiMo Studio — 项目文档

## 目录
1. [项目概述](#1-项目概述)
2. [设计理念](#2-设计理念)
3. [系统架构](#3-系统架构)
4. [技术栈](#4-技术栈)
5. [目录结构](#5-目录结构)
6. [核心模块详解](#6-核心模块详解)
7. [数据流](#7-数据流)
8. [通信协议](#8-通信协议)
9. [改动记录](#9-改动记录)
10. [操作手册](#10-操作手册)
11. [开发指南](#11-开发指南)

---

## 1. 项目概述

**MiMo Studio** 是小米 MiMo Code 的桌面客户端。MiMo Code 是一个 AI 编码 Agent，能够执行工具调用（读写文件、运行命令、搜索代码等），而不仅仅是聊天。本项目将其完整能力封装为跨平台桌面应用，提供简洁高效的交互界面。

### 核心目标
- **不是又一个聊天客户端** — 完整呈现 Agent 的工具调用、文件变更、权限请求
- **基于 MiMo Code 源码** — 深入研读 `github.com/XiaomiMiMo/MiMo-Code`，复用其 SSE 实时推送、Part 多态消息、Session 管理、Skill 发现等能力
- **开箱即用** — 内置 MiMo 免费模型，同时支持 OpenAI、Anthropic、DeepSeek、阿里百炼等外部 Provider
- **本地优先** — API Key 存储于本地 SQLite，不上传任何第三方

### 与 MiMo Code 的关系
```
MiMo Code (官方)          MiMo Studio (本项目)
┌─────────────────┐      ┌──────────────────────────┐
│  CLI / TUI       │      │  Electron 桌面应用          │
│  mimo serve (服务器) │◀────│  渲染器直连 HTTP/SSE       │
│  SSE 事件推送    │      │  Part 多态渲染             │
│  16 个内置技能   │      │  模型选择 & Provider 管理   │
│  Agent 循环      │      │  终端（PTY/本地）          │
└─────────────────┘      └──────────────────────────┘
```

---

## 2. 设计理念

### 2.1 瘦客户端原则
mimo serve 本身就是完整的 Agent 服务器。本项目**不重新实现**会话管理、Provider 管理、技能系统，而是通过 HTTP/SSE 直连复用其全部能力。

### 2.2 双模式运行
| 模式 | 通道 | 能力 |
|------|------|------|
| **Agent 模式** | mimo serve SSE | 完整 Agent：工具调用、文件 Diff、权限、16 个内置技能 |
| **直连模式** (Fallback) | 直接调 OpenAI/Anthropic API | 纯聊天：流式文本输出，无工具调用 |

模式切换对用户透明：mimo serve 在线 → Agent 模式；离线 → 自动 fallback。

### 2.3 Part 多态渲染
区别于传统聊天客户端的扁平 `{role, content}` 结构，MiMo Code 的消息由 **多态 Part** 组成：

```
Message
├── info (sessionID, role, model, tokens, cost)
└── parts[]
    ├── TextPart      → Markdown 渲染
    ├── ReasoningPart → 可折叠思考过程
    ├── ToolPart      → 工具调用卡片 (pending/running/completed/error)
    ├── StepStartPart / StepFinishPart → 步骤标记
    ├── FilePart      → 附件
    └── PatchPart     → 文件变更
```

### 2.4 模型配置模板化
不要求用户手动填写端点、模型 ID。8 个知名 Provider 预置模板，只需填入 API Key 即可使用。已配置的才出现在模型选择器中。

---

## 3. 系统架构

```
┌─────────────────────────────────────────────────────┐
│                   Electron Main Process             │
│  ┌──────────────┐  ┌────────────┐  ┌─────────────┐ │
│  │ mimo serve   │  │ SQLite     │  │ 终端 spawn  │ │
│  │ 进程管理     │  │ 设置/Key   │  │ cmd.exe     │ │
│  └──────────────┘  └────────────┘  └─────────────┘ │
│         │                │               │         │
│    IPC: mimo:start  IPC: settings:  IPC: terminal: │
│         │           get/set         create/write   │
└─────────┼────────────────┼───────────────┼─────────┘
          │                │               │
    preload.cjs (contextBridge)
          │                │               │
┌─────────┼────────────────┼───────────────┼─────────┐
│         ▼                ▼               ▼         │
│              Electron Renderer (React 19)           │
│  ┌──────────────────────────────────────────────┐   │
│  │               Zustand Stores                 │   │
│  │  chatStore │ uiStore │ themeStore            │   │
│  └──────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────┐   │
│  │              MimoClient (HTTP/SSE)            │   │
│  │  Session API │ Message API │ Skill API       │   │
│  │  Provider API │ PTY API    │ Permission API  │   │
│  └──────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────┐   │
│  │           directChat (Fallback)              │   │
│  │  OpenAI / Anthropic API streaming            │   │
│  └──────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────┐   │
│  │                     UI                        │   │
│  │  ChatView │ TerminalView │ SkillsView        │   │
│  │  SettingsView │ MemoryView │ McpView         │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 关键设计决策

**为什么渲染器直连 mimo serve 而不是通过 IPC 代理？**
- MiMo Code 官方桌面端也是这个架构（主进程启动服务器，渲染器直连）
- IPC 代理会增加延迟和复杂度
- SSE 事件需要低延迟实时推送，IPC 序列化/反序列化开销大

**为什么保留 SQLite？**
- 本地设置（主题、字体大小、Session 追踪列表、API Keys）需要持久化
- mimo serve 的 SQLite 存储的是完整的会话/消息/事件日志，属于服务端数据

**为什么有两种聊天模式？**
- Agent 模式依赖 `mimo serve` 进程（需要安装 MiMo CLI）
- 直连模式确保用户在没装 CLI 时也能用 OpenAI/Anthropic 聊天
- 自动切换，用户无需手动选择

---

## 4. 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Electron 35 |
| 前端 | React 19 + TypeScript 5.8 |
| 状态管理 | Zustand 5 |
| 样式 | Tailwind CSS 3 + CSS 变量主题 |
| 构建 | Vite 6 + electron-builder |
| 终端 | xterm.js 5 + PTY WebSocket / child_process |
| Markdown | marked + DOMPurify + react-syntax-highlighter |
| 本地存储 | better-sqlite3 |
| 图标 | lucide-react |

---

## 5. 目录结构

```
mimo-studio/
├── electron/                    # Electron 主进程
│   ├── main.cjs                 # 入口：窗口创建、IPC 注册、server 管理
│   ├── preload.cjs              # contextBridge：安全暴露 IPC API
│   └── services/
│       ├── streaming.cjs        # mimo serve 启动/停止（startMimoServe/stopMimoServe）
│       ├── database.cjs         # SQLite：settings 表
│       ├── files.cjs            # 文件 I/O：Memory、Skills 读写
│       ├── mimoInstaller.cjs    # MiMo CLI 检测与安装
│       └── secret.cjs            # safeStorage 封装（API Key 加密）
├── src/                         # 渲染进程
│   ├── lib/
│   │   ├── mimoTypes.ts         # 类型定义（Part 多态、SSE 事件、Session、Skill 等）
│   │   ├── mimoClient.ts        # HTTP/SSE 客户端：所有 mimo serve API 通信
│   │   ├── directChat.ts        # 直连 Provider API fallback（OpenAI/Anthropic）
│   │   ├── api.ts               # 便捷方法 + connectToServer
│   │   ├── ipc.ts               # ElectronAPI 类型定义 + isElectron/getAPI
│   │   ├── types.ts             # 重导出 + 本地类型
│   │   └── formatTime.ts        # 消息时间格式化
│   ├── stores/
│   │   ├── chatStore.ts         # 核心：消息、Session、SSE 事件处理、发送
│   │   ├── themeStore.ts        # system / light / dark 三态主题
│   │   ├── uiStore.ts           # 导航、侧边栏状态
│   │   └── skillsStore.ts       # 技能全局状态（搜索/SkillsView 共享）
│   ├── config/
│   │   └── providerTemplates.ts # 8 个知名 Provider 模板
│   ├── hooks/
│   │   └── useStream.ts         # 精简版流式 hook
│   ├── views/
│   │   ├── ChatView/
│   │   │   ├── index.tsx         # 入口：连接初始化
│   │   │   ├── ChatHeader.tsx    # 面包屑 + 状态徽标
│   │   │   ├── ChatStatusBar.tsx # 优先级整合的聊天状态横幅
│   │   │   ├── ConversationList.tsx # Session 列表（搜索/分组/右键菜单）
│   │   │   ├── MessageList.tsx   # 消息列表 + 权限浮层
│   │   │   ├── MessageBubble.tsx # Part 多态渲染（双边气泡）
│   │   │   ├── MessageInput.tsx  # 大卡片输入框
│   │   │   ├── ContextUsageBar.tsx # 上下文 token 提示
│   │   │   ├── ModelPicker.tsx   # 模型选择器
│   │   │   ├── EmptyState.tsx    # 空状态
│   │   │   ├── ToolCallCard.tsx  # 工具调用卡片
│   │   │   └── PermissionDialog.tsx # 权限确认对话框
│   │   ├── TerminalView/        # xterm.js 终端
│   │   ├── SkillsView/          # 技能浏览/下载
│   │   ├── SettingsView/        # 外观 + Provider 配置 + 关于
│   │   ├── MemoryView/          # 记忆文件编辑
│   │   └── McpView/             # MCP 服务器管理
│   ├── components/
│   │   ├── Onboarding/          # 首次启动引导
│   │   ├── Sidebar/             # 导航侧边栏
│   │   │   ├── index.tsx        # 220px 宽侧边栏
│   │   │   └── SidebarItem.tsx  # 展开/折叠双态导航项
│   │   ├── Layout/              # 布局
│   │   │   ├── AppLayout.tsx    # 全局布局骨架
│   │   │   ├── AppHeader.tsx    # 全局顶栏：搜索/主题/窗口控件
│   │   │   └── GlobalSearch.tsx # ⌘K 全局搜索
│   │   └── ui/                  # 通用组件 (Button/Input/Modal/Toast/Spinner/StatusDot/EmptyHint/ContextMenu/WindowControls)
│   ├── styles/
│   │   └── globals.css          # light/dark 主题 CSS 变量 + 通用样式
│   ├── App.tsx                  # 根组件
│   └── main.tsx                 # 入口
├── build/                       # 应用图标
│   ├── icon.png                 # macOS 图标源（1024×1024）
│   ├── icon.ico                 # Windows 图标
│   └── generate_icon.py         # 图标生成脚本（Pillow）
├── package.json
├── index.html
├── tailwind.config.js
├── vite.config.ts
├── tsconfig.json
├── .gitee-ci.yml                # Gitee CI 流水线（Linux 构建+发布）
├── .github/workflows/
│   ├── ci.yml                   # GitHub CI：lint + typecheck + test + build
│   └── release.yml              # GitHub Release：全平台构建 + 码云上传
└── PROJECT.md                   # 本文档
```

---

## 6. 核心模块详解

### 6.1 mimoClient.ts — HTTP/SSE 客户端

```typescript
class MimoClient {
  // 生命周期
  connect(port: number, password?: string): void
  disconnect(): void
  get isConnected(): boolean

  // SSE 事件订阅
  on(eventType: string, handler: EventHandler): () => void

  // Session API
  listSessions(): Promise<SessionInfo[]>
  createSession(opts?): Promise<SessionInfo>
  getSession(sessionID): Promise<SessionInfo>
  deleteSession(sessionID): Promise<void>

  // Message API
  sendMessage(sessionID, parts, opts?): Promise<void>  // prompt_async → 204
  getMessages(sessionID, opts?): Promise<MessageWithParts[]>
  abortSession(sessionID): Promise<void>

  // Permission
  replyPermission(sessionID, permID, reply): Promise<void>

  // Skill
  listSkills(): Promise<SkillInfo[]>

  // Provider
  listProviders(): Promise<ProviderListResult>

  // PTY
  createPty(opts?): Promise<{ id: string }>
  connectPty(ptyID): WebSocket

  // Health
  health(): Promise<HealthResponse>
}
```

**SSE 解析细节：**
- 连接 `GET /global/event`，使用 `fetch` + `ReadableStream`
- 心跳检测：15 秒无事件 → 自动重连（250ms 退避）
- SyncEvent 解包：`{type:"sync", syncEvent:{type:"message.updated.v1", data:{...}}}` → 去除 `.v1` 后缀 → 转为 BusEvent 格式分发

### 6.2 chatStore.ts — 核心状态管理

```typescript
interface ChatState {
  serverConnected: boolean      // mimo serve 连接状态
  currentSessionID: string|null  // 当前会话
  sessions: SessionInfo[]       // 本应用创建的 Session 列表
  messages: Record<string, MessageWithParts[]>  // sessionID → messages
  sessionStatus: Record<string, SessionStatusInfo>  // idle/busy/retry
  permissionRequests: Record<string, PermissionRequest[]>
  sessionDiffs: Record<string, FileDiff[]>

  currentProvider: string       // 当前选中的 Provider
  currentModel: string          // 当前选中的模型

  sendMessage(text): Promise<void>
  initSSE(): () => void         // 注册 SSE 事件处理，返回 unsubscribe
  loadSessions(): Promise<void>
  loadMessages(sessionID): Promise<void>
}
```

**sendMessage 双模式逻辑：**
```
用户发送消息
    ↓
serverConnected && mimoClient.isConnected?
    ├── YES → 创建服务端 Session → POST prompt_async → 等 SSE 推送
    └── NO  → 检查 API Keys → directChat() 流式调用 → 本地更新消息
```

**SSE 事件 → Store 映射：**

| SSE 事件 | Store 操作 |
|----------|-----------|
| `message.part.delta` | 增量追加 part.text |
| `message.part.updated` | 替换/插入 part |
| `message.updated` | 创建/更新消息 |
| `session.status` | 更新 busy/idle 状态 |
| `permission.asked` | 添加到 permissionRequests |
| `session.diff` | 存储文件变更 |
| `session.error` | 显示错误提示 |

### 6.3 MessageBubble.tsx — Part 多态渲染

**分组策略：**
```
parts 列表
    ↓ groupPartsBySteps()
    ├── preStep: 第一个 step-start 之前的 parts (reasoning)
    ├── steps[]: 每对 step-start/step-finish 之间
    │   ├── tool → ToolCallCard
    │   ├── text → Markdown
    │   └── reasoning → ReasoningBlock
    └── postStep: 最后一个 step-finish 之后的 parts (text)
```

**ToolCallCard 状态：**
| 状态 | 图标 | 显示 |
|------|------|------|
| pending | 脉冲圆点 | "正在调用 {tool}..." |
| running | 旋转 spinner | "执行 {tool}..." + 耗时 |
| completed | ✓ 绿色勾 | 展开：input/output |
| error | ✗ 红色叉 | 错误信息 |

### 6.4 主题系统

3 套主题通过 CSS 变量实现，`<html data-theme="...">` 切换：
- `system` — 跟随 OS 自动解析为 light 或 dark
- `light` — 浅色 + 珊瑚粉品牌色
- `dark` — Zinc 色系深色 + 珊瑚粉品牌色

所有组件使用 `mc-*` 前缀的 Tailwind 颜色类，映射到 CSS 变量。

---

## 7. 数据流

### 7.1 Agent 模式消息流
```
用户输入 "帮我创建一个 React 组件"
    ↓
MessageInput → chatStore.sendMessage(text)
    ↓
serverConnected? YES
    ↓
mimoClient.createSession({title}) → POST /session → 返回 SessionInfo
    ↓
mimoClient.sendMessage(sessionID, [{type:'text', text}]) → POST prompt_async → 204
    ↓
mimo serve Agent 循环开始：
    推理 → 工具调用(read_file/write_file/bash) → 代码生成
    ↓ 发布 SSE 事件
    ↓
MimoClient SSE 监听 → 解包 SyncEvent → dispatchEvent
    ↓
chatStore 事件处理：
    message.part.delta → 逐字追加 text
    message.part.updated (tool:running) → ToolCallCard 显示 spinner
    message.part.updated (tool:completed) → ToolCallCard 显示结果
    message.part.updated (text) → Markdown 渲染
    permission.asked → PermissionDialog 弹出
    session.status (idle) → 隐藏 busy 指示器
    ↓
MessageBubble 重渲染，显示每一步的工具调用和文本输出
```

### 7.2 直连模式消息流
```
用户输入 "你好"
    ↓
store.sendMessage(text)
    ↓
serverConnected? NO
    ↓
loadConfiguredKeys() → 获取已配置的 API Keys
    ↓
directChat(providerId, modelId, messages, callbacks)
    ├── OpenAI: fetch POST /chat/completions (stream:true) → SSE 解析
    └── Anthropic: fetch POST /messages (stream:true) → SSE 解析
    ↓
onTextDelta → store 更新 part.text（逐字追加）
onDone → store 写入完整消息 + idle 状态
```

---

## 8. 通信协议

### 8.1 mimo serve HTTP API（实例路由）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/session` | 列出所有 Session |
| `POST` | `/session` | 创建 Session |
| `GET` | `/session/:id` | 获取 Session 详情 |
| `DELETE` | `/session/:id` | 删除 Session |
| `PATCH` | `/session/:id` | 更新 Session（标题/权限/存档） |
| `GET` | `/session/:id/message` | 获取消息列表（分页） |
| `POST` | `/session/:id/prompt_async` | 发送消息（异步，返回 204） |
| `POST` | `/session/:id/abort` | 中止执行 |
| `POST` | `/session/:id/permissions/:pid` | 回复权限请求 |
| `GET` | `/session/:id/diff` | 获取文件变更 Diff |
| `GET` | `/skill` | 列出所有技能 |
| `GET` | `/provider/` | 列出所有 Provider |
| `GET` | `/agent` | 列出所有 Agent |
| `GET` | `/pty/` | 列出 PTY 会话 |
| `POST` | `/pty/` | 创建 PTY 会话 |
| `GET` | `/pty/:id/connect` | PTY WebSocket 连接 |
| `GET` | `/global/health` | 健康检查 |
| `GET` | `/global/event` | **SSE 事件流**（核心实时通道） |

### 8.2 SSE 事件类型

**Global SSE (`GET /global/event`)：**
```json
{
  "directory": "/path/to/worktree",
  "project": "proj-id",
  "payload": {
    "type": "message.part.delta",
    "properties": { "sessionID": "...", "messageID": "...", "partID": "...", "field": "text", "delta": "Hello" }
  }
}
```

**SyncEvent 格式（需解包）：**
```json
{
  "payload": {
    "type": "sync",
    "syncEvent": {
      "type": "message.updated.v1",
      "id": "evt-123",
      "seq": 42,
      "aggregateID": "session-456",
      "data": { "sessionID": "session-456", "info": {...} }
    }
  }
}
```

**关键事件：**
| 事件 | 含义 |
|------|------|
| `message.part.delta` | 逐字流式推送 |
| `message.part.updated` | Part 完整更新（工具状态变更） |
| `message.updated` | 消息创建/完成 |
| `message.removed` | 消息删除 |
| `session.created` | 新 Session |
| `session.updated` | Session 变更 |
| `session.deleted` | Session 删除 |
| `session.status` | Agent 状态（idle/busy/retry） |
| `session.diff` | 文件变更 |
| `session.error` | 错误通知 |
| `permission.asked` | 权限请求 |
| `permission.replied` | 权限回复 |
| `server.connected` | 初始连接确认 |
| `server.heartbeat` | 心跳（10s 间隔） |

### 8.3 Electron IPC 通道

| 通道 | 方向 | 说明 |
|------|------|------|
| `mimo:startServer` | renderer→main | 启动 mimo serve，返回 `{port, password}` |
| `mimo:stopServer` | renderer→main | 停止 mimo serve |
| `mimo:serverStatus` | renderer→main | 查询 server 状态 |
| `mimo:detect` | renderer→main | 检测 CLI 安装状态 |
| `mimo:install` | renderer→main | 安装 CLI |
| `settings:get` | renderer→main | 读取设置 |
| `settings:set` | renderer→main | 写入设置 |
| `terminal:create` | renderer→main | 创建本地终端，返回 id |
| `terminal:write` | renderer→main | 写入 stdin |
| `terminal:data:{id}` | main→renderer | stdout 输出 |
| `terminal:exit:{id}` | main→renderer | 进程退出 |
| `terminal:kill` | renderer→main | 终止终端 |
| `files:readSkills` | renderer→main | 读取技能文件列表 |
| `files:writeSkill` | renderer→main | 写入技能文件 |
| `files:deleteSkill` | renderer→main | 删除技能文件 |
| `files:readMemory` | renderer→main | 读取记忆文件 |
| `files:writeMemory` | renderer→main | 写入记忆文件 |

---

## 9. 改动记录

### V1 → V2 架构重构（2026-06-14）

**背景：** 初始版本自建了 SQLite 会话管理、自定义 IPC 流式协议、硬编码 Provider、手动技能系统，但未复用 mimo serve 的核心能力。通过深入研读 MiMo-Code 源码发现消息是 Part 多态结构、SSE 是主要实时通道、服务端自带技能发现和 Provider 管理。

**核心变更：**

| 模块 | 旧实现 | 新实现 |
|------|--------|--------|
| 通信层 | Renderer→IPC→Main→mimo serve (阻塞HTTP) | Renderer→HTTP/SSE→mimo serve (直连) |
| 流式推送 | `chat:chunk/done/error` 自定义 IPC 事件 | SSE `message.part.delta` 逐字推送 |
| 消息结构 | `Message { content: string }` 扁平 | Part 多态（text/reasoning/tool/step-* 等 10 种） |
| 会话管理 | 自建 SQLite conversations/messages 表 | 服务端 Session API + SSE 实时同步 |
| 技能系统 | `builtinSkills.ts` 写死 4 个 | `GET /skill` 加载 16+ compose 技能 |
| Provider | `config/models.ts` 硬编码 4 个 | 模板化 8 个 + mimo serve 原生 Provider API |
| 工具调用 | 无 | ToolCallCard 可视化 + PermissionDialog |
| Agent 元数据 | `streamingMeta: any[]` hack | 原生 part 类型（step-start/step-finish） |
| 终端 | IPC stub | PTY WebSocket + 本地 cmd.exe 双模式 |
| IPC 层 | 30+ 通道 | 精简到 20 通道（移除聊天相关） |

**新建文件：**
- `src/lib/mimoTypes.ts` — 完整 Part/SSE/Session 类型定义
- `src/lib/mimoClient.ts` — HTTP/SSE 客户端
- `src/lib/directChat.ts` — 直连 Provider Fallback
- `src/views/ChatView/ToolCallCard.tsx` — 工具调用可视化
- `src/views/ChatView/PermissionDialog.tsx` — 权限确认
- `src/config/providerTemplates.ts` — Provider 模板

**重写文件：**
- `src/stores/chatStore.ts` — SQLite→SSE 驱动
- `src/views/ChatView/MessageBubble.tsx` — Part 多态渲染
- `src/views/ChatView/ChatHeader.tsx` — 模型选择器
- `src/views/ChatView/ConversationList.tsx` — Session API
- `src/views/SkillsView/index.tsx` — mimo serve Skill API
- `src/views/SettingsView/index.tsx` — 模板化 Provider 配置
- `src/views/TerminalView/index.tsx` — PTY+本地双模式
- `electron/main.cjs` — 精简 IPC + server 管理 + 本地终端
- `electron/preload.cjs` — 精简 IPC 桥接

**删除文件：**
- `src/config/builtinSkills.ts` — 被 mimo serve Skill API 替代
- `src/config/models.ts` — 被 providerTemplates 替代
- `src/config/theme.ts` — inline 到 themeStore
- `src/views/ChatView/AddProviderModal.tsx` — 合并到 SettingsView

### V2 → V3 功能完善（2026-06-14）

**核心变更：**

| 模块 | 旧实现 | 新实现 |
|------|--------|--------|
| 模型选择 | isActive 加载时固化，切换无响应 | 动态计算 currentProvider/currentModel，选中立即反映 |
| 模型获取 | 仅硬编码 Provider 模板 | 并行从 Provider API 动态拉取 + 模板回退 |
| API Key | 仅存本地 SQLite | 本地存储 + 自动同步到 MiMo Serve（PUT /auth） |
| 聊天模式 | 无视觉区分 | 横幅标识：在线 Agent 模式 vs 离线纯文本模式 |
| Fallback 对话 | 无上下文 | 注入 USER.md/MEMORY.md/Skills 作为 system prompt |
| Provider | 仅 7 个模板 | +自定义 OpenAI 兼容 Provider（Ollama 等） |
| 错误处理 | lastError 不显示 | 红色错误横幅 + 可关闭 |
| 终端 | xterm CSS 未导入，PTY 报错 | 导入 CSS，PTY 失败静默回退本地终端 |
| MiMo 模型 | 离线时消失 | 始终显示，离线标注"需连接" |

**新建文件：**
- `src/lib/providerModels.ts` — Provider API 动态模型获取
- `scripts/release.cjs` — 跨平台发布脚本
- `README.md` / `LICENSE` / `CONTRIBUTING.md` — 开源文档

**修改文件：**
- `src/views/ChatView/ChatHeader.tsx` — 动态 isActive、始终显示 MiMo、并行加载
- `src/views/ChatView/index.tsx` — 模式横幅、错误显示
- `src/lib/directChat.ts` — 模板 Provider 支持、Anthropic system prompt
- `src/lib/mimoClient.ts` — setAuth/removeAuth API
- `src/lib/api.ts` — 连接时自动同步 Key
- `src/stores/chatStore.ts` — 发消息前同步 Key、错误恢复、Memory+Skill 注入
- `src/stores/uiStore.ts` — settingsTab 状态
- `src/views/SettingsView/index.tsx` — Key 同步、自定义 Provider
- `src/views/TerminalView/index.tsx` — CSS 导入、PTY 回退、错误显示
- `src/main.tsx` — xterm CSS 导入
- `electron/services/files.cjs` — bootstrap 完整 workflow 模板

### V3 → V4 稳定性与体验（2026-06-14）

**核心变更：**

| 模块 | 旧实现 | 新实现 |
|------|--------|--------|
| 进程退出 | `mimoServeProcess.kill()` | 确认弹窗 + `taskkill /f /t` 杀进程树，不再残留 |
| 模型路由 | MiMo 模型=Agent，外部模型=直连 | 在线时所有模型统一经 MiMo Code Provider 系统 |
| 空状态 | 显示"正在连接..."，快捷提示禁用 | 智能引导：安装 CLI 或配置 API Key |
| MiMo CLI | 仅在引导中安装，跳过无法再装 | 设置 → MiMo Serve 区域常驻安装按钮 |
| 崩溃 | terminalSessions 作用域错误导致退出崩溃 | 提升到模块顶层作用域 |
| 制品 | 仅 NSIS 安装包 | NSIS 安装包 + Portable tar.xz 免安装版 + macOS DMG (x64/arm64，内置 MiMo CLI) |
| 文件锁 | 退出后 mimo 进程残留锁住文件 | 退出时 `taskkill /f /t /im mimo.exe` 彻底清理 |

**修改文件：**
- `electron/main.cjs` — 关闭确认弹窗、taskkill 杀进程树、terminalSessions 作用域修复
- `src/views/ChatView/index.tsx` — Agent 模式判定改为仅看 serverConnected
- `src/views/ChatView/ChatHeader.tsx` — 模型分组标签统一
- `src/views/ChatView/EmptyState.tsx` — 新用户引导（安装 CLI / 配置 Key）
- `src/views/SettingsView/index.tsx` — MimoCliInstall 组件
- `README.md` / `package.json` — 制品列表、构建目标更新
- `.github/workflows/release.yml` — 全平台 CI
- `~/.mimocode/MEMORY.md` — 引用 [[mimo-workflow]] 技能

### V4 → V5 macOS 构建与启动体验（2026-06-15）

**核心变更：**

| 模块 | 旧实现 | 新实现 |
|------|--------|--------|
| macOS 构建 | DMG 打包失败（图标太小 + 无代码签名 + 缺 vite build） | 图标放大到 1024px + 跳过签名 + CI 加 vite build 步骤 |
| MiMo CLI 安装 | 引导页从 GitHub 下载（国内慢，30+ 秒） | 内置 CLI 秒装 → Gitee 镜像 → GitHub → npm |
| CLI 覆盖 | 无检查，直接覆盖已安装版本 | 检测已有版本，已装则跳过避免降级 |
| 启动速度 | `connectToServer()` 阻塞 UI 渲染，黑屏数秒 | 异步连接，UI 先渲染，后台建立连接 |
| CLI 未安装 | `spawn('mimo')` 失败后等 15 秒超时 | 启动前先 `mimoDetect()`，未装直接跳过 |
| 服务初始化 | 连接即显示"Agent 模式"（实际技能不可用） | `serverReady` 状态：初始化中蓝色横幅 → 完成后绿色 Agent 模式 |
| macOS 布局 | 交通灯按钮被对话列表遮挡 | 所有视图顶部加 36px drag region |
| 技能加载 | mimo serve 初始化期间技能列表空 | `serverReady` 后自动刷新技能 |
| Electron 下载 | 默认从 GitHub 下载二进制（国内慢） | `.npmrc` 配置 npmmirror 镜像 |

**新建/修改文件：**
- `build/icon.png` — 256×256 → 1024×1024
- `electron/services/mimoInstaller.cjs` — `installFromBundled()` + Gitee 镜像 + 已安装检测
- `electron/services/streaming.cjs` — CLI 不存在时自动从内置安装
- `src/lib/api.ts` — `connectToServer()` 改为非阻塞
- `src/stores/chatStore.ts` — `serverReady` 状态 + 初始化完成自动加载 sessions/skills
- `src/views/ChatView/index.tsx` — 初始化中蓝色横幅 + Agent 模式用 `serverReady` 判断
- `src/views/ChatView/EmptyState.tsx` — 初始化中/连接中/离线三种文案
- `src/views/ChatView/ConversationList.tsx` — 顶部 drag region + 对话标题上移
- `src/views/ChatView/ChatHeader.tsx` — 顶部 padding 对齐
- `src/views/*/index.tsx` — 所有视图加 36px drag region
- `scripts/release.cjs` — 构建前自动下载 MiMo CLI
- `.github/workflows/release.yml` — 三平台下载 CLI + vite build + 跳过 >100MB Gitee 上传
- `.gitignore` — 排除 `cli/` 目录

### V5 → V6 稳定性与体验优化（2026-06-16）

**Bug 修复：**

| 模块 | 问题 | 修复 |
|------|------|------|
| directChat Fallback | `abortController` 未定义导致消息发送必然崩溃 | 模块级 `currentAbortController`，`sendMessage` 声明 + `finally` 清理，`abortSession` 优先 abort fallback |
| CLI 安装 | `execFileSync` 未导入导致版本检测静默失败 | 补充 import |
| CLI 安装 | `streaming.cjs` 调用 `mimoInstall(null)` 丢弃所有进度消息 | 新增 `installSilent()` 函数，控制台输出安装日志 |
| 连接状态 | `mimoClient.connect()` 覆盖 `onConnectionChange` 导致 zustand 不同步 | 改为 `Set` 多回调模式，`notifyConnectionChange()` 遍历通知 |
| 自动安装 | `autoInstallIfNeeded` 定义但无人调用 | `main.cjs` 启动时调用；`preload.cjs` 桥接 `mimo:status` 事件 |
| 初始化超时 | `serverReady` 30s 盲超时设 true 导致虚假就绪 | 超时设 `initError` 错误状态 + `retryInit()` 重试 |
| 连接重试 | `connectToServer` 一次失败永久离线 | 3 次指数退避重试（1s/2s/4s）+ EmptyState 重试按钮 |
| 设置页 | `serverOk` 一次性检查，服务器上线后不更新 | 改用 zustand 响应式订阅 `serverConnected` / `serverReady` |

**体验优化：**

| 模块 | 旧实现 | 新实现 |
|------|--------|--------|
| 技能商店 | 特色卡片点击打开空 URL 输入弹窗 | 直接下载（15s 超时 + YAML 验证 + Toast 通知） |
| CLI 安装进度 | 原始文本 + pulse 动画 | 百分比解析 → 真实进度条 + 步骤标签 |
| CLI 下载可靠性 | 每源无重试无整体超时（累计可达 10 分钟） | 每源 2 次重试 + 5 分钟整体超时 + `Promise.race` |
| 安装后体验 | 安装完无反应，用户需手动切换 | 安装成功自动调用 `connectToServer()` + 显示连接过渡状态 |
| 安装代码 | SettingsView 和 Onboarding 两套重复实现 | 提取共享 `useMimoInstaller` Hook |
| Windows 安装 | `oneClick: true` 无法选目录 | `oneClick: false` + `allowToChangeInstallationDirectory: true` |
| 服务端嵌入 | 仅 spawn 模式 | 新增 `startEmbedded()` 支持直接 import opencode 编译产物（`opencode-dist/`），spawn 保留为 fallback |

**新建文件：**
- `src/hooks/useMimoInstaller.ts` — 共享 CLI 安装 Hook（状态检测/下载进度/自动重试/安装后连接）
- `scripts/build-opencode.cjs` — 从 MiMo Code fork 编译嵌入模式服务端

**修改文件：**
- `electron/services/streaming.cjs` — 嵌入模式 + spawn fallback 双模式重构 + `installSilent`
- `electron/services/mimoInstaller.cjs` — 修复 `execFileSync` + `installSilent` + 下载重试 + 整体超时
- `electron/main.cjs` — `autoInstallIfNeeded` 调用 + `getServeMode` 导入
- `electron/preload.cjs` — 桥接 `mimo:status` 事件
- `src/stores/chatStore.ts` — `abortController` + `initError` + `retryInit` + `serveMode`
- `src/lib/mimoClient.ts` — `onConnectionChange` 多回调模式
- `src/lib/api.ts` — 连接重试 + 响应式 `serveMode` 同步 + 移除旧 monkey-patch
- `src/lib/ipc.ts` — `serverStatus.mode` / `onStatus` 类型
- `src/App.tsx` — 改用 `mimoClient.onConnectionChange()`
- `src/views/ChatView/index.tsx` — `initError` 横幅 + 重试按钮 + `serveMode` 标识
- `src/views/ChatView/EmptyState.tsx` — `initError` 提示 + 重试连接按钮
- `src/views/SettingsView/index.tsx` — 响应式 `serverOk` + 进度条 + `useMimoInstaller`
- `src/views/SkillsView/index.tsx` — 直接下载 + 超时验证 + Toast
- `src/components/Onboarding/index.tsx` — 进度条 + `useMimoInstaller`
- `package.json` — NSIS 安装目录选择 + `opencode:build` 脚本 + `opencode-dist/` 打包配置
- `scripts/release.cjs` — 构建前尝试编译 opencode
- `.gitignore` — 排除 `opencode-dist/`

### V6 → V7 打包后启动黑屏与对话流稳定性（2026-06-18）

**背景：** V6 打包后双击 exe 出现黑屏不显示界面，即使界面出来也卡在「正在初始化 MiMo 服务...」、对话发出后无回复、技能页打开崩溃、终端不可用。逐项排查后发现一连串相互独立的问题，从 Electron 协议加载、SSE 鉴权、状态机、SSE 事件批量更新顺序到服务端 PTY 路径都有 bug。

**故障根因（排查顺序）：**

| # | 现象 | 根因 |
|---|------|------|
| 1 | 双击 exe 黑屏，无任何报错 | Electron 用 `file://` 加载页面，`<script type="module">` 触发 CORS 检查，`file://` 不返 CORS 头被 Chromium 拦截 |
| 2 | electron-updater 抛 `ENOENT app-update.yml` | 打包配置缺少 `publish` 字段时 `electron-updater` 直接 require 即抛 |
| 3 | 启动失败完全静默 | `app.whenReady` 链没有 try-catch，初始化任意一步抛错窗口都不出现 |
| 4 | SSE 流到来后渲染层 ReferenceError | `chatStore.ts` 用了 `applyMergedDelta` 但漏 import |
| 5 | 自定义 Provider 保存失败 | `SettingsView` 用 `useState` 解构出 `setApiKey`，遮蔽了 `@/lib/secret` 同名函数 |
| 6 | 技能页一打开就 `Cannot read properties of undefined (reading 'includes')` | 本地 `files.cjs` 的 `readSkills()` 返回的对象缺 `location` 字段，渲染层直接调 `skill.location.includes('.bundle')` 崩溃 |
| 7 | 自定义协议返回 403 | `path.normalize('/dist/index.html')` 在 Windows 上被解释为绝对路径 `D:\dist\...`，落到 baseDir 之外被防穿越拦截 |
| 8 | SSE 始终 401 | streaming.cjs 给 `MIMOCODE_SERVER_PASSWORD` 生成了随机密码，但 mimo serve 的 `/global/event` 仅在空密码时放行，密码注入反而打破契约 |
| 9 | 服务卡在「正在初始化」 | SSE 401 后没通知 `connectionChange(false)`，store 永远停在 `initializing` |
| 10 | 第一句回复后续不更新 | rAF 批量更新里同帧 `message.updated` 被同帧 `part.updated` 浅合并覆盖；`pendingUpdates.reduce({...})` 浅合并 `messages` 字段直接丢失先到的更新 |
| 11 | 一直「Agent 执行中」无法发新消息 | `session.idle` 事件未注册 handler，busy 状态无法回到 idle |
| 12 | 消息已到达但界面不显示 | Virtuoso 容器 `flex-1` 但父容器 flex 收缩导致高度为 0，频繁报 `Zero-sized element` 警告 |
| 13 | `applyMergedDelta` 直接 mutate part 对象 | Zustand 浅比较看不到引用变化，渲染层不更新 |
| 14 | 终端开不起来 | mimo serve PTY 接口路径是 `/pty`，旧代码写成 `/pty/`，服务端返 503「Web UI is temporarily unavailable」，fallback 到本地 cmd 又不是真 PTY |

**关键修复：**

| 模块 | 旧实现 | 新实现 |
|------|--------|--------|
| 协议加载 | `mainWindow.loadFile()` 走 file:// | 注册 `mimo-app://` 自定义协议（`registerSchemesAsPrivileged` + `protocol.handle`），返回 `Access-Control-Allow-Origin: *`，所有静态资源走该协议 |
| 路径解析 | `path.normalize(url.pathname.replace(/^\/app\//, ''))` | `replace(/^\//, '')` 去前导 `/` 避免 Windows 把 pathname 当绝对路径 |
| 启动健壮性 | 无错误兜底 | `app.whenReady` 全程 try-catch + `dialog.showErrorBox` + `process.on('uncaughtException')` 兜底；electron-updater 加 try/catch require + 调用前空值检查 |
| 文件日志 | 无 | `mimo-debug.log` 写到 exe 同目录，记录主进程事件 + 渲染进程 console + 协议每次请求 + WebContents `did-fail-load` |
| Serve 密码 | 随机 32 byte | 强制空密码（mimo serve 的 SSE 端点契约）|
| `applyMergedDelta` 导入 | 缺 | `chatStore.ts` 导入 |
| `applyMergedDelta` 实现 | mutate 原 part | 不可变更新（新 parts、新 msg、新 messages map） |
| SSE 批量更新 | rAF 队列 + reduce 浅合并 | 非 delta 事件即时 set；delta 走 rAF 队列；处理 delta 时若有未刷的 message.updated 走最新 state |
| `handlePartUpdated` | sessionMsgs 不存在直接 return null | sessionMsgs 不存在时创建 placeholder message，等 `message.updated` 补齐 info |
| `session.idle` | 无 handler | 新增 `handleSessionIdle`，sessionID 缺失时用 `state.currentSessionID` 兜底 |
| `session.status` | 假定 `payload.properties.status` | 兼容 raw payload + `status` / `type` 两种结构 |
| SSE 401 | 不通知 store | 通知 `connectionChange(false)`，状态机退出 initializing |
| 消息列表 | react-virtuoso（容器高度 0 时不渲染） | 普通滚动列表 + auto scroll-to-bottom；移除虚拟滚动避免高度依赖 |
| `skill.location` | 渲染层假定存在 | 服务端返回的本地技能现在带 `location: <skillsDir/name>`；渲染层加 `(skill.location \|\| '')` 兜底 |
| Settings setApiKey 遮蔽 | `setApiKey` 与 import 同名 | 重命名 useState setter 为 `setApiKeyInput` |
| 终端 PTY 路径 | `/pty/` | `/pty`（trailing slash 触发 503）|
| 终端 fallback shell | `windowsHide: true` 无 args | `windowsHide: false`，cmd 加 `/K` 保持交互 |
| 终端容器 | `flex-1` | `flex-1 + minHeight: 0`，避免 flex 收缩导致 xterm 容器高度 0 |
| 直连模式用户消息 | onTextDelta 才入 store | 进入 `sendViaDirectChat` 立即把 user message 写入 store；directChat `onDone` 把返回消息的 `id/sessionID` 规范化到 placeholder ID |
| ChatView showEmpty | `messages[currentSessionID]?.length`（messages 已经是数组） | `!messages.length` |
| ChatView messages selector | 每次返回新数组导致 React 18 抛 #185 | `useMemo([currentSessionID, allMessages])` |

**新建文件：**
- 无（全部为修复，未新增模块）

**修改文件：**
- `electron/main.cjs` — 自定义协议 + path 兜底 + 启动 try-catch + 全局异常 handler + 文件日志 + electron-updater 安全加载
- `electron/services/streaming.cjs` — 强制空密码（保留 `getMimoServePassword` 兼容已调用点）
- `electron/services/files.cjs` — 本地技能补 `location` 字段
- `index.html` — 启动期诊断 overlay（加载中 / JS 错误 / 模块加载失败 / 3s 后 root 仍为空），方便用户在 prod 排错
- `src/main.tsx` — React 渲染前隐藏诊断 loading
- `vite.config.ts` — `transformIndexHtml` 移除 `crossorigin` 属性（防御性，配合协议改造）
- `src/App.tsx` — `mimoClient.onConnectionChange` 触发 `retryInit()`，避免依赖 `server.connected` SSE 事件
- `src/lib/mimoClient.ts` — SSE 401 通知 `connectionChange(false)`、不带 `properties` 时自动展平 raw 字段、`pty/` → `pty`
- `src/stores/chatStore.ts` — 即时 set 非 delta 事件 + rAF 仅 delta + 多次 delta 合并使用最新 state + `applyMergedDelta` 导入
- `src/stores/sseHandlers.ts` — `applyMergedDelta` 改为不可变更新；`handlePartUpdated` 创建 placeholder；新增 `handleSessionIdle`；`handleSessionStatus` 兜底
- `src/stores/chatFlow.ts` — 直连用户消息立即入 store；`onDone` 规范化 final 消息 id/sessionID
- `src/views/ChatView/index.tsx` — `showEmpty` 修正 + messages selector `useMemo`
- `src/views/ChatView/MessageList.tsx` — react-virtuoso → 普通滚动列表 + auto-scroll
- `src/views/ChatView/ToolCallCard.tsx` — `toolName` 兜底防 undefined.includes
- `src/views/SettingsView/index.tsx` — `useState setApiKey` 改名 `setApiKeyInput`
- `src/views/SkillsView/index.tsx` — `skill.location` 兜底
- `src/views/TerminalView/index.tsx` — 容器 `minHeight: 0`，setup 加 try-catch
- `package.json` — 版本 1.0.0 → 1.1.0

**调试与诊断方案（沉淀）：**
- 凡是 prod 黑屏 / 无报错的问题，**先加 `mimo-debug.log` 文件日志**（exe 同目录），把主进程 + 渲染进程 console + 协议请求 + WebContents fail/finish 事件全写进去。比凭直觉改代码省 5 倍以上时间。
- Electron 主进程加载 ESM 必须用自定义协议或 dev server，`file://` 不行。
- SSE rAF 批量更新需要保证「依赖事件先 set」+「自身事件再合并」的顺序；reduce 浅合并 `messages` 是隐式 bug。
- 不可变更新原则：handler 内不能 mutate 入参，否则 zustand/React 渲染失效。
- 服务端 API 路径要逐个测，trailing slash 是常见 503 来源。

### V7 → V8 CI/CD 与制品优化（2026-06-19）

**背景：** GitHub Actions 流水线从未成功跑通过，码云 Release 上传持续失败，macOS DMG 体积达 225MB 远超码云 100MB 限制。逐个修复 CI 配置、ESLint/Typecheck/Test 错误、electron-builder 自动发布报错，移除内置 MiMo CLI 减小包体积，新增 macOS tar.xz 格式适配码云分发。

**CI 修复（共 4 轮迭代 v1.1.1→v1.1.6）：**

| 轮次 | 问题 | 修复 |
|------|------|------|
| v1.1.1 | ESLint 12 error + 88 warning 导致 `npm run lint` 失败 | 降级 `react-hooks` error→warn；修复 `no-useless-assignment` 和测试文件 TypeScript 错误 |
| v1.1.1 | `chatStore.test.ts` 引用已移除的 `serverConnected`/`serverReady` 属性 | 改为 `serverState.status` 结构 |
| v1.1.1 | `providerModels.ts` 死代码赋值 | 移除不可达的 `= []` 初始化 |
| v1.1.2 | 所有平台 electron-builder 报 `GH_TOKEN not set` | `package.json` 的 `publish.owner/repo` 指向了 `XiaomiMiMo/MiMo-Code`，且 CI 未设 `--publish never` |
| v1.1.2 | Release 缺少 tar.xz 制品上传 | Windows/Linux 构建产 tar.xz 但未 upload-artifact |
| v1.1.3 | Gitee 上传脚本 `python3 -c` JSON 解析崩溃 | 改为 `jq` 解析；后续又改为 Node.js 行内脚本 |
| v1.1.4 | `GITEE_TOKEN` secret 过期 | 通过 `gh secret set` 更新为有效 token |
| v1.1.6 | macOS 构建产出一式两份文件（arm64 构建产 x64+arm64 两个文件） | `package.json` mac target 移除内嵌 `arch: ["x64", "arm64"]`，由 CI `--x64`/`--arm64` 控制 |

**制品策略变更：**

| 项目 | 旧 (V7 及以前) | 新 (V8) |
|------|------|------|
| MiMo CLI | 构建时下载打进安装包（~25MB 额外体积） | 不内置，用户首次启动自动下载（码云镜像→GitHub→npm fallback） |
| macOS 格式 | 仅 DMG | DMG + tar.xz（tar.xz 压缩率 ~2.4x，从 225MB→77MB） |
| 码云分发 | 尝试上传所有（>100MB 跳过） | 仅上传 <100MB：exe/portable/deb/tar.xz；DMG/AppImage 走 GitHub Releases |
| 构建目标 | Win nsis / Mac dmg / Linux AppImage+deb | 全平台增加 tar.xz：Windows portable / macOS tar.xz / Linux tar.xz |
| 本地构建 | `electron-builder` 默认尝试验 publish | 所有 script 加 `--publish never` |

**实际制品大小（v1.1.5 构建日志）：**

| 制品 | 大小 | 上传码云 | 上传 GitHub |
|------|------|:--:|:--:|
| Windows NSIS exe | 86 MB | ✅ | ✅ |
| Windows portable tar.xz | ~80 MB | ✅ | ✅ |
| Linux tar.xz | 77 MB | ✅ | ✅ |
| Linux deb | 90 MB | ✅ | ✅ |
| Linux AppImage | 116 MB | ❌ >100MB | ✅ |
| macOS x64 tar.xz | 77 MB | ✅ | ✅ |
| macOS arm64 tar.xz | 70 MB | ✅ | ✅ |
| macOS x64 DMG | 114 MB | ❌ >100MB | ✅ |
| macOS arm64 DMG | 110 MB | ❌ >100MB | ✅ |

**CI/CD 架构：**

```
GitHub Actions (push tag v*)
  ├── macos (x64)     → DMG + tar.xz  → upload-artifact
  ├── macos (arm64)   → DMG + tar.xz  → upload-artifact
  ├── linux           → AppImage+deb+tar.xz → upload-artifact
  ├── windows         → exe+portable.tar.xz → upload-artifact
  └── gitee-release   → download-artifact → 筛选 <100MB → curl 上传 Gitee
```

Gitee CI（`.gitee-ci.yml`）配置已就绪，但需在 Gitee 项目手动开通 Gitee Go 服务并设置 `GITEE_TOKEN` 变量后方可使用。

**新建/修改文件：**
- `.gitee-ci.yml` — Gitee CI Linux 构建流水线（待开通）
- `.github/workflows/release.yml` — CI 修复 + tar.xz artifact + jq Gitee 上传
- `package.json` — mac 加 tar.xz target + publish owner/repo 修正 + build script 加 `--publish never`
- `eslint.config.js` — react-hooks error→warn
- `src/lib/providerModels.ts` — 移除 dead code 赋值
- `src/lib/mimoClient.test.ts` — ts 类型断言修复
- `src/stores/chatStore.test.ts` — 迁移到 `serverState` 结构
- `README.md` — 制品列表 + 版本号 + CLI 安装说明更新

### V8 → V9 OpenClaw 风格重设计 + 新图标（2026-06-20）

**背景：** V8 功能稳定但视觉体验粗糙——深色优先、冷色调、Win/Mac 窗口框架不统一、各 View 顶栏散落拖拽占位、消息气泡布局跳动、Settings/Skills 等子页信息密度低。用户希望改为参考 OpenClaw 的浅色 Web App 风格：珊瑚粉品牌色、大圆角、宽侧边栏、面包屑顶栏、双边消息气泡。分 4 个 PR 批次完成全站改造，并重新设计应用图标。

**PR1 — 窗口框架 + Token 重写 + 品牌色：**

| 模块 | 旧实现 | 新实现 |
|------|--------|--------|
| 窗口框架 | mac `titleBarStyle:hiddenInset` / Win `titleBarOverlay` 写死黑色 | `frame:false` 自绘；mac 保留系统交通灯；Win/Linux 右上角自绘三按钮；主题切换时颜色同步 |
| 平台暴露 | preload 无平台/窗口控制 | `electronAPI.platform` + `window.minimize/maximize/close/isMaximized/onMaximizeChange` |
| 主题数量 | 5 套（dark/light/nord/catppuccin/one-dark） | 3 套：system / light / dark，监听 `prefers-color-scheme` |
| 品牌色 | 无统一强调 / 多主题各自为政 | 珊瑚粉 `#FB7185` 贯穿 light/dark；新增 `mc-brand` / `mc-brand-hover` / `mc-brand-soft` / `mc-brand-text` |
| 语义 token | 颜色硬编码散落 | 完整 `mc-*` token 体系：`mc-bg` / `mc-surface` / `mc-elevated` / `mc-hover` / `mc-bg-active` / `mc-border` / `mc-border-subtle` / `mc-text` / `mc-text-secondary` / `mc-text-muted` |
| 主题持久化 | 5 主题 ID 存 settings | `ThemeId: 'system' \| 'light' \| 'dark'`，`resolvedTheme` 计算属性 |
| 字体 | gstatic CDN Inter | 保留 CDN，统一回退链 |

**PR2 — 全局 AppHeader + 宽 Sidebar：**

| 模块 | 旧实现 | 新实现 |
|------|--------|--------|
| 顶栏 | 每 View 自己写 drag 占位 + header | 全局 `AppHeader`（44px）：mac 左侧交通灯留白、中央搜索、右侧主题切换 + 窗口控件 |
| 面包屑 | 无 | `ChatHeader` 显示 `聊天 › 当前会话标题` |
| Sidebar | 52px 图标列 | 默认展开 220px，可折叠为 52px；分组：聊天 / 控制（概览/活动/终端/记忆/技能/MCP） |
| 新对话 | 创建空 session | 清空当前 session，用户发第一条消息后 chatFlow 自动创建真实 session |
| 导航项 | 旧 `NavItem.tsx` | 新 `SidebarItem.tsx` 支持展开/折叠双态；active 态 `bg-mc-bg-active` + 左侧品牌指示条 |
| 版本信息 | 无 | Sidebar 底部显示 `v{x.x.x}` + 绿色状态点 |

**PR3 — ChatView 消息区 + 输入区：**

| 模块 | 旧实现 | 新实现 |
|------|--------|--------|
| 消息布局 | 用户右对齐、Assistant 左对齐，75% 宽度 | 双边圆角气泡；用户右对齐带玫瑰色气泡；Assistant 左对齐；均显示头像/角色/时间戳 |
| 时间戳 | 无 | 新增 `formatTime.ts`：当天 HH:mm / 昨天 / 周X / 更早 |
| 助手名称 | 固定显示「团子」 | 显示真实模型名 `message.info.model` |
| 输入区 | 裸 textarea + 顶部 + 菜单 | 大圆角卡片：顶部 `ContextUsageBar`、中间 textarea、底部工具栏（附件/@/设置 + ModelPicker + 圆形发送按钮） |
| 模型选择器 | 在 `ChatHeader` 下拉 | 下沉到 `MessageInput` 底部工具栏；`ModelPicker.tsx` 独立组件 |
| 上下文条 | 假进度条 | 移除进度条，仅显示当前 session token 总数 |
| ChatHeader | 36px drag + 模型选择器 | 44px 工具栏：面包屑 + 状态徽标；模型选择器移除 |

**PR4 — 各 View 视觉收口 + Onboarding + 全局搜索：**

| 模块 | 旧实现 | 新实现 |
|------|--------|--------|
| 共享组件 | `mc-card` hover 有阴影；Modal `rounded-xl shadow-2xl`；Toast 边框色条 | `mc-card` 去阴影；Modal `rounded-2xl shadow-xl` + 150ms 动画；Toast `rounded-xl` + 左侧品牌色圆点；ContextMenu 项 `rounded-md` + danger hover |
| EmptyHint | 小图标小字 | 图标 36px / title 14px / desc 13px |
| Button brand | 带 `shadow-sm shadow-mc-brand/20` | 去阴影 |
| SkillsView | 分类/列表 active 态用 `bg-mc-brand-soft text-mc-brand` | 统一 `bg-mc-bg-active text-mc-brand-text` + 左侧品牌指示条 |
| SettingsView | tab active `bg-mc-brand-soft` | `bg-mc-bg-active text-mc-brand-text` |
| MemoryView | tab active `bg-mc-elevated` | `bg-mc-bg-active text-mc-brand-text` |
| McpView | 类型选择 `bg-mc-brand-soft` | `bg-mc-bg-active text-mc-brand-text` |
| ConversationList | active `bg-mc-brand-soft` | `bg-mc-bg-active` + 左侧品牌指示条 |
| Onboarding | `mc-accent` 进度条/图标；`variant="primary"` 主按钮 | 全部改 `mc-brand`；按钮改 `variant="brand"`；卡片加 `rounded-2xl` |
| 全局搜索 | AppHeader 搜索框纯 UI | `GlobalSearch.tsx` 接入 sessions / skills / settings；⌘K 唤醒；Enter 跳转 |
| 技能数据 | 仅在 `SkillsView` 本地 state | 新建 `skillsStore.ts` 供搜索和后续视图共享 |

**新图标：**

- 重新设计 `build/icon.svg` / `build/icon.png` / `build/icon.ico`
- 设计：macOS Big Sur 圆角方形；浅玫瑰到白色渐变背景；珊瑚粉对话气泡；白色圆角 "M" 标识
- 生成脚本：`build/generate_icon.py`（Pillow，1024px 源 + 多尺寸 ICO）

**新建文件：**
- `src/components/ui/WindowControls.tsx` — 自绘 Win/Linux 窗口控件
- `src/components/Layout/AppHeader.tsx` — 全局顶栏（搜索 + 主题切换 + 窗口控件）
- `src/components/Layout/GlobalSearch.tsx` — ⌘K 全局搜索
- `src/views/ChatView/ContextUsageBar.tsx` — 输入卡片顶部上下文 token 提示
- `src/views/ChatView/ModelPicker.tsx` — 底部工具栏模型选择器
- `src/lib/formatTime.ts` — 消息时间格式化
- `src/stores/skillsStore.ts` — 技能全局状态
- `build/generate_icon.py` — 新图标生成脚本

**修改文件：**
- `electron/main.cjs` — `frame:false`；mac `titleBarStyle:'hiddenInset'`；新增 window IPC handlers
- `electron/preload.cjs` — 暴露 `platform` 与 `window.*`
- `src/lib/ipc.ts` — `ElectronAPI` 类型扩展
- `src/styles/globals.css` — 删除 nord/catppuccin/one-dark；重写 light/dark 珊瑚粉 token
- `tailwind.config.js` — 新增 `mc-bg-active` / `mc-brand-text` / `mc-user-bubble` / `mc-assistant-bubble` 等
- `src/stores/themeStore.ts` — 三态主题模型 + `resolvedTheme`
- `src/stores/uiStore.ts` — `sidebarCollapsed` 默认 `false`；新增 `sidebarGroups`
- `src/components/Layout/AppLayout.tsx` — 改用 `AppHeader` + Sidebar + main 布局
- `src/components/Sidebar/index.tsx` / `SidebarItem.tsx` — 宽栏 + 分组 + 新 active 态
- `src/views/ChatView/ChatHeader.tsx` — 面包屑 + 状态徽标
- `src/views/ChatView/MessageBubble.tsx` — 双边气泡 + 时间戳
- `src/views/ChatView/MessageInput.tsx` — 大输入卡片 + 底部工具栏
- `src/views/ChatView/ConversationList.tsx` — active 态统一
- `src/views/SkillsView/index.tsx` / `MemoryView/index.tsx` / `McpView/index.tsx` / `SettingsView/index.tsx` / `TerminalView/index.tsx` — active 态与组件阴影统一
- `src/components/Onboarding/index.tsx` — 珊瑚粉配色
- `src/components/ui/Button.tsx` / `Modal.tsx` / `ContextMenu.tsx` / `Toast.tsx` / `EmptyHint.tsx` — 视觉统一
- `README.md` — V1.3.0 特性、下载链接、文档链接

**删除文件：**
- `src/components/ui/TitleBar.tsx` — 被 AppHeader + 各 view 内部工具栏替代
- `src/components/Sidebar/NavItem.tsx` — 被 `SidebarItem.tsx` 替代
- `src/components/Sidebar/ServerStatusBadge.tsx` — 孤儿文件

**设计约定（新代码必须遵守）：**
- 禁止写死颜色，一律用 `bg-mc-*` / `text-mc-*` / `border-mc-*` 类名
- 字号收敛到 `text-2xs` / `text-xs` / `text-sm` / `text-base` / `text-lg`
- 优先复用原子组件：`Button` / `Spinner` / `StatusDot` / `EmptyHint` / `Modal` / `ContextMenu`
- active 列表项统一用 `bg-mc-bg-active` + `text-mc-brand-text` + 左侧品牌指示条
- 不可变更新原则：SSE handler 和 zustand updater 必须返回新对象/数组
- Win/Mac 窗口框架：mac 系统交通灯、Win/Linux 自绘按钮，统一 `no-drag`/`drag` 类

---

## 10. 操作手册

### 10.1 安装与启动

**Windows — NSIS 安装包**
下载 `MiMo-Studio-Setup-1.3.0-win-x64.exe`，双击安装到 Program Files（支持自定义目录）。

**Windows — 免安装版**
下载 `MiMo-Studio-1.3.0-win-x64-Portable.tar.xz`，解压到任意位置：
```bash
tar xf MiMo-Studio-1.2.0-win-x64-Portable.tar.xz
./MiMo Studio.exe
```

**Linux — tar.xz**
下载 `MiMo-Studio-1.3.0-linux-x64.tar.xz`，解压即用：
```bash
tar xf MiMo-Studio-1.2.0-linux-x64.tar.xz
./mimo-studio
```

**Linux — deb**
下载 `MiMo-Studio-1.2.0-linux-amd64.deb`：
```bash
sudo dpkg -i MiMo-Studio-1.1.0-linux-amd64.deb
```

**macOS — tar.xz**（推荐，码云可下载）
下载对应架构的 tar.xz：
- Apple Silicon (M1/M2/M3/M4)：`MiMo-Studio-1.3.0-mac-arm64.tar.xz`
- Intel：`MiMo-Studio-1.3.0-mac-x64.tar.xz`

```bash
tar xf MiMo-Studio-1.3.0-mac-arm64.tar.xz
open MiMo\ Studio.app
```

**macOS — DMG**（GitHub Releases 下载，码云因 >100MB 不提供）
下载对应架构的 DMG，双击打开 → 将 MiMo Studio 拖入 Applications 文件夹。

> **macOS 用户**：首次打开可能会提示"无法验证开发者"，请在系统设置 → 隐私与安全性中点击"仍要打开"。

**首次启动**
1. 显示欢迎引导 → 点击"开始使用"
2. 自动检测/安装 MiMo CLI（无内置二进制，从码云镜像下载 → GitHub → npm 回退）
3. MiMo Serve 初始化期间显示蓝色"正在初始化"横幅
4. 初始化完成后自动切换为绿色"Agent 模式"

> **已安装 CLI 的用户**：如果 `~/.mimocode/bin/mimo` 已存在且版本有效，自动跳过安装，不会覆盖降级。

**退出程序**
- 点击 ✕ 按钮弹出确认对话框，防止误关
- 确认退出后自动终止所有 Agent 和终端进程

### 10.2 基本使用

**发送消息**
- 在底部输入框输入文本，Enter 发送（Shift+Enter 换行）
- Agent 收到消息后会自主执行任务：读文件、写代码、运行命令等
- 思考过程可折叠查看（点击"查看思考"）
- 工具调用过程显示为卡片（展开可查看输入/输出）
- 当 Agent 需要写文件时会弹出权限确认

**管理对话**
- 左侧对话列表：点击切换，悬停显示删除按钮
- 点击 + 新建对话
- 顶栏显示当前对话标题

**选择模型**
- 顶栏右侧下拉：
  - 在线时所有模型统一经 MiMo Code，享受完整 Agent 能力
  - 离线时仅显示已配置 API Key 的外部模型（纯文本模式）
  - 底部"管理 Provider 配置"→ 跳转到设置页
- 设置 → Provider 中可随时安装 MiMo CLI

### 10.3 配置外部 AI Provider

1. 点击顶栏模型下拉 → "管理 Provider 配置"
2. 或点击左侧"设置"→ Provider 标签
3. 在卡片中输入对应 Provider 的 API Key
4. Key 安全存储于本地，仅用于 API 调用
5. 填入 Key 后，该 Provider 的模型自动出现在模型选择器中

**获取 API Key 的链接：**
| Provider | 获取 Key |
|----------|---------|
| OpenAI | https://platform.openai.com/api-keys |
| Anthropic | https://console.anthropic.com/settings/keys |
| DeepSeek | https://platform.deepseek.com/api_keys |
| Groq | https://console.groq.com/keys |
| 阿里云百炼 | https://bailian.console.aliyun.com/ |
| 智谱 GLM | https://open.bigmodel.cn/ |
| 硅基流动 | https://siliconflow.cn/ |

### 10.4 使用终端

1. 点击左侧"终端"图标
2. **mimo serve 在线时**：通过 PTY WebSocket 连接到 mimo serve 的终端
3. **离线时**：使用本地 cmd.exe
4. 终端会自动包含 `~/.mimocode/bin` 和 `%APPDATA%/npm` 在 PATH 中，确保 `mimo` 命令可用

### 10.5 管理技能

1. 点击左侧"技能"图标
2. **可用技能**：显示所有已发现的技能（mimo serve 在线时自动从 compose + 用户目录 + 项目目录发现）
3. **技能商店**：
   - 魔搭社区专区（modelscope.cn/skills）：点击打开官网浏览
   - 下载技能：点击"下载"按钮 → 输入 SKILL.md 的 URL → 自动安装
4. **新建技能**：点击"新建" → 编写 YAML frontmatter + Markdown → 保存
5. 内置技能标记为"内置"，不可删除；用户自建可删除

### 10.6 管理记忆

1. 点击左侧"记忆"图标
2. **User 记忆**：关于用户的偏好、背景等信息
3. **Memory 记忆**：Agent 自动记录的重要信息
4. 编辑后实时保存

### 10.7 MCP 服务器

1. 点击左侧"MCP"图标
2. 添加 MCP 服务器（stdio 或 HTTP）
3. 启用/禁用服务器
4. MCP 扩展 Agent 的工具能力

### 10.8 自定义外观

1. 点击左侧"设置"→ 外观
2. 3 种主题可选：跟随系统 / 浅色 / 深色
3. 字体大小：12-18px 滑块调节

---

## 11. 开发指南

### 11.1 环境准备
```bash
# 安装依赖
npm install

# 开发模式（Vite + Electron）
npm run electron:dev

# 仅构建前端
npm run build

# 打包
npm run electron:build
```

### 11.2 关键代码路径

**添加新的 Part 类型：**
1. `src/lib/mimoTypes.ts` — 添加类型定义
2. `src/views/ChatView/MessageBubble.tsx` — 添加渲染分支（`renderPart` 函数）
3. 如果是工具类 Part → `ToolCallCard.tsx`

**添加新的 SSE 事件处理：**
`src/stores/chatStore.ts` → `initSSE()` 中添加 `mimoClient.on('event.type', handler)`

**添加新的 Provider 模板：**
`src/config/providerTemplates.ts` → `PROVIDER_TEMPLATES` 数组添加条目
`src/views/SettingsView/index.tsx` → `PROVIDER_CARDS` 数组添加卡片

**修改 Electron IPC：**
1. `electron/main.cjs` → 添加 `ipcMain.handle('channel', handler)`
2. `electron/preload.cjs` → 添加 `channel: (args) => ipcRenderer.invoke(...)`
3. `src/lib/ipc.ts` → `ElectronAPI` 接口添加类型

### 11.3 调试

**查看 mimo serve 日志：**
```bash
# mimo serve 输出打印到 stdout
# 在 main.cjs 中可取消 stdio: 'pipe' 的注释改为 'inherit' 查看
```

**查看 SSE 事件：**
在 `mimoClient.ts` 的 `dispatchEvent` 中添加 `console.log`

**查看 chatStore 状态：**
```typescript
// 在浏览器 DevTools console 中
window.__ZUSTAND__ = useChatStore.getState()
```

### 11.4 项目约定

- 组件类名使用 `mc-*` 前缀（MiMo Code）
- CSS 变量命名：`--bg-base`, `--text-primary`, `--accent` 等
- IPC 通道命名：`namespace:verb`（如 `mimo:startServer`, `settings:get`）
- 文件命名：Component PascalCase / module camelCase
- 类型优先从 `mimoTypes.ts` 导入，`types.ts` 仅重导出 + 本地类型

---

## v1.3.1 — 稳定性修复（bugfix）

V1.3.0 OpenClaw 重设计后的一轮稳定性修复，无新功能：

| 问题 | 根因 | 修复 |
|------|------|------|
| 窗口拖不动 | `AppHeader` 中央搜索容器 `flex-1` + `no-drag` 铺满标题栏，无拖动余地 | 容器恢复可拖动，仅搜索框/按钮保留 `no-drag` |
| 搜索框偏左 | 中央容器用 `flex-1 justify-center`，仅在左右两 div 间居中；Win/Linux 右侧自绘窗口按钮重、左侧轻致偏左（mac 无按钮故居中） | 改为相对 header `absolute left-1/2 -translate-x-1/2` 绝对居中，三平台一致 |
| MemoryView 内存泄漏 | Cmd+S 的 `useEffect` 无依赖数组，每次渲染重复注册 keydown 监听 | 补 `[handleSave]` 依赖，并前移 `handleSave` 定义避免初始化前引用 |
| 并发发送丢 abort | 模块级 `currentAbortController` 被第二次发送覆盖，首条请求失联 | 发送前先 abort 上一条；`finally` 仅清自己的 controller |
| JSON.parse 崩溃 | 9 处持久化数据直接 `JSON.parse`，数据损坏时崩渲染进程白屏 | 新增 `lib/safeJson.ts` 统一安全解析兜底 |
| CI gitee 上传卡死 | `attach_files` 的 `curl` 无超时/重试，单文件传输挂起致 job 无限空转 | 加 `--max-time 600 --retry 3 --retry-all-errors` + job `timeout-minutes: 30` 兜底 |

**未改动（评估后判定为设计取舍或本地软件低风险）：** `webSecurity: false`（自定义协议 SSE 跨域所需）、`ensurePassword` 空串（MiMo serve SSE 不支持非空密码）、路径遍历 / 终端 spawn（本地单机操作，无外部攻击面）。
