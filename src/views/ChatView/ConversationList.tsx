// 会话列表 — 基于 mimo serve Session API

import { useEffect, useMemo, useRef, useState } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'
import { Plus, MessageSquare, Trash2, PanelLeftClose, Search, X, Edit, Pin, PinOff, Copy } from 'lucide-react'
import ContextMenu from '@/components/ui/ContextMenu'
import EmptyHint from '@/components/ui/EmptyHint'
import type { SessionInfo } from '@/lib/mimoTypes'

const GROUP_LABELS = ['置顶', '今天', '昨天', '本周', '更早'] as const
type SessionGroupLabel = typeof GROUP_LABELS[number]

export default function ConversationList() {
  const sessions = useChatStore((s) => s.sessions)
  const pinnedSessionIds = useChatStore((s) => s.pinnedSessionIds)
  const currentSessionID = useChatStore((s) => s.currentSessionID)
  const setCurrentSession = useChatStore((s) => s.setCurrentSession)
  const loadMessages = useChatStore((s) => s.loadMessages)
  const deleteSession = useChatStore((s) => s.deleteSession)
  const createSession = useChatStore((s) => s.createSession)
  const renameSession = useChatStore((s) => s.renameSession)
  const togglePinSession = useChatStore((s) => s.togglePinSession)
  const loadPinnedSessions = useChatStore((s) => s.loadPinnedSessions)
  const { conversationListOpen, toggleConversationList } = useUIStore()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadPinnedSessions()
  }, [loadPinnedSessions])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const filteredSessions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sessions
    return sessions.filter(s => (s.title || '无标题').toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
  }, [sessions, query])

  const groups = useMemo(
    () => groupSessions(filteredSessions, pinnedSessionIds),
    [filteredSessions, pinnedSessionIds],
  )

  const handleSelect = async (id: string) => {
    setCurrentSession(id)
    loadMessages(id)
  }

  const handleNew = async () => {
    const session = await createSession('新对话')
    if (session) loadMessages(session.id)
  }

  const handleDelete = async (id: string) => {
    await deleteSession(id)
  }

  const handleRename = async (session: SessionInfo) => {
    const title = window.prompt('重命名对话', session.title || '无标题')
    if (!title || !title.trim() || title.trim() === session.title) return
    await renameSession(session.id, title.trim())
  }

  if (!conversationListOpen) return null

  return (
    <div className="w-conv-list flex flex-col border-r border-mc-border-subtle bg-mc-bg/50 shrink-0">
      {/* Header */}
      <div className="h-11 flex items-center justify-between px-3 border-b border-mc-border-subtle">
        <span className="text-xs font-medium text-mc-text-muted">对话历史</span>
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

      {/* Search */}
      <div className="px-2 py-2 border-b border-mc-border-subtle/60">
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-mc-text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索对话 (Ctrl+K)"
            className="w-full pl-7 pr-7 py-1.5 text-xs bg-mc-surface border border-mc-border-subtle rounded-md focus:outline-none focus:border-mc-brand placeholder:text-mc-text-muted"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-mc-text-muted hover:text-mc-text"
              title="清空搜索"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1 animate-page-enter">
        {sessions.length === 0 ? (
          <EmptyHint icon={MessageSquare} title="暂无对话" description="点击右上角 + 创建新对话" />
        ) : filteredSessions.length === 0 ? (
          <EmptyHint icon={Search} title="没有匹配的对话" description="换个关键词试试" />
        ) : (
          GROUP_LABELS.map(label => {
            const items = groups[label]
            if (!items.length) return null
            return (
              <div key={label} className="mb-2">
                <div className="sticky top-0 z-10 px-3 py-1 text-2xs text-mc-text-muted uppercase tracking-wider bg-mc-bg/95 backdrop-blur-sm">
                  {label}
                  <span className="ml-1.5 normal-case font-normal opacity-60">{items.length}</span>
                </div>
                {items.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    isPinned={pinnedSessionIds.includes(session.id)}
                    isActive={session.id === currentSessionID}
                    onSelect={() => handleSelect(session.id)}
                    onDelete={() => handleDelete(session.id)}
                    onRename={() => handleRename(session)}
                    onTogglePin={() => togglePinSession(session.id)}
                  />
                ))}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function SessionItem({ session, isActive, isPinned, onSelect, onDelete, onRename, onTogglePin }: {
  session: SessionInfo
  isActive: boolean
  isPinned: boolean
  onSelect: () => void
  onDelete: () => void
  onRename: () => void
  onTogglePin: () => void
}) {
  const timeStr = formatTime(session.time.updated)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  return (
    <>
      <div
        className={`
          group relative flex items-center gap-2 px-3 py-2 mx-1 rounded-md cursor-pointer
          transition-all duration-100
          ${isActive
            ? 'bg-mc-bg-active text-mc-text font-medium'
            : 'text-mc-text-secondary hover:bg-mc-hover hover:text-mc-text'
          }
        `}
        onClick={onSelect}
        onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }) }}
      >
        <MessageSquare size={13} strokeWidth={1.5} className={`flex-shrink-0 ${isActive ? 'text-mc-brand' : 'text-mc-text-muted'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {isPinned && <Pin size={10} className="shrink-0 text-mc-brand" />}
            <div className="text-xs truncate">{session.title || '无标题'}</div>
          </div>
          <div className="text-2xs text-mc-text-muted">{timeStr}</div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-mc-text-muted hover:text-mc-error transition-all"
          title="删除"
        >
          <Trash2 size={11} />
        </button>
        {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-mc-brand rounded-r" />}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: '重命名', icon: <Edit size={11} />, onClick: onRename },
            { label: isPinned ? '取消置顶' : '置顶', icon: isPinned ? <PinOff size={11} /> : <Pin size={11} />, onClick: onTogglePin },
            { label: '复制 ID', icon: <Copy size={11} />, onClick: () => navigator.clipboard?.writeText(session.id) },
            { label: '删除', icon: <Trash2 size={11} />, danger: true, onClick: onDelete },
          ]}
        />
      )}
    </>
  )
}

function groupSessions(sessions: SessionInfo[], pinnedSessionIds: string[]): Record<SessionGroupLabel, SessionInfo[]> {
  const pinned = new Set(pinnedSessionIds)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfYesterday = startOfToday - 86400000
  const startOfWeek = startOfToday - now.getDay() * 86400000

  const buckets: Record<SessionGroupLabel, SessionInfo[]> = {
    置顶: [],
    今天: [],
    昨天: [],
    本周: [],
    更早: [],
  }

  for (const session of sessions) {
    if (pinned.has(session.id)) {
      buckets.置顶.push(session)
      continue
    }
    const t = session.time.updated
    if (t >= startOfToday) buckets.今天.push(session)
    else if (t >= startOfYesterday) buckets.昨天.push(session)
    else if (t >= startOfWeek) buckets.本周.push(session)
    else buckets.更早.push(session)
  }

  return buckets
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
