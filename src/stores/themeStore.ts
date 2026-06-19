// 三态主题模型：system / light / dark
// system 时跟随 prefers-color-scheme，并随 OS 切换动态更新
// resolvedTheme 是真正写入 <html data-theme> 的值，仅有 light/dark 两种
//
// 视觉上 OpenClaw 风默认浅色，所以 system 在多数桌面环境下会落到 light。

import { create } from 'zustand'
import { isElectron, getAPI } from '@/lib/ipc'

export type ThemeId = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

interface ThemeState {
  theme: ThemeId
  resolvedTheme: ResolvedTheme
  setTheme: (theme: ThemeId) => void
  loadTheme: () => Promise<void>
  /** 内部：监听 prefers-color-scheme，随 OS 变化更新 resolvedTheme */
  _initSystemListener: () => void
}

const VALID_THEMES: ThemeId[] = ['system', 'light', 'dark']

function getSystemPreference(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolve(theme: ThemeId): ResolvedTheme {
  return theme === 'system' ? getSystemPreference() : theme
}

function applyResolved(resolved: ResolvedTheme) {
  document.documentElement.setAttribute('data-theme', resolved)
}

let systemListenerAttached = false

export const useThemeStore = create<ThemeState>()((set, get) => ({
  theme: 'system',
  resolvedTheme: 'light',

  setTheme: (theme: ThemeId) => {
    const resolved = resolve(theme)
    set({ theme, resolvedTheme: resolved })
    applyResolved(resolved)
    if (isElectron()) {
      getAPI().settings.set('theme', theme)
    }
  },

  loadTheme: async () => {
    let theme: ThemeId = 'system'
    if (isElectron()) {
      try {
        const saved = await getAPI().settings.get('theme')
        if (saved && VALID_THEMES.includes(saved as ThemeId)) {
          theme = saved as ThemeId
        }
      } catch {
        // fallthrough
      }
    }
    const resolved = resolve(theme)
    set({ theme, resolvedTheme: resolved })
    applyResolved(resolved)
    get()._initSystemListener()
  },

  _initSystemListener: () => {
    if (systemListenerAttached || typeof window === 'undefined' || !window.matchMedia) return
    systemListenerAttached = true
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      // 仅当当前是 system 模式时才跟随
      if (get().theme === 'system') {
        const next: ResolvedTheme = mql.matches ? 'dark' : 'light'
        set({ resolvedTheme: next })
        applyResolved(next)
      }
    }
    // Safari 旧版用 addListener，新版统一 addEventListener
    if (mql.addEventListener) mql.addEventListener('change', handler)
    else mql.addListener(handler)
  },
}))
