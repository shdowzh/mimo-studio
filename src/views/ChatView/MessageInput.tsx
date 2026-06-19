// 消息输入框 — Phase 3 T3.6 + 布局增强
// 左侧 + 菜单、聚焦 brand ring、右下角模型 chip、shadow 浮动感

import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'
import { Send, Square, Plus, AtSign, Paperclip, FileCode } from 'lucide-react'

export default function MessageInput() {
  const [text, setText] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

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
    <div className="px-4 pb-5 pt-3">
      <div className="relative bg-mc-surface border border-mc-border rounded-xl shadow-lg shadow-black/10 focus-within:border-mc-brand/60 focus-within:ring-1 focus-within:ring-mc-brand/30 transition-all duration-200">

        {/* 顶部工具行 */}
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-mc-border-subtle/50">
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1 rounded text-mc-text-muted hover:text-mc-text hover:bg-mc-hover transition-colors"
              title="附加 / 引用"
            >
              <Plus size={13} />
            </button>
            {menuOpen && (
              <div className="absolute bottom-full left-0 mb-1 w-48 bg-mc-surface border border-mc-border rounded-md shadow-xl z-10 py-1 animate-fade-in">
                <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-mc-text-muted cursor-not-allowed" disabled>
                  <Paperclip size={11} /> 附加文件 <span className="ml-auto text-2xs opacity-60">即将支持</span>
                </button>
                <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-mc-text-muted cursor-not-allowed" disabled>
                  <FileCode size={11} /> 引用代码片段 <span className="ml-auto text-2xs opacity-60">即将支持</span>
                </button>
                <button className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-mc-hover transition-colors text-mc-text-secondary hover:text-mc-text">
                  <AtSign size={11} /> 选择技能 <span className="ml-auto text-2xs text-mc-text-muted">@</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 文本框 */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息... (Enter 发送 · Shift+Enter 换行)"
          disabled={isBusy}
          className="w-full bg-transparent px-3 py-2 text-sm text-mc-text placeholder:text-mc-text-muted resize-none focus:outline-none min-h-[24px] max-h-[160px] leading-relaxed"
          rows={1}
        />

        {/* 底部工具行 */}
        <div className="flex items-center justify-between px-2 py-1.5 border-t border-mc-border-subtle/50">
          <button
            onClick={() => {
              useUIStore.getState().setCurrentView('settings')
              useUIStore.getState().setSettingsTab('providers')
            }}
            className="flex items-center gap-1.5 px-2 py-0.5 text-2xs text-mc-text-muted hover:text-mc-text hover:bg-mc-hover rounded transition-colors"
            title="管理 Provider 配置"
          >
            <AtSign size={10} />
            <span className="truncate max-w-[120px]">{currentProvider}/{currentModel || 'auto'}</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-2xs text-mc-text-muted">Enter 发送</span>
            {isBusy ? (
              <button
                onClick={abortSession}
                className="p-1.5 text-mc-text-secondary hover:text-mc-error hover:bg-mc-hover rounded-lg transition-colors"
                title="停止生成"
              >
                <Square size={14} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!text.trim()}
                className="p-1.5 text-mc-text-muted hover:text-mc-brand hover:bg-mc-hover disabled:opacity-30 disabled:hover:text-mc-text-muted disabled:hover:bg-transparent rounded-lg transition-colors"
                title="发送"
              >
                <Send size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
