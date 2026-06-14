// MiMo Code Desktop — mimo serve API 类型定义
// 基于 MiMo-Code 源码 packages/opencode/src/session/message-v2.ts 等文件的 Zod schema

// ============================================================
// Session
// ============================================================

export interface SessionInfo {
  id: string
  slug: string
  projectID: string
  workspaceID?: string
  directory: string
  parentID?: string
  title: string
  version: string
  time: {
    created: number
    updated: number
    compacting?: number
    archived?: number
  }
  share?: { url: string }
  summary?: {
    additions: number
    deletions: number
    files: number
    diffs?: FileDiff[]
  }
  permission?: PermissionRule[]
  revert?: {
    messageID: string
    partID?: string
    snapshot?: string
    diff?: string
  }
}

// ============================================================
// Message
// ============================================================

export interface MessageInfo {
  id: string
  sessionID: string
  agentID?: string
  role: 'user' | 'assistant'
  time: {
    created: number
    completed?: number
  }
  agent: string
  model: {
    providerID: string
    modelID: string
    variant?: string
  }
  cost?: number
  tokens?: TokenInfo
  error?: MessageError
  parentID?: string // assistant messages
  path?: { cwd: string; root: string }
  summary?: boolean
  finish?: string
}

export interface MessageWithParts {
  info: MessageInfo
  parts: Part[]
}

// ============================================================
// Part 多态类型
// ============================================================

export type Part =
  | TextPart
  | ReasoningPart
  | ToolPart
  | FilePart
  | StepStartPart
  | StepFinishPart
  | SnapshotPart
  | PatchPart
  | AgentPart
  | SubtaskPart

interface PartBase {
  id: string
  sessionID: string
  messageID: string
}

export interface TextPart extends PartBase {
  type: 'text'
  text: string
  synthetic?: boolean
  ignored?: boolean
  time?: { start: number; end?: number }
  metadata?: Record<string, unknown>
}

export interface ReasoningPart extends PartBase {
  type: 'reasoning'
  text: string
  time: { start: number; end?: number }
  metadata?: Record<string, unknown>
}

export interface ToolPart extends PartBase {
  type: 'tool'
  callID: string
  tool: string
  state: ToolState
  metadata?: Record<string, unknown>
}

export type ToolState =
  | ToolStatePending
  | ToolStateRunning
  | ToolStateCompleted
  | ToolStateError

export interface ToolStatePending {
  status: 'pending'
  input: Record<string, unknown>
  raw: string
}

export interface ToolStateRunning {
  status: 'running'
  input: Record<string, unknown>
  title?: string
  metadata?: Record<string, unknown>
  time: { start: number }
}

export interface ToolStateCompleted {
  status: 'completed'
  input: Record<string, unknown>
  output: string
  title?: string
  metadata?: Record<string, unknown>
  time: { start: number; end: number; compacted?: boolean }
}

export interface ToolStateError {
  status: 'error'
  input: Record<string, unknown>
  error: string
  metadata?: Record<string, unknown>
  time: { start: number; end: number }
}

export interface FilePart extends PartBase {
  type: 'file'
  mime: string
  filename?: string
  url: string
  source?: FilePartSource
}

export type FilePartSource =
  | { type: 'file'; path: string; text?: { value: string; start: number; end: number } }
  | { type: 'symbol'; path: string; range: unknown; name: string; kind: number; text?: { value: string; start: number; end: number } }
  | { type: 'resource'; clientName: string; uri: string; text?: { value: string; start: number; end: number } }

export interface StepStartPart extends PartBase {
  type: 'step-start'
  snapshot?: string
}

export interface StepFinishPart extends PartBase {
  type: 'step-finish'
  reason: string
  snapshot?: string
  cost: number
  tokens: TokenInfo
}

export interface SnapshotPart extends PartBase {
  type: 'snapshot'
  snapshot: string
}

export interface PatchPart extends PartBase {
  type: 'patch'
  hash: string
  files: string[]
}

export interface AgentPart extends PartBase {
  type: 'agent'
  name: string
  source?: { value: string; start: number; end: number }
}

export interface SubtaskPart extends PartBase {
  type: 'subtask'
  prompt: string
  description: string
  agent: string
  model?: { providerID: string; modelID: string }
  command?: string
}

// ============================================================
// Token & Error
// ============================================================

export interface TokenInfo {
  total?: number
  input: number
  output: number
  reasoning: number
  cache: {
    read: number
    write: number
  }
}

export interface MessageError {
  name: string
  message: string
  data?: Record<string, unknown>
}

// ============================================================
// SSE 事件
// ============================================================

export type SSEEventPayload =
  | MessagePartDeltaPayload
  | MessagePartUpdatedPayload
  | MessagePartRemovedPayload
  | MessageUpdatedPayload
  | MessageRemovedPayload
  | SessionCreatedPayload
  | SessionUpdatedPayload
  | SessionDeletedPayload
  | SessionStatusPayload
  | SessionDiffPayload
  | SessionErrorPayload
  | PermissionAskedPayload
  | PermissionRepliedPayload
  | ServerConnectedPayload
  | ServerHeartbeatPayload

