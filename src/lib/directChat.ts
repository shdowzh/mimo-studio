// Direct Chat — 直连 Provider API (mimo serve 不可用时的 Fallback)
// 支持 OpenAI 兼容 API 和 Anthropic API 的流式调用
// 无 Agent 能力（无工具调用/权限/文件Diff），但保证基础聊天可用

import { isElectron, getAPI } from './ipc'
import { loadAllApiKeys } from './secret'
import { PROVIDER_TEMPLATES } from '@/config/providerTemplates'
import type { MessageWithParts, Part, TextPart, StepFinishPart } from './mimoTypes'

interface ProviderEntry {
  id: string
  name: string
  type: 'openai-compatible' | 'anthropic'
  endpoint: string
  models: { id: string; name: string }[]
  enabled: boolean
}

interface StreamCallbacks {
  onTextDelta: (text: string) => void
  onDone: (final: MessageWithParts) => void
  onError: (error: string) => void
}

function generateId(): string {
  return crypto.randomUUID()
}

/**
 * 从本地设置加载 Provider 和 API Key
 */
async function loadProviders(): Promise<ProviderEntry[]> {
  if (!isElectron()) return []
  const raw = await getAPI().settings.get('customProviders')
  return raw ? JSON.parse(raw) : []
}

async function loadApiKeys(): Promise<Record<string, string>> {
  return loadAllApiKeys()
}

/**
 * 获取默认 Provider（优先级：mimo-free > openai > 第一个自定义）
 */
export async function getDefaultProvider(): Promise<{ providerId: string; modelId: string } | null> {
  const keys = await loadApiKeys()

  // 尝试 OpenAI
  if (keys['openai']) {
    return { providerId: 'openai', modelId: 'gpt-4o' }
  }
  // 尝试 Anthropic
  if (keys['anthropic']) {
    return { providerId: 'anthropic', modelId: 'claude-sonnet-4-6' }
  }
  // 尝试自定义
  const providers = await loadProviders()
  const first = providers.find(p => p.enabled && p.models.length > 0)
  if (first) {
    return { providerId: first.id, modelId: first.models[0].id }
  }
  return null
}

/**
 * 流式调用 OpenAI 兼容 API
 */
async function streamOpenAI(
  endpoint: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
) {
  const url = `${endpoint.replace(/\/$/, '')}/chat/completions`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
    }),
    signal,
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`OpenAI API error (${response.status}): ${errText.slice(0, 300)}`)
  }

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''
  let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue

      try {
        const json = JSON.parse(data)
        const delta = json.choices?.[0]?.delta?.content || ''
        if (delta) {
          fullText += delta
          callbacks.onTextDelta(delta)
        }
        // 收集最后一块的 usage
        if (json.usage) usage = json.usage
      } catch {
        // 忽略解析错误
      }
    }
  }

  // 构造最终消息
  const partId = generateId()
  const msgId = generateId()
  const textPart: TextPart = {
    type: 'text',
    id: partId,
    sessionID: '',
    messageID: msgId,
    text: fullText,
  }

  const finishPart: StepFinishPart = {
    type: 'step-finish',
    id: generateId(),
    sessionID: '',
    messageID: msgId,
    reason: 'stop',
    cost: 0,
    tokens: {
      input: usage?.prompt_tokens || 0,
      output: usage?.completion_tokens || 0,
      reasoning: 0,
      total: usage?.total_tokens || 0,
      cache: { read: 0, write: 0 },
    },
  }

  const result: MessageWithParts = {
    info: {
      id: msgId,
      sessionID: '',
      role: 'assistant',
      time: { created: Date.now(), completed: Date.now() },
      agent: 'direct',
      model: { providerID: 'openai', modelID: model },
    },
    parts: [textPart, finishPart],
  }

  callbacks.onDone(result)
}

/**
 * 流式调用 Anthropic API
 */
