import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export default function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-xs font-medium text-mc-text-secondary">{label}</label>
      )}
      <input
        className={`
          w-full bg-transparent border-0 border-b
          px-0 py-2 text-sm placeholder:text-mc-text-muted
          focus:outline-none focus:ring-0
          transition-colors duration-150
          ${error
            ? 'border-mc-error/50 focus:border-mc-error text-mc-error'
            : 'border-mc-border focus:border-mc-border-focus text-mc-text'
          }
          ${className}
        `}
        {...props}
      />
      {error && <p className="text-xs text-mc-error">{error}</p>}
    </div>
  )
}
