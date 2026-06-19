// 最近 prompt 持久化工具
// Phase 3 T3.7：优先显示最近 5 条用户 prompt 历史

import { getAPI, isElectron } from '@/lib/ipc'

const KEY = 'recent-prompts'
const MAX = 20

export async function getRecentPrompts(): Promise<string[]> {
  if (!isElectron()) return []
  const raw = await getAPI().settings.get(KEY)
  return raw ? JSON.parse(raw) : []
}

export async function pushRecentPrompt(text: string) {
  if (!isElectron() || !text.trim()) return
  const list = await getRecentPrompts()
  const next = [text.trim(), ...list.filter(t => t !== text.trim())].slice(0, MAX)
  await getAPI().settings.set(KEY, JSON.stringify(next))
}
