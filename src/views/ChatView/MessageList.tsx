// 消息列表 — 基于 mimo serve Session 消息

import { useRef, useEffect } from 'react'
import { useChatStore } from '@/stores/chatStore'
import MessageBubble from './MessageBubble'
import PermissionDialog from './PermissionDialog'
import type { SessionStatusInfo } from '@/lib/mimoTypes'

export default function MessageList() {
  const currentSessionID = useChatStore((s) => s.currentSessionID)
  const messages = useChatStore((s) => currentSessionID ? s.messages[currentSessionID] || [] : [])
  const sessionStatus = useChatStore((s) => currentSessionID ? s.sessionStatus[currentSessionID] : undefined)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const isBusy = sessionStatus && sessionStatus.type === 'busy'

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {messages.map((msg) => (
        <MessageBubble key={msg.info.id} message={msg} />
      ))}

      {/* Agent 工作指示器 */}
      {isBusy && messages.length > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-mc-text-muted">
          <span className="flex gap-0.5">
            <span className="w-1 h-1 bg-mc-text-muted rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
            <span className="w-1 h-1 bg-mc-text-muted rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
            <span className="w-1 h-1 bg-mc-text-muted rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
          </span>
          <span>Agent 执行中...</span>
        </div>
      )}

      <div ref={bottomRef} />

      {/* 权限对话框 */}
      <PermissionDialog />
    </div>
  )
}
