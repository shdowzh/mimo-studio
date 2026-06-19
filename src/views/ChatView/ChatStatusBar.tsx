// 聊天状态条 — 把初始化/错误/离线/最近错误合并为单条带优先级的条
// 优先级：lastError > initError > initializing > offline (非 agent 且已开始对话)
// 正常 Agent 模式不显示，避免占用主界面纵向空间

import { AlertTriangle, RefreshCw, X, WifiOff, Loader2 } from 'lucide-react'
import { useChatStore, selectors } from '@/stores/chatStore'
import { isEphemeralSessionId } from '@/stores/chatFlow'

type Tone = 'error' | 'warning' | 'info'

interface BarConfig {
  tone: Tone
  icon: React.ReactNode
  text: string
  action?: { label: string; onClick: () => void }
  onDismiss?: () => void
}

const TONE_CLASS: Record<Tone, string> = {
  error: 'bg-mc-error/8 border-mc-error/25 text-mc-error',
  warning: 'bg-mc-warning/8 border-mc-warning/25 text-mc-warning',
  info: 'bg-mc-brand-soft border-mc-brand/25 text-mc-brand',
}

interface ChatStatusBarProps {
  /** 当前会话是否已经有消息 — 用于决定是否显示"离线模式"提示 */
  hasMessages: boolean
}

export default function ChatStatusBar({ hasMessages }: ChatStatusBarProps) {
  const isAgentMode = useChatStore(selectors.isAgentMode)
  const isInitializing = useChatStore(selectors.isInitializing)
  const initError = useChatStore(selectors.initError)
  const currentProvider = useChatStore((s) => s.currentProvider)
  const currentSessionID = useChatStore((s) => s.currentSessionID)
  const lastError = useChatStore((s) => s.lastError)
  const setLastError = useChatStore((s) => s.setLastError)
  const retryInit = useChatStore((s) => s.retryInit)

  // 优先级筛选：只显示一条
  const config: BarConfig | null = (() => {
    if (lastError) {
      return {
        tone: 'error',
        icon: <AlertTriangle size={12} strokeWidth={1.75} />,
        text: lastError,
        onDismiss: () => setLastError(null),
      }
    }
    if (initError) {
      return {
        tone: 'error',
        icon: <AlertTriangle size={12} strokeWidth={1.75} />,
        text: initError,
        action: { label: '重试', onClick: retryInit },
      }
    }
    if (isInitializing) {
      return {
        tone: 'info',
        icon: <Loader2 size={12} className="animate-spin" />,
        text: '正在初始化 MiMo 服务…',
      }
    }
    // 离线模式：只在已开始对话时提示一次
    if (!isAgentMode && hasMessages) {
      const ephemeralNote = currentSessionID && isEphemeralSessionId(currentSessionID) ? ' · 会话不会保存' : ''
      const providerNote = currentProvider ? `，直连 ${currentProvider}` : ''
      return {
        tone: 'warning',
        icon: <WifiOff size={12} strokeWidth={1.75} />,
        text: `离线模式 — MiMo Serve 未连接，纯文本（无 Agent 能力）${providerNote}${ephemeralNote}`,
      }
    }
    return null
  })()

  if (!config) return null

  return (
    <div
      className={`shrink-0 flex items-center gap-2 px-3 py-1.5 border-b text-2xs ${TONE_CLASS[config.tone]}`}
    >
      <span className="shrink-0 flex items-center">{config.icon}</span>
      <span className="flex-1 truncate">{config.text}</span>
      {config.action && (
        <button
          onClick={config.action.onClick}
          className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-current/10 hover:bg-current/20 transition-colors text-2xs font-medium"
        >
          <RefreshCw size={9} />
          {config.action.label}
        </button>
      )}
      {config.onDismiss && (
        <button
          onClick={config.onDismiss}
          className="shrink-0 p-0.5 rounded hover:bg-current/10 transition-colors"
          aria-label="关闭"
        >
          <X size={11} />
        </button>
      )}
    </div>
  )
}
