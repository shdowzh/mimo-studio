import type { LucideIcon } from 'lucide-react'

interface NavItemProps {
  icon: LucideIcon
  label: string
  active?: boolean
  expanded?: boolean
  onClick: () => void
  badge?: string | number
}

export default function NavItem({ icon: Icon, label, active, expanded, onClick, badge }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={`
        group relative flex items-center h-9 rounded-lg
        transition-all duration-150
        ${expanded ? 'w-full justify-start gap-2.5 px-3' : 'w-9 justify-center'}
        ${active
          ? 'bg-mc-brand-soft text-mc-brand'
          : 'text-mc-text-muted hover:text-mc-text hover:bg-mc-hover'
        }
      `}
      title={label}
    >
      <Icon size={17} strokeWidth={active ? 1.75 : 1.5} className="shrink-0" />
      {expanded && <span className="text-xs flex-1 text-left truncate">{label}</span>}
      {badge !== undefined && (
        <span className={`${expanded ? 'static' : 'absolute -top-0.5 -right-0.5'} min-w-[14px] h-[14px] flex items-center justify-center bg-mc-brand text-white text-2xs font-medium rounded-full px-0.5`}>
          {badge}
        </span>
      )}
      {/* Tooltip — 收起模式才显示 */}
      {!expanded && (
        <span className="absolute left-full ml-2 px-2 py-1 bg-mc-elevated text-mc-text text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 border border-mc-border-subtle shadow-lg">
          {label}
        </span>
      )}
      {/* Active indicator — brand-colored stripe on the left */}
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-mc-brand rounded-r" />
      )}
    </button>
  )
}
