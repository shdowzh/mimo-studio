// MiMo Code Desktop — 聊天状态管理
// 基于 mimo serve SSE 事件的实时状态驱动

import { create } from 'zustand'
import { mimoClient } from '@/lib/mimoClient'
import { directChat, getDefaultProvider } from '@/lib/directChat'
import { isElectron, getAPI } from '@/lib/ipc'
import type {
  SessionInfo,
  MessageWithParts,
  MessageInfo,
  Part,
  ToolPart,
  SessionStatusInfo,
  PermissionRequest,
  FileDiff,
  SSEEventPayload,
  GlobalSSEEvent,
  TextPartInput,
} from '@/lib/mimoTypes'

// === 本地 Session 追踪 ===
const MY_SESSIONS_KEY = 'mySessionIds'

let currentAbortController: AbortController | null = null

async function getMySessionIds(): Promise<Set<string>> {
  if (!isElectron()) return new Set()
  const raw = await getAPI().settings.get(MY_SESSIONS_KEY)
  return raw ? new Set(JSON.parse(raw)) : new Set()
}

async function trackSession(sessionID: string) {
  if (!isElectron()) return
  const ids = await getMySessionIds()
  ids.add(sessionID)
  await getAPI().settings.set(MY_SESSIONS_KEY, JSON.stringify([...ids]))
}

async function untrackSession(sessionID: string) {
  if (!isElectron()) return
  const ids = await getMySessionIds()
  ids.delete(sessionID)
  await getAPI().settings.set(MY_SESSIONS_KEY, JSON.stringify([...ids]))
}

interface ChatState {
  // === mimo serve 连接状态 ===
  serverConnected: boolean
  serverReady: boolean     // true = connected + skills API 可用（初始化完成）
  serverPort: number | null
  serveMode: string        // 'embedded' | 'spawn' | 'unknown'
  setServerPort: (port: number | null) => void

  // === 当前 Session ===
  currentSessionID: string | null
  setCurrentSession: (id: string | null) => void

  // === Session 列表 ===
  sessions: SessionInfo[]
  setSessions: (sessions: SessionInfo[]) => void

  // === 消息（按 sessionID 索引）===
  messages: Record<string, MessageWithParts[]>

  // === Session 状态 ===
  sessionStatus: Record<string, SessionStatusInfo>

  // === 权限请求 ===
  permissionRequests: Record<string, PermissionRequest[]>

  // === 文件 Diff ===
  sessionDiffs: Record<string, FileDiff[]>

  // === 错误 ===
  lastError: string | null
  setLastError: (error: string | null) => void
  initError: string | null  // 初始化超时等不可恢复错误

  // === 当前模型/Provider ===
  currentProvider: string
  currentModel: string
  setModel: (providerId: string, modelId: string) => void

  // === 可用模型列表（从 mimo serve 或 fallback 加载）===
  availableProviders: Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }>

  // === Actions ===
  loadSessions: () => Promise<void>
  loadMessages: (sessionID: string) => Promise<void>
  sendMessage: (text: string) => Promise<void>
  abortSession: () => Promise<void>
  replyPermission: (sessionID: string, permissionID: string, reply: 'once' | 'always' | 'reject') => Promise<void>
  deleteSession: (sessionID: string) => Promise<void>
  createSession: (title?: string) => Promise<SessionInfo | null>

  // === SSE 事件处理 ===
  initSSE: () => () => void  // 返回 unsubscribe 函数
  retryInit: () => void
}

