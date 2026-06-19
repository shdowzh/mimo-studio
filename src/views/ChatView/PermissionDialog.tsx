// 权限确认对话框
// 当 agent 请求执行敏感操作时，显示此对话框让用户确认
//
// Phase 3 T3.8：改用 brand 色描边 + Button 组件

import type { PermissionRequest } from '@/lib/mimoTypes'
import { useChatStore } from '@/stores/chatStore'
import { Shield, ShieldCheck, ShieldX, Terminal, FileText, Eye } from 'lucide-react'
import Button from '@/components/ui/Button'

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

/** 根据权限类型返回图标 */
function getPermissionIcon(permission: string) {
  if (permission.includes('bash') || permission.includes('shell') || permission.includes('exec')) return Terminal
  if (permission.includes('write') || permission.includes('create')) return FileText
  if (permission.includes('read')) return Eye
  return Shield
}

function PermissionCard({ request, onReply }: { request: PermissionRequest; onReply: (reply: 'once' | 'always' | 'reject') => void }) {
  const { permission, patterns, tool } = request

  // 从 patterns 提取目标信息
  const target = patterns.length > 0 ? patterns.join(', ') : ''
  const toolName = tool ? `工具: ${tool.callID.slice(0, 8)}...` : ''
  const PermissionIcon = getPermissionIcon(permission)

  return (
    <div className="bg-mc-surface border border-mc-brand/40 rounded-xl shadow-2xl shadow-mc-brand/10 overflow-hidden animate-slide-up">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-mc-brand-soft">
        <PermissionIcon size={14} className="text-mc-brand" />
        <span className="text-xs font-medium text-mc-text">Agent 请求权限</span>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-1.5">
        <div className="text-sm text-mc-text">
          允许执行: <span className="font-mono text-mc-brand">{permission}</span>
        </div>
        {target && (
          <div className="text-xs text-mc-text-muted">
            目标: <span className="font-mono">{target}</span>
          </div>
        )}
        {toolName && (
          <div className="text-2xs text-mc-text-muted">{toolName}</div>
        )}
      </div>

      {/* Actions */}
      <div className="grid grid-cols-3 border-t border-mc-border-subtle">
        <Button
          variant="brand"
          size="sm"
          onClick={() => onReply('once')}
          icon={<Shield size={11} />}
          className="rounded-none border-r border-mc-brand/20"
        >
          仅本次
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onReply('always')}
          icon={<ShieldCheck size={11} />}
          className="rounded-none border-r border-mc-border-subtle"
        >
          始终
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={() => onReply('reject')}
          icon={<ShieldX size={11} />}
          className="rounded-none"
        >
          拒绝
        </Button>
      </div>
    </div>
  )
}
