// 消息输入框 — OpenClaw 风大卡片
// 顶部 context usage 条 + 中间 textarea + 附件 chip 行 + 底部工具栏（附件/mention/设置 + 模型选择器 + 发送）
//
// 三条加附件路径，统一走 buildAttachmentsBatch → addAttachments：
//   1. 点 paperclip — 走系统文件选择器（单文件）
//   2. 拖入卡片  — DataTransfer.files：本地文件取 webUtils.getPathForFile 走 path 分支；
//                                      无路径源（网页图片）走 File 分支（dataUrl 内联）
//   3. Ctrl+V    — ClipboardEvent.items 里 kind === 'file' 的部分走 File 分支（截图直走）
//
// 拖放视觉：用 dragDepth 计数器（boolean 在子元素冒泡时会闪烁），> 0 才显示 overlay。
//          外层 border 预留 border-2，避免 hover 切 border-2 时撑大尺寸。

import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'
import { isElectron, getAPI } from '@/lib/ipc'
import {
  attachmentFromPath,
  buildAttachmentsBatch,
  FILE_PICKER_FILTERS,
  type AttachmentSource,
} from '@/lib/attachments'
import { Send, Square, Paperclip, AtSign, Settings } from 'lucide-react'
import ContextUsageBar from './ContextUsageBar'
import ModelPicker from './ModelPicker'
import AttachmentChip from './AttachmentChip'

// 空数组常量：zustand selector 返回值需保持引用稳定，否则每次渲染返回新 [] 触发无限重渲染
const EMPTY_ATTACHMENTS: readonly never[] = []
// 无 session 时的草稿键：允许首次进聊天框（尚未发消息、无 currentSessionID）就添加附件，
// 发送时 sendViaAgent 会自动创建 session。避免"必须先新开对话才能加附件"的限制。
const DRAFT_KEY = '__draft__'

// 把 DataTransfer / Clipboard 的 FileList 拆成"有路径走 path 分支 / 无路径走 file 分支"
// Electron 32+ webUtils.getPathForFile：本地文件返回绝对路径；剪贴板截图、网页拖出图片返回 ''
function classifyFiles(files: FileList | File[]): AttachmentSource[] {
  const api = isElectron() ? getAPI() : null
  const arr: AttachmentSource[] = []
  for (const file of Array.from(files)) {
    const path = api ? api.native.getPathForFile(file) : ''
    if (path) {
      arr.push({ kind: 'path', path })
    } else {
      arr.push({ kind: 'file', file })
    }
  }
  return arr
}