async function streamAnthropic(
  endpoint: string,
  apiKey: string,
  model: string,
  messages: { role: string; content: string }[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
) {
  // 分离 system 消息（Anthropic 需要单独的 system 字段）
  const systemMsgs = messages.filter(m => m.role === 'system')
  const chatMsgs = messages.filter(m => m.role !== 'system')

  const url = `${endpoint.replace(/\/$/, '')}/messages`
  const body: any = {
    model,
    max_tokens: 4096,
    messages: chatMsgs.map(m => ({ role: m.role, content: m.content })),
    stream: true,
  }
  if (systemMsgs.length > 0) {
    body.system = systemMsgs.map(m => m.content).join('\n\n')
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`Anthropic API error (${response.status}): ${errText.slice(0, 300)}`)
  }

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''
  let inputTokens = 0
  let outputTokens = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()

      try {
        const json = JSON.parse(data)
        if (json.type === 'content_block_delta') {
          const text = json.delta?.text || ''
          if (text) {
            fullText += text
            callbacks.onTextDelta(text)
          }
        } else if (json.type === 'message_start') {
          inputTokens = json.message?.usage?.input_tokens || 0
        } else if (json.type === 'message_delta') {
          outputTokens = json.usage?.output_tokens || 0
        }
      } catch {
        // 忽略解析错误
      }
    }
  }

  // 构造最终消息
  const partId = generateId()
  const msgId = generateId()
  const textPart: TextPart = {
    type: 'text',
    id: partId,
    sessionID: '',
    messageID: msgId,
    text: fullText,
  }

  const finishPart: StepFinishPart = {
    type: 'step-finish',
    id: generateId(),
    sessionID: '',
    messageID: msgId,
    reason: 'stop',
    cost: 0,
    tokens: {
      input: inputTokens,
      output: outputTokens,
      reasoning: 0,
      total: inputTokens + outputTokens,
      cache: { read: 0, write: 0 },
    },
  }

  const result: MessageWithParts = {
    info: {
      id: msgId,
      sessionID: '',
      role: 'assistant',
      time: { created: Date.now(), completed: Date.now() },
      agent: 'direct',
      model: { providerID: 'anthropic', modelID: model },
    },
    parts: [textPart, finishPart],
  }

  callbacks.onDone(result)
}

/**
 * 直连聊天入口
 */
export async function directChat(
  providerId: string,
  modelId: string,
  messages: { role: string; content: string }[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
) {
  const keys = await loadApiKeys()
  let apiKey: string | undefined
  let endpoint: string
  let type: 'openai-compatible' | 'anthropic'

  // 先尝试模板
  const tpl = PROVIDER_TEMPLATES.find(p => p.id === providerId)
  if (tpl) {
    apiKey = keys[providerId]
    endpoint = tpl.endpoint
    type = tpl.type
  } else if (providerId === 'openai') {
    apiKey = keys['openai']
    endpoint = 'https://api.openai.com/v1'
    type = 'openai-compatible'
  } else if (providerId === 'anthropic') {
    apiKey = keys['anthropic']
    endpoint = 'https://api.anthropic.com/v1'
    type = 'anthropic'
  } else {
    // 自定义 provider（用户手动添加的，或 custom_ 前缀的动态添加的）
    const providers = await loadProviders()
    const provider = providers.find(p => p.id === providerId)
    if (provider) {
      apiKey = keys[providerId]
      endpoint = provider.endpoint
      type = provider.type
    } else if (providerId.startsWith('custom_')) {
      // 兼容 custom_ 前缀的 provider（从自定义 Provider 表单添加的）
      apiKey = keys[providerId]
      if (!apiKey) throw new Error(`No API key configured for ${providerId}`)
      // 需要从 customProviders 读取 endpoint
      const customProviders = await loadProviders()
      const cp = customProviders.find(p => p.id === providerId)
      if (cp) {
        endpoint = cp.endpoint
        type = cp.type
      } else {
        throw new Error(`Custom provider ${providerId} metadata not found`)
      }
    } else {
      throw new Error(`Provider ${providerId} not found`)
    }
  }

  if (!apiKey) throw new Error(`No API key configured for ${providerId}`)

  if (type === 'anthropic') {
    await streamAnthropic(endpoint, apiKey, modelId, messages, callbacks, signal)
  } else {
    await streamOpenAI(endpoint, apiKey, modelId, messages, callbacks, signal)
  }
}
