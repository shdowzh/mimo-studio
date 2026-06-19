// 视图顶栏 — 36px macOS 交通灯 drag region + 可选标题/操作
// 替换各 View 中散落的 <div className="h-[36px] drag" /> + 第二行 header 的两层结构

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface TitleBarProps {
  icon?: LucideIcon
  title: string
  /** 顶栏右侧操作区（不参与 drag） */
  actions?: ReactNode
  /** 顶栏下方紧贴的副内容（如 tab bar），不参与 drag */
  subBar?: ReactNode
}

export default function TitleBar({ icon: Icon, title, actions, subBar }: TitleBarProps) {
  return (
    <div className="shrink-0 border-b border-mc-border-subtle">
      {/* drag region (36px) — 标题上半段，避免压住 macOS 交通灯 */}
      <div
        className="flex items-center justify-between px-4 drag"
        style={{ height: '36px' }}
      >
        <div className="flex items-center gap-2 text-mc-text-secondary">
          {Icon && <Icon size={13} strokeWidth={1.5} className="text-mc-text-muted" />}
          <span className="text-xs font-medium tracking-tight">{title}</span>
        </div>
        {actions && <div className="no-drag flex items-center gap-1">{actions}</div>}
      </div>
      {subBar && (
        <div className="no-drag flex items-center gap-1 px-4 h-9 border-t border-mc-border-subtle/60">
          {subBar}
        </div>
      )}
    </div>
  )
}
