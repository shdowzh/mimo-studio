// MiMo Code Desktop — mimo serve HTTP/SSE 客户端
// 渲染器直连 mimo serve，不通过 IPC 代理

import type {
  SessionInfo,
  MessageWithParts,
  PartInput,
  SkillInfo,
  FileDiff,
  AgentInfo,
  ProviderInfo,
  HealthResponse,
  PermissionReply,
  GlobalSSEEvent,
  SSEEventPayload,
} from './mimoTypes'

type EventHandler = (payload: SSEEventPayload, event: GlobalSSEEvent) => void

export class MimoClient {
  private baseUrl = ''
  private password = ''
  private abortController: AbortController | null = null
  private handlers = new Map<string, Set<EventHandler>>()
  private wildcardHandlers = new Set<EventHandler>()
  private connected = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null
  private connecting = false
  private lastEventTime = 0
  private connectionChangeHandlers = new Set<(connected: boolean) => void>()

  // === 生命周期 ===

  /**
   * 注册连接状态变更回调（可多次调用，所有回调都会触发）
   * @returns 取消订阅函数
   */
  onConnectionChange(cb: (connected: boolean) => void): () => void {
    this.connectionChangeHandlers.add(cb)
    return () => this.connectionChangeHandlers.delete(cb)
  }

  /**
   * 连接到 mimo serve
   * 启动 SSE 事件流，自动重连
   */
  connect(port: number, password?: string, onConnectionChange?: (connected: boolean) => void) {
    this.baseUrl = `http://127.0.0.1:${port}`
    this.password = password || ''
    if (onConnectionChange) {
      this.connectionChangeHandlers.add(onConnectionChange)
    }
    this.startSSE()
  }

  /** 断开连接 */
  disconnect() {
    this.connected = false
    this.connecting = false
    this.clearTimers()
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    this.handlers.clear()
    this.wildcardHandlers.clear()
  }

  get isConnected() {
    return this.connected
  }

  get serverUrl() {
    return this.baseUrl
  }

  // === SSE 事件订阅 ===

  /**
   * 订阅 SSE 事件
   * @param eventType 事件类型（如 'message.part.delta'），或 '*' 订阅所有事件
   * @returns 取消订阅函数
   */
  on(eventType: string, handler: EventHandler): () => void {
    if (eventType === '*') {
      this.wildcardHandlers.add(handler)
      return () => this.wildcardHandlers.delete(handler)
    }

    let set = this.handlers.get(eventType)
    if (!set) {
      set = new Set()
      this.handlers.set(eventType, set)
    }
    set.add(handler)
    return () => {
      set!.delete(handler)
      if (set!.size === 0) this.handlers.delete(eventType)
    }
  }

  // === Session API ===

  async listSessions(): Promise<SessionInfo[]> {
    const res = await this.fetch('/session')
    if (!res.ok) throw new Error(`listSessions failed: ${res.status}`)
    return res.json()
  }

