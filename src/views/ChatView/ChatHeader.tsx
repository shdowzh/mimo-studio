// 聊天顶栏 — 面包屑 + 状态徽标 + 对话列表折叠按钮
// 模型选择器已移到 MessageInput 底部工具栏

import { useChatStore, selectors } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'
import { PanelLeft, ChevronRight } from 'lucide-react'
import StatusDot from '@/components/ui/StatusDot'

export default function ChatHeader() {
  const currentSessionID = useChatStore((s) => s.currentSessionID)
  const sessions = useChatStore((s) => s.sessions)
  const sessionStatus = useChatStore((s) => currentSessionID ? s.sessionStatus[currentSessionID] : undefined)
  const serverConnected = useChatStore(selectors.serverConnected)
  const isAgentMode = useChatStore(selectors.isAgentMode)
  const conversationListOpen = useUIStore((s) => s.conversationListOpen)
  const { toggleConversationList } = useUIStore()

  const currentSession = sessions.find((s) => s.id === currentSessionID)
  const isBusy = sessionStatus?.type === 'busy'

  return (
    <div className="shrink-0 flex items-center justify-between px-3 h-11 border-b border-mc-border-subtle no-drag">
      <div className="flex items-center gap-2 min-w-0">
        {!conversationListOpen && (
          <button onClick={toggleConversationList} className="p-1.5 text-mc-text-muted hover:text-mc-text hover:bg-mc-hover rounded transition-colors" title="展开对话列表">
            <PanelLeft size={14} strokeWidth={1.5} />
          </button>
        )}

        <nav className="flex items-center gap-1 text-xs">
          <span className="text-mc-text-secondary">聊天</span>
          {currentSession && (
            <>
              <ChevronRight size={12} className="text-mc-text-muted" />
              <span className="text-mc-brand-text truncate max-w-[240px]">{currentSession.title || '无标题'}</span>
            </>
          )}
          {!currentSession && <span className="text-mc-text-muted">新对话</span>}
        </nav>
      </div>

      <div className="flex items-center gap-2">
        <span
          className="flex items-center gap-1 text-2xs text-mc-text-muted"
          title={isAgentMode ? 'Agent 模式：工具调用 / 文件操作 / 权限管理 均可用' : serverConnected ? 'MiMo Serve 已连接，正在就绪' : '离线模式：无 Agent 能力'}
        >
          <StatusDot
            tone={isAgentMode ? 'success' : serverConnected ? 'brand' : 'warning'}
            pulse={!isAgentMode && serverConnected}
          />
          {isAgentMode ? 'Agent' : serverConnected ? '准备中' : '离线'}
        </span>
        {isBusy && (
          <span className="flex items-center gap-1 text-2xs text-mc-brand">
            <StatusDot tone="brand" pulse />
            执行中
          </span>
        )}
      </div>
    </div>
  )
}
