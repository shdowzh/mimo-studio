// 类型安全的 Electron IPC 客户端
// 精简版：只保留原生功能和设置，聊天功能由 MimoClient 直连 mimo serve

import type { SkillInfo } from './mimoTypes'

export interface ElectronAPI {
  // === Mimo Server 管理 ===
  mimo: {
    startServer: () => Promise<{ port: number; password: string }>
    stopServer: () => Promise<void>
    serverStatus: () => Promise<{ running: boolean; port: number; password: string; mode: string }>
    detect: () => Promise<{ installed: boolean; version?: string; path?: string; source?: string }>
    install: () => Promise<void>
    onInstallProgress: (callback: (data: { stdout?: string; stderr?: string }) => void) => () => void
    onStatus: (callback: (data: { installed: boolean; version?: string; installing?: boolean; justInstalled?: boolean; error?: string }) => void) => () => void
  }

  // === 本地设置 ===
  settings: {
    get: (key: string) => Promise<string | null>
    set: (key: string, value: string) => Promise<void>
  }

  // === API Key 加密存储（safeStorage）===
  secret: {
    getApiKey: (providerId: string) => Promise<string | null>
    setApiKey: (providerId: string, plain: string) => Promise<void>
    deleteApiKey: (providerId: string) => Promise<void>
    listApiKeyProviders: () => Promise<string[]>
    isEncryptionAvailable: () => Promise<boolean>
  }

  // === 终端 ===
  terminal: {
    create: (opts?: { shell?: string; cwd?: string }) => Promise<string>
    write: (sessionId: string, data: string) => Promise<void>
    onData: (sessionId: string, callback: (data: string) => void) => () => void
    onExit: (sessionId: string, callback: (exitCode: number) => void) => () => void
    onCleanup: (sessionId: string, callback: () => void) => () => void
    resize: (sessionId: string, cols: number, rows: number) => Promise<void>
    kill: (sessionId: string) => Promise<void>
  }

  // === 文件 I/O ===
  files: {
    readMemory: (type: 'user' | 'memory') => Promise<string | null>
    writeMemory: (type: 'user' | 'memory', content: string) => Promise<void>
    readSkills: () => Promise<SkillInfo[]>
    readSkill: (name: string) => Promise<string | null>
    writeSkill: (name: string, content: string) => Promise<void>
    deleteSkill: (name: string) => Promise<void>
  }

  // === 原生功能 ===
  native: {
    openDirectory: () => Promise<string | null>
    openFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
    showItemInFolder: (path: string) => Promise<void>
  }

  // === 自动更新 ===
  updater: {
    check: () => Promise<{ available: boolean; version?: string | null; error?: string }>
    install: () => Promise<void>
    onAvailable: (callback: (data: { version: string }) => void) => () => void
    onProgress: (callback: (data: { percent: number; transferred: number; total: number }) => void) => () => void
    onDownloaded: (callback: (data: { version: string }) => void) => () => void
  }
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

// 安全获取 electronAPI
export function getAPI(): ElectronAPI {
  if (!window.electronAPI) {
    throw new Error('electronAPI not available — not running in Electron?')
  }
  return window.electronAPI
}

// 检测是否在 Electron 环境中
export function isElectron(): boolean {
  return !!window.electronAPI
}
