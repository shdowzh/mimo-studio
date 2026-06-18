// mimoClient SSE 解析测试
// 核心逻辑：从 ReadableStream 的原始文本中解析 data: 行 → JSON → 分发事件

import { describe, it, expect, vi, beforeEach } from 'vitest'

// MimoClient 的 SSE 解析是私有的，但我们可以通过 on() 注册 handler
// 然后模拟事件到达来验证。由于 startSSE 依赖 fetch，我们单独测试解析逻辑。

// 抽取纯解析函数用于测试
function parseSSELines(raw: string): string[] {
  const lines = raw.split('\n')
  const dataLines: string[] = []
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6).trim()
      if (data) dataLines.push(data)
    }
  }
  return dataLines
}

function parseSSEEvent(dataStr: string): { type: string; properties: Record<string, unknown> } | null {
  try {
    const event = JSON.parse(dataStr)
    const payload = event.payload
    if (!payload || !payload.type) return null

    // SyncEvent 解包
    if (payload.type === 'sync') {
      const syncEvent = payload.syncEvent
      if (!syncEvent || !syncEvent.type) return null
      const baseType = syncEvent.type.replace(/\.v\d+$/, '')
      return { type: baseType, properties: syncEvent.data || {} }
    }

    return { type: payload.type, properties: payload.properties || {} }
  } catch {
    return null
  }
}

describe('SSE 解析', () => {
  it('解析单行 data', () => {
    const raw = 'data: {"payload":{"type":"session.created","properties":{"info":{"id":"s1"}}}}\n\n'
    const lines = parseSSELines(raw)
    expect(lines).toHaveLength(1)
    const evt = parseSSEEvent(lines[0])
    expect(evt?.type).toBe('session.created')
    expect(evt?.properties.info.id).toBe('s1')
  })

  it('解析多行 data', () => {
    const raw = [
      'data: {"payload":{"type":"message.part.delta","properties":{"sessionID":"s1","messageID":"m1","partID":"p1","field":"text","delta":"Hello"}}}',
      'data: {"payload":{"type":"message.part.delta","properties":{"sessionID":"s1","messageID":"m1","partID":"p1","field":"text","delta":" world"}}}',
      '',
    ].join('\n')
    const lines = parseSSELines(raw)
    expect(lines).toHaveLength(2)
    const e1 = parseSSEEvent(lines[0])
    expect(e1?.type).toBe('message.part.delta')
    expect(e1?.properties.delta).toBe('Hello')
    const e2 = parseSSEEvent(lines[1])
    expect(e2?.properties.delta).toBe(' world')
  })

  it('解包 SyncEvent（.v1 后缀去除）', () => {
    const raw = 'data: {"payload":{"type":"sync","syncEvent":{"type":"message.updated.v1","data":{"info":{"id":"m1"}}}}}\n\n'
    const lines = parseSSELines(raw)
    const evt = parseSSEEvent(lines[0])
    expect(evt?.type).toBe('message.updated')
    expect(evt?.properties.info.id).toBe('m1')
  })

  it('忽略非 JSON data', () => {
    const raw = 'data: keep-alive\n\ndata: {"payload":{"type":"session.created","properties":{}}}\n\n'
    const lines = parseSSELines(raw)
    expect(lines).toHaveLength(2)
    expect(parseSSEEvent(lines[0])).toBeNull()
    expect(parseSSEEvent(lines[1])?.type).toBe('session.created')
  })

  it('空输入不崩溃', () => {
    expect(parseSSELines('')).toHaveLength(0)
    expect(parseSSEEvent('')).toBeNull()
    expect(parseSSEEvent('not json')).toBeNull()
  })
})

describe('Basic Auth 构造', () => {
  it('正确编码 username:password', () => {
    const username = 'opencode'
    const password = 'test-password-123'
    const encoded = btoa(`${username}:${password}`)
    const header = `Basic ${encoded}`
    expect(header).toBe('Basic b3BlbmNvZGU6dGVzdC1wYXNzd29yZC0xMjM=')
    // 解码回来验证
    const decoded = atob(encoded)
    expect(decoded).toBe(`${username}:${password}`)
  })
})
