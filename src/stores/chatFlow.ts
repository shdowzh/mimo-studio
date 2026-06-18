// chatFlow.ts — sendMessage 的三条路径编排
// 从 chatStore 抽出，store 只管状态，这里管业务流程

import { mimoClient } from '@/lib/mimoClient'
import { directChat, getDefaultProvider } from '@/lib/directChat'
import { isElectron, getAPI } from '@/lib/ipc'
import { getApiKey } from '@/lib/secret'
import type { MessageWithParts, TextPartInput } from '@/lib/mimoTypes'
import type { ChatState } from './chatStore'
import { selectors } from './chatStore'

// ── 类型：sendMessage 需要从 store 读/写的接口 ──

// 离线（fallback）会话标记：不在 DB 里，刷新即丢
export const EPHEMERAL_SESSION_PREFIX = 'ephemeral-'

export function isEphemeralSessionId(id: string): boolean {
  return id.startsWith(EPHEMERAL_SESSION_PREFIX)
}

function makeEphemeralSessionId(): string {
  return EPHEMERAL_SESSION_PREFIX + crypto.randomUUID()
}

export interface ChatFlowDeps {
  get: () => ChatState
  set: (partial: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) => void
  trackSession: (id: string) => Promise<void>
  loadSessions: () => Promise<void>
}

// ── 路径 1：Agent 模式（mimo serve 在线） ──

async function sendViaAgent(text: string, deps: ChatFlowDeps): Promise<boolean> {
  const state = deps.get()
  if (!selectors.serverConnected(state) || !mimoClient.isConnected) return false

  let sessionID = state.currentSessionID

  // 如果没有当前 session，在服务端创建一个
  if (!sessionID) {
    try {
      const session = await mimoClient.createSession({
        title: text.slice(0, 30) + (text.length > 30 ? '...' : ''),
      })
      sessionID = session.id
      deps.set({ currentSessionID: sessionID })
      await deps.trackSession(sessionID)
      deps.loadSessions()
      deps.set(s => ({ messages: { ...s.messages, [sessionID!]: [] } }))
    } catch (err) {
      deps.set({ lastError: `创建会话失败: ${err instanceof Error ? err.message : String(err)}` })
      return true // 消费了这次调用，不要走 fallback
    }
  }

  // 同步 API Key 到服务端
  const parts: TextPartInput[] = [{ type: 'text', text }]
  const opts: any = {}
  if (state.currentProvider && state.currentProvider !== 'mimo' && state.currentModel) {
    opts.model = { providerID: state.currentProvider, modelID: state.currentModel }
    try {
      if (isElectron()) {
        const key = await getApiKey(state.currentProvider)
        if (key) {
          await mimoClient.setAuth(state.currentProvider, key)
        }
      }
    } catch (err) { console.warn('[chatFlow] sync apiKey to server failed:', err) }
  }

  try {
    console.log('[chatFlow] sendViaAgent', { sessionID, provider: state.currentProvider, model: state.currentModel, opts })
    await mimoClient.sendMessage(sessionID, parts, opts)
    return true // 成功
  } catch (err) {
    console.warn('[chatFlow] Server send failed, falling back to directChat:', err)
    return false // 走 fallback
  }
}

// ── 路径 2：Fallback 模式（直连 Provider API） ──

