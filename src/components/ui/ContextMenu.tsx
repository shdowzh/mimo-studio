import { useEffect, useRef } from 'react'

export interface ContextMenuItem {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  danger?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handlePointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('contextmenu', handlePointer)
    window.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('contextmenu', handlePointer)
      window.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[160px] py-1 bg-mc-surface border border-mc-border rounded-lg shadow-xl animate-fade-in"
      style={{ left: x, top: y }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => { item.onClick(); onClose() }}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded-md transition-colors ${
            item.danger
              ? 'text-mc-error hover:bg-mc-error/10 hover:text-mc-error'
              : 'text-mc-text-secondary hover:text-mc-text hover:bg-mc-hover'
          }`}
        >
          {item.icon && <span className="shrink-0">{item.icon}</span>}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  )
}
