// MiMo Code Desktop — 聊天状态管理
// 纯状态 + 薄 action 入口，业务逻辑在 chatFlow.ts / sseHandlers.ts

import { create } from 'zustand'
import { mimoClient } from '@/lib/mimoClient'
import { isElectron, getAPI } from '@/lib/ipc'
import { sendMessageFlow } from './chatFlow'
import { pushRecentPrompt } from '@/lib/recentPrompts'
import { SSE_HANDLER_MAP, applyMergedDelta } from './sseHandlers'
import type {
  SessionInfo,
  MessageWithParts,
  SessionStatusInfo,
  PermissionRequest,
  FileDiff,
} from '@/lib/mimoTypes'

// === 本地 Session 追踪 ===
const MY_SESSIONS_KEY = 'mySessionIds'
const PINNED_SESSIONS_KEY = 'pinned-sessions'

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

async function getPinnedSessionIds(): Promise<string[]> {
  if (!isElectron()) return []
  const raw = await getAPI().settings.get(PINNED_SESSIONS_KEY)
  return raw ? JSON.parse(raw) : []
}

async function setPinnedSessionIds(ids: string[]) {
  if (!isElectron()) return
  await getAPI().settings.set(PINNED_SESSIONS_KEY, JSON.stringify(ids))
}

function sortSessions(sessions: SessionInfo[], pinnedIds: string[]) {
  const pinned = new Set(pinnedIds)
  return [...sessions].sort((a, b) => {
    const ap = pinned.has(a.id) ? 1 : 0
    const bp = pinned.has(b.id) ? 1 : 0
    if (ap !== bp) return bp - ap
    return b.time.updated - a.time.updated
  })
}

// === 状态接口 ===

// 连接状态机：discriminated union，只允许合法组合
export type ServerState =
  | { status: 'disconnected' }
  | { status: 'connecting'; port: number; password: string; mode: string }
  | { status: 'initializing'; port: number; password: string; mode: string }
  | { status: 'ready'; port: number; password: string; mode: string }
  | { status: 'error'; error: string; port: number; password: string; mode: string }

// 便捷 selector（组件可以从 serverState 派生，不用记联合键）
export const selectors = {
  serverConnected: (s: ChatState) => s.serverState.status !== 'disconnected',
  serverReady: (s: ChatState) => s.serverState.status === 'ready',
  isAgentMode: (s: ChatState) => s.serverState.status === 'ready',
  isInitializing: (s: ChatState) => s.serverState.status === 'initializing',
  isDirectMode: (s: ChatState) => s.serverState.status === 'disconnected',
  initError: (s: ChatState) => s.serverState.status === 'error' ? s.serverState.error : null,
  serveMode: (s: ChatState) => s.serverState.status === 'disconnected' ? 'unknown' : s.serverState.mode,
  serverPort: (s: ChatState) => s.serverState.status === 'disconnected' ? null : s.serverState.port,
  serverPassword: (s: ChatState) => s.serverState.status === 'disconnected' ? '' : s.serverState.password,
}

export interface ChatState {
  // === mimo serve 连接状态（discriminated union）===
  serverState: ServerState
  setServerState: (state: ServerState) => void

  // === 当前 Session ===
  currentSessionID: string | null
  setCurrentSession: (id: string | null) => void

  // === Session 列表 ===
  sessions: SessionInfo[]
  setSessions: (sessions: SessionInfo[]) => void
  pinnedSessionIds: string[]

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

  // === 当前模型/Provider ===
  currentProvider: string
  currentModel: string
  setModel: (providerId: string, modelId: string) => void

  // === 可用模型列表 ===
  availableProviders: Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }>

  // === Actions ===
  loadSessions: () => Promise<void>
  loadMessages: (sessionID: string) => Promise<void>
  sendMessage: (text: string) => Promise<void>
  abortSession: () => Promise<void>
  replyPermission: (sessionID: string, permissionID: string, reply: 'once' | 'always' | 'reject') => Promise<void>
  deleteSession: (sessionID: string) => Promise<void>
  createSession: (title?: string) => Promise<SessionInfo | null>
  renameSession: (sessionID: string, title: string) => Promise<void>
  loadPinnedSessions: () => Promise<void>
  togglePinSession: (sessionID: string) => Promise<void>

  // === SSE ===
  initSSE: () => () => void
  retryInit: () => void
}

