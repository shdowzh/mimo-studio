// 宽 Sidebar — OpenClaw 风（简化导航版）
// 260px 展开态 / 56px 折叠态
// 只做导航入口 + 新会话按钮；会话列表在右侧 ConversationList

import {
  MessageSquare,
  Terminal,
  Brain,
  Sparkles,
  Plug,
  Settings,
  Plus,
  LayoutDashboard,
  Activity,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { useChatStore } from '@/stores/chatStore'
import SidebarItem from './SidebarItem'
import type { ViewId } from '@/lib/types'

const MAIN_NAV: { id: ViewId; icon: typeof MessageSquare; label: string }[] = [
  { id: 'terminal', icon: Terminal, label: '终端' },
  { id: 'memory', icon: Brain, label: '记忆' },
  { id: 'skills', icon: Sparkles, label: '技能' },
  { id: 'mcp', icon: Plug, label: 'MCP' },
]

const CONTROL_NAV: { id: ViewId | 'overview' | 'activity'; icon: typeof MessageSquare; label: string; disabled?: boolean }[] = [
  { id: 'overview', icon: LayoutDashboard, label: '概览' },
  { id: 'activity', icon: Activity, label: '活动', disabled: true },
]

export default function Sidebar() {
  const { currentView, setCurrentView, sidebarCollapsed, toggleSidebar } = useUIStore()
  const sessions = useChatStore((s) => s.sessions)
  const currentSessionID = useChatStore((s) => s.currentSessionID)
  const setCurrentSession = useChatStore((s) => s.setCurrentSession)

  const startNewChat = () => {
    setCurrentView('chat')
    // 清空当前 session，让 ChatView 显示 EmptyState；
    // 用户发送第一条消息时 chatFlow 会自动创建真实 session。
    if (currentSessionID) {
      setCurrentSession(null)
    }
  }

  const widthClass = sidebarCollapsed ? 'w-sidebar' : 'w-sidebar-expanded'

  return (
    <aside
      className={widthClass + ' flex flex-col shrink-0 bg-mc-bg border-r border-mc-border-subtle select-none transition-all duration-200'}
    >
      {/* 顶部：Logo + 标题 + 折叠按钮 */}
      <div className="h-14 flex items-center justify-between px-3 border-b border-mc-border-subtle">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-mc-brand-soft flex items-center justify-center shrink-0">
              <MessageSquare size={15} className="text-mc-brand" />
            </div>
            <span className="text-sm font-semibold text-mc-text truncate">MiMo Studio</span>
          </div>
        )}
        {sidebarCollapsed && (
          <div className="w-9 h-9 rounded-lg bg-mc-brand-soft flex items-center justify-center">
            <MessageSquare size={17} className="text-mc-brand" />
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1.5 text-mc-text-muted hover:text-mc-text hover:bg-mc-hover rounded-md transition-colors"
          title={sidebarCollapsed ? '展开' : '收起'}
        >
          {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-3 space-y-1">
        {/* + 新会话 */}
        <div className={(sidebarCollapsed ? 'px-2' : 'px-3') + ' mb-4'}>
          <button
            onClick={startNewChat}
            className={
              'flex items-center justify-center gap-2 rounded-lg transition-colors ' +
              (sidebarCollapsed ? 'w-9 h-9 ' : 'w-full h-9 px-3 ') +
              'bg-mc-brand-soft text-mc-brand-text hover:bg-mc-bg-active font-medium'
            }
            title="新建对话"
          >
            <Plus size={16} />
            {!sidebarCollapsed && <span className="text-xs">新建对话</span>}
          </button>
        </div>

        {!sidebarCollapsed ? (
          <div className="space-y-4 px-3">
            {/* 聊天 */}
            <div className="space-y-0.5">
              <div className="px-2.5 py-1 text-2xs text-mc-text-muted">聊天</div>
              <SidebarItem
                icon={MessageSquare}
                label="聊天"
                active={currentView === 'chat'}
                onClick={() => setCurrentView('chat')}
                badge={sessions.length > 0 ? sessions.length : undefined}
              />
            </div>

            {/* 控制 */}
            <div className="space-y-0.5">
              <div className="px-2.5 py-1 text-2xs text-mc-text-muted">控制</div>
              {CONTROL_NAV.map((item) => (
                <SidebarItem
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  active={currentView === item.id}
                  disabled={item.disabled}
                  onClick={() => {
                    if (item.id === 'overview') {
                      setCurrentView('settings')
                    } else if (!item.disabled) {
                      setCurrentView(item.id as ViewId)
                    }
                  }}
                />
              ))}
              {MAIN_NAV.map((item) => (
                <SidebarItem
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  active={currentView === item.id}
                  onClick={() => setCurrentView(item.id)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 px-2">
            <SidebarItem
              icon={MessageSquare}
              label="聊天"
              active={currentView === 'chat'}
              collapsed
              onClick={() => setCurrentView('chat')}
            />
            {MAIN_NAV.map((item) => (
              <SidebarItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                active={currentView === item.id}
                collapsed
                onClick={() => setCurrentView(item.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div className={(sidebarCollapsed ? 'p-2' : 'p-3') + ' border-t border-mc-border-subtle space-y-1'}>
        <SidebarItem
          icon={Settings}
          label="设置"
          active={currentView === 'settings'}
          collapsed={sidebarCollapsed}
          onClick={() => setCurrentView('settings')}
        />
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2 px-2.5 h-7 text-2xs text-mc-text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-mc-success" />
            <span>v{__APP_VERSION__}</span>
          </div>
        )}
      </div>
    </aside>
  )
}
