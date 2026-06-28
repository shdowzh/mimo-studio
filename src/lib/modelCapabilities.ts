// 模型能力查询 — 给定 (providerId, modelId, capability) 返回 'yes' | 'no' | 'unknown'
//
// 策略（按优先级）：
//   1. PROVIDER_TEMPLATES 里有匹配条目 + 显式声明 capabilities → 按声明回答
//   2. 启发式规则匹配（claude-* / gpt-4o / *-vision / *-vl-* 等）→ 'yes' / 'no'
//   3. 兜底 → 'unknown'
//
// 三态语义：UI 仅在 'no' 时提示用户"模型可能不支持该能力"。'unknown' 不打扰。
//          这样未来新模型自动归 unknown，不会冤枉。
//
// 注意：所有判断都是 best-effort。最终真相在 Provider API 响应，事后错误转译做兜底。

import { PROVIDER_TEMPLATES, type ModelCapability } from '@/config/providerTemplates'

export type CapabilityResult = 'yes' | 'no' | 'unknown'

// 启发式：模型 id 命中以下正则视为支持 vision
// 列表保守：宁可 unknown 不可错判 'no'，避免阻塞真正支持的模型
const VISION_YES_PATTERNS: RegExp[] = [
  /claude-(?:3|3\.5|3\.7|4|4\.\d+|opus|sonnet|haiku)/i, // Claude 3+ 全系都支持视觉
  /gpt-4o/i,
  /gpt-4\.1/i,
  /gpt-4-(?:turbo|vision)/i,
  /\bo[34](?:-mini|-pro)?\b/i, // o3 / o4-mini / o3-pro 等
  /gemini-(?:1\.5|2|2\.5|pro|flash)/i,
  /-vl-/i, // 阿里 qwen-vl-*, mini-cpm-vl 等
  /-vision/i,
  /llama-(?:3\.2|4)-(?:11b|90b|scout|maverick)/i, // Llama 3.2 11B/90B + Llama 4 全系支持视觉
  /glm-4(?:v|-plus|-air|-long)/i, // GLM-4V / GLM-4-Plus 等
]

// 启发式：明确不支持 vision 的纯文本模型家族
// 命中则返回 'no'（这里要更稳健，只列上游官方明确文档说"text only"的）
const VISION_NO_PATTERNS: RegExp[] = [
  /^deepseek-(?:chat|reasoner|v3|r1|coder)/i, // DeepSeek 官方明确纯文本
  /^moonshot-v1-(?:8k|32k|128k)$/i, // 非 vision 后缀的 Kimi 纯文本
  /^qwen-(?:turbo|plus|max|coder)/i, // Qwen 文本系（vl- 走 YES）
  /^qwen3-/i, // Qwen3 旗舰文本
  /^qwen-qwq-/i, // QWQ 推理纯文本
  /glm-4-flash$/i,
]

// tools 启发式（function calling）：现代主流 chat 模型基本都支持，简化只列已知不支持的
const TOOLS_NO_PATTERNS: RegExp[] = [
  /-base$/i, // -base 后缀通常是 completion 模型，没 tools
  /embedding/i,
]

function modelTemplate(providerId: string, modelId: string): { capabilities?: ModelCapability[] } | null {
  const p = PROVIDER_TEMPLATES.find((p) => p.id === providerId)
  if (!p) return null
  // 精确匹配优先；其次按 id 包含（sf 转发的 'deepseek-ai/DeepSeek-V3' 用户也可能简写）
  const exact = p.models.find((m) => m.id === modelId)
  if (exact) return exact
  const loose = p.models.find((m) => modelId && (m.id.includes(modelId) || modelId.includes(m.id)))
  return loose ?? null
}

/**
 * 查询某模型是否支持某能力。
 * 'yes'：模板显式声明 OR 启发式 YES 命中
 * 'no' ：模板显式声明了 capabilities 但不含 + 启发式 NO 命中
 * 'unknown'：没足够信息（新模型、第三方模型、自定义 provider）
 */
export function modelSupports(
  providerId: string | undefined,
  modelId: string | undefined,
  capability: ModelCapability,
): CapabilityResult {
  if (!providerId || !modelId) return 'unknown'
  // mimo provider 是 MiMo Code 的内部路由，下游模型不确定，统一 unknown 不打扰
  if (providerId === 'mimo' || providerId === 'opencode') return 'unknown'

  const tpl = modelTemplate(providerId, modelId)
  if (tpl?.capabilities) {
    return tpl.capabilities.includes(capability) ? 'yes' : 'no'
  }

  // 没有显式声明 → 启发式
  if (capability === 'vision') {
    if (VISION_YES_PATTERNS.some((re) => re.test(modelId))) return 'yes'
    if (VISION_NO_PATTERNS.some((re) => re.test(modelId))) return 'no'
    return 'unknown'
  }
  if (capability === 'tools') {
    if (TOOLS_NO_PATTERNS.some((re) => re.test(modelId))) return 'no'
    return 'unknown' // 默认假设支持，但不强声明
  }
  if (capability === 'reasoning') {
    // reasoning 模型命名特征明显
    if (/(?:^|-)(?:o[1-9](?:-mini|-pro)?|r1|qwq|reasoner)(?:-|$)/i.test(modelId)) return 'yes'
    return 'unknown'
  }
  return 'unknown'
}
