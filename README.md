<p align="center">
  <img src="build/icon.png" width="128" alt="MiMo Studio" />
</p>

<h1 align="center">MiMo Studio</h1>

<p align="center">
  <strong>基于 MiMo Code 的 AI Agent 桌面工作站</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" /></a>
  <a href="https://gitee.com/shdowzh/mimo-studio/releases"><img src="https://img.shields.io/badge/release-v1.0.0-green.svg" /></a>
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
- **内置 MiMo CLI** — 安装包内置 MiMo CLI 二进制，首次启动秒装，无需联网下载

## 安装

### 下载预编译包

从 [Releases](https://gitee.com/shdowzh/mimo-studio/releases) 下载对应平台安装包：

| 平台 | 文件 | 大小 | 说明 |
|------|------|------|------|
| 🪟 **Windows** (x64) 安装版 | `MiMo-Studio-Setup-1.0.0-win-x64.exe` | ~88 MB | NSIS 安装包，双击安装 |
| 🪟 **Windows** (x64) 免安装版 | `MiMo-Studio-1.0.0-win-x64-Portable.tar.xz` | ~87 MB | 解压即用：`tar xf` 后运行 `mimo-studio.exe` |
| 🐧 **Linux** (x64) | `MiMo-Studio-1.0.0-linux-x64.tar.xz` | ~81 MB | 解压即用，运行 `./mimo-studio` |
| 🍎 **macOS** (Apple Silicon) | `MiMo-Studio-1.0.0-mac-arm64.dmg` | ~147 MB | 双击打开，拖入 Applications |
| 🍎 **macOS** (Intel) | `MiMo-Studio-1.0.0-mac-x64.dmg` | ~151 MB | 双击打开，拖入 Applications |

> **macOS 用户**：首次打开可能会提示"无法验证开发者"，请在系统设置 → 隐私与安全性中点击"仍要打开"。

### 从源码构建

```bash
git clone git@gitee.com:shdowzh/mimo-studio.git
cd mimo-studio

# 国内用户建议先配置 npm 镜像加速依赖下载
cp .npmrc.example .npmrc   # 或手动创建 .npmrc 添加镜像配置

npm install
npm run electron:dev          # 开发模式（Vite + Electron 热重载）
npm run electron:build:win    # 构建 Windows 安装包
npm run electron:build:mac    # 构建 macOS 安装包
npm run electron:build:linux  # 构建 Linux 安装包
npm run release               # 完整发布流程（前端构建 + 下载 CLI + 打包 + 校验和）
```

## 使用

### 首次启动

1. 启动后进入引导程序 → 点击"开始使用"
2. MiMo CLI 自动从内置二进制安装（秒装，无需联网）
3. MiMo Serve 初始化期间显示"正在初始化"提示，完成后自动进入 Agent 模式
4. 如内置安装失败，引导页提供 Gitee 镜像下载（国内快）或 GitHub 下载备选

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
