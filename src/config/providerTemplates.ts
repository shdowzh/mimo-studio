// Provider 模板 — 知名模型预配置
// 用户只需填入 API Key 即可使用
//
// capabilities 字段语义：**明确支持才声明**。未声明 ≠ 不支持，按"未知"处理。
//   - 这样新模型/第三方 provider 自动归"未知"，UI 不冤枉它
//   - 只有 capabilities 显式存在但不含 'vision' 时，才提示用户"模型可能不支持图片"
//   - vision：支持图片输入（多模态视觉）
//   - tools：支持 function calling / 工具调用
//   - reasoning：原生推理模型（o-series / deepseek-r1 等）

export type ModelCapability = 'vision' | 'tools' | 'reasoning'

export interface ProviderTemplate {
  id: string
  name: string
  type: 'openai-compatible' | 'anthropic'
  endpoint: string
  models: { id: string; name: string; description?: string; capabilities?: ModelCapability[] }[]
  /** 获取 API Key 的环境变量名（供参考） */
  envKey?: string
  website?: string
}

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    type: 'openai-compatible',
    endpoint: 'https://api.openai.com/v1',
    envKey: 'OPENAI_API_KEY',
    website: 'https://platform.openai.com/api-keys',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', description: '旗舰多模态', capabilities: ['vision', 'tools'] },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: '轻量高效', capabilities: ['vision', 'tools'] },
      { id: 'gpt-4.1', name: 'GPT-4.1', description: 'Coding 优化', capabilities: ['vision', 'tools'] },
      { id: 'o3', name: 'o3', description: '深度推理', capabilities: ['vision', 'tools', 'reasoning'] },
      { id: 'o4-mini', name: 'o4-mini', description: '轻量推理', capabilities: ['vision', 'tools', 'reasoning'] },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'anthropic',
    endpoint: 'https://api.anthropic.com/v1',
    envKey: 'ANTHROPIC_API_KEY',
    website: 'https://console.anthropic.com/settings/keys',
    models: [
      { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4', description: '旗舰 Coding', capabilities: ['vision', 'tools'] },
      { id: 'claude-opus-4-8', name: 'Claude Opus 4', description: '最强推理', capabilities: ['vision', 'tools', 'reasoning'] },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4', description: '极速响应', capabilities: ['vision', 'tools'] },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    type: 'openai-compatible',
    endpoint: 'https://api.deepseek.com/v1',
    envKey: 'DEEPSEEK_API_KEY',
    website: 'https://platform.deepseek.com/api_keys',
    models: [
      // DeepSeek V3/R1 截至 2026-06 仍为纯文本模型，不支持 vision
      { id: 'deepseek-chat', name: 'DeepSeek-V3', description: '通用对话', capabilities: ['tools'] },
      { id: 'deepseek-reasoner', name: 'DeepSeek-R1', description: '深度推理', capabilities: ['tools', 'reasoning'] },
    ],
  },
  {
    id: 'groq',
    name: 'Groq',
    type: 'openai-compatible',
    endpoint: 'https://api.groq.com/openai/v1',
    envKey: 'GROQ_API_KEY',
    website: 'https://console.groq.com/keys',
    models: [
      { id: 'llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout', description: '高速推理', capabilities: ['vision', 'tools'] },
      { id: 'qwen-qwq-32b', name: 'Qwen QWQ 32B', description: '推理专用', capabilities: ['tools', 'reasoning'] },
    ],
  },
  {
    id: 'alibaba',
    name: '阿里云百炼',
    type: 'openai-compatible',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    envKey: 'DASHSCOPE_API_KEY',
    website: 'https://bailian.console.aliyun.com/',
    models: [
      // qwen3 文本旗舰；qwen-vl-* 才是视觉版（这里未列）
      { id: 'qwen3-235b-a22b', name: 'Qwen3 235B', description: '旗舰模型', capabilities: ['tools'] },
      { id: 'qwen-coder-plus', name: 'Qwen Coder Plus', description: 'Coding 专用', capabilities: ['tools'] },
      { id: 'qwen-turbo-latest', name: 'Qwen Turbo', description: '高速经济', capabilities: ['tools'] },
    ],
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    type: 'openai-compatible',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4',
    envKey: 'ZHIPU_API_KEY',
    website: 'https://open.bigmodel.cn/',
    models: [
      { id: 'glm-4-plus', name: 'GLM-4 Plus', description: '旗舰模型', capabilities: ['vision', 'tools'] },
      { id: 'glm-4-flash', name: 'GLM-4 Flash', description: '高速免费', capabilities: ['tools'] },
    ],
  },
  {
    id: 'moonshot',
    name: 'Moonshot (Kimi)',
    type: 'openai-compatible',
    endpoint: 'https://api.moonshot.cn/v1',
    envKey: 'MOONSHOT_API_KEY',
    website: 'https://platform.moonshot.cn/',
    models: [
      // moonshot-v1-*-vision 才支持视觉，纯 v1 文本模型不支持
      { id: 'moonshot-v1-8k', name: 'Moonshot v1 8K', description: '标准上下文', capabilities: ['tools'] },
      { id: 'moonshot-v1-128k', name: 'Moonshot v1 128K', description: '超长上下文', capabilities: ['tools'] },
    ],
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    type: 'openai-compatible',
    endpoint: 'https://api.siliconflow.cn/v1',
    envKey: 'SILICONFLOW_API_KEY',
    website: 'https://siliconflow.cn/',
    models: [
      // siliconflow 转发的开源模型多为纯文本（vision 版需另指定 -VL 后缀）
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek-V3', description: '通用旗舰', capabilities: ['tools'] },
      { id: 'Qwen/Qwen3-235B-A22B', name: 'Qwen3 235B', description: '阿里旗舰', capabilities: ['tools'] },
      { id: 'Pro/zai-org/GLM-4.7', name: 'GLM-4.7', description: '智谱旗舰', capabilities: ['tools'] },
    ],
  },
]

/** Coding Plan — 推荐用于编程的模型组合 */
export const CODING_PLANS = [
  {
    name: 'MiMo Free',
    description: 'MiMo 免费模型，随时可用',
    providerId: 'mimo',
    modelId: '',
    icon: '🚀',
    requiresKey: false,
  },
  {
    name: 'Claude Code',
    description: 'Claude Sonnet 4 — AI 编程标杆',
    providerId: 'anthropic',
    modelId: 'claude-sonnet-4-6',
    icon: '🧠',
    requiresKey: true,
  },
  {
    name: 'GPT Coder',
    description: 'GPT-4.1 — OpenAI coding 优化',
    providerId: 'openai',
    modelId: 'gpt-4.1',
    icon: '⚡',
    requiresKey: true,
  },
  {
    name: 'DeepSeek Coder',
    description: 'DeepSeek-V3 — 国产性价比之选',
    providerId: 'deepseek',
    modelId: 'deepseek-chat',
    icon: '🐋',
    requiresKey: true,
  },
  {
    name: 'Qwen Coder',
    description: '通义千问 Coding 专用模型',
    providerId: 'alibaba',
    modelId: 'qwen-coder-plus',
    icon: '☁️',
    requiresKey: true,
  },
]
