// 工具调用可视化卡片
// 显示 agent 的工具调用过程：pending → running → completed / error

import { useState } from 'react'
import type { ToolPart, ToolState } from '@/lib/mimoTypes'
import { ChevronDown, ChevronRight, Wrench, FileText, Terminal, FolderOpen, Loader2, CheckCircle2, XCircle } from 'lucide-react'

interface ToolCallCardProps {
  part: ToolPart
}

/** 工具图标映射 */
function getToolIcon(toolName: string) {
  if (toolName.includes('file') || toolName.includes('read') || toolName.includes('write')) return FileText
  if (toolName.includes('bash') || toolName.includes('shell') || toolName.includes('exec')) return Terminal
  if (toolName.includes('search') || toolName.includes('find') || toolName.includes('glob')) return FolderOpen
  return Wrench
}

/** 工具名称美化 */
function formatToolName(toolName: string): string {
  return toolName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

/** 从 tool input 中提取关键信息做摘要 */
function getInputSummary(state: ToolState): string {
  const input = (state as any).input
  if (!input) return ''

  if (input.file_path || input.path) return input.file_path || input.path
  if (input.command) return input.command
  if (input.pattern || input.query) return input.pattern || input.query
  if (input.directory) return input.directory
  return ''
}

export default function ToolCallCard({ part }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false)
  const Icon = getToolIcon(part.tool)
  const state = part.state
  const summary = getInputSummary(state)

  return (
    <div className="my-1.5 rounded-lg border border-mc-border-subtle bg-mc-surface/50 overflow-hidden">
      {/* Header — 始终显示 */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-mc-hover transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* 状态图标 */}
        {state.status === 'pending' && <Loader2 size={13} className="text-mc-text-muted animate-pulse" />}
        {state.status === 'running' && <Loader2 size={13} className="text-mc-accent animate-spin" />}
        {state.status === 'completed' && <CheckCircle2 size={13} className="text-mc-success" />}
        {state.status === 'error' && <XCircle size={13} className="text-mc-error" />}

        {/* 工具图标 */}
        <Icon size={13} className="text-mc-text-muted" />

        {/* 工具名 */}
        <span className="text-xs font-medium text-mc-text">{formatToolName(part.tool)}</span>

        {/* 摘要 */}
        {summary && (
          <span className="text-[11px] text-mc-text-muted truncate flex-1">{summary}</span>
        )}

        {/* 展开/折叠 */}
        {expanded ? <ChevronDown size={12} className="text-mc-text-muted" /> : <ChevronRight size={12} className="text-mc-text-muted" />}
      </button>

      {/* 详情 — 展开时显示 */}
      {expanded && (
        <div className="border-t border-mc-border-subtle px-3 py-2">
          {/* 输入参数 */}
          {state.status !== 'pending' && (state as any).input && (
            <div className="mb-2">
              <div className="text-[10px] text-mc-text-muted mb-1">输入</div>
              <pre className="text-[11px] text-mc-text bg-mc-bg rounded p-2 overflow-x-auto max-h-[200px] overflow-y-auto font-mono leading-relaxed">
                {typeof (state as any).input === 'string'
                  ? (state as any).input
                  : JSON.stringify((state as any).input, null, 2)}
              </pre>
            </div>
          )}

          {/* 输出 — completed */}
          {state.status === 'completed' && state.output && (
            <div>
              <div className="text-[10px] text-mc-text-muted mb-1">输出</div>
              <pre className="text-[11px] text-mc-text bg-mc-bg rounded p-2 overflow-x-auto max-h-[300px] overflow-y-auto font-mono leading-relaxed whitespace-pre-wrap">
                {state.output.length > 2000
                  ? state.output.slice(0, 2000) + '\n... (截断)'
                  : state.output}
              </pre>
            </div>
          )}

          {/* 错误 — error */}
          {state.status === 'error' && (
            <div>
              <div className="text-[10px] text-mc-error mb-1">错误</div>
              <pre className="text-[11px] text-mc-error bg-mc-bg rounded p-2 overflow-x-auto font-mono leading-relaxed">
                {state.error}
              </pre>
            </div>
          )}

          {/* 耗时 */}
          {(state.status === 'completed' || state.status === 'error') && (state as any).time && (
            <div className="mt-1.5 text-[10px] text-mc-text-muted">
              耗时 {Math.round(((state as any).time.end - (state as any).time.start) / 1000)}s
            </div>
          )}
        </div>
      )}
    </div>
  )
}