export interface GlobalSSEEvent {
  directory?: string
  project?: string
  workspace?: string
  payload: SSEEventPayload
}

// --- Message Events ---

export interface MessagePartDeltaPayload {
  type: 'message.part.delta'
  properties: {
    sessionID: string
    messageID: string
    partID: string
    field: string
    delta: string
  }
}

export interface MessagePartUpdatedPayload {
  type: 'message.part.updated'
  properties: {
    sessionID: string
    part: Part
    time: number
  }
}

export interface MessagePartRemovedPayload {
  type: 'message.part.removed'
  properties: {
    sessionID: string
    messageID: string
    partID: string
  }
}

export interface MessageUpdatedPayload {
  type: 'message.updated'
  properties: {
    sessionID: string
    info: MessageInfo
  }
}

export interface MessageRemovedPayload {
  type: 'message.removed'
  properties: {
    sessionID: string
    messageID: string
  }
}

// --- Session Events ---

export interface SessionCreatedPayload {
  type: 'session.created'
  properties: {
    sessionID: string
    info: SessionInfo
  }
}

export interface SessionUpdatedPayload {
  type: 'session.updated'
  properties: {
    sessionID: string
    info: Partial<SessionInfo> & { id: string }
  }
}

export interface SessionDeletedPayload {
  type: 'session.deleted'
  properties: {
    sessionID: string
    info: SessionInfo
  }
}

export interface SessionStatusPayload {
  type: 'session.status'
  properties: {
    sessionID: string
    status: SessionStatusInfo
  }
}

export type SessionStatusInfo =
  | { type: 'idle' }
  | { type: 'busy'; message?: string }
  | { type: 'retry'; attempt: number; message: string; next: number }

export interface SessionDiffPayload {
  type: 'session.diff'
  properties: {
    sessionID: string
    diff: FileDiff[]
  }
}

export interface SessionErrorPayload {
  type: 'session.error'
  properties: {
    sessionID?: string
    error: MessageError
  }
}

// --- Permission Events ---

export interface PermissionAskedPayload {
  type: 'permission.asked'
  properties: {
    id: string
    sessionID: string
    permission: string
    patterns: string[]
    metadata: Record<string, unknown>
    always: string[]
    tool?: {
      messageID: string
      callID: string
    }
  }
}

export interface PermissionRepliedPayload {
  type: 'permission.replied'
  properties: {
    sessionID: string
    requestID: string
    reply: PermissionReply
  }
}

// --- Server Events ---

export interface ServerConnectedPayload {
  type: 'server.connected'
  properties: Record<string, never>
}

export interface ServerHeartbeatPayload {
  type: 'server.heartbeat'
  properties: Record<string, never>
}

// ============================================================
// Permission
// ============================================================

export type PermissionReply = 'once' | 'always' | 'reject'

export type PermissionAction = 'allow' | 'deny' | 'ask'

export interface PermissionRule {
  permission: string
  pattern: string
  action: PermissionAction
}

export interface PermissionRequest {
  id: string
  sessionID: string
  permission: string
  patterns: string[]
  metadata: Record<string, unknown>
  always: string[]
  tool?: {
    messageID: string
    callID: string
  }
}

// ============================================================
// Skill
// ============================================================

export interface SkillInfo {
  name: string
  description: string
  location: string
  content: string
  hidden?: boolean
}

// ============================================================
// File Diff
// ============================================================

export interface FileDiff {
  path: string
  content: string // unified diff format
  type?: 'added' | 'modified' | 'deleted'
}

// ============================================================
// Prompt Input
// ============================================================

export type PartInput = TextPartInput | FilePartInput

export interface TextPartInput {
  type: 'text'
  text: string
}

export interface FilePartInput {
  type: 'file'
  url: string
  mime: string
  filename?: string
}

export interface PromptInput {
  sessionID: string
  parts: PartInput[]
  model?: { providerID: string; modelID: string }
  modelRef?: string
  agent?: string
  agentID?: string
  noReply?: boolean
  tools?: Record<string, boolean>
  format?: string
  system?: string
  variant?: string
}

// ============================================================
// Agent & Provider
// ============================================================

export interface AgentInfo {
  id: string
  name: string
  model?: { providerID: string; modelID: string }
}

export interface ProviderInfo {
  id: string
  name: string
  type: string
  models: ModelInfo[]
}

export interface ModelInfo {
  id: string
  name: string
  providerID: string
}

// ============================================================
// Health
// ============================================================

export interface HealthResponse {
  healthy: true
  version: string
}

// ============================================================
// View & Local Types (保留)
// ============================================================

export type ViewId = 'chat' | 'terminal' | 'memory' | 'skills' | 'mcp' | 'settings'

export type ThemeId = 'dark' | 'light' | 'nord' | 'catppuccin' | 'one-dark'
