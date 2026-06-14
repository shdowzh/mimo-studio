// MiMo Code Desktop — 类型定义
// 重导出 mimoTypes，保持向后兼容

export type {
  // Session
  SessionInfo,
  // Message
  MessageInfo,
  MessageWithParts,
  // Part 多态
  Part,
  TextPart,
  ReasoningPart,
  ToolPart,
  FilePart,
  StepStartPart,
  StepFinishPart,
  SnapshotPart,
  PatchPart,
  AgentPart,
  SubtaskPart,
  // Tool
  ToolState,
  ToolStatePending,
  ToolStateRunning,
  ToolStateCompleted,
  ToolStateError,
  // Token & Error
  TokenInfo,
  MessageError,
  // SSE
  SSEEventPayload,
  GlobalSSEEvent,
  // Permission
  PermissionReply,
  PermissionAction,
  PermissionRule,
  PermissionRequest,
  // Skill
  SkillInfo,
  // Diff
  FileDiff,
  // Prompt
  PartInput,
  TextPartInput,
  FilePartInput,
  PromptInput,
  // Agent & Provider
  AgentInfo,
  ProviderInfo,
  ModelInfo,
  // Health
  HealthResponse,
  // View
  ViewId,
  ThemeId,
} from './mimoTypes'

// 重新导出常用类型别名
export type Skill = import('./mimoTypes').SkillInfo
export type McpServer = {
  id: string
  name: string
  type: 'stdio' | 'http'
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  enabled: boolean
  status: 'running' | 'stopped' | 'error'
}
export type SkillCategory = 'workflow' | 'coding' | 'analysis' | 'writing'
