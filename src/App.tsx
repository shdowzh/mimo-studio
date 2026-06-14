import { useEffect, useState } from 'react'
import AppLayout from '@/components/Layout/AppLayout'
import Toast from '@/components/ui/Toast'
import Onboarding from '@/components/Onboarding'
import { useUIStore } from '@/stores/uiStore'
import { useThemeStore } from '@/stores/themeStore'
import { isElectron, getAPI } from '@/lib/ipc'
import { registerChatStoreSetter } from '@/lib/api'
import { useChatStore } from '@/stores/chatStore'
import ChatView from '@/views/ChatView'
import TerminalView from '@/views/TerminalView'
import MemoryView from '@/views/MemoryView'
import SkillsView from '@/views/SkillsView'
import McpView from '@/views/McpView'
import SettingsView from '@/views/SettingsView'
import type { ViewId } from '@/lib/mimoTypes'

const viewMap: Record<ViewId, React.ComponentType> = {
  chat: ChatView,
  terminal: TerminalView,
  memory: MemoryView,
  skills: SkillsView,
  mcp: McpView,
  settings: SettingsView,
}

function App() {
  const { currentView } = useUIStore()
  const { loadTheme } = useThemeStore()
  const CurrentView = viewMap[currentView]
  const [showOnboarding, setShowOnboarding] = useState(false)

  // 注册 chatStore 的 serverConnected setter
  useEffect(() => {
    registerChatStoreSetter((connected: boolean) => {
      useChatStore.setState({ serverConnected: connected })
    })
  }, [])

  // 加载保存的主题
  useEffect(() => {
    loadTheme()
  }, [loadTheme])

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
        <CurrentView />
      </AppLayout>
      <Toast />
      {showOnboarding && (
        <Onboarding onComplete={() => setShowOnboarding(false)} />
      )}
    </>
  )
}

export default App
