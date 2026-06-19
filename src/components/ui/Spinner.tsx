// 统一的加载指示器 — 替代分散的 Loader2/RefreshCw animate-spin
import { Loader2 } from 'lucide-react'

interface SpinnerProps {
  size?: number
  className?: string
  /** 'brand' = 强调（操作进行中），'muted' = 辅助（轻量等待） */
  tone?: 'brand' | 'muted'
}

export default function Spinner({ size = 12, className = '', tone = 'brand' }: SpinnerProps) {
  const color = tone === 'brand' ? 'text-mc-brand' : 'text-mc-text-muted'
  return <Loader2 size={size} className={`animate-spin ${color} ${className}`} />
}
