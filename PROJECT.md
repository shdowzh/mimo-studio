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
│       └── auth.cjs             # JWT Bootstrap（MiMo Free 认证，已废弃）
├── src/                         # 渲染进程
│   ├── lib/
│   │   ├── mimoTypes.ts         # 类型定义（Part 多态、SSE 事件、Session、Skill 等）
│   │   ├── mimoClient.ts        # HTTP/SSE 客户端：所有 mimo serve API 通信
│   │   ├── directChat.ts        # 直连 Provider API fallback（OpenAI/Anthropic）
│   │   ├── api.ts               # 便捷方法 + connectToServer
│   │   ├── ipc.ts               # ElectronAPI 类型定义 + isElectron/getAPI
│   │   └── types.ts             # 重导出 + 本地类型
│   ├── stores/
│   │   ├── chatStore.ts         # 核心：消息、Session、SSE 事件处理、发送
│   │   ├── themeStore.ts        # 5 套主题切换
│   │   └── uiStore.ts           # 导航、侧边栏状态
│   ├── config/
│   │   └── providerTemplates.ts # 8 个知名 Provider 模板
│   ├── hooks/
│   │   └── useStream.ts         # 精简版流式 hook
│   ├── views/
│   │   ├── ChatView/
│   │   │   ├── index.tsx         # 入口：连接初始化
│   │   │   ├── ChatHeader.tsx    # 模型选择器
│   │   │   ├── ConversationList.tsx # Session 列表
│   │   │   ├── MessageList.tsx   # 消息列表 + 权限浮层
│   │   │   ├── MessageBubble.tsx # Part 多态渲染
│   │   │   ├── MessageInput.tsx  # 输入框
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
│   │   ├── Layout/              # 布局
│   │   └── ui/                  # 通用组件 (Button/Input/Modal/Toast)
│   ├── styles/
│   │   └── globals.css          # 5 套主题 CSS 变量 + 通用样式
│   ├── App.tsx                  # 根组件
│   └── main.tsx                 # 入口
├── build/                       # 应用图标
├── package.json
├── index.html
├── tailwind.config.js
├── vite.config.ts
├── tsconfig.json
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
5 套主题通过 CSS 变量实现，`<html data-theme="...">` 切换：
- `dark` — Zinc 色系深色
- `light` — 浅色
- `nord` — Nord 配色
- `catppuccin` — Catppuccin 配色
- `one-dark` — Atom One Dark

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

---

## 10. 操作手册

### 10.1 安装与启动

**Windows — NSIS 安装包**
下载 `MiMo-Studio-Setup-1.0.0-win-x64.exe`，双击安装到 Program Files。

**Windows — 免安装版**
下载 `MiMo-Studio-1.0.0-win-x64-Portable.tar.xz`，解压到任意位置：
```bash
tar xf MiMo-Studio-1.0.0-win-x64-Portable.tar.xz
./win-unpacked/MiMo Studio.exe
```

**macOS — DMG**
下载对应架构的 DMG：
- Apple Silicon (M1/M2/M3/M4)：`MiMo-Studio-1.0.0-mac-arm64.dmg`
- Intel：`MiMo-Studio-1.0.0-mac-x64.dmg`

双击打开 DMG → 将 MiMo Studio 拖入 Applications 文件夹。首次打开如提示"无法验证开发者"，请前往系统设置 → 隐私与安全性 → 点击"仍要打开"。

**首次启动**
1. 显示欢迎引导 → 点击"开始使用"
2. MiMo CLI 从内置二进制自动安装（秒装，无需联网）
3. MiMo Serve 初始化期间显示蓝色"正在初始化"横幅
4. 初始化完成后自动切换为绿色"Agent 模式"
5. 如内置安装失败，引导页提供 Gitee 镜像下载（国内快）或 GitHub 下载

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
2. 5 种主题可选：深色 / 浅色 / Nord / Catppuccin / One Dark
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
