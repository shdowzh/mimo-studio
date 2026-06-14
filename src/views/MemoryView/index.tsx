import { useState, useEffect } from 'react'
import { isElectron, getAPI } from '@/lib/ipc'
import { Brain, User, FileText, Save } from 'lucide-react'
import Button from '@/components/ui/Button'

type MemoryType = 'user' | 'memory'

export default function MemoryView() {
  const [activeType, setActiveType] = useState<MemoryType>('user')
  const [content, setContent] = useState('')
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isElectron()) { setLoading(false); return }
    getAPI().files.readMemory(activeType).then((data) => {
      setContent(data || getDefaultContent(activeType))
      setLoading(false)
      setSaved(false)
    })
  }, [activeType])

  const handleSave = async () => {
    if (!isElectron()) return
    await getAPI().files.writeMemory(activeType, content)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const tabs: { type: MemoryType; icon: typeof User; label: string }[] = [
    { type: 'user', icon: User, label: 'USER.md' },
    { type: 'memory', icon: FileText, label: 'MEMORY.md' },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between h-10 px-4 border-b border-mc-border-subtle">
        <div className="flex items-center gap-2">
          <Brain size={14} strokeWidth={1.5} className="text-mc-text-muted" />
          <span className="text-xs font-medium text-mc-text-secondary">记忆</span>
        </div>
        <div className="flex items-center gap-2">
          {tabs.map(({ type, icon: Icon, label }) => (
            <button
              key={type}
              onClick={() => { setActiveType(type); setLoading(true) }}
              className={`
                flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-colors
                ${activeType === type
                  ? 'bg-mc-elevated text-mc-text'
                  : 'text-mc-text-muted hover:text-mc-text hover:bg-mc-hover'
                }
              `}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-mc-text-muted">加载中...</p>
          </div>
        ) : (
          <>
            <textarea
              value={content}
              onChange={(e) => { setContent(e.target.value); setSaved(false) }}
              className="flex-1 w-full bg-transparent border border-mc-border-subtle rounded-lg p-4 text-sm text-mc-text font-mono leading-relaxed resize-none focus:outline-none focus:border-mc-border transition-colors"
              placeholder="输入内容..."
              spellCheck={false}
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] text-mc-text-muted">
                {content.length} 字符 · {activeType === 'user' ? '用户画像 (Who)' : '项目记忆 (What/Where)'}
              </span>
              <Button
                variant={saved ? 'ghost' : 'secondary'}
                size="sm"
                icon={saved ? <CheckCircle size={12} /> : <Save size={12} />}
                onClick={handleSave}
              >
                {saved ? '已保存' : '保存'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function getDefaultContent(type: MemoryType): string {
  if (type === 'user') {
    return `# 用户画像\n\n用户使用中文交流。时区：CST / UTC+8。\n工具偏好：本地免费工具优先。\n工作风格：不确定时先查证不瞎猜。\n`
  }
  return `# 项目记忆\n\n## 环境\n- OS: \n- Node: \n\n## 关键事实\n- \n\n## 约束\n- \n`
}

function CheckCircle({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}
