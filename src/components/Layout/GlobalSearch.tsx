// 全局搜索 — ⌘K 唤醒，跨 sessions / skills / settings
import { useEffect, useRef, useState, useMemo } from 'react'
import { Search, MessageSquare, Sparkles, Settings, ChevronRight } from 'lucide-react'
import { useChatStore } from '@/stores/chatStore'
import { useSkillsStore } from '@/stores/skillsStore'
import { useUIStore } from '@/stores/uiStore'
import type { SessionInfo } from '@/lib/mimoTypes'
import type { SkillInfo } from '@/lib/mimoTypes'

type SettingsResult = { id: string; label: string; tab: 'appearance' | 'providers' | 'about' }
type SearchResult =
  | { type: 'session'; item: SessionInfo }
  | { type: 'skill'; item: SkillInfo }
  | { type: 'setting'; item: SettingsResult }

const SETTINGS_ITEMS: SettingsResult[] = [
  { id: 'appearance', label: '外观设置', tab: 'appearance' },
  { id: 'providers', label: 'Provider 配置', tab: 'providers' },
  { id: 'about', label: '关于', tab: 'about' },
]

export default function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const sessions = useChatStore((s) => s.sessions)
  const setCurrentSession = useChatStore((s) => s.setCurrentSession)
  const loadMessages = useChatStore((s) => s.loadMessages)
  const skills = useSkillsStore((s) => s.skills)
  const loadSkills = useSkillsStore((s) => s.loadSkills)
  const { setCurrentView, setSettingsTab } = useUIStore()

  // 组件挂载时加载一次技能列表
  useEffect(() => {
    loadSkills()
  }, [loadSkills])

  // 全局 ⌘K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (inputRef.current && !inputRef.current.contains(target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const q = query.trim().toLowerCase()

  const results = useMemo(() => {
    const list: SearchResult[] = []
    if (!q) return list

    sessions.forEach((session) => {
      const title = session.title || '无标题'
      if (title.toLowerCase().includes(q) || session.id.toLowerCase().includes(q)) {
        list.push({ type: 'session', item: session })
      }
    })

    skills.forEach((skill) => {
      if (skill.name.toLowerCase().includes(q) || (skill.description || '').toLowerCase().includes(q)) {
        list.push({ type: 'skill', item: skill })
      }
    })

    SETTINGS_ITEMS.forEach((setting) => {
      if (setting.label.toLowerCase().includes(q)) {
        list.push({ type: 'setting', item: setting })
      }
    })

    return list
  }, [q, sessions, skills])

  const activeIndex = Math.min(selectedIndex, Math.max(results.length - 1, 0))

  const handleSelect = (result: SearchResult) => {
    if (result.type === 'session') {
      setCurrentSession(result.item.id)
      loadMessages(result.item.id)
      setCurrentView('chat')
    } else if (result.type === 'skill') {
      setCurrentView('skills')
    } else if (result.type === 'setting') {
      setSettingsTab(result.item.tab)
      setCurrentView('settings')
    }
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[activeIndex]) {
      e.preventDefault()
      handleSelect(results[activeIndex])
    }
  }

  const groupLabel = (type: SearchResult['type']) => {
    switch (type) {
      case 'session': return '会话'
      case 'skill': return '技能'
      case 'setting': return '设置'
    }
  }

  const groupIcon = (type: SearchResult['type']) => {
    switch (type) {
      case 'session': return MessageSquare
      case 'skill': return Sparkles
      case 'setting': return Settings
    }
  }

  return (
    <div className="relative w-full max-w-[480px]">
      <div
        className={`
          flex items-center gap-2 w-full px-3 h-7 rounded-lg border transition-all
          ${focused || open
            ? 'border-mc-brand bg-mc-surface'
            : 'border-mc-border-subtle bg-mc-elevated/50 hover:border-mc-border'
          }
        `}
      >
        <Search size={13} className="text-mc-text-muted" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); setOpen(true) }}
          onFocus={() => { setFocused(true); setOpen(true) }}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder="搜索..."
          className="flex-1 bg-transparent text-xs text-mc-text placeholder:text-mc-text-muted outline-none"
        />
        <span className="text-2xs text-mc-text-muted px-1.5 py-0.5 rounded bg-mc-bg border border-mc-border-subtle">
          ⌘K
        </span>
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-mc-surface border border-mc-border rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
          {results.length === 0 ? (
            <div className="px-3 py-4 text-center text-2xs text-mc-text-muted">
              {q ? '未找到匹配结果' : '输入关键词搜索会话、技能或设置'}
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto py-1">
              {results.map((result, index) => {
                const Icon = groupIcon(result.type)
                const isSelected = index === activeIndex
                return (
                  <button
                    key={`${result.type}-${result.type === 'session' ? result.item.id : result.type === 'skill' ? result.item.name : result.item.id}`}
                    onMouseEnter={() => setSelectedIndex(index)}
                    onClick={() => handleSelect(result)}
                    className={`
                      w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors
                      ${isSelected ? 'bg-mc-bg-active' : 'hover:bg-mc-hover'}
                    `}
                  >
                    <Icon size={13} className="text-mc-text-muted shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-mc-text truncate">
                        {result.type === 'session' ? (result.item.title || '无标题')
                          : result.type === 'skill' ? result.item.name
                          : result.item.label}
                      </div>
                      {result.type === 'skill' && result.item.description && (
                        <div className="text-2xs text-mc-text-muted truncate">{result.item.description}</div>
                      )}
                    </div>
                    <span className="text-2xs text-mc-text-muted shrink-0">{groupLabel(result.type)}</span>
                    {isSelected && <ChevronRight size={12} className="text-mc-brand shrink-0" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
