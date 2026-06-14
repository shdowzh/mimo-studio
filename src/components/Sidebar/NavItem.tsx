import type { LucideIcon } from 'lucide-react'

interface NavItemProps {
  icon: LucideIcon
  label: string
  active?: boolean
  onClick: () => void
  badge?: string | number
}

export default function NavItem({ icon: Icon, label, active, onClick, badge }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={`
        group relative flex items-center justify-center w-9 h-9 rounded-lg
        transition-all duration-150
        ${active
          ? 'bg-mc-elevated text-mc-text'
          : 'text-mc-text-muted hover:text-mc-text hover:bg-mc-hover'
        }
      `}
      title={label}
    >
      <Icon size={18} strokeWidth={1.5} />
      {badge !== undefined && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] flex items-center justify-center bg-blue-500 text-white text-[9px] font-medium rounded-full px-0.5">
          {badge}
        </span>
      )}
      {/* Tooltip */}
      <span className="absolute left-full ml-2 px-2 py-1 bg-mc-elevated text-mc-text text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 border border-mc-border">
        {label}
      </span>
      {/* Active indicator */}
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-mc-accent rounded-r" />
      )}
    </button>
  )
}
