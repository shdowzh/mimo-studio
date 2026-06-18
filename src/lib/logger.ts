// 统一日志工具 — 分级 + 模块前缀 + 可选文件落盘
// 用法：import { log } from '@/lib/logger'; log.warn('[chatFlow]', 'sync key failed:', err)
//
// 替代满地 console.*，方便：
//   1. 生产环境只输出 warn/error（减少控制台噪音）
//   2. 未来接入文件落盘或远程日志
//   3. grep 一个前缀即可定位模块

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

// 默认：开发环境 debug，生产环境 warn
const DEFAULT_LEVEL: LogLevel = import.meta.env?.DEV ? 'debug' : 'warn'

let currentLevel: LogLevel = DEFAULT_LEVEL

export function setLogLevel(level: LogLevel) {
  currentLevel = level
}

export function getLogLevel(): LogLevel {
  return currentLevel
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel]
}

export const log = {
  debug: (...args: unknown[]) => {
    if (shouldLog('debug')) console.log(...args)
  },
  info: (...args: unknown[]) => {
    if (shouldLog('info')) console.info(...args)
  },
  warn: (...args: unknown[]) => {
    if (shouldLog('warn')) console.warn(...args)
  },
  error: (...args: unknown[]) => {
    if (shouldLog('error')) console.error(...args)
  },
}

// 主进程侧也提供同一套（通过 module.exports，CJS 可 require）
// 但由于 renderer 和 main 隔离，main 进程用独立实例
// 这里只服务渲染层；主进程日志继续用 console（主进程无需 bundler alias）
