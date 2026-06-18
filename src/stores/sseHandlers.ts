// SSE 事件 → chatStore 状态更新
// 所有 mimo serve 推送事件的处理逻辑，从 chatStore.initSSE() 抽出
// 每个 handler 返回 Partial<ChatState>（由调用方 set 进 store）

import type {
  MessageWithParts,
  Part,
  StepFinishPart,
  PermissionRequest,
  FileDiff,
  SessionStatusInfo,
  SessionInfo,
  SSEEventPayload,
} from '@/lib/mimoTypes'
import type { ChatState } from './chatStore'

// ── 辅助：按 messageID 索引消息，避免 .map 遍历 ──

interface MessageIndex {
  index: number
  msg: MessageWithParts
}

function findMessageIndex(msgs: MessageWithParts[], messageID: string): MessageIndex | null {
  const idx = msgs.findIndex(m => m.info.id === messageID)
  return idx >= 0 ? { index: idx, msg: msgs[idx] } : null
}

// ── delta 更新：直接定位 message + part，O(1) 修改 ──

function applyDelta(
  state: ChatState,
  sessionID: string,
  messageID: string,
  partID: string,
  field: string,
  delta: string,
): Partial<ChatState> | null {
  const sessionMsgs = state.messages[sessionID]
  if (!sessionMsgs) return null

  const found = findMessageIndex(sessionMsgs, messageID)
  if (!found) return null

  const partIdx = found.msg.parts.findIndex(p => p.id === partID)
  if (partIdx < 0) return null

  // 最小化不可变更新：只重建目标 message + 目标 part
  const newParts = [...found.msg.parts]
  newParts[partIdx] = { ...newParts[partIdx], [field]: (newParts[partIdx] as any)[field] + delta }

  const newMsgs = [...sessionMsgs]
  newMsgs[found.index] = { ...found.msg, parts: newParts }

  return { messages: { ...state.messages, [sessionID]: newMsgs } }
}

/**
 * 批量 delta 合并模式：直接 mutate state.messages 内部，不做中间不可变重建。
 * 由 chatStore 的 rAF 批量机制调用——每次 flush 前可对同一 part 的多次 delta 合并追加，
 * flush 时只做一次 set({ messages }) 触发一次 React 渲染。
 *
 * 注意：此函数会 side-effect 修改 state.messages 引用内部的对象。
 *       只在 rAF 批量模式下安全使用（flush 完成后 set 一次即可）。
 */
export function applyMergedDelta(
  state: ChatState,
  sessionID: string,
  messageID: string,
  partID: string,
  field: string,
  delta: string,
): Partial<ChatState> | null {
  const sessionMsgs = state.messages[sessionID]
  if (!sessionMsgs) return null

  const msgIdx = sessionMsgs.findIndex(m => m.info.id === messageID)
  if (msgIdx < 0) return null

  const msg = sessionMsgs[msgIdx]
  const partIdx = msg.parts.findIndex(p => p.id === partID)
  if (partIdx < 0) return null

  const current = (msg.parts[partIdx] as any)[field] || ''
  const newParts = [...msg.parts]
  newParts[partIdx] = { ...newParts[partIdx], [field]: current + delta }

  const newMsgs = [...sessionMsgs]
  newMsgs[msgIdx] = { ...msg, parts: newParts }

  return { messages: { ...state.messages, [sessionID]: newMsgs } }
}

// ── 各事件处理器 ──

export function handlePartDelta(
  state: ChatState,
  payload: SSEEventPayload,
): Partial<ChatState> | null {
  const { sessionID, messageID, partID, field, delta } = payload.properties as any
  if (!sessionID || !messageID || !partID) return null
  return applyDelta(state, sessionID, messageID, partID, field, delta)
}

export function handlePartUpdated(
  state: ChatState,
  payload: SSEEventPayload,
): Partial<ChatState> | null {
  const { sessionID, part } = payload.properties as any
  if (!sessionID || !part) return null

  const messageID = part.messageID
  const sessionMsgs = state.messages[sessionID] || []

  const found = findMessageIndex(sessionMsgs, messageID)
  if (!found) {
    // 消息容器还没建（message.updated 还没到），先占位创建
    // 后续 message.updated 会通过 handleMessageUpdated 补全 info
    const placeholder: MessageWithParts = {
      info: {
        id: messageID,
        sessionID,
        role: part.type === 'text' && !part.synthetic ? 'assistant' : 'assistant',
        time: { created: Date.now() },
        agent: 'main',
        model: { providerID: '', modelID: '' },
      },
      parts: [part],
    }
    return {
      messages: { ...state.messages, [sessionID]: [...sessionMsgs, placeholder] },
    }
  }

  const partIndex = found.msg.parts.findIndex(p => p.id === part.id)
  const newParts = [...found.msg.parts]
  if (partIndex >= 0) {
    newParts[partIndex] = part
  } else {
    newParts.push(part)
  }

  const newMsgs = [...sessionMsgs]
  newMsgs[found.index] = { ...found.msg, parts: newParts }
  return { messages: { ...state.messages, [sessionID]: newMsgs } }
}

export function handlePartRemoved(
  state: ChatState,
  payload: SSEEventPayload,
): Partial<ChatState> | null {
  const { sessionID, messageID, partID } = payload.properties as any
  if (!sessionID || !messageID) return null

  const sessionMsgs = state.messages[sessionID]
  if (!sessionMsgs) return null

  const found = findMessageIndex(sessionMsgs, messageID)
  if (!found) return null

  const newMsgs = [...sessionMsgs]
  newMsgs[found.index] = { ...found.msg, parts: found.msg.parts.filter(p => p.id !== partID) }
  return { messages: { ...state.messages, [sessionID]: newMsgs } }
}

