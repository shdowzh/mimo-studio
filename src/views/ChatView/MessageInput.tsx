// 消息输入框 — OpenClaw 风大卡片
// 顶部 context usage 条 + 中间 textarea + 底部工具栏（附件/mention/设置 + 模型选择器 + 发送）

import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'
import { Send, Square, Paperclip, AtSign, Settings } from 'lucide-react'
import ContextUsageBar from './ContextUsageBar'
import ModelPicker from './ModelPicker'

export default function MessageInput() {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const abortSession = useChatStore((s) => s.abortSession)
  const currentSessionID = useChatStore((s) => s.currentSessionID)
  const currentModel = useChatStore((s) => s.currentModel)
  const currentProvider = useChatStore((s) => s.currentProvider)
  const sessionStatus = useChatStore((s) => currentSessionID ? s.sessionStatus[currentSessionID] : undefined)
  const isBusy = sessionStatus?.type === 'busy'

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

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="bg-mc-surface border border-mc-border rounded-2xl shadow-sm transition-all focus-within:border-mc-brand/60 focus-within:ring-1 focus-within:ring-mc-brand/20">
        <ContextUsageBar />

        <div className="px-4">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`发消息（Enter 发送 · Shift+Enter 换行）`}
            disabled={isBusy}
            className="w-full bg-transparent text-sm text-mc-text placeholder:text-mc-text-muted resize-none outline-none min-h-[24px] max-h-[160px] leading-relaxed py-1"
            rows={1}
          />
        </div>

        <div className="flex items-center justify-between px-3 py-2 border-t border-mc-border-subtle/50">
          <div className="flex items-center gap-1">
            <button
              className="p-2 text-mc-text-muted hover:text-mc-text hover:bg-mc-hover rounded-lg transition-colors disabled:opacity-40"
              disabled
              title="附加文件（即将支持）"
            >
              <Paperclip size={16} strokeWidth={1.5} />
            </button>
            <button
              className="p-2 text-mc-text-muted hover:text-mc-text hover:bg-mc-hover rounded-lg transition-colors"
              title="@ 选择技能"
            >
              <AtSign size={16} strokeWidth={1.5} />
            </button>
            <button
              onClick={() => {
                useUIStore.getState().setCurrentView('settings')
                useUIStore.getState().setSettingsTab('providers')
              }}
              className="p-2 text-mc-text-muted hover:text-mc-text hover:bg-mc-hover rounded-lg transition-colors"
              title="聊天设置"
            >
              <Settings size={16} strokeWidth={1.5} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <ModelPicker variant="compact" />
            {isBusy ? (
              <button
                onClick={abortSession}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-mc-error/10 text-mc-error hover:bg-mc-error/20 transition-colors"
                title="停止生成"
              >
                <Square size={14} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!text.trim()}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-mc-brand text-white hover:bg-mc-brand-hover disabled:opacity-30 disabled:hover:bg-mc-brand transition-colors"
                title="发送"
              >
                <Send size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
