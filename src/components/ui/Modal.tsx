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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Content */}
      <div className={`relative ${width} w-full mx-4 bg-mc-surface border border-mc-border rounded-xl shadow-2xl animate-fade-in`}>
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-mc-border">
            <h2 className="text-sm font-semibold text-mc-text">{title}</h2>
            <button
              onClick={onClose}
              className="p-1 text-mc-text-muted hover:text-mc-text transition-colors rounded"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
