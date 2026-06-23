<p align="center">
  <img src="build/icon.png" width="128" alt="MiMo Studio" />
</p>

<h1 align="center">MiMo Studio</h1>

<p align="center">
  <strong>基于 MiMo Code 的 AI Agent 桌面工作站</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" /></a>
  <a href="https://gitee.com/shdowzh/mimo-studio/releases"><img src="https://img.shields.io/badge/release-v1.4.0-green.svg" /></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg" />
</p>

---

MiMo Studio 是 [MiMo Code](https://github.com/XiaomiMiMo/MiMo-Code) 的跨平台桌面客户端。MiMo Code 是一个完整的 AI 编码 Agent，具备工具调用、文件操作、终端命令执行等能力。本项目将其封装为开箱即用的桌面应用，提供简洁高效的交互界面。

## 特性

- **完整 Agent 能力** — 工具调用可视化、文件 Diff 预览、权限请求确认
- **全模型统一路由** — 所有模型（OpenAI / Anthropic / DeepSeek 等）统一经 MiMo Code Provider 系统，享受完整 Agent 能力
- **8+ Provider 模板** — 预置 OpenAI、Anthropic、DeepSeek、Groq、阿里百炼、智谱、硅基流动等，填入 Key 即用
- **自定义 Provider** — 支持 Ollama、vLLM、LocalAI 等任何 OpenAI 兼容 API
- **多模型切换** — 实时切换模型，自动同步 API Key 到服务端
- **本地优先** — API Key 存储于本地 SQLite，不上传任何第三方
- **智能 CLI 安装** — 首次启动自动下载 MiMo CLI（优先码云镜像 Gitee → GitHub → npm），无需手动配置

## V1.3.0 新特性

本次大版本对全站 UI 进行 **OpenClaw 风格重设计**：

- **全新视觉系统**：浅色优先、珊瑚粉（#FB7185）品牌色、`mc-*` 语义 token、统一字号与圆角规范
- **统一窗口框架**：macOS 保留系统交通灯，Win/Linux 自绘窗口控件，三平台主题切换一致
- **全局 AppHeader + 宽 Sidebar**：面包屑、中央搜索（⌘K）、主题切换、220px 可折叠侧边栏
- **聊天体验升级**：双边圆角气泡 + 头像/时间戳、大卡片输入区、模型选择器下沉到底部工具栏
- **各 View 视觉收口**：Settings / Skills / Memory / MCP / Terminal 统一卡片、空态、选中态
- **全局搜索**：⌘K 跨会话 / 技能 / 设置快速跳转
- **全新应用图标**：珊瑚粉对话气泡 + 白色 "M" 标识，契合 OpenClaw 品牌色

## V1.4.0 新特性 — 聊天附件

本次版本新增聊天附件功能，支持向对话中附加文件和图片：

- **📎 点按钮选文件**：点击输入框工具栏的回形针按钮，从系统文件选择器选取文件
- **🖱️ 拖入文件**：将文件直接拖入输入框区域，松手即添加（支持多文件批量拖入）
- **📋 粘贴截图**：Ctrl/Cmd+V 粘贴剪贴板截图（ShareX / Snipping Tool 等），图片以缩略图形式展示
- **🖼️ 图片预览**：图片附件在输入框和历史消息中显示缩略图
- **📄 文件路径**：文本/代码文件走 `file://` 协议，AI 可按需读取，不浪费上下文
- **🎬 进出动画**：附件 chip 带滑入/滑出动画，拖入时输入框显示品牌色虚线边框 + 提示文字
- **🛡️ 类型拦截**：Excel/PDF 等二进制文件会提示"不支持"，避免发到服务端报错
- **📱 跨平台文件选择器**：Windows 默认显示所有文件类型；macOS/Linux 保留类型筛选下拉

## V1.3.1 修复

稳定性与体验修复：

- **窗口可拖动**：修复 Win/Linux 下标题栏空白区无法拖动窗口的问题
- **搜索框居中**：修复 Win/Linux 下全局搜索框因窗口按钮挤压而偏左，改为相对窗口绝对居中（三平台一致）
- **内存泄漏**：MemoryView 不再在每次渲染重复注册键盘监听器
- **并发发送**：连续发送消息时正确中止上一条请求，避免中止开关失联
- **数据健壮性**：本地持久化数据损坏时安全兜底，不再导致界面崩溃白屏

详细改造过程与架构决策见：

- [PROJECT.md](PROJECT.md) — 项目总览、架构、完整改动记录
- [UI-REDESIGN-PLAN.md](UI-REDESIGN-PLAN.md) — UI 改造计划与验收清单
- [CONTRIBUTING.md](CONTRIBUTING.md) — 开发环境与发布流程

## 安装

### 下载预编译包

点击对应链接直接下载：

| 平台 | 下载 | 大小 | 说明 |
|------|------|------|------|
| 🪟 **Windows** (x64) 安装版 | [⬇ 下载 exe](https://gitee.com/shdowzh/mimo-studio/releases/download/v1.4.0/MiMo-Studio-Setup-1.4.0-win-x64.exe) | ~86 MB | NSIS 安装包，支持自定义安装目录 |
| 🐧 **Linux** (x64) tar.xz | [⬇ 下载 tar.xz](https://gitee.com/shdowzh/mimo-studio/releases/download/v1.4.0/MiMo-Studio-1.4.0-linux-x64.tar.xz) | ~77 MB | 解压即用：`tar xf` 后运行 `./mimo-studio` |
| 🍎 **macOS** (Apple Silicon M1-M4) | [⬇ 下载 tar.xz](https://gitee.com/shdowzh/mimo-studio/releases/download/v1.4.0/MiMo-Studio-1.4.0-mac-arm64.tar.xz) | ~70 MB | 解压即用：`tar xf` 后运行 `MiMo Studio.app` |
| 🍎 **macOS** (Intel) | [⬇ 下载 tar.xz](https://gitee.com/shdowzh/mimo-studio/releases/download/v1.4.0/MiMo-Studio-1.4.0-mac-x64.tar.xz) | ~77 MB | 解压即用：`tar xf` 后运行 `MiMo Studio.app` |

> **其他格式**：Linux deb（~90 MB）、macOS DMG（~110 MB）、Linux AppImage（~116 MB）在 [GitHub Releases](https://github.com/shdowzh/mimo-studio/releases) 下载。码云限制单文件 100MB，tar.xz 通过压缩适配。<br>
> **全部版本**：浏览 [Gitee Releases](https://gitee.com/shdowzh/mimo-studio/releases) 查看历史版本。<br>
> **macOS 用户**：首次打开提示"无法验证开发者"→ 系统设置 → 隐私与安全性 → 仍要打开。

### 从源码构建

```bash
git clone git@gitee.com:shdowzh/mimo-studio.git
cd mimo-studio

# 国内用户建议先配置 npm 镜像加速依赖下载
cp .npmrc.example .npmrc   # 或手动创建 .npmrc 添加镜像配置

npm install
npm run electron:dev          # 开发模式（Vite + Electron 热重载）
npm run electron:build:win    # 构建 Windows (exe + portable tar.xz)
npm run electron:build:mac    # 构建 macOS (DMG + tar.xz)
npm run electron:build:linux  # 构建 Linux (AppImage + deb + tar.xz)
npm run electron:build:all    # 构建全部平台
```

> **关于 MiMo CLI**：安装包不内置 CLI 二进制（体积过大无法上传码云），用户首次启动时自动从码云镜像/GitHub 下载。

## 使用

### 首次启动

1. 启动后进入引导程序 → 点击"开始使用"
2. 自动检测/安装 MiMo CLI（优先码云 Gitee 镜像下载，国内快；失败则回退 GitHub → npm）
3. MiMo Serve 初始化期间显示蓝色"正在初始化"横幅，完成后自动切换为 Agent 模式

### 基础聊天

1. 在底部输入框输入消息，Enter 发送
2. 工具调用自动展示为卡片，点击可展开详情
3. 思考过程可折叠查看

### 配置外部模型

1. 点击顶栏模型下拉 → "管理 Provider 配置"，或左侧"设置"→ Provider 标签
2. 填入对应 Provider 的 API Key，Key 安全存储于本地并自动同步到 MiMo Serve
3. 填入后该 Provider 的模型自动出现在模型选择器中

### 终端

内置 xterm.js 终端，优先连接 MiMo Serve PTY，离线时自动回退本地 shell。

### 技能 & 记忆

- **技能**：`~/.mimocode/skills/` 下的 SKILL.md 文件自动加载为 AI 行为规则
- **记忆**：`~/.mimocode/USER.md`（用户画像）和 `MEMORY.md`（项目记忆）自动注入对话上下文

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Electron 35 |
| 前端 | React 19 + TypeScript + Zustand |
| 样式 | Tailwind CSS 3 |
| 终端 | xterm.js 5 |
| 存储 | better-sqlite3 |
| 构建 | Vite + electron-builder |

## 架构

```
Renderer (React)
    ├─ ChatView    — 聊天界面（Part 多态渲染）
    ├─ TerminalView — xterm.js 终端
    ├─ SkillsView  — 技能管理
    ├─ MemoryView  — 记忆编辑
    ├─ McpView     — MCP 服务器
    └─ SettingsView — Provider 配置 + MiMo CLI 安装
    │
    ├─ MimoClient (HTTP/SSE)  — 所有模型经 MiMo Code Provider 系统
    └─ directChat (Fallback)  — MiMo Serve 离线时透明降级，纯文本
```

## 开发

```bash
npm install
npm run electron:dev    # 开发模式（Vite + Electron 热重载）
npm run build           # 仅构建前端
npm run electron:build  # 构建桌面安装包
```

## 相关项目

- [MiMo Code](https://github.com/XiaomiMiMo/MiMo-Code) — 上游项目，Agent 引擎
- [MiMo Code 镜像](https://gitee.com/mirrors/mimocode) — Gitee 镜像，国内下载快

## License

MIT © MiMo Studio Contributors
