// 消息气泡 — OpenClaw 风
// 双边圆角气泡 + 头像 + 角色名 + 时间戳

import { marked } from 'marked'
import DOMPurify from 'dompurify'
import type { MessageWithParts, Part, TextPart, FilePart, ReasoningPart, ToolPart, StepStartPart, StepFinishPart } from '@/lib/mimoTypes'
import { Brain, Wrench, User, Bot, ChevronDown, ChevronRight, CheckCircle2, Paperclip, Cog, FileText, Image as ImageIcon } from 'lucide-react'
import { useState, useMemo, memo } from 'react'
import ToolCallCard from './ToolCallCard'
import Spinner from '@/components/ui/Spinner'
import { formatMessageTime } from '@/lib/formatTime'

marked.setOptions({ gfm: true, breaks: true })

function parseMarkdown(content: string): string {
  const html = marked.parse(content) as string
  return DOMPurify.sanitize(html)
}

// === 头像 ===
function Avatar({ role }: { role: 'user' | 'assistant' }) {
  return (
    <div
      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
        role === 'user' ? 'bg-mc-user-bubble text-mc-user-bubble-text' : 'bg-mc-brand-soft text-mc-brand'
      }`}
    >
      {role === 'user' ? <User size={15} /> : <Bot size={15} />}
    </div>
  )
}

// === Reasoning Block ===
function ReasoningBlock({ text, isStreaming }: { text: string; isStreaming?: boolean }) {
  const [show, setShow] = useState(false)

  if (isStreaming) {
    return (
      <div className="flex items-center gap-1.5 text-2xs text-mc-text-muted italic mb-1.5">
        <Spinner size={10} tone="muted" />
        正在思考...
      </div>
    )
  }

  return (
    <div className="mb-1.5 group">
      <button
        onClick={() => setShow(!show)}
        className="flex items-center gap-1.5 text-2xs text-mc-text-muted italic hover:text-mc-text transition-colors"
      >
        <Brain size={10} />
        思考过程 · {text.length} 字
        <span className="opacity-0 group-hover:opacity-100 transition-opacity">
          {show ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </span>
      </button>
      {show && (
        <div className="mt-1.5 p-2.5 bg-mc-elevated/60 rounded-lg text-2xs text-mc-text-muted leading-relaxed font-mono max-h-[200px] overflow-y-auto whitespace-pre-wrap">
          {text}
        </div>
      )}
    </div>
  )
}

// === Step Block ===
function StepBlock({ children, stepIndex, finish, totalSteps, isLastStep }: {
  children: React.ReactNode
  stepIndex: number
  finish?: StepFinishPart
  totalSteps: number
  isLastStep: boolean
}) {
  const isCompleted = !!finish
  const [collapsed, setCollapsed] = useState(isCompleted && !isLastStep)

  const summary = useMemo(() => {
    if (!finish) return null
    const childrenArray = Array.isArray(children) ? children : [children]
    const toolCount = childrenArray.filter((c: any) => c?.props?.part?.type === 'tool').length
    const tokens = finish.tokens?.total
    const cost = finish.cost
    return [
      toolCount > 0 ? `${toolCount} 个工具` : null,
      tokens ? `${tokens} tokens` : null,
      cost > 0 ? `$${cost.toFixed(4)}` : cost === 0 ? '免费' : null,
    ].filter(Boolean).join(' · ')
  }, [children, finish])

  return (
    <div className="my-1.5">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-1.5 text-2xs text-mc-text-muted hover:text-mc-text transition-colors px-1 py-0.5 rounded hover:bg-mc-hover"
      >
        {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
        {isCompleted ? <CheckCircle2 size={10} className="text-mc-success" /> : <Spinner size={10} />}
        <span className="font-medium">Step {stepIndex + 1}/{totalSteps}</span>
        {summary && collapsed && <span className="opacity-70">· {summary}</span>}
      </button>
      {!collapsed && (
        <div className="mt-1 pl-3 border-l border-mc-border-subtle space-y-1">
          {children}
          {finish && <MetaInfo part={finish} />}
        </div>
      )}
    </div>
  )
}

function MetaInfo({ part }: { part: StepFinishPart }) {
  return (
    <div className="flex items-center gap-3 text-2xs text-mc-text-muted mt-1 px-1">
      {part.tokens && (
        <>
          {part.tokens.input > 0 && <span>输入: {part.tokens.input}</span>}
          {part.tokens.output > 0 && <span>输出: {part.tokens.output}</span>}
          {part.tokens.total !== undefined && part.tokens.total > 0 && <span>共: {part.tokens.total} tokens</span>}
        </>
      )}
      {part.cost > 0 && <span>${part.cost.toFixed(4)}</span>}
      {part.cost === 0 && <span className="text-mc-success">免费</span>}
    </div>
  )
}

// ============================================================
// 主组件
// ============================================================

interface MessageBubbleProps {
  message: MessageWithParts
}

export default memo(function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.info.role === 'user'
  const { steps, preStep, postStep } = groupPartsBySteps(message.parts)
  const timestamp = formatMessageTime(message.info.time.created)
  const assistantName = message.info.model
    ? `${message.info.model.providerID}/${message.info.model.modelID || 'auto'}`
    : 'MiMo'

  if (isUser) {
    const textContent = message.parts
      .filter((p): p is TextPart => p.type === 'text')
      .map(p => p.text)
      .join('\n')
    const fileParts = message.parts.filter((p): p is FilePart => p.type === 'file')

    return (
      <div className="flex flex-row-reverse gap-3 mb-6 animate-fade-in">
        <Avatar role="user" />
        <div className="flex flex-col items-end max-w-[70%] min-w-0">
          <div className="rounded-2xl bg-mc-user-bubble text-mc-user-bubble-text px-4 py-2.5">
            {fileParts.length > 0 && (
              <div className="flex flex-col gap-1.5 mb-2">
                {fileParts.map(p => <UserFileChip key={p.id} part={p} />)}
              </div>
            )}
            {textContent && <p className="text-sm whitespace-pre-wrap leading-relaxed">{textContent}</p>}
          </div>
          <div className="mt-1 text-2xs text-mc-text-muted">
            你 · {timestamp}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3 mb-6 animate-fade-in">
      <Avatar role="assistant" />
      <div className="flex flex-col max-w-[80%] min-w-0">
        <div className="rounded-2xl bg-mc-assistant-bubble text-mc-text px-4 py-2.5">
          {preStep.map(part => renderPart(part, false))}
          {steps.map((step, i) => (
            <StepBlock key={i} stepIndex={i} finish={step.finish} totalSteps={steps.length} isLastStep={i === steps.length - 1}>
              {step.parts.map(part => renderPart(part, false))}
            </StepBlock>
          ))}
          {postStep.map(part => renderPart(part, steps.length === 0))}

          {message.parts.length === 0 && (
            <div className="flex items-center gap-1.5 text-xs text-mc-text-muted">
              <Spinner size={12} tone="muted" />
              <span>Agent 工作中...</span>
            </div>
          )}
        </div>
        <div className="mt-1 text-2xs text-mc-text-muted">
          {assistantName} · {timestamp}
        </div>
      </div>
    </div>
  )
})

// 用户消息里的文件附件 chip
// data: url（图片）直接 <img>；file:// url 用图标占位（渲染器加载 file:// 受 CORS 限制，不强行加载避免白块）
function UserFileChip({ part }: { part: FilePart }) {
  const isImage = part.mime.startsWith('image/')
  const isDataUrl = part.url.startsWith('data:')
  return (
    <div className="flex items-center gap-1.5 bg-mc-user-bubble-text/10 rounded-lg px-2 py-1 max-w-[220px]">
      {isImage && isDataUrl ? (
        <img src={part.url} alt={part.filename || 'image'} className="w-6 h-6 object-cover rounded shrink-0" />
      ) : isImage ? (
        <ImageIcon size={14} className="shrink-0 opacity-80" />
      ) : (
        <FileText size={14} className="shrink-0 opacity-80" />
      )}
      <span className="text-2xs truncate max-w-[160px]" title={part.filename}>
        {part.filename || 'file'}
      </span>
    </div>
  )
}

const TextPartView = memo(function TextPartView({ part }: { part: { id: string; text: string } }) {
  const html = useMemo(() => parseMarkdown(part.text), [part.text])
  if (!part.text) return null
  return (
    <div className="markdown-content text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
  )
})

function renderPart(part: Part, isStreaming: boolean): React.ReactNode {
  switch (part.type) {
    case 'text': return <TextPartView key={part.id} part={part} />
    case 'reasoning': return part.text ? <ReasoningBlock key={part.id} text={part.text} isStreaming={isStreaming} /> : null
    case 'tool': return <ToolCallCard key={part.id} part={part} />
    case 'step-start': case 'step-finish': case 'snapshot': case 'patch': return null
    case 'file': return <div key={part.id} className="flex items-center gap-1.5 text-2xs text-mc-text-muted"><Paperclip size={10} />{part.filename || 'file'}</div>
    case 'agent': return <div key={part.id} className="flex items-center gap-1.5 text-2xs text-mc-text-muted"><Bot size={10} />{part.name}</div>
    case 'subtask': return <div key={part.id} className="flex items-center gap-1.5 text-2xs text-mc-text-muted"><Cog size={10} />{part.description}</div>
    default: return null
  }
}

interface StepGroup { parts: Part[]; finish?: StepFinishPart }

function groupPartsBySteps(parts: Part[]) {
  const preStep: Part[] = []
  const steps: StepGroup[] = []
  const postStep: Part[] = []
  let currentStep: StepGroup | null = null
  let inStep = false

  for (const part of parts) {
    if (part.type === 'step-start') { inStep = true; currentStep = { parts: [] }; continue }
    if (part.type === 'step-finish') { if (currentStep) { currentStep.finish = part; steps.push(currentStep) }; currentStep = null; inStep = false; continue }
    if (inStep && currentStep) { currentStep.parts.push(part) }
    else if (steps.length === 0) preStep.push(part)
    else postStep.push(part)
  }
  return { preStep, steps, postStep }
}