export default function MessageInput() {
  const [text, setText] = useState('')
  const [attaching, setAttaching] = useState(false)
  const [dragDepth, setDragDepth] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const abortSession = useChatStore((s) => s.abortSession)
  const currentSessionID = useChatStore((s) => s.currentSessionID)
  // 草稿键：有 session 用 sessionID，无 session 用 DRAFT_KEY（附件存取都走这个键）
  const draftKey = currentSessionID ?? DRAFT_KEY
  const attachments = useChatStore((s) => s.draftAttachments[draftKey] ?? EMPTY_ATTACHMENTS)
  const addAttachment = useChatStore((s) => s.addAttachment)
  const addAttachments = useChatStore((s) => s.addAttachments)
  const removeAttachment = useChatStore((s) => s.removeAttachment)
  const clearAttachments = useChatStore((s) => s.clearAttachments)
  const addToast = useUIStore((s) => s.addToast)
  const sessionStatus = useChatStore((s) => (currentSessionID ? s.sessionStatus[currentSessionID] : undefined))
  const isBusy = sessionStatus?.type === 'busy'
  const isDragOver = dragDepth > 0

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`
    }
  }, [text])

  // 共用：把分类后的 sources 批量构造附件 → 部分成功语义
  const ingestSources = async (sources: AttachmentSource[]) => {
    if (sources.length === 0) return
    const { ok, errors } = await buildAttachmentsBatch(sources)
    if (ok.length > 0) addAttachments(draftKey, ok)
    for (const msg of errors) addToast(msg, 'error')
  }

  // 点附件按钮：走系统对话框（单文件）
  // Windows 上 main.cjs 会忽略 filters（extensions:['*'] 不会成为默认选中项），
  // macOS / Linux 上 filters 正常生效，用户可切换"所有文件/文本/图片"
  const handleAttach = async () => {
    if (!isElectron() || isBusy || attaching) return
    setAttaching(true)
    try {
      const filePath = await getAPI().native.openFile(FILE_PICKER_FILTERS)
      if (!filePath) return // 用户取消
      const att = await attachmentFromPath(filePath)
      addAttachment(draftKey, att)
    } catch (err) {
      addToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      setAttaching(false)
    }
  }

  const handleSubmit = () => {
    const hasText = text.trim().length > 0
    const hasAtt = attachments.length > 0
    if ((!hasText && !hasAtt) || isBusy) return
    sendMessage(text, attachments)
    setText('')
    clearAttachments(draftKey)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  // === 拖放 ===
  // dragenter / dragleave 在子元素间冒泡会反复触发，所以用 depth 计数器而非 boolean
  const handleDragEnter = (e: React.DragEvent) => {
    if (isBusy) return
    // 必须有 Files 类型才显示 overlay，避免选中文本拖拽误触
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    setDragDepth((d) => d + 1)
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (isBusy) return
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    setDragDepth((d) => Math.max(0, d - 1))
  }

  const handleDrop = (e: React.DragEvent) => {
    if (isBusy) return
    e.preventDefault()
    setDragDepth(0)
    const files = e.dataTransfer.files
    if (!files || files.length === 0) return
    ingestSources(classifyFiles(files))
  }

  // === 粘贴 ===
  // ClipboardEvent.clipboardData.items: kind === 'file' 的条目走附件分支；
  // 必须在至少一个文件被识别时 preventDefault —— 否则浏览器会把文件名作为字符串塞进 textarea
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (isBusy) return
    const items = e.clipboardData?.items
    if (!items) return
    const files: File[] = []
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const f = item.getAsFile()
        if (f) files.push(f)
      }
    }
    if (files.length === 0) return // 纯文本粘贴：交给 textarea 默认行为
    e.preventDefault()
    ingestSources(classifyFiles(files))
  }

  return (
    <div className="px-4 pb-4 pt-2">
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative bg-mc-surface border-2 rounded-2xl shadow-sm transition-all ${
          isDragOver
            ? 'border-mc-brand border-dashed bg-mc-brand-soft/10'
            : 'border-mc-border focus-within:border-mc-brand/60 focus-within:ring-1 focus-within:ring-mc-brand/20'
        }`}
      >
        <ContextUsageBar />

        <div className="px-4">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={`发消息（Enter 发送 · Shift+Enter 换行 · 可拖入 / 粘贴文件、截图）`}
            disabled={isBusy}
            className="w-full bg-transparent text-sm text-mc-text placeholder:text-mc-text-muted resize-none outline-none min-h-[24px] max-h-[160px] leading-relaxed py-1"
            rows={1}
          />
        </div>

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-4 py-2 border-t border-mc-border-subtle/50">
            {attachments.map((a) => (
              <AttachmentChip key={a.id} att={a} onRemove={() => removeAttachment(draftKey, a.id)} />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between px-3 py-2 border-t border-mc-border-subtle/50">
          <div className="flex items-center gap-1">
            <button
              onClick={handleAttach}
              className="p-2 text-mc-text-muted hover:text-mc-text hover:bg-mc-hover rounded-lg transition-colors disabled:opacity-40"
              disabled={isBusy || attaching}
              title="附加文件"
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
                disabled={!text.trim() && attachments.length === 0}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-mc-brand text-white hover:bg-mc-brand-hover disabled:opacity-30 disabled:hover:bg-mc-brand transition-colors"
                title="发送"
              >
                <Send size={16} />
              </button>
            )}
          </div>
        </div>

        {/* 拖放 overlay：覆盖整张卡片，提示当前接收区。pointer-events-none 让事件继续冒泡到外层卡片的 onDrop */}
        {isDragOver && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none rounded-2xl bg-mc-bg/80 backdrop-blur-sm animate-fade-in">
            <span className="text-sm text-mc-brand font-medium">松开以添加为附件</span>
          </div>
        )}
      </div>
    </div>
  )
}
