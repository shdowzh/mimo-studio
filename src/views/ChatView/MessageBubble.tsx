// 消息气泡 — 基于 Part 多态结构渲染
// 支持文本、推理、工具调用、步骤标记等 part 类型

import { marked } from 'marked'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import DOMPurify from 'dompurify'
import type { MessageWithParts, Part, TextPart, ReasoningPart, ToolPart, StepStartPart, StepFinishPart } from '@/lib/mimoTypes'
import { Copy, Check, Brain, Wrench, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import ToolCallCard from './ToolCallCard'

marked.setOptions({ gfm: true, breaks: true })

// === Code Block ===

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative group my-2">
      <div className="flex items-center justify-between px-3 py-1.5 bg-mc-surface border border-mc-border rounded-t-lg border-b-0">
        <span className="text-[10px] text-mc-text-muted font-mono">{language || 'text'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-mc-text-muted hover:text-mc-text transition-colors"
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language || 'text'}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: '0 0 8px 8px',
          background: 'var(--code-bg)',
          border: '1px solid var(--border-default)',
          borderTop: 'none',
          fontSize: '12px',
          lineHeight: '1.6',
          padding: '12px',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}

// === Markdown 自定义 renderer ===

const renderer = new marked.Renderer()
renderer.code = function ({ text, lang }) {
  const language = lang || ''
  return `<div class="code-block" data-lang="${language}">${escapeHtml(text)}</div>`
}

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function parseMarkdown(content: string): string {
  const html = marked.parse(content, { renderer }) as string
  return DOMPurify.sanitize(html)
}

// === Reasoning Block ===

function ReasoningBlock({ text }: { text: string }) {
  const [show, setShow] = useState(false)

  return (
    <div className="mb-2">
      <button
        onClick={() => setShow(!show)}
        className="flex items-center gap-1.5 text-[10px] text-mc-text-muted hover:text-mc-accent transition-colors"
      >
        <Brain size={10} />
        {show ? '隐藏思考' : '查看思考'}
        {show ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
      </button>
      {show && (
        <div className="mt-1.5 p-2.5 bg-mc-bg rounded-lg border border-mc-border-subtle text-[11px] text-mc-text-muted leading-relaxed font-mono max-h-[200px] overflow-y-auto">
          {text}
        </div>
      )}
    </div>
  )
}

// === Step Block ===

function StepBlock({ children, stepIndex }: { children: React.ReactNode; stepIndex: number }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="border-l-2 border-mc-border-subtle pl-3 my-2">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 text-[10px] text-mc-text-muted hover:text-mc-text transition-colors mb-1"
      >
        {collapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
        <Wrench size={10} />
        Step {stepIndex + 1}
      </button>
      {!collapsed && <div className="space-y-1">{children}</div>}
    </div>
  )
}

// === Token/Meta Info ===

function MetaInfo({ part }: { part: StepFinishPart }) {
  return (
    <div className="flex items-center gap-3 text-[9px] text-mc-text-muted mt-1 px-1">
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

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.info.role === 'user'

  // 将 parts 分组：按 step-start/step-finish 划分步骤
  const { steps, preStep, postStep } = groupPartsBySteps(message.parts)

  if (isUser) {
    // 用户消息：只显示 text parts
    const textContent = message.parts
      .filter((p): p is TextPart => p.type === 'text')
      .map(p => p.text)
      .join('\n')

    return (
      <div className="flex mb-4 justify-end animate-fade-in">
        <div className="max-w-[75%] rounded-xl px-4 py-2.5 bg-mc-elevated text-mc-text">
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{textContent}</p>
        </div>
      </div>
    )
  }

  // 助手消息：渲染所有 part 类型
  return (
    <div className="flex mb-4 justify-start animate-fade-in">
      <div className="max-w-[75%] text-mc-text">
        {/* Pre-step parts (reasoning before first step) */}
        {preStep.map(part => renderPart(part))}

        {/* Steps */}
        {steps.map((step, i) => (
          <StepBlock key={i} stepIndex={i}>
            {step.parts.map(part => renderPart(part))}
            {step.finish && <MetaInfo part={step.finish} />}
          </StepBlock>
        ))}

        {/* Post-step parts (text after last step) */}
        {postStep.map(part => renderPart(part))}

        {/* 如果没有任何 parts，显示工作指示 */}
        {message.parts.length === 0 && (
          <div className="flex items-center gap-1.5 text-xs text-mc-text-muted">
            <Wrench size={12} className="animate-pulse" />
            <span>Agent 工作中...</span>
          </div>
        )}

        {/* 模型信息 */}
        {message.info.model && (
          <div className="mt-2 text-[9px] text-mc-text-muted">
            {message.info.model.providerID}/{message.info.model.modelID}
          </div>
        )}
      </div>
    </div>
  )
}

// === Part 渲染 ===

function renderPart(part: Part): React.ReactNode {
  switch (part.type) {
    case 'text':
      if (!part.text) return null
      return (
        <div
          key={part.id}
          className="markdown-content text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: parseMarkdown(part.text) }}
        />
      )

    case 'reasoning':
      if (!part.text) return null
      return <ReasoningBlock key={part.id} text={part.text} />

    case 'tool':
      return <ToolCallCard key={part.id} part={part} />

    case 'step-start':
    case 'step-finish':
    case 'snapshot':
    case 'patch':
      // 这些由 StepBlock 处理，此处不渲染
      return null

    case 'file':
      return (
        <div key={part.id} className="text-[11px] text-mc-text-muted">
          📎 {part.filename || 'file'}
        </div>
      )

    case 'agent':
      return (
        <div key={part.id} className="text-[11px] text-mc-text-muted">
          🤖 {part.name}
        </div>
      )

    case 'subtask':
      return (
        <div key={part.id} className="text-[11px] text-mc-text-muted">
          🔧 {part.description}
        </div>
      )

    default:
      return null
  }
}

// === Step 分组逻辑 ===

interface StepGroup {
  parts: Part[]
  finish?: StepFinishPart
}

function groupPartsBySteps(parts: Part[]) {
  const preStep: Part[] = []
  const steps: StepGroup[] = []
  const postStep: Part[] = []

  let currentStep: StepGroup | null = null
  let inStep = false

  for (const part of parts) {
    if (part.type === 'step-start') {
      inStep = true
      currentStep = { parts: [] }
      continue
    }

    if (part.type === 'step-finish') {
      if (currentStep) {
        currentStep.finish = part
        steps.push(currentStep)
      }
      currentStep = null
      inStep = false
      continue
    }

    if (inStep && currentStep) {
      currentStep.parts.push(part)
    } else if (steps.length === 0) {
      preStep.push(part)
    } else {
      postStep.push(part)
    }
  }

  return { preStep, steps, postStep }
}
