# 贡献指南

欢迎贡献！请先阅读本文档。

## 行为准则

- 尊重所有贡献者
- 建设性讨论，聚焦技术问题
- PR 需通过 CI 检查后才合并

## 开发环境

```bash
git clone git@gitee.com:shdowzh/mimo-studio.git
cd mimo-studio
npm install
npm run electron:dev
```

## 项目结构

```
mimo-studio/
├── electron/            # Electron 主进程
│   ├── main.cjs         # 入口、窗口、IPC
│   ├── preload.cjs      # contextBridge
│   └── services/        # 数据库、文件、终端
├── src/                 # 渲染进程
│   ├── lib/             # MiMoClient、directChat、类型
│   ├── stores/          # Zustand 状态管理
│   ├── views/           # 页面组件
│   ├── components/      # 通用组件
│   └── config/          # Provider 模板
├── build/               # 应用图标
├── scripts/             # 发布脚本
└── dist/                # Vite 构建产物
```

## 提交规范

- **feat**: 新功能
- **fix**: Bug 修复
- **docs**: 文档更新
- **refactor**: 代码重构
- **chore**: 构建/工具变更

示例：`feat: 添加自定义 Provider 支持`

## PR 流程

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feat/my-feature`
3. 提交变更
4. 确保 `npm run build` 通过
5. 提交 PR 到 `main` 分支
6. 等待 Review

## 发布流程

```bash
npm run electron:build:win    # 构建 Windows (exe)
npm run electron:build:mac    # 构建 macOS (DMG + tar.xz)
npm run electron:build:linux  # 构建 Linux (AppImage + deb + tar.xz)
npm run electron:build:all    # 构建全部平台
```

产物在 `release/` 目录下。
