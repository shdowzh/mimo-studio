// 全局 AppHeader — OpenClaw 风（轻量版）
// 只保留：中央全局搜索（⌘K） + 右侧主题切换 + Win/Linux 自绘窗口控件
// macOS 左侧留空给系统交通灯，避免与 Sidebar 顶部 Logo 错位
// 面包屑下移到各 view 内部工具栏

import { Monitor, Sun, Moon } from 'lucide-react'
import { useThemeStore, type ThemeId } from '@/stores/themeStore'
import WindowControls from '@/components/ui/WindowControls'
import GlobalSearch from './GlobalSearch'
import { isElectron } from '@/lib/ipc'

const IS_MAC = isElectron() && window.electronAPI?.platform === 'darwin'

export default function AppHeader() {
  const { theme, setTheme } = useThemeStore()

  return (
    <header
      className={`relative shrink-0 h-[44px] drag flex items-center justify-between border-b border-mc-border-subtle bg-mc-bg/80 backdrop-blur-sm z-40 ${
        IS_MAC ? 'pl-[64px]' : 'pl-3'
      } pr-0`}
    >
      <div className="flex items-center min-w-0">
        {/* mac 左侧不放内容；Win/Linux 左侧可预留给后续全局菜单入口 */}
      </div>

      {/* 中央：全局搜索 —— 绝对居中，不受左右两侧宽度不对称影响（Win/Linux 有自绘窗口按钮，mac 没有）
          容器保持可拖动，只让搜索框本身 no-drag */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[480px] px-6 flex justify-center pointer-events-none">
        <div className="no-drag w-full flex justify-center pointer-events-auto">
          <GlobalSearch />
        </div>
      </div>

      {/* 右：主题切换 + 窗口控件 */}
      <div className="no-drag flex items-center h-full">
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-mc-elevated/50 border border-mc-border-subtle mr-2">
          {(['system', 'light', 'dark'] as ThemeId[]).map((id) => {
            const Icon = { system: Monitor, light: Sun, dark: Moon }[id]
            return (
              <button
                key={id}
                onClick={() => setTheme(id)}
                className={`p-1 rounded-md transition-colors ${
                  theme === id
                    ? 'bg-mc-surface text-mc-brand-text shadow-sm'
                    : 'text-mc-text-muted hover:text-mc-text'
                }`}
                title={id === 'system' ? '跟随系统' : id === 'light' ? '浅色' : '深色'}
              >
                <Icon size={13} strokeWidth={1.5} />
              </button>
            )
          })}
        </div>

        <WindowControls />
      </div>
    </header>
  )
}
