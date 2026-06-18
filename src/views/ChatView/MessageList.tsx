// 消息列表 — 简单滚动列表

import { useEffect, useMemo, useRef } from 'react'
import { useChatStore } from '@/stores/chatStore'
import MessageBubble from './MessageBubble'
import PermissionDialog from './PermissionDialog'

export default function MessageList() {
  const currentSessionID = useChatStore((s) => s.currentSessionID)
  const allMessages = useChatStore((s) => s.messages)
  const messages = useMemo(
    () => currentSessionID ? allMessages[currentSessionID] || [] : [],
    [currentSessionID, allMessages],
  )
  const sessionStatus = useChatStore((s) => s.currentSessionID ? s.sessionStatus[s.currentSessionID] : undefined)
  const scrollRef = useRef<HTMLDivElement>(null)

  const isBusy = sessionStatus && sessionStatus.type === 'busy'

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, messages[messages.length - 1]?.parts?.length, isBusy])

  return (
    <div className="flex-1 overflow-hidden relative" style={{ minHeight: 0 }}>
      <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.info.id} message={msg} />
        ))}

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
      </div>

      <PermissionDialog />
    </div>
  )
}
