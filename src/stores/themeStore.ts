import { create } from 'zustand'
import { isElectron, getAPI } from '@/lib/ipc'

export type ThemeId = 'dark' | 'light' | 'nord' | 'catppuccin' | 'one-dark'

export const THEMES: { id: ThemeId; name: string; preview: { bg: string; surface: string; elevated: string; accent: string } }[] = [
  {
    id: 'dark',
    name: '深色',
    preview: { bg: '#09090b', surface: '#18181b', elevated: '#27272a', accent: '#94a3b8' },
  },
  {
    id: 'light',
    name: '浅色',
    preview: { bg: '#fafafa', surface: '#f4f4f5', elevated: '#e4e4e7', accent: '#64748b' },
  },
  {
    id: 'nord',
    name: 'Nord',
    preview: { bg: '#2e3440', surface: '#3b4252', elevated: '#434c5e', accent: '#88c0d0' },
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin',
    preview: { bg: '#1e1e2e', surface: '#181825', elevated: '#313244', accent: '#cba6f7' },
  },
  {
    id: 'one-dark',
    name: 'One Dark',
    preview: { bg: '#282c34', surface: '#21252b', elevated: '#2c313c', accent: '#61afef' },
  },
]

interface ThemeState {
  theme: ThemeId
  setTheme: (theme: ThemeId) => void
  loadTheme: () => Promise<void>
}

export const useThemeStore = create<ThemeState>()((set) => ({
  theme: 'dark',

  setTheme: (theme: ThemeId) => {
    set({ theme })
    document.documentElement.setAttribute('data-theme', theme)
    if (isElectron()) {
      getAPI().settings.set('theme', theme)
    }
  },

  loadTheme: async () => {
    if (!isElectron()) return
    try {
      const saved = await getAPI().settings.get('theme')
      const theme = (saved as ThemeId) || 'dark'
      // 只接受有效主题
      const validThemes: ThemeId[] = ['dark', 'light', 'nord', 'catppuccin', 'one-dark']
      const finalTheme = validThemes.includes(theme) ? theme : 'dark'
      set({ theme: finalTheme })
      document.documentElement.setAttribute('data-theme', finalTheme)
    } catch {
      // 默认 dark
      document.documentElement.setAttribute('data-theme', 'dark')
    }
  },
}))