export function handleMessageUpdated(
  state: ChatState,
  payload: SSEEventPayload,
): Partial<ChatState> | null {
  const { sessionID, info } = payload.properties as any
  if (!sessionID || !info) return null

  const sessionMsgs = state.messages[sessionID] || []
  const existingIndex = sessionMsgs.findIndex(m => m.info.id === info.id)

  const newMsgs = [...sessionMsgs]
  if (existingIndex >= 0) {
    newMsgs[existingIndex] = { ...newMsgs[existingIndex], info }
  } else {
    newMsgs.push({ info, parts: [] })
  }

  return { messages: { ...state.messages, [sessionID]: newMsgs } }
}

export function handleMessageRemoved(
  state: ChatState,
  payload: SSEEventPayload,
): Partial<ChatState> | null {
  const { sessionID, messageID } = payload.properties as any
  if (!sessionID) return null

  const sessionMsgs = state.messages[sessionID]
  if (!sessionMsgs) return null

  return {
    messages: {
      ...state.messages,
      [sessionID]: sessionMsgs.filter(m => m.info.id !== messageID),
    },
  }
}

export function handleSessionCreated(
  state: ChatState,
  payload: SSEEventPayload,
): Partial<ChatState> | null {
  const { info } = payload.properties as any
  if (!info) return null
  if (state.sessions.some(s => s.id === info.id)) return null
  return { sessions: [info, ...state.sessions] }
}

export function handleSessionUpdated(
  state: ChatState,
  payload: SSEEventPayload,
): Partial<ChatState> | null {
  const { info } = payload.properties as any
  if (!info) return null
  return { sessions: state.sessions.map(s => s.id === info.id ? { ...s, ...info } : s) }
}

export function handleSessionDeleted(
  state: ChatState,
  payload: SSEEventPayload,
): Partial<ChatState> | null {
  const { sessionID } = payload.properties as any
  if (!sessionID) return null
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
}

export function handleSessionStatus(
  state: ChatState,
  payload: SSEEventPayload,
): Partial<ChatState> | null {
  const props = (payload.properties || {}) as any
  const sessionID = props.sessionID || state.currentSessionID
  if (!sessionID) return null
  const status = props.status || (props.type ? props : null)
  if (!status) return null
  return { sessionStatus: { ...state.sessionStatus, [sessionID]: status } }
}

export function handleSessionIdle(
  state: ChatState,
  payload: SSEEventPayload,
): Partial<ChatState> | null {
  // session.idle 事件：不带 status 对象，直接标记 session 为空闲
  const sessionID = (payload.properties as any)?.sessionID || state.currentSessionID
  if (!sessionID) return null
  return { sessionStatus: { ...state.sessionStatus, [sessionID]: { type: 'idle' as const } } }
}

export function handleSessionDiff(
  state: ChatState,
  payload: SSEEventPayload,
): Partial<ChatState> | null {
  const { sessionID, diff } = payload.properties as any
  if (!sessionID) return null
  return { sessionDiffs: { ...state.sessionDiffs, [sessionID]: diff } }
}

export function handleSessionError(
  state: ChatState,
  payload: SSEEventPayload,
): Partial<ChatState> | null {
  const { error, sessionID } = payload.properties as any
  const sid = sessionID
  return {
    lastError: `[${error?.name || 'Error'}] ${error?.message || 'Unknown error'}`,
    sessionStatus: sid ? { ...state.sessionStatus, [sid]: { type: 'idle' as const } } : state.sessionStatus,
  }
}

export function handlePermissionAsked(
  state: ChatState,
  payload: SSEEventPayload,
): Partial<ChatState> | null {
  const request = payload.properties as any
  if (!request?.sessionID) return null
  const existing = state.permissionRequests[request.sessionID] || []
  return {
    permissionRequests: {
      ...state.permissionRequests,
      [request.sessionID]: [...existing, request],
    },
  }
}

export function handlePermissionReplied(
  state: ChatState,
  payload: SSEEventPayload,
): Partial<ChatState> | null {
  const { sessionID, requestID } = payload.properties as any
  if (!sessionID) return null
  const requests = state.permissionRequests[sessionID]?.filter(r => r.id !== requestID) || []
  return {
    permissionRequests: { ...state.permissionRequests, [sessionID]: requests },
  }
}

// ── 事件类型 → handler 映射表 ──

type SseHandler = (state: ChatState, payload: SSEEventPayload) => Partial<ChatState> | null

export const SSE_HANDLER_MAP: Record<string, SseHandler> = {
  'message.part.delta': handlePartDelta,
  'message.part.updated': handlePartUpdated,
  'message.part.removed': handlePartRemoved,
  'message.updated': handleMessageUpdated,
  'message.removed': handleMessageRemoved,
  'session.created': handleSessionCreated,
  'session.updated': handleSessionUpdated,
  'session.deleted': handleSessionDeleted,
  'session.status': handleSessionStatus,
  'session.idle': handleSessionIdle,
  'session.diff': handleSessionDiff,
  'session.error': handleSessionError,
  'permission.asked': handlePermissionAsked,
  'permission.replied': handlePermissionReplied,
}
