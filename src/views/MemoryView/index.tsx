// 记忆视图 — Phase 4 T4.3
// 左侧大纲 + 右侧编辑器 + 底部状态栏 + Cmd+S 保存

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { isElectron, getAPI } from '@/lib/ipc'
import { Brain, User, FileText, Save } from 'lucide-react'
import Button from '@/components/ui/Button'
import TitleBar from '@/components/ui/TitleBar'

type MemoryType = 'user' | 'memory'

interface OutlineItem {
  level: number
  text: string
  lineNo: number
}

export default function MemoryView() {
  const [activeType, setActiveType] = useState<MemoryType>('user')
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!isElectron()) { setLoading(false); return }
    getAPI().files.readMemory(activeType).then((data) => {
      setContent(data || getDefaultContent(activeType))
      setLoading(false)
      setSaved(false)
      setLastSavedAt(null)
    })
  }, [activeType])

  // Cmd+S / Ctrl+S 保存
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  const handleSave = useCallback(async () => {
    if (!isElectron()) return
    await getAPI().files.writeMemory(activeType, content)
    setSaved(true)
    setLastSavedAt(Date.now())
    setTimeout(() => setSaved(false), 2000)
  }, [activeType, content])

  // 解析 markdown 大纲
  const outline = useMemo(() => parseOutline(content), [content])

  // 跳转到指定行
  const jumpTo = useCallback((lineNo: number) => {
    const ta = textareaRef.current
    if (!ta) return
    const lines = ta.value.split('\n')
    const charPos = lines.slice(0, lineNo).join('\n').length
    ta.focus()
    ta.setSelectionRange(charPos, charPos)
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 20
    ta.scrollTop = lineNo * lineHeight - 100
  }, [])

  const tabs: { type: MemoryType; icon: typeof User; label: string }[] = [
    { type: 'user', icon: User, label: 'USER.md' },
    { type: 'memory', icon: FileText, label: 'MEMORY.md' },
  ]

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0

  return (
    <div className="flex flex-col h-full">
      <TitleBar
        icon={Brain}
        title="记忆"
        actions={
          <div className="flex items-center gap-1">
            {tabs.map(({ type, icon: Icon, label }) => (
              <button
                key={type}
                onClick={() => { setActiveType(type); setLoading(true) }}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-colors ${
                  activeType === type
                    ? 'bg-mc-elevated text-mc-text'
                    : 'text-mc-text-muted hover:text-mc-text hover:bg-mc-hover'
                }`}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>
        }
      />

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-mc-text-muted">加载中...</p>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0">
          {/* 左侧大纲 */}
          {outline.length > 0 && (
            <aside className="w-48 shrink-0 border-r border-mc-border-subtle overflow-y-auto p-2 space-y-0.5">
              <div className="px-2 py-1 text-2xs text-mc-text-muted uppercase tracking-wider">大纲</div>
              {outline.map((item, i) => (
                <button
                  key={i}
                  onClick={() => jumpTo(item.lineNo)}
                  className={`w-full text-left px-2 py-1 text-2xs text-mc-text-secondary hover:text-mc-text hover:bg-mc-hover rounded transition-colors truncate ${
                    item.level === 1 ? 'font-medium text-mc-text' : ''
                  }`}
                  style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
                >
                  {item.text}
                </button>
              ))}
            </aside>
          )}

          {/* 右侧编辑器 */}
          <div className="flex-1 flex flex-col min-w-0">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => { setContent(e.target.value); setSaved(false) }}
              className="flex-1 w-full bg-transparent p-4 text-sm text-mc-text font-mono leading-relaxed resize-none focus:outline-none"
              placeholder="输入内容..."
              spellCheck={false}
            />
            {/* 底部状态栏 */}
            <div className="flex items-center justify-between px-4 py-1.5 border-t border-mc-border-subtle text-2xs text-mc-text-muted shrink-0">
              <span>{content.length} 字符 · {wordCount} 词</span>
              <span>{lastSavedAt ? `已保存 ${formatTime(lastSavedAt)}` : saved ? '已保存' : '未保存'}</span>
              <span>Ctrl+S 保存</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function parseOutline(md: string): OutlineItem[] {
  const lines = md.split('\n')
  return lines
    .map((line, i) => {
      const m = line.match(/^(#{1,3})\s+(.+)$/)
      if (!m) return null
      return { level: m[1].length, text: m[2], lineNo: i }
    })
    .filter(Boolean) as OutlineItem[]
}

function getDefaultContent(type: MemoryType): string {
  if (type === 'user') {
    return `# 用户画像\n\n用户使用中文交流。时区：CST / UTC+8。\n工具偏好：本地免费工具优先。\n工作风格：不确定时先查证不瞎猜。\n`
  }
  return `# 项目记忆\n\n## 环境\n- OS: \n- Node: \n\n## 关键事实\n- \n\n## 约束\n- \n`
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
