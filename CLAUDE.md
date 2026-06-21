# CLAUDE.md

本文件给 AI 编码助手提供本仓库的工作指引。先读这里，再动手。

## 项目是什么

**MiMo Studio** —— [MiMo Code](https://github.com/XiaomiMiMo/MiMo-Code)（一个具备工具调用/文件操作/终端执行能力的 AI 编码 Agent）的跨平台 Electron 桌面客户端。把 Agent 引擎封装成开箱即用的 GUI，国内用户优先走码云镜像下载 CLI。

- 主仓库在 **Gitee**（`https://gitee.com/shdowzh/mimo-studio`），GitHub 是镜像 + CI 构建机。
- 当前版本见 `package.json`；详细历史与架构决策见 `PROJECT.md`（63KB，很全）和 `UI-REDESIGN-PLAN.md`。

## 常用命令

```bash
npm install
npm run electron:dev          # 开发：Vite (5173) + Electron 热重载
npm run dev                   # 仅前端（浏览器，无 Electron API —— 大部分功能不可用）

npm run typecheck             # tsc --noEmit  ← 改完代码先跑这个
npm run lint                  # eslint src/
npm run lint:fix
npm run format                # prettier --write
npm run test                  # vitest run

npm run electron:build:win    # 构建对应平台安装包（:mac / :linux / :all）
```

**改完代码的最低自检**：`npm run typecheck && npm run lint && npm run test`。这三个都不 block 构建（lint 多为 warn），但别让它们退化。

## 架构（必读）

两层进程，**聊天流量不经过 IPC**：

```
渲染进程 (React, src/)
  ├─ views/        Chat / Terminal / Skills / Memory / MCP / Settings（非默认视图懒加载）
  ├─ stores/       Zustand：chatStore(状态) + chatFlow(业务编排) + sseHandlers(SSE 分发)
  ├─ lib/mimoClient.ts   ← 直连 mimo serve 的 HTTP/SSE 客户端，不经主进程
  ├─ lib/directChat.ts   ← mimo serve 离线时的纯文本降级
  └─ lib/ipc.ts          ← 只用于原生能力（文件/设置/终端/窗口/secret）
        │  IPC
主进程 (electron/, CommonJS .cjs)
  ├─ main.cjs            窗口 / 自定义协议 / IPC / 自动更新
  └─ services/           database / streaming / files / secret / mimoInstaller
```

### 三条发送路径（`src/stores/chatFlow.ts`）

`sendMessage` 按服务端状态分流：
1. **Agent 模式** — mimo serve 在线，走 `mimoClient`，完整工具调用能力
2. **Fallback** — serve 离线，走 `directChat`，会话 ID 带 `ephemeral-` 前缀（刷新即丢，不入 DB）
3. 错误消费后**不要**自动降级，避免重复副作用

### 状态机（`src/stores/chatStore.ts`）

`ServerState` 是 discriminated union：`disconnected | connecting | initializing | ready | error`。
- 改状态时用 `selectors.serverReady(s)` / `selectors.isAgentMode(s)` 派生，**不要**直接记 `status === 'ready'` 字符串到处写。
- 业务逻辑放 `chatFlow.ts` / `sseHandlers.ts`，`chatStore.ts` 只管纯状态 + 薄 action —— 保持这个分层。

### IPC 边界

- 渲染端调原生能力统一走 `getAPI()`（`src/lib/ipc.ts`），**别直接用 `window.electronAPI`**。
- 新增 IPC：在 `electron/preload.cjs` 暴露 + `electron/main.cjs` 的 `setupIPC()` 注册 + `src/lib/ipc.ts` 的 `ElectronAPI` 接口补类型，三处缺一不可。
- 主进程是 **CommonJS**（`.cjs`），渲染端是 **ESM + TS**。eslint 故意忽略 `*.cjs`（见 `eslint.config.js`），主进程不跑 TS lint。

## 编码约定

- **路径别名** `@/*` → `src/*`（tsconfig + vite 都配了）。
- **Prettier**：无分号、单引号、尾逗号、`printWidth: 120`、`arrowParens: always`、`endOfLine: lf`。写代码就按这个来，别引 eslint-disable 绕风格。
- **TypeScript strict 开启**，但 `noUnusedLocals/Parameters` 关掉。允许 `any`（warn 级），新代码尽量收紧但别为了消 warn 搞大重构。
- **catch 空块允许**（`no-empty: ['error', { allowEmptyCatch: true }]`）—— 主进程清理逻辑常用，别自作主张往里塞 console。
- **类型定义放 `src/lib/mimoTypes.ts`**（基于 MiMo Code 上游 Zod schema），`types.ts` 只是重导出 + 少量本地类型。新类型优先进 `mimoTypes.ts`。
- 注释用中文（与现有代码一致），密度跟周围代码匹配。

## 关键陷阱（踩过的坑，别再踩）

1. **打包后白屏/黑屏** — Electron 用 `file://` 加载时 ES module 的 `crossorigin` 会被 CORS 拦截。两个兜底都别动：
   - `vite.config.ts` 的 `removeCrossorigin()` 插件（构建后移除 crossorigin 属性）
   - `electron/main.cjs` 的 `mimo-app://` 自定义协议（带 `Access-Control-Allow-Origin` 头）
   - 协议 handler 里的**路径穿越防护**（`resolved.startsWith(baseDir)` 检查）必须保留。

2. **API Key 存储迁移** — 老版本明文存 `settings.apiKeys`，现在走 `safeStorage` 加密（`electron/services/secret.cjs`），落在另一个键上。**渲染端别再读 `settings:get('apiKeys')`**，会拿到空。`secret.migrateLegacyIfNeeded()` 在 app ready 后调用，别删。

3. **窗口生命周期** — `mainWindow.on('close')` 拦截关闭、弹确认框、调 `cleanupAll()`（杀终端子进程 + 停 mimo serve + Windows taskkill 残留 + 关 DB）。任何新增的子进程/连接都要在 `cleanupAll()` 里加清理，否则退出后留僵尸进程。

4. **退出确认框**是产品决策，别改成静默退出。

5. **MiMo CLI 不内置进安装包**（体积超码云 100MB 限制），用户首次启动按 Gitee → GitHub → npm 顺序自动下载。别把 CLI 二进制 commit 进仓库。

6. **文件日志 `mimo-debug.log`** 写在 exe 同目录，打包后用户看不到控制台，靠它排查。主进程关键路径用 `debugLog`/`debugError`，别用裸 `console.log`。

7. **新增 Provider 模板**进 `src/config/providerTemplates.ts`，填模板即可在设置页出现，无需改别处。

## 发布（详见记忆 `release-workflow`）

- 推 `v*` tag 触发 CI：`git tag -a vX.X.X -m "..." && git push github vX.X.X`
- **码云附件总配额 1GB**，每次完整 release ~500MB → **发新版前先删旧 release 腾空间**。
- 码云单文件限 100MB：AppImage / DMG 只传 GitHub，tar.xz 才传码云。
- 所有 electron-builder 命令加 `--publish never`，发布走 CI 脚本而非自动 publish。
- 发版后更新 `README.md` 的下载链接和 badge 版本号。

**不要主动 commit/push，除非用户明确要求。**

## 其他文档

- `PROJECT.md` — 完整架构、改动记录、设计决策（最权威）
- `UI-REDESIGN-PLAN.md` — V9 OpenClaw 视觉重设计规范（`mc-*` 语义 token、珊瑚粉品牌色）
- `CONTRIBUTING.md` — 开发环境、提交规范、PR 流程
- `README.md` — 用户向说明 + 下载链接
