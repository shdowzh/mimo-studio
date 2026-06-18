// directChat stream parser 测试
// 验证 OpenAI / Anthropic 格式的 SSE chunk 解析逻辑

import { describe, it, expect } from 'vitest'

// ── OpenAI stream parser ──

function parseOpenAIChunks(raw: string): { fullText: string; done: boolean } {
  const lines = raw.split('\n')
  let fullText = ''
  let done = false

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue
    const data = line.slice(6).trim()
    if (data === '[DONE]') { done = true; continue }
    try {
      const json = JSON.parse(data)
      const delta = json.choices?.[0]?.delta?.content || ''
      fullText += delta
    } catch {
      // ignore
    }
  }

  return { fullText, done }
}

// ── Anthropic stream parser ──

function parseAnthropicChunks(raw: string): { fullText: string; inputTokens: number; outputTokens: number } {
  const lines = raw.split('\n')
  let fullText = ''
  let inputTokens = 0
  let outputTokens = 0

  for (const line of lines) {
    if (!line.startsWith('data: ')) continue
    const data = line.slice(6).trim()
    try {
      const json = JSON.parse(data)
      if (json.type === 'content_block_delta') {
        const text = json.delta?.text || ''
        fullText += text
      } else if (json.type === 'message_start') {
        inputTokens = json.message?.usage?.input_tokens || 0
      } else if (json.type === 'message_delta') {
        outputTokens = json.usage?.output_tokens || 0
      }
    } catch {
      // ignore
    }
  }

  return { fullText, inputTokens, outputTokens }
}

describe('OpenAI stream parser', () => {
  it('解析流式 delta', () => {
    const raw = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}',
      'data: {"choices":[{"delta":{"content":" world"}}]}',
      'data: {"choices":[{"delta":{"content":"!"}}]}',
      'data: [DONE]',
      '',
    ].join('\n')
    const result = parseOpenAIChunks(raw)
    expect(result.fullText).toBe('Hello world!')
    expect(result.done).toBe(true)
  })

  it('空流', () => {
    const result = parseOpenAIChunks('data: [DONE]\n\n')
    expect(result.fullText).toBe('')
    expect(result.done).toBe(true)
  })

  it('无 delta 的 chunk 不追加文本', () => {
    const raw = [
      'data: {"choices":[{"delta":{"role":"assistant"}}]}',
      'data: {"choices":[{"delta":{"content":"Hi"}}]}',
      'data: [DONE]',
      '',
    ].join('\n')
    const result = parseOpenAIChunks(raw)
    expect(result.fullText).toBe('Hi')
  })

  it('忽略非 JSON 行', () => {
    const raw = [
      'data: not-json',
      'data: {"choices":[{"delta":{"content":"OK"}}]}',
      'data: [DONE]',
      '',
    ].join('\n')
    const result = parseOpenAIChunks(raw)
    expect(result.fullText).toBe('OK')
  })
})

describe('Anthropic stream parser', () => {
  it('解析 content_block_delta', () => {
    const raw = [
      'data: {"type":"message_start","message":{"usage":{"input_tokens":10}}}',
      'data: {"type":"content_block_start","content_block":{"type":"text"}}',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" from Anthropic"}}',
      'data: {"type":"message_delta","usage":{"output_tokens":5}}',
      '',
    ].join('\n')
    const result = parseAnthropicChunks(raw)
    expect(result.fullText).toBe('Hello from Anthropic')
    expect(result.inputTokens).toBe(10)
    expect(result.outputTokens).toBe(5)
  })

  it('空流', () => {
    expect(parseAnthropicChunks('')).toEqual({ fullText: '', inputTokens: 0, outputTokens: 0 })
  })

  it('非 content_block_delta 类型不产生文本', () => {
    const raw = [
      'data: {"type":"message_start","message":{"usage":{"input_tokens":0}}}',
      'data: {"type":"ping"}',
      'data: {"type":"message_delta","usage":{"output_tokens":0}}',
      '',
    ].join('\n')
    const result = parseAnthropicChunks(raw)
    expect(result.fullText).toBe('')
  })
})
