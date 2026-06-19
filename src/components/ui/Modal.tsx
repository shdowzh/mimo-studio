import type { ReactNode } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  width?: string
}

export default function Modal({ open, onClose, title, children, width = 'max-w-md' }: ModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
      />
      {/* Content */}
      <div className={`relative ${width} w-full mx-4 bg-mc-surface border border-mc-border rounded-xl shadow-2xl animate-modal-in max-h-[85vh] overflow-hidden flex flex-col`}>
        {title && (
          <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-mc-border-subtle">
            <h2 className="text-sm font-semibold text-mc-text tracking-tight">{title}</h2>
            <button
              onClick={onClose}
              className="p-1 text-mc-text-muted hover:text-mc-text hover:bg-mc-hover transition-colors rounded"
              aria-label="关闭"
            >
              <X size={15} strokeWidth={1.5} />
            </button>
          </div>
        )}
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
