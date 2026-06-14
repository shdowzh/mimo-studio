// 会话列表 — 基于 mimo serve Session API

import { useChatStore } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'
import { Plus, MessageSquare, Trash2, PanelLeftClose } from 'lucide-react'
import type { SessionInfo } from '@/lib/mimoTypes'

export default function ConversationList() {
  const sessions = useChatStore((s) => s.sessions)
  const currentSessionID = useChatStore((s) => s.currentSessionID)
  const setCurrentSession = useChatStore((s) => s.setCurrentSession)
  const loadMessages = useChatStore((s) => s.loadMessages)
  const deleteSession = useChatStore((s) => s.deleteSession)
  const createSession = useChatStore((s) => s.createSession)
  const { toggleConversationList } = useUIStore()

  const handleSelect = async (id: string) => {
    setCurrentSession(id)
    loadMessages(id)
  }

  const handleNew = async () => {
    const session = await createSession('新对话')
    if (session) loadMessages(session.id)
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await deleteSession(id)
  }

  return (
    <div className="w-conv-list flex flex-col border-r border-mc-border-subtle bg-mc-bg/50">
      {/* macOS traffic light drag region */}
      <div className="h-[36px] flex items-end px-3 drag">
        <span className="text-xs font-medium text-mc-text-muted pb-1.5">对话</span>
      </div>
      {/* Header */}
      <div className="flex items-center justify-end px-3 h-9 border-b border-mc-border-subtle">
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleNew}
            className="p-1.5 text-mc-text-muted hover:text-mc-text hover:bg-mc-hover rounded transition-colors"
            title="新对话"
          >
            <Plus size={14} strokeWidth={1.5} />
          </button>
          <button
            onClick={toggleConversationList}
            className="p-1.5 text-mc-text-muted hover:text-mc-text hover:bg-mc-hover rounded transition-colors"
            title="收起面板"
          >
            <PanelLeftClose size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {sessions.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-mc-text-muted">
            暂无对话
          </div>
        )}
        {sessions.map((session) => (
          <SessionItem
            key={session.id}
            session={session}
            isActive={session.id === currentSessionID}
            onSelect={() => handleSelect(session.id)}
            onDelete={(e) => handleDelete(e, session.id)}
          />
        ))}
      </div>
    </div>
  )
}

function SessionItem({ session, isActive, onSelect, onDelete }: {
  session: SessionInfo
  isActive: boolean
  onSelect: () => void
  onDelete: (e: React.MouseEvent) => void
}) {
  const timeStr = formatTime(session.time.updated)

  return (
    <div
      className={`
        group flex items-center gap-2 px-3 py-2 mx-1 rounded-md cursor-pointer
        transition-all duration-100
        ${isActive
          ? 'bg-mc-elevated/70 text-mc-text'
          : 'text-mc-text-secondary hover:bg-mc-hover hover:text-mc-text'
        }
      `}
      onClick={onSelect}
    >
      <MessageSquare size={13} strokeWidth={1.5} className="flex-shrink-0 text-mc-text-muted" />
      <div className="flex-1 min-w-0">
        <div className="text-xs truncate">{session.title || '无标题'}</div>
        <div className="text-[10px] text-mc-text-muted">{timeStr}</div>
      </div>
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 p-0.5 text-mc-text-muted hover:text-mc-error transition-all"
      >
        <Trash2 size={11} />
      </button>
    </div>
  )
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return '刚刚'
  if (diffMins < 60) return `${diffMins} 分钟前`

  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours} 小时前`

  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
