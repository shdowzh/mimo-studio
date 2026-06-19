// 状态点 — 表示连接/会话/服务状态的小圆点
// 替代分散的 <span className="w-1.5 h-1.5 rounded-full bg-...">

interface StatusDotProps {
  tone: 'success' | 'warning' | 'error' | 'brand' | 'muted'
  pulse?: boolean
  size?: 'sm' | 'md'
  className?: string
}

const TONE_BG: Record<StatusDotProps['tone'], string> = {
  success: 'bg-mc-success',
  warning: 'bg-mc-warning',
  error: 'bg-mc-error',
  brand: 'bg-mc-brand',
  muted: 'bg-mc-text-muted',
}

export default function StatusDot({ tone, pulse, size = 'sm', className = '' }: StatusDotProps) {
  const dim = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2'
  return (
    <span
      className={`inline-block shrink-0 rounded-full ${dim} ${TONE_BG[tone]} ${pulse ? 'animate-pulse' : ''} ${className}`}
    />
  )
}
