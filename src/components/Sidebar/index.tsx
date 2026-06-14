import { MessageSquare, Terminal, Brain, Sparkles, Plug, Settings } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import NavItem from './NavItem'
import type { ViewId } from '@/lib/types'

const NAV_ITEMS: { id: ViewId; icon: typeof MessageSquare; label: string }[] = [
  { id: 'chat', icon: MessageSquare, label: '聊天' },
  { id: 'terminal', icon: Terminal, label: '终端' },
  { id: 'memory', icon: Brain, label: '记忆' },
  { id: 'skills', icon: Sparkles, label: '技能' },
  { id: 'mcp', icon: Plug, label: 'MCP' },
]

export default function Sidebar() {
  const { currentView, setCurrentView } = useUIStore()

  return (
    <aside className="w-sidebar flex flex-col items-center py-3 bg-mc-bg border-r border-mc-border-subtle select-none">
      {/* Main nav */}
      <div className="flex flex-col items-center gap-1">
        {NAV_ITEMS.map(({ id, icon, label }) => (
          <NavItem
            key={id}
            icon={icon}
            label={label}
            active={currentView === id}
            onClick={() => setCurrentView(id)}
          />
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom nav */}
      <div className="flex flex-col items-center gap-1">
        <NavItem
          icon={Settings}
          label="设置"
          active={currentView === 'settings'}
          onClick={() => setCurrentView('settings')}
        />
      </div>
    </aside>
  )
}
