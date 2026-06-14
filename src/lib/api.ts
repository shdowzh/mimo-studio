// MiMo Studio — API 便捷方法
// 所有聊天功能通过 MimoClient 直连 mimo serve
// 本地设置通过 IPC

import { mimoClient } from './mimoClient'
import { isElectron, getAPI } from './ipc'

/**
 * 连接到 mimo serve
 * 由 ChatView 在启动时调用
 */
export async function connectToServer(): Promise<boolean> {
  if (!isElectron()) {
    console.log('[API] Not in Electron, skipping server connection')
    return false
  }

  try {
    // 1. 先尝试获取已运行的 server 状态
    console.log('[API] Checking server status...')
    const status = await getAPI().mimo.serverStatus()
    if (status.running && status.port > 0) {
      console.log(`[API] Server already running on port ${status.port}`)
      mimoClient.connect(status.port, '', (connected) => {
        console.log(`[API] MimoClient connection: ${connected}`)
      })
      await waitForConnection(5000)
      if (mimoClient.isConnected) {
        console.log('[API] Connected to existing server')
        syncKeysToServer()
        return true
      }
      console.log('[API] Existing server not responding, will try to restart')
    }

    // 2. 启动 server
    console.log('[API] Starting mimo serve...')
    const result = await getAPI().mimo.startServer()
    console.log(`[API] startServer result: port=${result.port}`)
    if (result.port > 0) {
      mimoClient.connect(result.port, result.password, (connected) => {
        console.log(`[API] MimoClient connection: ${connected}`)
      })
      await waitForConnection(10000)
      const connected = mimoClient.isConnected
      console.log(`[API] Connection status: ${connected}`)
      if (connected) { syncKeysToServer(); return true }

      // SSE 可能还没建立，但服务器已经在运行
      // 尝试 health check
      try {
        const resp = await fetch(`http://127.0.0.1:${result.port}/global/health`)
        if (resp.ok) {
          console.log('[API] Health OK, SSE connecting...')
          await waitForConnection(5000)
          if (mimoClient.isConnected) syncKeysToServer()
          return mimoClient.isConnected
        }
      } catch {
        console.log('[API] Health check failed')
      }
    }

    console.log('[API] Could not start/connect to mimo serve')
    return false
  } catch (err) {
    console.error('[API] connectToServer error:', err)
    return false
  }
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
    const raw = await getAPI().settings.get('apiKeys')
    if (!raw) return
    const keys: Record<string, string> = JSON.parse(raw)
    for (const [providerId, apiKey] of Object.entries(keys)) {
      if (!apiKey || !apiKey.trim()) continue
      try {
        await mimoClient.setAuth(providerId, apiKey)
        console.log(`[API] Synced key for ${providerId} to server`)
      } catch (e) {
        console.warn(`[API] Failed to sync key for ${providerId}:`, e)
      }
    }
  } catch {}
}

// 全局 serverConnected setter
let setConnected: (c: boolean) => void = () => {}
export function registerChatStoreSetter(setter: (connected: boolean) => void) {
  setConnected = setter
}

// 从 MimoClient 连接状态同步到 zustand
mimoClient['onConnectionChange'] = (connected: boolean) => {
  setConnected(connected)
}

// === 本地设置便捷方法 ===

export const settings = {
  get: (key: string) => isElectron() ? getAPI().settings.get(key) : Promise.resolve(null),
  set: (key: string, value: string) => isElectron() ? getAPI().settings.set(key, value) : Promise.resolve(),
}

// === MimoClient 重导出 ===

export { mimoClient } from './mimoClient'
