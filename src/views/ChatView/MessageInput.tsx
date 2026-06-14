// 消息输入框 — 直接调用 chatStore.sendMessage

import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { Send, Square } from 'lucide-react'

export default function MessageInput() {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const abortSession = useChatStore((s) => s.abortSession)
  const currentSessionID = useChatStore((s) => s.currentSessionID)
  const sessionStatus = useChatStore((s) => currentSessionID ? s.sessionStatus[currentSessionID] : undefined)

  const isBusy = sessionStatus?.type === 'busy'

  // 自动调整高度
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`
    }
  }, [text])

  const handleSubmit = () => {
    if (!text.trim() || isBusy) return
    sendMessage(text)
    setText('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleAbort = () => {
    abortSession()
  }

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="relative flex items-end gap-2 bg-mc-surface/50 border border-mc-border-subtle rounded-xl px-3 py-2 focus-within:border-mc-border transition-colors">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="发送消息给 MiMo Agent..."
          disabled={isBusy}
          className="flex-1 bg-transparent text-sm text-mc-text placeholder:text-mc-text-muted resize-none focus:outline-none min-h-[24px] max-h-[160px] leading-relaxed"
          rows={1}
        />

        {isBusy ? (
          <button
            onClick={handleAbort}
            className="flex-shrink-0 p-1.5 text-mc-text-secondary hover:text-mc-error hover:bg-mc-hover rounded-lg transition-colors"
            title="停止生成"
          >
            <Square size={14} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!text.trim()}
            className="flex-shrink-0 p-1.5 text-mc-text-muted hover:text-mc-text hover:bg-mc-hover disabled:opacity-30 disabled:hover:text-mc-text-muted disabled:hover:bg-transparent rounded-lg transition-colors"
            title="发送"
          >
            <Send size={14} />
          </button>
        )}
      </div>

      {/* 底部提示 */}
      <div className="flex items-center justify-between mt-1.5 px-1">
        <span className="text-[10px] text-mc-text-muted">
          Shift + Enter 换行 · Agent 自动执行任务
        </span>
        <span className="text-[10px] text-mc-text-muted">
          MiMo Studio
        </span>
      </div>
    </div>
  )
}
