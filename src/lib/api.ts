// MiMo Studio — API 便捷方法
// 所有聊天功能通过 MimoClient 直连 mimo serve
// 本地设置通过 IPC

import { mimoClient } from './mimoClient'
import { isElectron, getAPI } from './ipc'
import { loadAllApiKeys } from './secret'
import { log } from './logger'

/**
 * 连接到 mimo serve
 * 由 ChatView 在启动时调用
 * 非阻塞：尽快返回，连接状态通过 onConnectionChange 回调通知
 */
export async function connectToServer(): Promise<boolean> {
  if (!isElectron()) {
    log.info('[API] Not in Electron, skipping server connection')
    return false
  }

  const MAX_RETRIES = 3
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // 1. 先尝试获取已运行的 server 状态
      console.log(`[API] Checking server status (attempt ${attempt}/${MAX_RETRIES})...`)
      const status = await getAPI().mimo.serverStatus()
      // 同步 server 状态到 store（走 action，不直接 setState）
      if (status.running && status.port > 0) {
        try {
          const { useChatStore } = await import('@/stores/chatStore')
          useChatStore.getState().setServerState({ status: 'initializing', port: status.port, password: status.password || '', mode: status.mode || 'unknown' })
          console.log(`[API] Server mode: ${status.mode}`)
        } catch (e) { log.warn('[API] sync serveMode failed:', e) }
      }
      if (status.running && status.port > 0) {
        console.log(`[API] Server already running on port ${status.port}`)
        mimoClient.connect(status.port, status.password || '', (connected) => {
          console.log(`[API] MimoClient connection: ${connected}`)
          if (connected) syncKeysToServer()
        })
        await waitForConnection(3000)
        if (mimoClient.isConnected) {
          log.info('[API] Connected to existing server')
          return true
        }
        log.info('[API] Existing server not responding, will try to restart')
      }

      // 2. 启动 server（异步，不阻塞 UI）
      log.info('[API] Starting mimo serve...')
      getAPI().mimo.startServer().then(async result => {
        console.log(`[API] startServer result: port=${result.port}`)
        try {
          const s = await getAPI().mimo.serverStatus()
          if (s.mode) {
            const { useChatStore } = await import('@/stores/chatStore')
            // 走 action 更新状态
            const prev = useChatStore.getState().serverState
            const port = result.port || (prev.status !== 'disconnected' ? prev.port : 0)
            const password = result.password || (prev.status !== 'disconnected' ? prev.password : '')
            useChatStore.getState().setServerState({ status: 'initializing', port, password, mode: s.mode })
            console.log(`[API] Server mode after start: ${s.mode}`)
          }
        } catch (e) { log.warn('[API] sync serveMode failed:', e) }
        if (result.port > 0) {
          mimoClient.connect(result.port, result.password, (connected) => {
            console.log(`[API] MimoClient connection: ${connected}`)
            if (connected) syncKeysToServer()
          })
        }
      }).catch(err => {
        log.error('[API] startServer error:', err)
      })

      return false
    } catch (err) {
      console.error(`[API] connectToServer attempt ${attempt}/${MAX_RETRIES} failed:`, err)
      if (attempt < MAX_RETRIES) {
        await sleep(1000 * Math.pow(2, attempt - 1))  // 1s, 2s, 4s
      }
    }
  }

  log.error('[API] connectToServer all retries failed')
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

function waitForConnection(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now()
    const check = () => {
      if (mimoClient.isConnected) { resolve(); return }
      if (Date.now() - start > timeoutMs) { resolve(); return }
      setTimeout(check, 100)
    }
    check()
  })
}

/** 将本地所有 API Key 同步到 MiMo Serve */
async function syncKeysToServer() {
  if (!isElectron()) return
  try {
    const keys = await loadAllApiKeys()
    for (const [providerId, apiKey] of Object.entries(keys)) {
      if (!apiKey || !apiKey.trim()) continue
      try {
        await mimoClient.setAuth(providerId, apiKey)
        console.log(`[API] Synced key for ${providerId} to server`)
      } catch (e) {
        console.warn(`[API] Failed to sync key for ${providerId}:`, e)
      }
    }
  } catch (e) { log.warn('[API] syncKeysToServer failed:', e) }
}

// === 本地设置便捷方法 ===

export const settings = {
  get: (key: string) => isElectron() ? getAPI().settings.get(key) : Promise.resolve(null),
  set: (key: string, value: string) => isElectron() ? getAPI().settings.set(key, value) : Promise.resolve(),
}

// === MimoClient 重导出 ===

// 窗口关闭时断开 SSE 连接
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    try { mimoClient.disconnect() } catch {}
  })
}

export { mimoClient } from './mimoClient'
