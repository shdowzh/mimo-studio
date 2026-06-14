// 权限确认对话框
// 当 agent 请求执行敏感操作时，显示此对话框让用户确认

import type { PermissionRequest } from '@/lib/mimoTypes'
import { useChatStore } from '@/stores/chatStore'
import { Shield, ShieldCheck, ShieldX } from 'lucide-react'

export default function PermissionDialog() {
  const permissionRequests = useChatStore((s) => s.permissionRequests)
  const replyPermission = useChatStore((s) => s.replyPermission)

  // 收集所有未处理的权限请求
  const allRequests = Object.values(permissionRequests).flat()
  if (allRequests.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {allRequests.map((req) => (
        <PermissionCard key={req.id} request={req} onReply={(reply) => replyPermission(req.sessionID, req.id, reply)} />
      ))}
    </div>
  )
}

function PermissionCard({ request, onReply }: { request: PermissionRequest; onReply: (reply: 'once' | 'always' | 'reject') => void }) {
  const { permission, patterns, tool } = request

  // 从 patterns 提取目标信息
  const target = patterns.length > 0 ? patterns.join(', ') : ''
  const toolName = tool ? `工具: ${tool.callID.slice(0, 8)}...` : ''

  return (
    <div className="bg-mc-surface border border-mc-border rounded-xl shadow-lg overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-mc-elevated/50 border-b border-mc-border-subtle">
        <Shield size={14} className="text-amber-400" />
        <span className="text-xs font-medium text-mc-text">Agent 请求权限</span>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-1.5">
        <div className="text-sm text-mc-text">
          允许执行: <span className="font-mono text-mc-accent">{permission}</span>
        </div>
        {target && (
          <div className="text-xs text-mc-text-muted">
            目标: <span className="font-mono">{target}</span>
          </div>
        )}
        {toolName && (
          <div className="text-[11px] text-mc-text-muted">{toolName}</div>
        )}
      </div>

      {/* Actions */}
      <div className="flex border-t border-mc-border-subtle">
        <button
          onClick={() => onReply('once')}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-mc-text hover:bg-mc-hover transition-colors border-r border-mc-border-subtle"
        >
          <Shield size={11} />
          仅本次允许
        </button>
        <button
          onClick={() => onReply('always')}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-mc-success hover:bg-mc-hover transition-colors border-r border-mc-border-subtle"
        >
          <ShieldCheck size={11} />
          始终允许
        </button>
        <button
          onClick={() => onReply('reject')}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-mc-error hover:bg-mc-hover transition-colors"
        >
          <ShieldX size={11} />
          拒绝
        </button>
      </div>
    </div>
  )
}