async function sendViaDirectChat(text: string, abortSignal: AbortSignal, deps: ChatFlowDeps): Promise<void> {
  const state = deps.get()
  let sessionID = state.currentSessionID

  if (!sessionID) {
    sessionID = makeEphemeralSessionId()
    deps.set({ currentSessionID: sessionID })
  }

  // 创建用户消息
  const userMsgId = crypto.randomUUID()
  const userMsg: MessageWithParts = {
    info: {
      id: userMsgId,
      sessionID,
      role: 'user',
      time: { created: Date.now() },
      agent: 'main',
      model: { providerID: '', modelID: '' },
    },
    parts: [{ type: 'text', id: crypto.randomUUID(), sessionID, messageID: userMsgId, text }],
  }

  const providerId = state.currentProvider || 'openai'
  let modelId = state.currentModel || ''
  if (!modelId) {
    const dp = await getDefaultProvider()
    if (dp) {
      modelId = dp.modelId
    } else {
      deps.set({ lastError: '未检测到可用的 AI Provider，请在设置中配置 API Key 或安装 MiMo CLI' })
      return
    }
  }

  // 先把用户消息写进本地状态（离线/直连模式也能立即看到输入）
  if (!deps.get().messages[sessionID]?.some(m => m.info.id === userMsgId)) {
    deps.set(s => ({
      messages: {
        ...s.messages,
        [sessionID!]: [...(s.messages[sessionID!] || []), userMsg],
      },
    }))
  }

  // 收集对话历史
  const msgs = deps.get().messages[sessionID] || [userMsg]
  const history = msgs.map(m => ({
    role: m.info.role,
    content: m.parts
      .filter((p): p is import('@/lib/mimoTypes').TextPart => p.type === 'text')
      .map(p => p.text).join('\n'),
  }))

  // 加载 Memory + Skills 作为系统上下文
  if (isElectron()) {
    try {
      const api = getAPI()
      const [userMd, memoryMd] = await Promise.all([
        api.files.readMemory('user'),
        api.files.readMemory('memory'),
      ])
      let systemContext = ''
      if (userMd) systemContext += `## 用户画像（USER.md）\n\n${userMd}\n\n`
      if (memoryMd) systemContext += `## 项目记忆（MEMORY.md）\n\n${memoryMd}\n\n`

      const skills = await api.files.readSkills()
      if (skills && skills.length > 0) {
        systemContext += `## 技能规则（强制遵守）\n\n`
        for (const skill of skills) {
          systemContext += `### ${skill.name}\n${skill.content}\n\n`
        }
      }
      if (systemContext) {
        history.unshift({ role: 'system' as any, content: systemContext })
      }
    } catch (err) { console.warn('[chatFlow] load system context failed:', err) }
  }

  // 准备助手消息占位
  const assistantMsgId = crypto.randomUUID()
  const textPartId = crypto.randomUUID()

  const assistantMsg: MessageWithParts = {
    info: {
      id: assistantMsgId,
      sessionID: sessionID!,
      role: 'assistant',
      time: { created: Date.now() },
      agent: 'direct',
      model: { providerID: providerId, modelID: modelId },
    },
    parts: [{
      type: 'text',
      id: textPartId,
      sessionID: sessionID!,
      messageID: assistantMsgId,
      text: '',
    }],
  }

  deps.set(s => ({
    messages: {
      ...s.messages,
      [sessionID!]: [...(s.messages[sessionID!] || []), assistantMsg],
    },
    sessionStatus: {
      ...s.sessionStatus,
      [sessionID!]: { type: 'busy' as const, message: '直接连接中...' },
    },
  }))

  // 调用 directChat，流式回调更新
  try {
    await directChat(
      providerId,
      modelId,
      history,
      {
        onTextDelta: (delta: string) => {
          deps.set((s) => {
            const sessionMsgs = s.messages[sessionID!]
            if (!sessionMsgs) return {}
            const msgIdx = sessionMsgs.findIndex(m => m.info.id === assistantMsgId)
            if (msgIdx < 0) return {}
            const msg = sessionMsgs[msgIdx]
            const partIdx = msg.parts.findIndex(p => p.id === textPartId)
            if (partIdx < 0) return {}
            const newParts = [...msg.parts]
            const oldPart = newParts[partIdx] as import('@/lib/mimoTypes').TextPart
            newParts[partIdx] = { ...oldPart, text: oldPart.text + delta }
            const newMsgs = [...sessionMsgs]
            newMsgs[msgIdx] = { ...msg, parts: newParts }
            return { messages: { ...s.messages, [sessionID!]: newMsgs } }
          })
        },
        onDone: (final: MessageWithParts) => {
          deps.set((s) => {
            const sessionMsgs = s.messages[sessionID!]
            if (!sessionMsgs) return {}
            const normalized: MessageWithParts = {
              info: {
                ...final.info,
                id: assistantMsgId,
                sessionID: sessionID!,
              },
              parts: final.parts.map(p => ({ ...p, sessionID: sessionID!, messageID: assistantMsgId })),
            }
            const newMsgs = sessionMsgs.map(m =>
              m.info.id === assistantMsgId ? normalized : m
            )
            return {
              messages: { ...s.messages, [sessionID!]: newMsgs },
              sessionStatus: { ...s.sessionStatus, [sessionID!]: { type: 'idle' } },
            }
          })
        },
        onError: (error: string) => {
          deps.set((s) => {
            const sessionMsgs = s.messages[sessionID!]
            if (!sessionMsgs) return {}
            const newMsgs = sessionMsgs.map(m => {
              if (m.info.id !== assistantMsgId) return m
              return {
                ...m,
                parts: [{ type: 'text' as const, id: textPartId, sessionID: sessionID!, messageID: assistantMsgId, text: `⚠️ ${error}` }],
              }
            })
            return {
              messages: { ...s.messages, [sessionID!]: newMsgs },
              sessionStatus: { ...s.sessionStatus, [sessionID!]: { type: 'idle' } },
              lastError: error,
            }
          })
        },
      },
      abortSignal,
    )
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      // 用户主动中止
    } else {
      deps.set({
        lastError: `发送消息失败: ${err instanceof Error ? err.message : String(err)}`,
        sessionStatus: { ...deps.get().sessionStatus, [sessionID!]: { type: 'idle' } },
      })
    }
  }
}

// ── 入口：编排三条路径 ──

export async function sendMessageFlow(text: string, abortController: AbortController, deps: ChatFlowDeps): Promise<void> {
  if (!text.trim()) return

  // 先尝试 Agent 模式
  const handled = await sendViaAgent(text, deps)
  if (handled) return

  // fallback 到直连
  await sendViaDirectChat(text, abortController.signal, deps)
}
