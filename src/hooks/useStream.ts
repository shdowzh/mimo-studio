// 流式聊天 Hook — 精简版
// SSE 事件由 chatStore.initSSE() 处理，不再需要复杂的事件监听
// 此 hook 仅提供 send/abort 便捷方法

import { useCallback } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { mimoClient } from '@/lib/mimoClient'

export function useStream() {
  const sendMessage = useChatStore((s) => s.sendMessage)
  const abortSession = useChatStore((s) => s.abortSession)
  const currentSessionID = useChatStore((s) => s.currentSessionID)
  const sessionStatus = useChatStore((s) => currentSessionID ? s.sessionStatus[currentSessionID] : undefined)

  const isBusy = sessionStatus?.type === 'busy'

  const send = useCallback(async (content: string) => {
    await sendMessage(content)
  }, [sendMessage])

  const abort = useCallback(async () => {
    await abortSession()
  }, [abortSession])

  return { send, abort, isStreaming: isBusy, streamingContent: '' }
}