export const useChatStore = create<ChatState>()((set, get) => ({
  // === 连接状态 ===
  serverConnected: false,
  serverReady: false,
  serverPort: null,
  serveMode: 'unknown',
  setServerPort: (port) => set({ serverPort: port }),

  // === 当前 Session ===
  currentSessionID: null,
  setCurrentSession: (id) => set({ currentSessionID: id }),

  // === Session 列表 ===
  sessions: [],
  setSessions: (sessions) => set({ sessions }),

  // === 消息 ===
  messages: {},

  // === Session 状态 ===
  sessionStatus: {},

  // === 权限请求 ===
  permissionRequests: {},

  // === 文件 Diff ===
  sessionDiffs: {},

  // === 错误 ===
  lastError: null,
  setLastError: (error) => set({ lastError: error }),
  initError: null,

  // === 当前模型/Provider ===
  currentProvider: 'mimo',
  currentModel: '',
  setModel: (providerId: string, modelId: string) => set({ currentProvider: providerId, currentModel: modelId }),

  // === 可用模型列表 ===
  availableProviders: [],

  // ============================================================
  // Actions
  // ============================================================

  loadSessions: async () => {
    try {
      // 获取本应用追踪的 session ID 列表
      const myIds = await getMySessionIds()
      const allSessions = await mimoClient.listSessions()
      // 只显示本应用创建的 session
      const sessions = allSessions.filter(s => myIds.has(s.id))
      sessions.sort((a, b) => b.time.updated - a.time.updated)
      set({ sessions })
    } catch (err) {
      console.error('loadSessions error:', err)
    }
  },

  loadMessages: async (sessionID: string) => {
    try {
      const msgs = await mimoClient.getMessages(sessionID)
      set((state) => ({
        messages: { ...state.messages, [sessionID]: msgs },
      }))
    } catch (err) {
      console.error('loadMessages error:', err)
    }
  },

  sendMessage: async (text: string) => {
    const state = get()
    if (!text.trim()) return

    // 创建 AbortController 用于中止（Agent 模式 + Fallback 模式共用）
    const abortController = new AbortController()
    currentAbortController = abortController

    let sessionID = state.currentSessionID

    // === 正常模式：mimo serve 已连接 ===
    if (state.serverConnected && mimoClient.isConnected) {
      // 如果没有当前 session，在服务端创建一个
      if (!sessionID) {
        try {
          const session = await mimoClient.createSession({
            title: text.slice(0, 30) + (text.length > 30 ? '...' : ''),
          })
          sessionID = session.id
          set({ currentSessionID: sessionID })
          await trackSession(sessionID!)
          get().loadSessions()
          // 加载 session 的消息（初始为空）
          set((s) => ({ messages: { ...s.messages, [sessionID!]: [] } }))
        } catch (err) {
          set({ lastError: `创建会话失败: ${err instanceof Error ? err.message : String(err)}` })
          return
        }
      }

      // 调用 prompt_async（服务端自动创建 user message + 启动 agent loop）
      const parts: TextPartInput[] = [{ type: 'text', text }]
      const opts: any = {}
      if (state.currentProvider && state.currentProvider !== 'mimo' && state.currentModel) {
        opts.model = { providerID: state.currentProvider, modelID: state.currentModel }
        // 外部模型 — 先确保 API Key 已同步到服务端
        try {
          if (isElectron()) {
            const raw = await getAPI().settings.get('apiKeys')
            if (raw) {
              const keys: Record<string, string> = JSON.parse(raw)
              if (keys[state.currentProvider]) {
                await mimoClient.setAuth(state.currentProvider, keys[state.currentProvider])
              }
            }
          }
        } catch { /* 同步失败不阻塞，让服务端尝试 */ }
      }
      try {
        await mimoClient.sendMessage(sessionID, parts, opts)
        // prompt_async 返回 204，所有更新通过 SSE 推送
        return
      } catch (err) {
        // 服务端发送失败（如缺少 Provider 凭证），fallback 到直连 API
        console.warn('[chatStore] Server send failed, falling back to directChat:', err)
        // 不 return，继续走到下面的 fallback 逻辑
      }
    }

    // === Fallback 模式：直连 Provider API ===
    if (!sessionID) {
      sessionID = crypto.randomUUID()
      set({ currentSessionID: sessionID })
    }

    // 创建用户消息（本地）
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
      if (dp) { /* use getDefaultProvider result */ modelId = dp.modelId }
      else {
        set({ lastError: '未检测到可用的 AI Provider，请在设置中配置 API Key 或安装 MiMo CLI' })
        return
      }
    }

    // 收集对话历史
    const msgs = get().messages[sessionID] || [userMsg]
    const history = msgs.map(m => ({
      role: m.info.role,
      content: m.parts.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map(p => p.text).join('\n'),
    }))

    // 加载 Memory + Skills 作为系统上下文
    let systemContext = ''
    if (isElectron()) {
      try {
        const api = getAPI()
        // 读取 USER.md 和 MEMORY.md
        const [userMd, memoryMd] = await Promise.all([
          api.files.readMemory('user'),
          api.files.readMemory('memory'),
        ])
        if (userMd) systemContext += `## 用户画像（USER.md）\n\n${userMd}\n\n`
        if (memoryMd) systemContext += `## 项目记忆（MEMORY.md）\n\n${memoryMd}\n\n`

        // 读取所有 Skill 文件
        const skills = await api.files.readSkills()
        if (skills && skills.length > 0) {
          systemContext += `## 技能规则（强制遵守）\n\n`
          for (const skill of skills) {
            systemContext += `### ${skill.name}\n${skill.content}\n\n`
          }
        }

        // 注入到对话开头作为 system 消息
        if (systemContext) {
          history.unshift({ role: 'system', content: systemContext })
        }
      } catch { /* 非关键路径 */ }
    }
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

    set((s) => ({
      messages: {
        ...s.messages,
        [sessionID!]: [...(s.messages[sessionID!] || []), assistantMsg],
      },
      sessionStatus: {
        ...s.sessionStatus,
        [sessionID!]: { type: 'busy' as const, message: '直接连接中...' },
      },
    }))

    try {
      await directChat(
        providerId,
        modelId,
        history,
        {
            onTextDelta: (delta: string) => {
              set((s) => {
                const sessionMsgs = s.messages[sessionID!]
                if (!sessionMsgs) return s
                const newMsgs = sessionMsgs.map(m => {
                  if (m.info.id !== assistantMsgId) return m
                  return {
                    ...m,
                    parts: m.parts.map(p => {
                      if (p.id !== textPartId) return p
                      return { ...p, text: (p as any).text + delta }
                    }),
                  }
                })
                return { messages: { ...s.messages, [sessionID!]: newMsgs } }
              })
            },
            onDone: (final: MessageWithParts) => {
              set((s) => {
                const sessionMsgs = s.messages[sessionID!]
                if (!sessionMsgs) return s
                const newMsgs = sessionMsgs.map(m =>
                  m.info.id === assistantMsgId ? final : m
                )
                return {
                  messages: { ...s.messages, [sessionID!]: newMsgs },
                  sessionStatus: { ...s.sessionStatus, [sessionID!]: { type: 'idle' } },
                }
              })
            },
            onError: (error: string) => {
              set((s) => {
                const sessionMsgs = s.messages[sessionID!]
                if (!sessionMsgs) return s
                const newMsgs = sessionMsgs.map(m => {
                  if (m.info.id !== assistantMsgId) return m
                  return {
                    ...m,
                    parts: [{ type: 'text', id: textPartId, sessionID: sessionID!, messageID: assistantMsgId, text: `⚠️ ${error}` }],
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
          abortController.signal,
        )
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          // 用户主动中止，不报错
        } else {
          set({
            lastError: `发送消息失败: ${err instanceof Error ? err.message : String(err)}`,
            sessionStatus: { ...get().sessionStatus, [sessionID!]: { type: 'idle' } },
          })
        }
      } finally {
        currentAbortController = null
      }

      return
  },

  abortSession: async () => {
    const state = get()

    // 先中止 directChat fallback（如果有）
    if (currentAbortController) {
      currentAbortController.abort()
      currentAbortController = null
      // 恢复 session 状态
      if (state.currentSessionID) {
        set((s) => ({
          sessionStatus: { ...s.sessionStatus, [state.currentSessionID!]: { type: 'idle' } },
        }))
      }
      return
    }

    // 再中止 Agent 模式的 session
    if (!state.currentSessionID) return
    try {
      await mimoClient.abortSession(state.currentSessionID)
    } catch (err) {
      console.error('abortSession error:', err)
    }
  },

  replyPermission: async (sessionID: string, permissionID: string, reply: 'once' | 'always' | 'reject') => {
    try {
      await mimoClient.replyPermission(sessionID, permissionID, reply)
      // 移除已处理的权限请求
      set((state) => {
        const requests = state.permissionRequests[sessionID]?.filter(r => r.id !== permissionID) || []
        return {
          permissionRequests: {
            ...state.permissionRequests,
            [sessionID]: requests,
          },
        }
      })
    } catch (err) {
      console.error('replyPermission error:', err)
    }
  },

  deleteSession: async (sessionID: string) => {
    try {
      await untrackSession(sessionID)
      await mimoClient.deleteSession(sessionID)
      set((state) => {
        const newSessions = state.sessions.filter(s => s.id !== sessionID)
        const newMessages = { ...state.messages }
        delete newMessages[sessionID]
        const newStatus = { ...state.sessionStatus }
        delete newStatus[sessionID]
        const newPerms = { ...state.permissionRequests }
        delete newPerms[sessionID]
        return {
          sessions: newSessions,
          messages: newMessages,
          sessionStatus: newStatus,
          permissionRequests: newPerms,
          currentSessionID: state.currentSessionID === sessionID ? null : state.currentSessionID,
        }
      })
    } catch (err) {
      console.error('deleteSession error:', err)
    }
  },

  createSession: async (title?: string) => {
    try {
      const session = await mimoClient.createSession({ title })
      await trackSession(session.id)
      set((state) => ({
        sessions: [session, ...state.sessions],
        currentSessionID: session.id,
      }))
      return session
    } catch (err) {
      console.error('createSession error:', err)
      return null
    }
  },

  // ============================================================
  // SSE 事件处理
  // ============================================================

  initSSE: () => {
    const handlers: Array<() => void> = []

    // message.part.delta — 逐字流式追加
    handlers.push(mimoClient.on('message.part.delta', (payload) => {
      const { sessionID, messageID, partID, field, delta } = payload.properties
      set((state) => {
        const sessionMsgs = state.messages[sessionID]
        if (!sessionMsgs) return state

        const newMsgs = sessionMsgs.map(msg => {
          if (msg.info.id !== messageID) return msg

          const newParts = msg.parts.map(part => {
            if (part.id !== partID) return part
            // 增量追加到指定字段
            return { ...part, [field]: (part as any)[field] + delta }
          })

          return { ...msg, parts: newParts }
        })

        return {
          messages: { ...state.messages, [sessionID]: newMsgs },
        }
      })
    }))

    // message.part.updated — Part 完整更新
    handlers.push(mimoClient.on('message.part.updated', (payload) => {
      const { sessionID, part } = payload.properties
      set((state) => {
        const sessionMsgs = state.messages[sessionID]
        if (!sessionMsgs) return state

        const messageID = part.messageID
        const newMsgs = sessionMsgs.map(msg => {
          if (msg.info.id !== messageID) return msg

          // 查找 part 是否已存在
          const partIndex = msg.parts.findIndex(p => p.id === part.id)
          let newParts: Part[]
          if (partIndex >= 0) {
            // 替换已有 part
            newParts = [...msg.parts]
            newParts[partIndex] = part
          } else {
            // 插入新 part（保持 ID 排序）
            newParts = [...msg.parts, part]
          }

          return { ...msg, parts: newParts }
        })

        return {
          messages: { ...state.messages, [sessionID]: newMsgs },
        }
      })
    }))

    // message.part.removed
    handlers.push(mimoClient.on('message.part.removed', (payload) => {
      const { sessionID, messageID, partID } = payload.properties
      set((state) => {
        const sessionMsgs = state.messages[sessionID]
        if (!sessionMsgs) return state

        const newMsgs = sessionMsgs.map(msg => {
          if (msg.info.id !== messageID) return msg
          return { ...msg, parts: msg.parts.filter(p => p.id !== partID) }
        })

        return {
          messages: { ...state.messages, [sessionID]: newMsgs },
        }
      })
    }))

    // message.updated — 消息创建/完成
    handlers.push(mimoClient.on('message.updated', (payload) => {
      const { sessionID, info } = payload.properties
      set((state) => {
        const sessionMsgs = state.messages[sessionID] || []

        // 查找消息是否已存在
        const existingIndex = sessionMsgs.findIndex(m => m.info.id === info.id)
        let newMsgs: MessageWithParts[]
        if (existingIndex >= 0) {
          // 更新已有消息的 info
          newMsgs = [...sessionMsgs]
          newMsgs[existingIndex] = { ...newMsgs[existingIndex], info }
        } else {
          // 插入新消息（用户消息先出现，助手消息后出现）
          newMsgs = [...sessionMsgs, { info, parts: [] }]
        }

        return {
          messages: { ...state.messages, [sessionID]: newMsgs },
        }
      })
    }))

    // message.removed
    handlers.push(mimoClient.on('message.removed', (payload) => {
      const { sessionID, messageID } = payload.properties
      set((state) => {
        const sessionMsgs = state.messages[sessionID]
        if (!sessionMsgs) return state

        return {
          messages: {
            ...state.messages,
            [sessionID]: sessionMsgs.filter(m => m.info.id !== messageID),
          },
        }
      })
    }))

    // session.created
    handlers.push(mimoClient.on('session.created', (payload) => {
      const { info } = payload.properties
      set((state) => {
        // 避免重复
        if (state.sessions.some(s => s.id === info.id)) return state
        return { sessions: [info, ...state.sessions] }
      })
    }))

    // session.updated
    handlers.push(mimoClient.on('session.updated', (payload) => {
      const { info } = payload.properties
      set((state) => ({
        sessions: state.sessions.map(s => s.id === info.id ? { ...s, ...info } : s),
      }))
    }))

    // session.deleted
    handlers.push(mimoClient.on('session.deleted', (payload) => {
      const { sessionID } = payload.properties
      set((state) => {
        const newMessages = { ...state.messages }
        delete newMessages[sessionID]
        const newStatus = { ...state.sessionStatus }
        delete newStatus[sessionID]
        return {
          sessions: state.sessions.filter(s => s.id !== sessionID),
          messages: newMessages,
          sessionStatus: newStatus,
          currentSessionID: state.currentSessionID === sessionID ? null : state.currentSessionID,
        }
      })
    }))

    // session.status — idle/busy/retry
    handlers.push(mimoClient.on('session.status', (payload) => {
      const { sessionID, status } = payload.properties
      set((state) => ({
        sessionStatus: { ...state.sessionStatus, [sessionID]: status },
      }))
    }))

    // session.diff
    handlers.push(mimoClient.on('session.diff', (payload) => {
      const { sessionID, diff } = payload.properties
      set((state) => ({
        sessionDiffs: { ...state.sessionDiffs, [sessionID]: diff },
      }))
    }))

    // session.error
    handlers.push(mimoClient.on('session.error', (payload) => {
      const error = payload.properties.error
      const sid = payload.properties.sessionID
      set((s) => ({
        lastError: `[${error.name || 'Error'}] ${error.message || 'Unknown error'}`,
        // 恢复 session 为 idle
        sessionStatus: sid ? { ...s.sessionStatus, [sid]: { type: 'idle' as const } } : s.sessionStatus,
      }))
    }))

    // permission.asked
    handlers.push(mimoClient.on('permission.asked', (payload) => {
      const request = payload.properties
      set((state) => {
        const existing = state.permissionRequests[request.sessionID] || []
        return {
          permissionRequests: {
            ...state.permissionRequests,
            [request.sessionID]: [...existing, request],
          },
        }
      })
    }))

    // permission.replied
    handlers.push(mimoClient.on('permission.replied', (payload) => {
      const { sessionID, requestID } = payload.properties
      set((state) => {
        const requests = state.permissionRequests[sessionID]?.filter(r => r.id !== requestID) || []
        return {
          permissionRequests: {
            ...state.permissionRequests,
            [sessionID]: requests,
          },
        }
      })
    }))

    // server.connected — 标记连接已建立，等待初始化完成后加载 session 列表
    handlers.push(mimoClient.on('server.connected', () => {
      set({ serverConnected: true })
      // mimo serve 首次启动会执行初始化（auto dream 等），期间 skills API 不可用
      // 轮询直到 skills API 可用，标记 serverReady
      const checkReady = async (retries = 0) => {
        if (retries > 30) { // 最多等 30 秒
          set({ initError: '初始化超时 — MiMo 服务未能在 30 秒内就绪，请检查网络连接后重试' })
          // 仍然尝试加载 sessions（可能会失败）
          get().loadSessions()
          return
        }
        try {
          const skills = await mimoClient.listSkills()
          // skills API 可用 = 初始化完成
          set({ serverReady: true, initError: null })
          get().loadSessions()
        } catch {
          // 还在初始化，1 秒后重试
          setTimeout(() => checkReady(retries + 1), 1000)
        }
      }
      checkReady()
    }))

    // 返回 unsubscribe 函数
    return () => {
      handlers.forEach(unsub => unsub())
    }
  },

  retryInit: () => {
    set({ initError: null })
    const checkReady = async (retries = 0) => {
      if (retries > 30) {
        set({ initError: '初始化超时 — MiMo 服务未能在 30 秒内就绪，请检查网络连接后重试' })
        return
      }
      try {
        await mimoClient.listSkills()
        set({ serverReady: true, initError: null })
        get().loadSessions()
      } catch {
        setTimeout(() => checkReady(retries + 1), 1000)
      }
    }
    checkReady()
  },
}))
