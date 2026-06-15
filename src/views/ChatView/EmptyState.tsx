// 空状态 — 根据连接和配置状态给出引导

import { useState, useEffect } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'
import { isElectron, getAPI } from '@/lib/ipc'
import { Download, Settings } from 'lucide-react'

const QUICK_PROMPTS = [
  '帮我写一个 Python 快速排序',
  '解释一下 React hooks 的工作原理',
  '用 TypeScript 实现一个 LRU Cache',
  '在当前项目中找出所有 TODO',
]

export default function EmptyState() {
  const sendMessage = useChatStore((s) => s.sendMessage)
  const serverConnected = useChatStore((s) => s.serverConnected)
  const serverReady = useChatStore((s) => s.serverReady)
  const initError = useChatStore((s) => s.initError)
  const retryInit = useChatStore((s) => s.retryInit)
  const [hasApiKeys, setHasApiKeys] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!isElectron()) { setChecking(false); return }
    getAPI().settings.get('apiKeys').then(raw => {
      const keys = raw ? JSON.parse(raw) : {}
      setHasApiKeys(Object.values(keys).some(v => typeof v === 'string' && v.trim()))
      setChecking(false)
    }).catch(() => { setChecking(false) })
  }, [])

  const canChat = serverReady || hasApiKeys

  // 需要用户操作的状态
  if (!checking && !canChat) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-5 max-w-sm mx-auto px-4">
          {/* 初始化超时错误 */}
          {initError && (
            <div className="mc-card p-3 border-red-500/30 bg-red-500/5">
              <p className="text-xs text-red-500 mb-2">{initError}</p>
              <button
                onClick={retryInit}
                className="text-[10px] px-3 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-500 transition-colors"
              >
                重试连接
              </button>
            </div>
          )}
          <div className="space-y-1.5">
            <p className="text-sm text-mc-text-secondary">欢迎使用 MiMo Studio</p>
            <p className="text-xs text-mc-text-muted">开始前请先完成一项配置：</p>
          </div>
          <div className="space-y-2.5 text-left">
            <button
              onClick={() => {
                useUIStore.getState().setCurrentView('settings')
                useUIStore.getState().setSettingsTab('providers')
              }}
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-mc-accent/30 bg-mc-accent/5 hover:bg-mc-accent/10 transition-colors group"
            >
              <Download size={16} className="text-mc-accent shrink-0" />
              <div className="text-left flex-1">
                <p className="text-xs text-mc-text font-medium">安装 MiMo CLI（推荐）</p>
                <p className="text-[10px] text-mc-text-muted">获得完整 Agent 能力：工具调用、文件操作、免费模型</p>
              </div>
            </button>
            <button
              onClick={() => {
                useUIStore.getState().setCurrentView('settings')
                useUIStore.getState().setSettingsTab('providers')
              }}
              className="w-full flex items-center gap-3 p-3 rounded-lg border border-mc-border hover:bg-mc-hover transition-colors group"
            >
              <Settings size={16} className="text-mc-text-muted shrink-0 group-hover:text-mc-text transition-colors" />
              <div className="text-left flex-1">
                <p className="text-xs text-mc-text font-medium">配置 API Key</p>
                <p className="text-[10px] text-mc-text-muted">使用 OpenAI / Anthropic / DeepSeek 等外部模型（纯文本）</p>
              </div>
            </button>
          </div>
          {/* 重试连接 */}
          <button
            onClick={async () => {
              const { connectToServer } = await import('@/lib/api')
              await connectToServer()
            }}
            className="text-[10px] text-mc-accent hover:underline"
          >
            重试连接
          </button>
        </div>
      </div>
    )
  }

  // 正常空状态：可用时显示快捷提示
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-6 max-w-md mx-auto px-4">
        {/* Logo / Brand */}
        <div className="space-y-2">
          <div className="text-2xl font-light tracking-tight text-mc-text-secondary">
            MiMo Studio
          </div>
          <p className="text-xs text-mc-text-muted">
            {initError
              ? `⚠️ ${initError}`
              : serverReady
                ? 'AI 编码助手 · Agent 自动执行任务'
                : serverConnected
                  ? '正在初始化 MiMo 服务...'
                  : hasApiKeys
                    ? '离线模式 — 纯文本聊天（无 Agent 能力）'
                    : '正在连接 MiMo Server...'}
          </p>
        </div>

        {/* Quick prompts */}
        <div className="space-y-2">
          <p className="text-[10px] text-mc-text-muted uppercase tracking-wider">试试这些</p>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => sendMessage(prompt)}
                className="text-left px-3 py-2.5 text-xs text-mc-text-secondary bg-mc-surface/50 border border-mc-border-subtle rounded-lg hover:bg-mc-hover hover:text-mc-text hover:border-mc-border transition-all duration-150"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
