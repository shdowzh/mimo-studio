// 通用空态组件 — 居中显示图标 + 标题 + 描述 + 可选操作
// 替代各视图自写的 EmptyState

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface EmptyHintProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export default function EmptyHint({ icon: Icon, title, description, action, className = '' }: EmptyHintProps) {
  return (
    <div className={`flex flex-1 items-center justify-center ${className}`}>
      <div className="text-center space-y-3 max-w-xs px-4">
        {Icon && (
          <Icon size={36} strokeWidth={1} className="text-mc-text-muted/50 mx-auto mb-1" />
        )}
        <p className="text-sm text-mc-text-secondary font-medium">{title}</p>
        {description && (
          <p className="text-xs text-mc-text-muted leading-relaxed">{description}</p>
        )}
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  )
}
