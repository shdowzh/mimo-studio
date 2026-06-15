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
    serverReady,
    serveMode,
    currentProvider,
    messages,
    loadSessions,
    setCurrentSession,
    initSSE,
    lastError,
    setLastError,
    initError,
    retryInit,
  } = useChatStore()

  // 模式判断：
  // serverReady → Agent 模式（初始化完成，所有功能可用）
  // serverConnected && !serverReady → 正在初始化（auto dream 等跑完）
  // !serverConnected → 离线模式（纯文本 fallback）
  const isAgentMode = serverReady
  const isInitializing = serverConnected && !serverReady
  const isDirectMode = !serverConnected

  // 初始化：连接 mimo serve + 启动 SSE 监听（异步，不阻塞 UI）
  useEffect(() => {
    let unsubSSE: (() => void) | undefined

    async function init() {
      if (!isElectron()) return

      // 先注册 SSE 事件处理（确保不丢事件）
      unsubSSE = initSSE()

      // 再连接 mimo serve（启动 SSE 流）
      connectToServer().then(connected => {
        if (connected) {
          loadSessions()
        }
      })
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

        {/* 初始化中横幅 */}
        {isInitializing && !initError && (
          <div className="px-3 py-1 border-b flex items-center gap-2 text-[10px] bg-blue-500/8 border-blue-500/20 text-blue-500">
            <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-blue-500 animate-pulse" />
            <span>正在初始化 MiMo 服务...</span>
          </div>
        )}

        {/* 初始化超时错误 */}
        {initError && (
          <div className="px-3 py-1.5 border-b flex items-center justify-between text-[10px] bg-red-500/8 border-red-500/20 text-red-500">
            <span className="flex items-center gap-2 truncate flex-1">
              <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-red-500" />
              <span className="truncate">{initError}</span>
            </span>
            <button
              onClick={retryInit}
              className="ml-2 px-2 py-0.5 rounded text-[10px] bg-red-500/10 hover:bg-red-500/20 shrink-0 transition-colors"
            >
              重试
            </button>
          </div>
        )}

        {/* 模式横幅 */}
        {!showEmpty && !isInitializing && (
          <div className={`px-3 py-1 border-b flex items-center gap-2 text-[10px] ${
            isAgentMode
              ? 'bg-green-500/8 border-green-500/20 text-green-600'
              : 'bg-amber-500/8 border-amber-500/20 text-amber-600'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isAgentMode ? 'bg-green-500' : 'bg-amber-500'}`} />
            {isAgentMode ? (
              <span>Agent 模式{serveMode === 'embedded' ? ' (直嵌)' : ''} — 工具调用 · 文件操作 · 权限管理 均可用{currentProvider && currentProvider !== 'mimo' && currentProvider !== 'opencode' ? `（经 MiMo Code → ${currentProvider}）` : ''}</span>
            ) : (
              <span>离线模式 — MiMo Serve 未连接，纯文本（无 Agent 能力）{currentProvider ? `，直连 ${currentProvider}` : ''}</span>
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
