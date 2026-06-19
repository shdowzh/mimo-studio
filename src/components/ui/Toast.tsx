import { useUIStore } from '@/stores/uiStore'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
}

const colors = {
  success: 'bg-mc-success',
  error: 'bg-mc-error',
  info: 'bg-mc-text-accent',
}

export default function Toast() {
  const { toasts, removeToast } = useUIStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((toast) => {
        const Icon = icons[toast.type]
        return (
          <div
            key={toast.id}
            className={`
              flex items-center gap-2.5 px-3 py-2.5
              bg-mc-surface border border-mc-border rounded-xl shadow-lg
              animate-slide-up min-w-[240px] max-w-[360px]
            `}
          >
            <span className={`w-1 h-1 rounded-full ${colors[toast.type]}`} />
            <Icon size={14} className="flex-shrink-0 text-mc-text-secondary" />
            <span className="text-xs text-mc-text flex-1">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="flex-shrink-0 text-mc-text-muted hover:text-mc-text transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
