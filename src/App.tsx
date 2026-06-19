import { useEffect, useState, lazy, Suspense } from 'react'
import AppLayout from '@/components/Layout/AppLayout'
import Toast from '@/components/ui/Toast'
import Onboarding from '@/components/Onboarding'
import { useUIStore } from '@/stores/uiStore'
import { useThemeStore } from '@/stores/themeStore'
import { isElectron, getAPI } from '@/lib/ipc'
import { mimoClient } from '@/lib/mimoClient'
import { useChatStore } from '@/stores/chatStore'
import { connectToServer } from '@/lib/api'
import ChatView from '@/views/ChatView'
import type { ViewId } from '@/lib/types'

// 非默认视图懒加载，减少首屏 JS 解析量
const TerminalView = lazy(() => import('@/views/TerminalView'))
const MemoryView = lazy(() => import('@/views/MemoryView'))
const SkillsView = lazy(() => import('@/views/SkillsView'))
const McpView = lazy(() => import('@/views/McpView'))
const SettingsView = lazy(() => import('@/views/SettingsView'))

const viewMap: Record<ViewId, React.ComponentType> = {
  chat: ChatView,
  terminal: TerminalView,
  memory: MemoryView,
  skills: SkillsView,
  mcp: McpView,
  settings: SettingsView,
}

// 全局初始化标记，确保 SSE + 连接只初始化一次
let _appInitialized = false

function App() {
  const { currentView } = useUIStore()
  const { loadTheme } = useThemeStore()
  const CurrentView = viewMap[currentView]
  const [showOnboarding, setShowOnboarding] = useState(false)

  // 注册 mimoClient 连接状态 → zustand store 的同步
  useEffect(() => {
    const unsub = mimoClient.onConnectionChange((connected) => {
      const state = useChatStore.getState()
      if (connected) {
        const prev = state.serverState
        if (prev.status === 'disconnected') {
          useChatStore.getState().setServerState({ status: 'initializing', port: 0, password: '', mode: 'unknown' })
          // 直接开始 checkReady 轮询（不依赖 server.connected SSE 事件）
          const retryInit = useChatStore.getState().retryInit
          retryInit()
        }
      } else {
        useChatStore.getState().setServerState({ status: 'disconnected' })
      }
    })
    return () => { unsub() }
  }, [])

  // 加载保存的主题
  useEffect(() => {
    loadTheme()
  }, [loadTheme])

  // 加载保存的侧边栏锁定状态
  useEffect(() => {
    if (!isElectron()) return
    getAPI().settings.get('sidebar-pinned').then((v) => {
      if (v === 'true') {
        useUIStore.getState().setSidebarPinned(true)
      }
    })
  }, [])

  // 全局初始化：SSE + 连接 mimo serve（只执行一次，切换视图不会重复）
  useEffect(() => {
    if (_appInitialized || !isElectron()) return
    _appInitialized = true

    const initSSE = useChatStore.getState().initSSE
    const loadSessions = useChatStore.getState().loadSessions
    const unsubSSE = initSSE()

    connectToServer().then(connected => {
      if (connected) loadSessions()
    })

    return () => { unsubSSE?.() }
  }, [])

  // 检查是否首次启动
  useEffect(() => {
    if (!isElectron()) return
    const check = async () => {
      try {
        const isFirst = await getAPI().settings.get('first-launch')
        if (isFirst === 'true' || isFirst === null) {
          setShowOnboarding(true)
        }
      } catch {
        // 如果出错，不显示引导
      }
    }
    check()
  }, [])

  return (
    <>
      <AppLayout>
        <Suspense fallback={<div className="flex-1 flex items-center justify-center text-xs text-mc-text-muted">加载中...</div>}>
          <CurrentView />
        </Suspense>
      </AppLayout>
      <Toast />
      {showOnboarding && (
        <Onboarding onComplete={() => setShowOnboarding(false)} />
      )}
    </>
  )
}

export default App
