import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  /** 表单密度：'underline' = 行内下划线 (旧默认)，'box' = 圆角盒装 (用在卡片内) */
  variant?: 'underline' | 'box'
}

export default function Input({ label, error, className = '', variant = 'underline', ...props }: InputProps) {
  const baseUnderline = 'w-full bg-transparent border-0 border-b px-0 py-2 text-sm placeholder:text-mc-text-muted focus:outline-none focus:ring-0 transition-colors duration-150'
  const baseBox = 'w-full bg-mc-bg border rounded-md px-3 py-1.5 text-xs text-mc-text placeholder:text-mc-text-muted focus:outline-none transition-colors duration-150'

  const errorState = error
    ? variant === 'underline'
      ? 'border-mc-error/50 focus:border-mc-error text-mc-error'
      : 'border-mc-error/50 focus:border-mc-error text-mc-error'
    : variant === 'underline'
      ? 'border-mc-border focus:border-mc-brand text-mc-text'
      : 'border-mc-border focus:border-mc-brand text-mc-text'

  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-xs font-medium text-mc-text-secondary">{label}</label>
      )}
      <input
        className={`${variant === 'underline' ? baseUnderline : baseBox} ${errorState} ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-mc-error">{error}</p>}
    </div>
  )
}