export const useChatStore = create<ChatState>()((set, get) => ({
  // === 连接状态 ===
  serverState: { status: 'disconnected' },
  setServerState: (state) => set({ serverState: state }),

  // === 当前 Session ===
  currentSessionID: null,
  setCurrentSession: (id) => set({ currentSessionID: id }),

  // === Session 列表 ===
  sessions: [],
  setSessions: (sessions) => set({ sessions }),
  pinnedSessionIds: [],

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
      const myIds = await getMySessionIds()
      const pinnedIds = await getPinnedSessionIds()
      const allSessions = await mimoClient.listSessions()
      const sessions = allSessions.filter(s => myIds.has(s.id))
      set({ sessions: sortSessions(sessions, pinnedIds), pinnedSessionIds: pinnedIds })
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
    const abortController = new AbortController()
    currentAbortController = abortController
    // T3.7：记录最近 prompt
    pushRecentPrompt(text).catch(() => {})
    try {
      await sendMessageFlow(text, abortController, {
        get,
        set,
        trackSession,
        loadSessions: get().loadSessions,
      })
    } finally {
      currentAbortController = null
    }
  },

  abortSession: async () => {
    const state = get()

    if (currentAbortController) {
      currentAbortController.abort()
      currentAbortController = null
      if (state.currentSessionID) {
        set((s) => ({
          sessionStatus: { ...s.sessionStatus, [state.currentSessionID!]: { type: 'idle' } },
        }))
      }
      return
    }

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
      set((state) => {
        const requests = state.permissionRequests[sessionID]?.filter(r => r.id !== permissionID) || []
        return {
          permissionRequests: { ...state.permissionRequests, [sessionID]: requests },
        }
      })
    } catch (err) {
      console.error('replyPermission error:', err)
    }
  },

  deleteSession: async (sessionID: string) => {
    try {
      await untrackSession(sessionID)
      const nextPinned = get().pinnedSessionIds.filter(id => id !== sessionID)
      await setPinnedSessionIds(nextPinned)
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
          pinnedSessionIds: nextPinned,
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
        sessions: sortSessions([session, ...state.sessions], state.pinnedSessionIds),
        currentSessionID: session.id,
      }))
      return session
    } catch (err) {
      console.error('createSession error:', err)
      return null
    }
  },

  renameSession: async (sessionID: string, title: string) => {
    try {
      const updated = await mimoClient.updateSession(sessionID, { title })
      set((state) => ({
        sessions: sortSessions(
          state.sessions.map(s => s.id === sessionID ? { ...s, ...updated, title } : s),
          state.pinnedSessionIds,
        ),
      }))
    } catch (err) {
      console.error('renameSession error:', err)
    }
  },

  loadPinnedSessions: async () => {
    const pinnedIds = await getPinnedSessionIds()
    set((state) => ({
      pinnedSessionIds: pinnedIds,
      sessions: sortSessions(state.sessions, pinnedIds),
    }))
  },

  togglePinSession: async (sessionID: string) => {
    const current = get().pinnedSessionIds
    const next = current.includes(sessionID)
      ? current.filter(id => id !== sessionID)
      : [...current, sessionID]
    await setPinnedSessionIds(next)
    set((state) => ({
      pinnedSessionIds: next,
      sessions: sortSessions(state.sessions, next),
    }))
  },

  // ============================================================
  // SSE 事件处理（委托给 sseHandlers.ts）
  // 使用 rAF 批量合并 set()，避免每个 token 都触发一次 React 渲染
  // ============================================================

  initSSE: () => {
    const handlers: Array<() => void> = []

    // ── 批量更新机制 ──
    // 高频 delta 事件攒到 requestAnimationFrame 统一刷一次
    // 同一个 part 的多个 delta 会合并追加（避免中间态的不可变重建开销）
    const pendingDeltas: Map<string, { sessionID: string; messageID: string; partID: string; field: string; delta: string }> = new Map()
    let rafId: number | null = null

    function flushDeltas() {
      rafId = null
      if (pendingDeltas.size === 0) return
      const state = get()
      // 拷贝 messages 引用，避免污染原 state（applyMergedDelta 会 mutate parts）
      let newMessages = state.messages
      let dirty = false
      for (const [, d] of pendingDeltas) {
        const update = applyMergedDelta({ ...state, messages: newMessages } as any, d.sessionID, d.messageID, d.partID, d.field, d.delta)
        if (update?.messages) {
          newMessages = update.messages
          dirty = true
        }
      }
      pendingDeltas.clear()
      if (dirty) set({ messages: newMessages })
    }

    function scheduleFlush() {
      if (!rafId) {
        rafId = requestAnimationFrame(flushDeltas)
      }
    }

    // delta 专用：合并同一 part 的多次追加
    function queueDelta(props: { sessionID: string; messageID: string; partID: string; field: string; delta: string }) {
      const key = `${props.sessionID}:${props.messageID}:${props.partID}:${props.field}`
      const existing = pendingDeltas.get(key)
      if (existing) {
        existing.delta += props.delta
      } else {
        pendingDeltas.set(key, { ...props })
      }
      scheduleFlush()
    }

    // 注册所有事件 handler
    for (const [eventType, handler] of Object.entries(SSE_HANDLER_MAP)) {
      handlers.push(mimoClient.on(eventType, (payload) => {
        // delta 事件走专用队列（高频，需合并），合并后一次 set
        if (eventType === 'message.part.delta') {
          const { sessionID, messageID, partID, field, delta } = payload.properties as any
          if (sessionID && messageID && partID) {
            queueDelta({ sessionID, messageID, partID, field, delta })
            return
          }
        }
        // 非 delta 事件：即时 set()，确保后续 handler 看到最新状态
        // （message.updated 创建 message → message.part.updated 立即能找到）
        const state = get()
        const update = handler(state, payload)
        if (update) {
          set(update)
          // 同时刷 pending deltas（用最新状态计算，避免目标 part 被覆盖）
          if (pendingDeltas.size > 0) {
            const latest = get()
            let newMessages = latest.messages
            let dirty = false
            for (const [, d] of pendingDeltas) {
              const du = applyMergedDelta({ ...latest, messages: newMessages } as any, d.sessionID, d.messageID, d.partID, d.field, d.delta)
              if (du?.messages) {
                newMessages = du.messages
                dirty = true
              }
            }
            pendingDeltas.clear()
            if (dirty) set({ messages: newMessages })
          }
        }
      }))
    }

    // server.connected — 标记连接已建立，轮询直到初始化完成
    handlers.push(mimoClient.on('server.connected', () => {
      const prev = get().serverState
      const port = prev.status !== 'disconnected' ? prev.port : 0
      const password = prev.status !== 'disconnected' ? prev.password : ''
      const mode = prev.status !== 'disconnected' ? prev.mode : 'unknown'
      set({ serverState: { status: 'initializing', port, password, mode } })
      const checkReady = async (retries = 0) => {
        if (retries > 30) {
          const s = get().serverState
          set({ serverState: { status: 'error', error: '初始化超时 — MiMo 服务未能在 30 秒内就绪，请检查网络连接后重试', port: s.status !== 'disconnected' ? s.port : 0, password: s.status !== 'disconnected' ? s.password : '', mode: s.status !== 'disconnected' ? s.mode : 'unknown' } })
          get().loadSessions()
          return
        }
        try {
          await mimoClient.listSkills()
          const s = get().serverState
          set({ serverState: { status: 'ready', port: s.status !== 'disconnected' ? s.port : 0, password: s.status !== 'disconnected' ? s.password : '', mode: s.status !== 'disconnected' ? s.mode : 'unknown' } })
          get().loadSessions()
        } catch {
          setTimeout(() => checkReady(retries + 1), 1000)
        }
      }
      checkReady()
    }))

    return () => {
      handlers.forEach(unsub => unsub())
    }
  },

  retryInit: () => {
    const prev = get().serverState
    const port = prev.status !== 'disconnected' ? prev.port : 0
    const password = prev.status !== 'disconnected' ? prev.password : ''
    const mode = prev.status !== 'disconnected' ? prev.mode : 'unknown'
    set({ serverState: { status: 'initializing', port, password, mode } })
    const checkReady = async (retries = 0) => {
      if (retries > 30) {
        set({ serverState: { status: 'error', error: '初始化超时 — MiMo 服务未能在 30 秒内就绪，请检查网络连接后重试', port, password, mode } })
        return
      }
      try {
        await mimoClient.listSkills()
        set({ serverState: { status: 'ready', port, password, mode } })
        get().loadSessions()
      } catch {
        setTimeout(() => checkReady(retries + 1), 1000)
      }
    }
    checkReady()
  },
}))
