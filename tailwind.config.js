/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // OpenClaw 风设计 token — CSS variables 驱动主题
        mc: {
          bg: 'var(--bg-base)',
          surface: 'var(--bg-surface)',
          elevated: 'var(--bg-elevated)',
          hover: 'var(--bg-hover)',
          'bg-active': 'var(--bg-active)',
          border: 'var(--border-default)',
          'border-subtle': 'var(--border-subtle)',
          'border-focus': 'var(--border-focus)',
          text: 'var(--text-primary)',
          'text-secondary': 'var(--text-secondary)',
          'text-muted': 'var(--text-muted)',
          'text-accent': 'var(--text-accent)',
          accent: 'var(--accent)',
          'accent-hover': 'var(--accent-hover)',
          brand: 'var(--brand)',
          'brand-hover': 'var(--brand-hover)',
          'brand-soft': 'var(--brand-soft)',
          'brand-text': 'var(--brand-text)',
          'user-bubble': 'var(--user-bubble)',
          'user-bubble-text': 'var(--user-bubble-text)',
          'assistant-bubble': 'var(--assistant-bubble)',
          success: 'var(--success)',
          error: 'var(--error)',
          warning: 'var(--warning)',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', '"Cascadia Code"', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],    // 11px
        xs: ['0.75rem', { lineHeight: '1rem' }],         // 12px
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],    // 13px
        base: ['0.875rem', { lineHeight: '1.5rem' }],    // 14px
        lg: ['1rem', { lineHeight: '1.5rem' }],          // 16px
      },
      spacing: {
        sidebar: '52px',
        'sidebar-expanded': '220px',
        'conv-list': '220px',
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '12px',
      },
      borderWidth: {
        '1': '1px',
      },
      animation: {
        'fade-in': 'fadeIn 0.15s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        'slide-down-out': 'slideDownOut 0.12s ease-in forwards',
        'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // chip 删除时的出场：与 slideUp 镜像 + 轻微缩放，告诉视觉"它正在离开"
        slideDownOut: {
          '0%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(4px) scale(0.95)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
    },
  },
  plugins: [],
}
