// 自绘窗口控件 — frame:false 模式下的最小/最大/关闭按钮
// macOS 保留系统交通灯，不自绘
// Win/Linux: 右上角方形三按钮（— ▢ ×，46×36px）

import { useEffect, useState } from 'react'
import { Minus, Square, Copy, X } from 'lucide-react'
import { isElectron, getAPI } from '@/lib/ipc'

export default function WindowControls({ side: _side }: { side?: 'left' | 'right' }) {
  // 平台在挂载时就已知，用 lazy initializer 避免 effect 内 setState
  const [platform] = useState<NodeJS.Platform | null>(() =>
    isElectron() ? getAPI().platform : null,
  )
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    if (!isElectron()) return
    const api = getAPI()
    api.window.isMaximized().then(setIsMaximized)
    const off = api.window.onMaximizeChange(setIsMaximized)
    return off
  }, [])

  if (!isElectron() || !platform) return null

  // macOS 保留系统交通灯，不自绘按钮
  if (platform === 'darwin') return null
  return <WinControls isMaximized={isMaximized} />
}

// === Win/Linux 方形三按钮 ===
function WinControls({ isMaximized }: { isMaximized: boolean }) {
  const api = getAPI()
  return (
    <div className="no-drag flex items-center select-none">
      <button
        onClick={() => api.window.minimize()}
        className="w-[46px] h-[36px] flex items-center justify-center text-mc-text-secondary hover:bg-mc-hover transition-colors"
        aria-label="最小化"
      >
        <Minus size={14} strokeWidth={1.5} />
      </button>
      <button
        onClick={() => api.window.maximize()}
        className="w-[46px] h-[36px] flex items-center justify-center text-mc-text-secondary hover:bg-mc-hover transition-colors"
        aria-label={isMaximized ? '还原' : '最大化'}
      >
        {isMaximized
          ? <Copy size={12} strokeWidth={1.5} className="-scale-x-100" />
          : <Square size={12} strokeWidth={1.5} />}
      </button>
      <button
        onClick={() => api.window.close()}
        className="w-[46px] h-[36px] flex items-center justify-center text-mc-text-secondary hover:bg-mc-error hover:text-white transition-colors"
        aria-label="关闭"
      >
        <X size={14} strokeWidth={1.5} />
      </button>
    </div>
  )
}
