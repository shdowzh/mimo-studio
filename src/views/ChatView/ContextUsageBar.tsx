// 上下文用量提示 — 仅显示当前会话累计 tokens，不伪造进度条

import { useChatStore } from '@/stores/chatStore'

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export default function ContextUsageBar() {
  const currentSessionID = useChatStore((s) => s.currentSessionID)
  const used = useChatStore((s) => {
    if (!currentSessionID || !s.messages[currentSessionID]) return 0
    const msgs = s.messages[currentSessionID]
    return msgs.reduce((sum, m) => sum + (m.info.tokens?.total ?? 0), 0)
  })

  if (used <= 0) return null

  return (
    <div className="flex items-center justify-end px-4 py-1.5 border-b border-mc-border-subtle/50">
      <span className="text-2xs text-mc-text-muted">
        {formatNumber(used)} tokens used
      </span>
    </div>
  )
}
