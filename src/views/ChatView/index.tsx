// ChatView 入口 — 基于 mimo serve 的实时聊天
// SSE + 连接初始化已移至 App.tsx，此处只读状态

import { useEffect, useMemo } from 'react'
import { useChatStore } from '@/stores/chatStore'
import ConversationList from './ConversationList'
import ChatHeader from './ChatHeader'
import ChatStatusBar from './ChatStatusBar'
import MessageList from './MessageList'
import MessageInput from './MessageInput'
import EmptyState from './EmptyState'

export default function ChatView() {
  const currentSessionID = useChatStore((s) => s.currentSessionID)
  const allMessages = useChatStore((s) => s.messages)
  const messages = useMemo(
    () => currentSessionID ? allMessages[currentSessionID] || [] : [],
    [currentSessionID, allMessages],
  )

  // 切换 session 时加载消息
  useEffect(() => {
    if (currentSessionID) {
      useChatStore.getState().loadMessages(currentSessionID)
    }
  }, [currentSessionID])

  const showEmpty = !currentSessionID || !messages.length

  return (
    <div className="flex h-full">
      {/* 对话列表 */}
      <ConversationList />

      {/* 主聊天区 */}
      <div className="flex-1 flex flex-col min-w-0">
        <ChatHeader />

        {/* 单一状态条 — 只在异常 / 初始化 / 离线时显示 */}
        <ChatStatusBar hasMessages={!showEmpty} />

        {showEmpty ? (
          <EmptyState />
        ) : (
          <MessageList />
        )}

        <MessageInput />
      </div>
    </div>
  )
}
