import { useChatStore, selectors } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'
import StatusDot from '@/components/ui/StatusDot'

interface ServerStatusBadgeProps {
  expanded: boolean
}

export default function ServerStatusBadge({ expanded }: ServerStatusBadgeProps) {
  const isAgentMode = useChatStore(selectors.isAgentMode)
  const isInitializing = useChatStore(selectors.isInitializing)

  const { tone, label, hint } = (() => {
    if (isAgentMode) return { tone: 'success' as const, label: 'Agent 在线', hint: '工具调用 / 文件操作 / 权限均可用' }
    if (isInitializing) return { tone: 'brand' as const, label: '正在准备', hint: 'MiMo Serve 初始化中' }
    return { tone: 'warning' as const, label: '离线', hint: '点击配置 Provider' }
  })()

  return (
    <button
      onClick={() => {
        useUIStore.getState().setCurrentView('settings')
        useUIStore.getState().setSettingsTab('providers')
      }}
      title={hint}
      className={`flex items-center gap-2 ${expanded ? 'px-3 w-full justify-start' : 'w-9 justify-center'} h-8 rounded-md text-mc-text-muted hover:text-mc-text hover:bg-mc-hover transition-colors`}
    >
      <StatusDot tone={tone} pulse={isInitializing} />
      {expanded && <span className="text-xs truncate">{label}</span>}
    </button>
  )
}
