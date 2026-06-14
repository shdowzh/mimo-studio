// Provider Models — 从供应商 API 动态获取可用模型列表
// 支持 OpenAI 兼容 API 的 /v1/models 端点
// Anthropic 等不支持列表端点的则回退到模板

import { PROVIDER_TEMPLATES } from '@/config/providerTemplates'
import { isElectron, getAPI } from './ipc'

export interface DynamicModel {
  id: string
  name: string
  description?: string
  owned_by?: string
}

export interface DynamicProvider {
  providerId: string
  providerName: string
  models: DynamicModel[]
  fetched: boolean
  error?: string
}

/**
 * 从 OpenAI 兼容 API 获取模型列表
 * GET {endpoint}/models → { data: [{ id, ... }] }
 */
async function fetchOpenAICompatibleModels(
  endpoint: string,
  apiKey: string,
): Promise<DynamicModel[]> {
  const base = endpoint.replace(/\/$/, '')
  const url = `${base}/models`

  const resp = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(8000),
  })

  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)

  const json = await resp.json()
  const data = json.data || []

  // 过滤：只保留聊天/文本模型，排除过时、音频、图像、embedding 等
  const chatKeywords = ['gpt', 'claude', 'deepseek', 'qwen', 'glm', 'moonshot', 'llama', 'chat', 'coder', 'reasoner', 'turbo', 'o1', 'o3', 'o4', 'opus', 'sonnet', 'haiku', 'command', 'mistral', 'mixtral', 'gemini', 'kimi']
  const excludeKeywords = ['audio', 'tts', 'whisper', 'dall-e', 'embedding', 'moderation', 'babbage', 'davinci', 'instruct', 'vision-preview', 'gpt-3.5', 'gpt-4-0', 'gpt-4-vision']

  let models = data
    .filter((m: any) => m.id && typeof m.id === 'string')
    .filter((m: any) => {
      const id = m.id.toLowerCase()
      // 排除已知的非聊天模型
      if (excludeKeywords.some(k => id.includes(k))) return false
      // 匹配聊天关键词
      if (chatKeywords.some(k => id.includes(k))) return true
      // 其他模型也保留（有些 API 返回的模型 ID 可能不在关键词列表中）
      return true
    })
    .map((m: any) => ({
      id: m.id,
      name: m.id,
      description: m.owned_by || undefined,
      owned_by: m.owned_by,
    }))

  // 限制数量，避免几百个模型撑爆选择器
  if (models.length > 50) {
    models = models.slice(0, 50)
  }

  return models
}

/**
 * 尝试从 Anthropic API 获取模型（实验性）
 * 注意：Anthropic 不公开此端点，仅在特定条件下可用
 */
async function fetchAnthropicModels(
  _endpoint: string,
  _apiKey: string,
): Promise<DynamicModel[]> {
  // Anthropic 没有公开的 /models 端点
  // 回退到模板模型
  return []
}

/**
 * 加载已配置 Provider 的 API Keys
 */
async function loadApiKeys(): Promise<Record<string, string>> {
  if (!isElectron()) return {}
  try {
    const raw = await getAPI().settings.get('apiKeys')
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/**
 * 加载自定义 Provider 元数据
 */
async function loadCustomProviders(): Promise<Array<{ id: string; name: string; endpoint: string; type: 'openai-compatible' | 'anthropic'; models: any[] }>> {
  if (!isElectron()) return []
  try {
    const raw = await getAPI().settings.get('customProviders')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

/**
 * 为已配置 API Key 的 Provider 动态获取模型列表
 * 所有 Provider 并行请求，失败则回退到模板模型
 */
export async function fetchDynamicModels(): Promise<DynamicProvider[]> {
  const apiKeys = await loadApiKeys()
  const configuredTpls = PROVIDER_TEMPLATES.filter(tpl => !!apiKeys[tpl.id])
  const customProviders = await loadCustomProviders()
  const configuredCustom = customProviders.filter(cp => !!apiKeys[cp.id])

  if (configuredTpls.length === 0 && configuredCustom.length === 0) return []

  // 并行请求所有 Provider（模板 + 自定义）
  const templateResults = configuredTpls.map(async (tpl): Promise<DynamicProvider> => {
    const apiKey = apiKeys[tpl.id]
    let models: DynamicModel[] = []
    let fetched = false
    let error: string | undefined

    const fallbackModels: DynamicModel[] = tpl.models.map(m => ({
      id: m.id, name: m.name, description: m.description,
    }))

    if (tpl.type === 'openai-compatible') {
      try {
        models = await fetchOpenAICompatibleModels(tpl.endpoint, apiKey)
        fetched = true
      } catch (err: any) {
        error = err.message || String(err)
        models = fallbackModels
      }
    } else if (tpl.type === 'anthropic') {
      try {
        models = await fetchAnthropicModels(tpl.endpoint, apiKey)
        if (models.length === 0) models = fallbackModels
        else fetched = true
      } catch (err: any) {
        error = err.message || String(err)
        models = fallbackModels
      }
    }

    return { providerId: tpl.id, providerName: tpl.name, models, fetched, error }
  })

  const customResults = configuredCustom.map(async (cp): Promise<DynamicProvider> => {
    const apiKey = apiKeys[cp.id]
    let models: DynamicModel[] = []
    let fetched = false
    let error: string | undefined

    try {
      models = await fetchOpenAICompatibleModels(cp.endpoint, apiKey)
      fetched = true
    } catch (err: any) {
      error = err.message || String(err)
      models = cp.models?.length ? cp.models.map((m: any) => ({ id: m.id, name: m.name || m.id })) : []
    }

    return { providerId: cp.id, providerName: cp.name, models, fetched, error }
  })

  const results = await Promise.all([...templateResults, ...customResults])
  return results
}

/**
 * 根据 providerId + apiKey 获取单个 Provider 的模型列表
 */
export async function fetchModelsForProvider(
  providerId: string,
  apiKey: string,
): Promise<DynamicProvider | null> {
  const tpl = PROVIDER_TEMPLATES.find(p => p.id === providerId)
  if (!tpl) return null

  let models: DynamicModel[] = []
  let fetched = false
  let error: string | undefined

  if (tpl.type === 'openai-compatible') {
    try {
      models = await fetchOpenAICompatibleModels(tpl.endpoint, apiKey)
      fetched = true
    } catch (err: any) {
      error = err.message || String(err)
      models = tpl.models.map(m => ({ id: m.id, name: m.name, description: m.description }))
    }
  } else {
    models = tpl.models.map(m => ({ id: m.id, name: m.name, description: m.description }))
  }

  return {
    providerId: tpl.id,
    providerName: tpl.name,
    models,
    fetched,
    error,
  }
}