  async createSession(opts?: { title?: string; parentID?: string; contextFrom?: string }): Promise<SessionInfo> {
    const body: Record<string, string> = {}
    if (opts?.title) body.title = opts.title
    if (opts?.parentID) body.parentID = opts.parentID
    if (opts?.contextFrom) body.contextFrom = opts.contextFrom

    const res = await this.fetch('/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: Object.keys(body).length > 0 ? JSON.stringify(body) : '{}',
    })
    if (!res.ok) throw new Error(`createSession failed: ${res.status}`)
    return res.json()
  }

  async getSession(sessionID: string): Promise<SessionInfo> {
    const res = await this.fetch(`/session/${sessionID}`)
    if (!res.ok) throw new Error(`getSession failed: ${res.status}`)
    return res.json()
  }

  async updateSession(sessionID: string, data: { title?: string; permission?: unknown; time?: { archived?: number } }): Promise<SessionInfo> {
    const res = await this.fetch(`/session/${sessionID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error(`updateSession failed: ${res.status}`)
    return res.json()
  }

  async deleteSession(sessionID: string): Promise<void> {
    const res = await this.fetch(`/session/${sessionID}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`deleteSession failed: ${res.status}`)
  }

  // === Message/Prompt API ===

  async getMessages(sessionID: string, opts?: { limit?: number; before?: string }): Promise<MessageWithParts[]> {
    const params = new URLSearchParams()
    if (opts?.limit) params.set('limit', String(opts.limit))
    if (opts?.before) params.set('before', opts.before)
    const query = params.toString() ? `?${params.toString()}` : ''

    const res = await this.fetch(`/session/${sessionID}/message${query}`)
    if (!res.ok) throw new Error(`getMessages failed: ${res.status}`)
    return res.json()
  }

  /**
   * 发送消息（prompt_async — 火后不理）
   * 所有更新通过 SSE 事件流推送
   */
  async sendMessage(sessionID: string, parts: PartInput[], opts?: { model?: { providerID: string; modelID: string }; agent?: string }): Promise<void> {
    const body: Record<string, unknown> = { parts }
    if (opts?.model) body.model = opts.model
    if (opts?.agent) body.agent = opts.agent

    const res = await this.fetch(`/session/${sessionID}/prompt_async`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`sendMessage failed: ${res.status} ${errText.slice(0, 200)}`)
    }
    // 204 = accepted
  }

  /** 中止正在执行的 prompt */
  async abortSession(sessionID: string): Promise<void> {
    const res = await this.fetch(`/session/${sessionID}/abort`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (!res.ok) throw new Error(`abortSession failed: ${res.status}`)
  }

  // === Permission API ===

  async replyPermission(sessionID: string, permissionID: string, reply: PermissionReply, message?: string): Promise<void> {
    const body: Record<string, string> = { response: reply }
    if (message) body.message = message

    const res = await this.fetch(`/session/${sessionID}/permissions/${permissionID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`replyPermission failed: ${res.status}`)
  }

  // === Skill API ===

  async listSkills(): Promise<SkillInfo[]> {
    const res = await this.fetch('/skill')
    if (!res.ok) throw new Error(`listSkills failed: ${res.status}`)
    return res.json()
  }

  // === Diff API ===

  async getSessionDiff(sessionID: string, messageID?: string): Promise<FileDiff[]> {
    const params = messageID ? `?messageID=${encodeURIComponent(messageID)}` : ''
    const res = await this.fetch(`/session/${sessionID}/diff${params}`)
    if (!res.ok) throw new Error(`getSessionDiff failed: ${res.status}`)
    return res.json()
  }

  // === Agent & Provider API ===

  async listAgents(): Promise<AgentInfo[]> {
    const res = await this.fetch('/agent')
    if (!res.ok) throw new Error(`listAgents failed: ${res.status}`)
    return res.json()
  }

  async listProviders(): Promise<ProviderInfo[]> {
    const res = await this.fetch('/provider/')
    if (!res.ok) throw new Error(`listProviders failed: ${res.status}`)
    return res.json()
  }

  // === PTY（终端）API ===

  async listPtys(): Promise<any[]> {
    const res = await this.fetch('/pty/')
    if (!res.ok) throw new Error(`listPtys failed: ${res.status}`)
    return res.json()
  }

  async createPty(opts?: { shell?: string; cwd?: string; env?: Record<string, string> }): Promise<{ id: string }> {
    const res = await this.fetch('/pty/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts || {}),
    })
    if (!res.ok) throw new Error(`createPty failed: ${res.status}`)
    // 检查响应类型，防止 HTML 错误页被当作 JSON 解析
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('application/json')) {
      throw new Error('PTY not supported by this MiMo Serve version')
    }
    return res.json()
  }

  /** 连接到 PTY WebSocket。返回 WebSocket 实例 */
  connectPty(ptyID: string): WebSocket {
    const wsUrl = this.baseUrl.replace('http://', 'ws://')
    const url = `${wsUrl}/pty/${ptyID}/connect`
    const ws = new WebSocket(url)
    return ws
  }

  /** 删除 PTY 会话 */
  async deletePty(ptyID: string): Promise<void> {
    const res = await this.fetch(`/pty/${ptyID}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`deletePty failed: ${res.status}`)
  }

  // === Auth API ===

  /** 向服务端设置 Provider API Key */
  async setAuth(providerID: string, apiKey: string): Promise<void> {
    const res = await this.fetch(`/auth/${encodeURIComponent(providerID)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'api', key: apiKey }),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`setAuth failed: ${res.status} ${errText.slice(0, 200)}`)
    }
  }

  /** 从服务端删除 Provider API Key */
  async removeAuth(providerID: string): Promise<void> {
    const res = await this.fetch(`/auth/${encodeURIComponent(providerID)}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`removeAuth failed: ${res.status} ${errText.slice(0, 200)}`)
    }
  }

  // === Health ===

  async health(): Promise<HealthResponse> {
    const res = await this.fetch('/global/health')
    if (!res.ok) throw new Error(`health check failed: ${res.status}`)
    return res.json()
  }

  /** 检查服务端是否可用 */
  async isAvailable(): Promise<boolean> {
    try {
      const result = await this.health()
      return result.healthy === true
    } catch {
      return false
    }
  }

  // ============================================================
  // SSE 内部实现
  // ============================================================

  private async startSSE() {
    if (this.connecting) return
    this.connecting = true

    this.abortController = new AbortController()

    try {
      const url = `${this.baseUrl}/global/event`
      const headers: Record<string, string> = {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
      }
      if (this.password) {
        headers['Authorization'] = `Basic ${btoa(`opencode:${this.password}`)}`
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: this.abortController.signal,
      })

      if (!response.ok) {
        console.error('[MimoClient] SSE connection failed:', response.status)
        this.scheduleReconnect()
        return
      }

      this.connecting = false
      this.connected = true
      this.notifyConnectionChange(true)
      this.resetHeartbeat()

      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim()
            if (!data) continue
            try {
              const event: GlobalSSEEvent = JSON.parse(data)
              this.dispatchEvent(event)
              this.resetHeartbeat()
            } catch {
              // 忽略非 JSON 数据
            }
          }
        }
      }

      // 流结束 — 非主动断开，尝试重连
      if (this.connected) {
        this.connected = false
        this.notifyConnectionChange(false)
        this.scheduleReconnect()
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // 主动断开，不重连
        this.connecting = false
        return
      }
      console.error('[MimoClient] SSE error:', err)
      this.connecting = false
      this.connected = false
      this.notifyConnectionChange(false)
      this.scheduleReconnect()
    }
  }

  private dispatchEvent(event: GlobalSSEEvent) {
    const payload = event.payload
    if (!payload || !payload.type) return

    // SyncEvent 解包：{ type: "sync", syncEvent: { type: "message.updated.v1", data, ... } }
    // 将版本化的 type（如 "message.updated.v1"）转为 BusEvent type（"message.updated"）
    if (payload.type === 'sync') {
      const syncEvent = (payload as any).syncEvent
      if (!syncEvent || !syncEvent.type) return
      // 去除版本后缀： "message.updated.v1" → "message.updated"
      const baseType = syncEvent.type.replace(/\.v\d+$/, '')
      const busPayload: SSEEventPayload = {
        type: baseType as any,
        properties: syncEvent.data || {},
      }
      this.emitPayload(busPayload, event)
      return
    }

    this.emitPayload(payload, event)
  }

  private notifyConnectionChange(connected: boolean) {
    for (const handler of this.connectionChangeHandlers) {
      try { handler(connected) } catch (e) { console.error('[MimoClient] connection handler error:', e) }
    }
  }

  private emitPayload(payload: SSEEventPayload, event: GlobalSSEEvent) {
    // 分发给特定类型的处理器
    const typeHandlers = this.handlers.get(payload.type)
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        try { handler(payload, event) } catch (e) { console.error('[MimoClient] handler error:', e) }
      }
    }

    // 分发给通配符处理器
    for (const handler of this.wildcardHandlers) {
      try { handler(payload, event) } catch (e) { console.error('[MimoClient] wildcard handler error:', e) }
    }
  }

  private resetHeartbeat() {
    this.lastEventTime = Date.now()
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer)
    // 15秒无事件则认为连接断开
    this.heartbeatTimer = setTimeout(() => {
      if (this.connected && Date.now() - this.lastEventTime > 15_000) {
        console.warn('[MimoClient] Heartbeat timeout, reconnecting...')
        this.connected = false
        this.notifyConnectionChange(false)
        if (this.abortController) this.abortController.abort()
        this.scheduleReconnect()
      }
    }, 15_000)
  }

  private scheduleReconnect() {
    this.clearTimers()
    if (this.reconnectTimer) return

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connecting = false
      this.startSSE()
    }, 250)
  }

  private clearTimers() {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private async fetch(path: string, opts?: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      ...(opts?.headers as Record<string, string> || {}),
    }
    if (this.password && !headers['Authorization']) {
      headers['Authorization'] = `Basic ${btoa(`opencode:${this.password}`)}`
    }

    return fetch(url, {
      ...opts,
      headers,
      signal: opts?.signal || AbortSignal.timeout(30_000),
    })
  }
}

// 单例
export const mimoClient = new MimoClient()
