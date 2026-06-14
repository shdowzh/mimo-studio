// ChatView 入口 — 基于 mimo serve 的实时聊天

import { useEffect } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { connectToServer } from '@/lib/api'
import { isElectron } from '@/lib/ipc'
import ConversationList from './ConversationList'
import ChatHeader from './ChatHeader'
import MessageList from './MessageList'
import MessageInput from './MessageInput'
import EmptyState from './EmptyState'

export default function ChatView() {
  const {
    currentSessionID,
    serverConnected,
    currentProvider,
    messages,
    loadSessions,
    setCurrentSession,
    initSSE,
    lastError,
    setLastError,
  } = useChatStore()

  // 判断当前是 Agent 模式还是直连模式
  const isMimoModel = currentProvider === 'mimo' || currentProvider === 'opencode' || !currentProvider
  const isAgentMode = serverConnected && isMimoModel
  const isDirectMode = !serverConnected || !isMimoModel

  // 初始化：连接 mimo serve + 启动 SSE 监听
  useEffect(() => {
    let unsubSSE: (() => void) | undefined

    async function init() {
      if (!isElectron()) return

      // 先注册 SSE 事件处理（确保不丢事件）
      unsubSSE = initSSE()

      // 再连接 mimo serve（启动 SSE 流）
      const connected = await connectToServer()

      // 加载 session 列表
      if (connected) {
        loadSessions()
      }
    }
    init()

    return () => {
      unsubSSE?.()
    }
  }, [])

  // 切换 session 时加载消息
  useEffect(() => {
    if (currentSessionID) {
      useChatStore.getState().loadMessages(currentSessionID)
    }
  }, [currentSessionID])

  const showEmpty = !currentSessionID ||
    (currentSessionID && !messages[currentSessionID]?.length)

  return (
    <div className="flex h-full">
      {/* 对话列表 */}
      <ConversationList />

      {/* 主聊天区 */}
      <div className="flex-1 flex flex-col min-w-0">
        <ChatHeader />

        {/* 模式横幅 */}
        {!showEmpty && (
          <div className={`px-3 py-1 border-b flex items-center gap-2 text-[10px] ${
            isAgentMode
              ? 'bg-green-500/8 border-green-500/20 text-green-600'
              : 'bg-amber-500/8 border-amber-500/20 text-amber-600'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isAgentMode ? 'bg-green-500' : 'bg-amber-500'}`} />
            {isAgentMode ? (
              <span>Agent 模式 — 工具调用 · 文件操作 · 权限管理 均可用</span>
            ) : isDirectMode && currentProvider && !isMimoModel ? (
              <span>直连 {currentProvider} — 纯文本模式（无 Agent 能力）</span>
            ) : (
              <span>MiMo Serve 未连接 — 纯文本模式（无 Agent 能力）</span>
            )}
          </div>
        )}

        {/* 错误横幅 */}
        {lastError && (
          <div className="px-4 py-1.5 bg-red-500/10 border-b border-red-500/20 flex items-center justify-between">
            <span className="text-[10px] text-red-500 truncate flex-1">{lastError}</span>
            <button onClick={() => setLastError(null)} className="text-red-400 hover:text-red-300 ml-2 shrink-0 text-xs">✕</button>
          </div>
        )}

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
