// errorTranslate 测试
import { describe, it, expect } from 'vitest'
import { translateModelError, formatTranslatedError } from './errorTranslate'

describe('translateModelError — vision', () => {
  it('OpenAI 风格 "does not support image" → vision-unsupported', () => {
    const t = translateModelError('Error: This model does not support image inputs.')
    expect(t.category).toBe('vision-unsupported')
    expect(t.friendly).toContain('图片')
  })

  it('"image not supported" → vision-unsupported', () => {
    const t = translateModelError('image_url is not supported for this model')
    expect(t.category).toBe('vision-unsupported')
  })

  it('hasImage=true 时，含 multimodal 关键字也命中', () => {
    const t = translateModelError('multimodal request rejected', { hasImage: true })
    expect(t.category).toBe('vision-unsupported')
  })

  it('未提到图片关键字 + hasImage=false → 不误判', () => {
    const t = translateModelError('something else went wrong', { hasImage: false })
    expect(t.category).toBe('unknown')
  })
})

describe('translateModelError — 其他类别', () => {
  it('401/Unauthorized → auth', () => {
    expect(translateModelError('401 Unauthorized').category).toBe('auth')
    expect(translateModelError('Incorrect API key provided').category).toBe('auth')
  })

  it('429/rate limit → rate-limit', () => {
    expect(translateModelError('429 Too Many Requests').category).toBe('rate-limit')
    expect(translateModelError('You have exceeded your quota').category).toBe('rate-limit')
  })

  it('context length 超限 → context-too-long', () => {
    expect(translateModelError("This model's maximum context length is 8192 tokens").category).toBe('context-too-long')
    expect(translateModelError('Input is too long for this model').category).toBe('context-too-long')
  })

  it('网络错误 → network', () => {
    expect(translateModelError('ECONNREFUSED 127.0.0.1:11434').category).toBe('network')
    expect(translateModelError('TypeError: Failed to fetch').category).toBe('network')
  })

  it('未命中任何模式 → unknown，friendly 回退到 raw', () => {
    const t = translateModelError('Something arbitrary')
    expect(t.category).toBe('unknown')
    expect(t.friendly).toBe('Something arbitrary')
  })

  it('空错误也能处理', () => {
    const t = translateModelError('')
    expect(t.category).toBe('unknown')
    expect(t.friendly).toBe('未知错误')
  })
})

describe('formatTranslatedError', () => {
  it('unknown 直接返回 friendly', () => {
    const s = formatTranslatedError(translateModelError('weird'))
    expect(s).toBe('weird')
  })

  it('有 suggestion 时拼接显示', () => {
    const s = formatTranslatedError(translateModelError('does not support image'))
    expect(s).toContain('图片')
    expect(s).toContain('—')
    expect(s).toContain('切换')
  })
})
