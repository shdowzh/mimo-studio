// API Key 读写封装（渲染层）
// 走 secret IPC（主进程 safeStorage 加密），替代旧的 settings.get/set('apiKeys') 明文 JSON
//
// 设计：渲染层不应再持有所有 keys 的明文 map —— 但 UI（SettingsView）
// 仍然需要按 provider 列表渲染输入框，所以提供 loadAllApiKeys() 一次性拉取，
// 调用方应只在需要时调用，不要常驻 state。

import { isElectron, getAPI } from './ipc'

export async function getApiKey(providerId: string): Promise<string> {
  if (!isElectron()) return ''
  const v = await getAPI().secret.getApiKey(providerId)
  return v || ''
}

export async function setApiKey(providerId: string, key: string): Promise<void> {
  if (!isElectron()) return
  await getAPI().secret.setApiKey(providerId, key)
}

export async function deleteApiKey(providerId: string): Promise<void> {
  if (!isElectron()) return
  await getAPI().secret.deleteApiKey(providerId)
}

export async function listApiKeyProviders(): Promise<string[]> {
  if (!isElectron()) return []
  return await getAPI().secret.listApiKeyProviders()
}

/**
 * 一次性拉取全部 keys（解密后明文）
 * 仅用于 UI 初始渲染、向 mimo serve 同步等场景；不要常驻 React state
 */
export async function loadAllApiKeys(): Promise<Record<string, string>> {
  if (!isElectron()) return {}
  const providers = await getAPI().secret.listApiKeyProviders()
  const out: Record<string, string> = {}
  await Promise.all(providers.map(async (pid) => {
    const v = await getAPI().secret.getApiKey(pid)
    if (v) out[pid] = v
  }))
  return out
}

export async function isEncryptionAvailable(): Promise<boolean> {
  if (!isElectron()) return false
  return await getAPI().secret.isEncryptionAvailable()
}
