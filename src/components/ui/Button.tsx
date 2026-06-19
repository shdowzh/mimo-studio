import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'brand'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  children?: ReactNode
}

const variantClasses: Record<Variant, string> = {
  // brand: 主色行动按钮（CTA / 表单提交）
  brand: 'bg-mc-brand text-white hover:bg-mc-brand-hover shadow-sm shadow-mc-brand/20',
  // primary: 文本反白（次于 brand 的"重要"按钮）
  primary: 'bg-mc-text text-mc-bg hover:opacity-90',
  // secondary: 卡面之上的常规按钮
  secondary: 'bg-mc-elevated text-mc-text-secondary hover:bg-mc-hover hover:text-mc-text border border-mc-border-subtle',
  // ghost: 工具条/图标按钮
  ghost: 'bg-transparent text-mc-text-muted hover:text-mc-text hover:bg-mc-hover',
  // danger: 删除/危险操作
  danger: 'bg-mc-error/10 text-mc-error hover:bg-mc-error/20',
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-8 px-3 text-sm gap-1.5',
  lg: 'h-9 px-4 text-sm gap-2',
}

export default function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center rounded-md font-medium
        transition-all duration-150 cursor-pointer select-none
        disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none
        focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-mc-brand/60 focus-visible:ring-offset-0
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
      disabled={disabled}
      {...props}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </button>
  )
}
