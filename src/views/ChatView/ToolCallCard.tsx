// 工具调用可视化卡片
// 显示 agent 的工具调用过程：pending → running → completed / error
//
// Phase 3 T3.4：折叠态单行设计
// 单行：图标 工具名 · 摘要 · 状态徽标 · 耗时

import { useState } from 'react'
import type { ToolPart, ToolState } from '@/lib/mimoTypes'
import { ChevronRight, Wrench, FileText, Terminal, FolderOpen, CheckCircle2, XCircle } from 'lucide-react'
import Spinner from '@/components/ui/Spinner'
import StatusDot from '@/components/ui/StatusDot'

interface ToolCallCardProps {
  part: ToolPart
}

/** 工具图标映射 */
function getToolIcon(toolName?: string) {
  const name = toolName || ''
  if (name.includes('file') || name.includes('read') || name.includes('write')) return FileText
  if (name.includes('bash') || name.includes('shell') || name.includes('exec')) return Terminal
  if (name.includes('search') || name.includes('find') || name.includes('glob')) return FolderOpen
  return Wrench
}

/** 工具名称美化 */
function formatToolName(toolName?: string): string {
  return (toolName || 'tool')
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

  // 计算耗时
  const duration = (state.status === 'completed' || state.status === 'error') && (state as any).time
    ? Math.round(((state as any).time.end - (state as any).time.start) / 1000)
    : null

  return (
    <div className="rounded-md border border-mc-border-subtle bg-mc-surface/40 overflow-hidden">
      {/* 单行 header */}
      <button
        className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-mc-hover transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Tool 图标 */}
        <Icon size={12} className="text-mc-text-muted shrink-0" />

        {/* Tool 名 */}
        <span className="text-xs font-medium text-mc-text shrink-0">{formatToolName(part.tool)}</span>

        {/* 摘要 */}
        {summary && (
          <span className="text-2xs text-mc-text-muted truncate flex-1 font-mono">{summary}</span>
        )}

        {/* 状态徽标 */}
        {state.status === 'pending' && <StatusDot tone="muted" pulse />}
        {state.status === 'running' && <Spinner size={10} />}
        {state.status === 'completed' && <CheckCircle2 size={11} className="text-mc-success shrink-0" />}
        {state.status === 'error' && <XCircle size={11} className="text-mc-error shrink-0" />}

        {/* 耗时 */}
        {duration !== null && (
          <span className="text-2xs text-mc-text-muted shrink-0 font-mono">{duration}s</span>
        )}

        {/* 展开图标 */}
        <ChevronRight size={11} className={`text-mc-text-muted shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {/* 详情面板 */}
      {expanded && (
        <div className="border-t border-mc-border-subtle px-3 py-2">
          {/* 输入参数 */}
          {state.status !== 'pending' && (state as any).input && (
            <div className="mb-2">
              <div className="text-2xs text-mc-text-muted mb-1">输入</div>
              <pre className="text-2xs text-mc-text bg-mc-bg rounded p-2 overflow-x-auto max-h-[200px] overflow-y-auto font-mono leading-relaxed">
                {typeof (state as any).input === 'string'
                  ? (state as any).input
                  : JSON.stringify((state as any).input, null, 2)}
              </pre>
            </div>
          )}

          {/* 输出 — completed */}
          {state.status === 'completed' && state.output && (
            <div>
              <div className="text-2xs text-mc-text-muted mb-1">输出</div>
              <pre className="text-2xs text-mc-text bg-mc-bg rounded p-2 overflow-x-auto max-h-[300px] overflow-y-auto font-mono leading-relaxed whitespace-pre-wrap">
                {state.output.length > 2000
                  ? state.output.slice(0, 2000) + '\n... (截断)'
                  : state.output}
              </pre>
            </div>
          )}

          {/* 错误 — error */}
          {state.status === 'error' && (
            <div>
              <div className="text-2xs text-mc-error mb-1">错误</div>
              <pre className="text-2xs text-mc-error bg-mc-bg rounded p-2 overflow-x-auto font-mono leading-relaxed">
                {state.error}
              </pre>
            </div>
          )}

          {/* 耗时 */}
          {duration !== null && (
            <div className="mt-1.5 text-2xs text-mc-text-muted">
              耗时 {duration}s
            </div>
          )}
        </div>
      )}
    </div>
  )
}
