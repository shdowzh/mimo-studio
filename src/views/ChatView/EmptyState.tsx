// 空状态 — 新对话时的欢迎页

import { useChatStore } from '@/stores/chatStore'

const QUICK_PROMPTS = [
  '帮我写一个 Python 快速排序',
  '解释一下 React hooks 的工作原理',
  '用 TypeScript 实现一个 LRU Cache',
  '在当前项目中找出所有 TODO',
]

export default function EmptyState() {
  const sendMessage = useChatStore((s) => s.sendMessage)
  const serverConnected = useChatStore((s) => s.serverConnected)

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-6 max-w-md mx-auto px-4">
        {/* Logo / Brand */}
        <div className="space-y-2">
          <div className="text-2xl font-light tracking-tight text-mc-text-secondary">
            MiMo Studio
          </div>
          <p className="text-xs text-mc-text-muted">
            {serverConnected
              ? 'AI 编码助手 · Agent 自动执行任务'
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
                disabled={!serverConnected}
                className="text-left px-3 py-2.5 text-xs text-mc-text-secondary bg-mc-surface/50 border border-mc-border-subtle rounded-lg hover:bg-mc-hover hover:text-mc-text hover:border-mc-border transition-all duration-150 disabled:opacity-40"
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
