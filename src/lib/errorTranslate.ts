// 错误转译 — 把上游 Provider 报错（多为英文）转成中文友好提示 + 操作建议
//
// 策略：正则匹配关键字 → 命中后返回结构化结果。未命中原样返回。
// 调用点：
//   - sseHandlers.handleSessionError（SSE error 事件）
//   - chatFlow 的 sendViaAgent catch / sendViaDirectChat catch
//
// 设计原则：
//   - 不吞掉原始错误信息：raw 永远保留在 result.raw 里，UI 可选展开
//   - 提示尽量短，给出"下一步可做什么"

export interface TranslatedError {
  /** 短中文友好标题（一行内） */
  friendly: string
  /** 给用户的建议下一步（可选） */
  suggestion?: string
  /** 原始错误，供 hover 或展开查看 */
  raw: string
  /** 错误类别，可用于 UI 决定显示什么操作按钮 */
  category: 'vision-unsupported' | 'modality-unsupported' | 'auth' | 'rate-limit' | 'network' | 'context-too-long' | 'unknown'
}

interface MatchContext {
  /** 本次发送是否带图片附件 —— vision 误判的最强佐证 */
  hasImage?: boolean
}

// === 关键字表（按优先级） ===
const VISION_PATTERNS: RegExp[] = [
  /does not support image/i,
  /image.*not supported/i,
  /cannot process image/i,
  /unsupported.*image/i,
  /vision.*not supported/i,
  /image_url.*not.*supported/i,
  /multimodal.*not.*support/i,
  /not a (?:vision|multimodal) model/i,
]

const AUTH_PATTERNS: RegExp[] = [
  /\b401\b|\b403\b/,
  /unauthorized/i,
  /invalid.*api.*key/i,
  /authentication.*failed/i,
  /incorrect.*api.*key/i,
]

const RATE_LIMIT_PATTERNS: RegExp[] = [/\b429\b/, /rate.*limit/i, /quota/i, /too many requests/i]

const NETWORK_PATTERNS: RegExp[] = [
  /ECONNREFUSED/,
  /ECONNRESET/,
  /ETIMEDOUT/,
  /network.*error/i,
  /failed to fetch/i,
  /socket hang up/i,
]

const CONTEXT_PATTERNS: RegExp[] = [
  /context.*length/i,
  /maximum.*tokens?/i,
  /input is too long/i,
  /exceeds.*context/i,
  /token limit/i,
]

export function translateModelError(raw: string, ctx: MatchContext = {}): TranslatedError {
  const text = raw || ''

  if (VISION_PATTERNS.some((re) => re.test(text)) || (ctx.hasImage && /image|multimodal|vision/i.test(text))) {
    return {
      category: 'vision-unsupported',
      friendly: '当前模型不支持图片输入',
      suggestion: '请切换到支持视觉的模型（如 GPT-4o、Claude Sonnet/Opus、Gemini Pro），或移除图片后重发',
      raw,
    }
  }

  if (AUTH_PATTERNS.some((re) => re.test(text))) {
    return {
      category: 'auth',
      friendly: 'API Key 无效或未授权',
      suggestion: '请到「设置 → Provider」检查并更新 API Key',
      raw,
    }
  }

  if (RATE_LIMIT_PATTERNS.some((re) => re.test(text))) {
    return {
      category: 'rate-limit',
      friendly: '触发了 Provider 速率/配额限制',
      suggestion: '稍候几秒后重试，或切换到其他 Provider',
      raw,
    }
  }

  if (CONTEXT_PATTERNS.some((re) => re.test(text))) {
    return {
      category: 'context-too-long',
      friendly: '消息超出了模型的上下文长度',
      suggestion: '试试新开会话、删除部分历史，或换一个上下文更长的模型',
      raw,
    }
  }

  if (NETWORK_PATTERNS.some((re) => re.test(text))) {
    return {
      category: 'network',
      friendly: '网络连接异常',
      suggestion: '检查网络是否能访问 Provider API，或确认代理/防火墙设置',
      raw,
    }
  }

  return { category: 'unknown', friendly: text || '未知错误', raw }
}

/**
 * 格式化为单行错误字符串：用于直接塞进 lastError（向后兼容，不强行改 UI）
 * 例：「当前模型不支持图片输入 — 请切换到支持视觉的模型…」
 */
export function formatTranslatedError(t: TranslatedError): string {
  if (t.category === 'unknown') return t.friendly
  return t.suggestion ? `${t.friendly} — ${t.suggestion}` : t.friendly
}
