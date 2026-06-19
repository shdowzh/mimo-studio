// Sidebar 项 — 展开态（260px）/ 折叠态（56px）双模式

import type { LucideIcon } from 'lucide-react'

interface SidebarItemProps {
  icon: LucideIcon
  label: string
  active?: boolean
  collapsed?: boolean
  onClick: () => void
  badge?: string | number
  disabled?: boolean
}

export default function SidebarItem({
  icon: Icon,
  label,
  active,
  collapsed,
  onClick,
  badge,
  disabled,
}: SidebarItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={collapsed ? label : undefined}
      className={`
        group relative flex items-center rounded-lg transition-colors
        ${collapsed ? 'w-9 h-9 justify-center' : 'w-full h-8 px-2.5 gap-2.5'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${active
          ? 'bg-mc-bg-active text-mc-brand-text font-medium'
          : 'text-mc-text-secondary hover:text-mc-text hover:bg-mc-hover'
        }
      `}
    >
      <Icon size={16} strokeWidth={active ? 1.75 : 1.5} className="shrink-0" />
      {!collapsed && <span className="text-xs flex-1 text-left truncate">{label}</span>}
      {!collapsed && badge !== undefined && (
        <span className="min-w-[16px] h-4 flex items-center justify-center bg-mc-elevated text-mc-text-muted text-2xs font-medium rounded-full px-1">
          {badge}
        </span>
      )}
      {active && !collapsed && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-mc-brand rounded-r" />
      )}
      {collapsed && (
        <span className="absolute left-full ml-2 px-2 py-1 bg-mc-elevated text-mc-text text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 border border-mc-border-subtle shadow-lg">
          {label}
        </span>
      )}
    </button>
  )
}
