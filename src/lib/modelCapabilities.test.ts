// modelCapabilities 测试
import { describe, it, expect } from 'vitest'
import { modelSupports } from './modelCapabilities'

describe('modelSupports — vision', () => {
  it('PROVIDER_TEMPLATES 显式声明 vision → yes', () => {
    expect(modelSupports('openai', 'gpt-4o', 'vision')).toBe('yes')
    expect(modelSupports('anthropic', 'claude-sonnet-4-6', 'vision')).toBe('yes')
    expect(modelSupports('openai', 'o3', 'vision')).toBe('yes')
  })

  it('PROVIDER_TEMPLATES 声明了 capabilities 但未含 vision → no', () => {
    expect(modelSupports('deepseek', 'deepseek-chat', 'vision')).toBe('no')
    expect(modelSupports('alibaba', 'qwen3-235b-a22b', 'vision')).toBe('no')
    expect(modelSupports('moonshot', 'moonshot-v1-128k', 'vision')).toBe('no')
  })

  it('启发式：claude/gpt-4o/-vl-/-vision 后缀 → yes（即使不在模板里）', () => {
    expect(modelSupports('custom', 'claude-3-5-haiku-20241022', 'vision')).toBe('yes')
    expect(modelSupports('custom', 'gpt-4o-2024-11-20', 'vision')).toBe('yes')
    expect(modelSupports('custom', 'qwen-vl-max', 'vision')).toBe('yes')
    expect(modelSupports('custom', 'gemini-2.5-pro', 'vision')).toBe('yes')
  })

  it('启发式：deepseek-* / qwen3-* 等明确纯文本家族 → no', () => {
    expect(modelSupports('custom', 'deepseek-v3-0324', 'vision')).toBe('no')
    expect(modelSupports('custom', 'qwen3-72b', 'vision')).toBe('no')
  })

  it('完全未知模型 → unknown（不冤枉新模型）', () => {
    expect(modelSupports('custom', 'foo-bar-9000', 'vision')).toBe('unknown')
    expect(modelSupports('custom', 'some-future-model', 'vision')).toBe('unknown')
  })

  it('mimo provider 一律 unknown（下游模型不可见）', () => {
    expect(modelSupports('mimo', 'anything', 'vision')).toBe('unknown')
    expect(modelSupports('opencode', 'anything', 'vision')).toBe('unknown')
  })

  it('缺参数返回 unknown', () => {
    expect(modelSupports(undefined, 'gpt-4o', 'vision')).toBe('unknown')
    expect(modelSupports('openai', undefined, 'vision')).toBe('unknown')
    expect(modelSupports('openai', '', 'vision')).toBe('unknown')
  })
})

describe('modelSupports — reasoning', () => {
  it('o-series / r1 / qwq / reasoner 命名命中', () => {
    expect(modelSupports('custom', 'o3', 'reasoning')).toBe('yes')
    expect(modelSupports('custom', 'o4-mini', 'reasoning')).toBe('yes')
    expect(modelSupports('deepseek', 'deepseek-reasoner', 'reasoning')).toBe('yes')
    expect(modelSupports('groq', 'qwen-qwq-32b', 'reasoning')).toBe('yes')
  })

  it('普通对话模型不声明 reasoning → no（模板显式）/ unknown（启发式）', () => {
    // 模板里 gpt-4o 的 capabilities 不含 reasoning，应该返回 no
    expect(modelSupports('openai', 'gpt-4o', 'reasoning')).toBe('no')
    expect(modelSupports('custom', 'gpt-3.5-turbo', 'reasoning')).toBe('unknown')
  })
})
