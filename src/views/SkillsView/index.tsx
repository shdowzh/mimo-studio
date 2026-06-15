// 技能视图 — 基于 mimo serve Skill API
// 服务端自动发现：compose 内置技能 + 用户目录 + 项目目录技能

import { useState, useEffect } from 'react'
import { useChatStore } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'
import { isElectron, getAPI } from '@/lib/ipc'
import { mimoClient } from '@/lib/mimoClient'
import { Sparkles, Plus, FileCode, Trash2, BookOpen, Edit, EyeOff, Download, Loader2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import type { SkillInfo } from '@/lib/mimoTypes'

type SkillsTab = 'available' | 'store'

export default function SkillsView() {
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<SkillsTab>('available')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingSkill, setEditingSkill] = useState<SkillInfo | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [serverConnected, setServerConnected] = useState(false)
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [downloadingName, setDownloadingName] = useState<string | null>(null)

  useEffect(() => {
    loadSkills()
  }, [])

  // 当 serverReady 变为 true 时重新加载技能（首次初始化完成后）
  useEffect(() => {
    const unsub = useChatStore.subscribe((state, prev) => {
      if (state.serverReady && !prev.serverReady) {
        loadSkills()
      }
    })
    return unsub
  }, [])

  const loadSkills = async () => {
    setLoading(true)
    try {
      const available = await mimoClient.isAvailable()
      setServerConnected(available)
      if (available) {
        const data = await mimoClient.listSkills()
        setSkills(data || [])
      } else if (isElectron()) {
        // Fallback: 从本地文件加载
        const data = await getAPI().files.readSkills()
        setSkills(data || [])
      }
    } catch {
      // 离线时从本地加载
      if (isElectron()) {
        try {
          const data = await getAPI().files.readSkills()
          setSkills(data || [])
        } catch {
          setSkills([])
        }
      }
    }
    setLoading(false)
  }

  // 可用技能（非隐藏）
  const availableSkills = skills.filter(s => !s.hidden)

  // 创建自定义技能
  const handleCreate = () => {
    setEditingSkill(null)
    setEditorContent(getDefaultSkillContent())
    setEditorOpen(true)
  }

  // 查看技能内容
  const handleView = (skill: SkillInfo) => {
    setEditingSkill(skill)
    setEditorContent(skill.content || getFallbackContent(skill.name))
    setEditorOpen(true)
  }

  // 保存技能到本地文件
  const handleSave = async () => {
    if (!isElectron()) return
    const nameMatch = editorContent.match(/^---\n[\s\S]*?^name:\s*(.+)$/m)
    const name = nameMatch ? nameMatch[1].trim() : `skill-${Date.now()}`
    await getAPI().files.writeSkill(name, editorContent)
    setEditorOpen(false)
    loadSkills()
  }

  // 删除本地技能
  const handleDelete = async (name: string) => {
    if (!isElectron()) return
    await getAPI().files.deleteSkill(name)
    loadSkills()
  }

  // 从 URL 下载技能（手动输入）
  const handleDownload = async () => {
    if (!downloadUrl.trim() || !isElectron()) return
    setDownloading(true)
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15_000)
      const response = await fetch(downloadUrl.trim(), { signal: controller.signal })
      clearTimeout(timeout)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const content = await response.text()
      if (!content.startsWith('---\n')) throw new Error('无效的 SKILL.md：缺少 YAML frontmatter')
      const nameMatch = content.match(/^---\n[\s\S]*?^name:\s*(.+)$/m)
      const name = nameMatch ? nameMatch[1].trim() : `skill-${Date.now()}`
      await getAPI().files.writeSkill(name, content)
      setDownloadOpen(false)
      setDownloadUrl('')
      loadSkills()
      useUIStore.getState().addToast(`技能 "${name}" 安装成功`, 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '未知错误'
      useUIStore.getState().addToast(`下载失败: ${msg}`, 'error')
    } finally {
      setDownloading(false)
    }
  }

  // 直接下载指定技能（从技能商店卡片）
  const handleDirectDownload = async (item: typeof MODELSCOPE_FEATURED[number]) => {
    if (!isElectron() || !item.skillUrl) {
      // fallback: 打开手动输入弹窗
      setDownloadUrl(item.url || '')
      setDownloadOpen(true)
      return
    }
    setDownloadingName(item.name)
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 20_000)
      const response = await fetch(item.skillUrl, { signal: controller.signal })
      clearTimeout(timeout)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const content = await response.text()
      if (!content.startsWith('---\n')) throw new Error('无效的 SKILL.md：缺少 YAML frontmatter')
      const nameMatch = content.match(/^---\n[\s\S]*?^name:\s*(.+)$/m)
      const name = nameMatch ? nameMatch[1].trim() : `skill-${Date.now()}`
      await getAPI().files.writeSkill(name, content)
      loadSkills()
      useUIStore.getState().addToast(`技能 "${name}" 安装成功`, 'success')
    } catch (err) {
      const msg = err instanceof Error ? (err.name === 'AbortError' ? '下载超时' : err.message) : '未知错误'
      useUIStore.getState().addToast(`下载 "${item.name}" 失败: ${msg}`, 'error')
    } finally {
      setDownloadingName(null)
    }
  }

  // 判断是否为 compose 内置技能（location 包含 compose bundle 路径）
  const isComposeSkill = (skill: SkillInfo): boolean => {
    return skill.location.includes('.bundle') || skill.location.includes('compose')
  }

  const composeSkills = availableSkills.filter(isComposeSkill)
  const userSkills = availableSkills.filter(s => !isComposeSkill(s))

  return (
    <div className="flex flex-col h-full">
      <div className="h-[36px] drag" />
      {/* Header with tabs */}
      <div className="flex items-center justify-between h-10 px-4 border-b border-mc-border-subtle">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Sparkles size={14} strokeWidth={1.5} className="text-mc-text-muted" />
            <span className="text-xs font-medium text-mc-text-secondary">技能</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTab('available')}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                tab === 'available' ? 'bg-mc-elevated text-mc-text' : 'text-mc-text-muted hover:text-mc-text hover:bg-mc-hover'
              }`}
            >
              可用技能
              {availableSkills.length > 0 && <span className="ml-1 text-[10px] text-mc-text-muted">{availableSkills.length}</span>}
            </button>
            <button
              onClick={() => setTab('store')}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-colors ${
                tab === 'store' ? 'bg-mc-elevated text-mc-text' : 'text-mc-text-muted hover:text-mc-text hover:bg-mc-hover'
              }`}
            >
              <BookOpen size={10} />
              技能商店
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!serverConnected && (
            <span className="text-[10px] text-mc-warning mr-1">离线</span>
          )}
          <Button variant="ghost" size="sm" icon={<Download size={12} />} onClick={() => setDownloadOpen(true)}>
            下载
          </Button>
          <Button variant="ghost" size="sm" icon={<Plus size={12} />} onClick={handleCreate}>
            新建
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-mc-text-muted">加载中...</p>
          </div>
        ) : tab === 'available' ? (
          <AvailableSkillsTab
            composeSkills={composeSkills}
            userSkills={userSkills}
            onView={handleView}
            onDelete={handleDelete}
            serverConnected={serverConnected}
          />
        ) : (
          <SkillStoreTab
            skills={availableSkills}
            onView={handleView}
            onDownload={() => setDownloadOpen(true)}
            onDirectDownload={handleDirectDownload}
            downloadingName={downloadingName}
          />
        )}
      </div>

      {/* Download skill modal */}
      <Modal
        open={downloadOpen}
        onClose={() => setDownloadOpen(false)}
        title="下载技能"
        width="max-w-md"
      >
        <div className="space-y-3">
          <p className="text-xs text-mc-text-muted">
            输入技能 SKILL.md 文件的 URL，系统将自动下载并保存到本地
          </p>
          <input
            type="url"
            value={downloadUrl}
            onChange={(e) => setDownloadUrl(e.target.value)}
            placeholder="https://example.com/SKILL.md"
            className="w-full bg-mc-bg border border-mc-border rounded-lg px-3 py-2 text-xs text-mc-text focus:outline-none focus:border-mc-border-focus"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDownloadOpen(false)}>取消</Button>
            <Button variant="primary" size="sm" onClick={handleDownload} disabled={!downloadUrl.trim() || downloading}>
              {downloading ? '下载中...' : '下载'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Skill viewer/editor modal */}
      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editingSkill ? `查看技能: ${editingSkill.name}` : '新建技能'}
        width="max-w-2xl"
      >
        <textarea
          value={editorContent}
          onChange={(e) => setEditorContent(e.target.value)}
          className="w-full h-[400px] bg-mc-bg border border-mc-border rounded-lg p-3 text-xs text-mc-text font-mono leading-relaxed resize-none focus:outline-none focus:border-mc-border-focus"
          spellCheck={false}
          placeholder="输入技能内容（YAML frontmatter + Markdown）..."
        />
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="ghost" size="sm" onClick={() => setEditorOpen(false)}>关闭</Button>
          {(!editingSkill || !isComposeSkill(editingSkill)) && (
            <Button variant="primary" size="sm" onClick={handleSave}>保存</Button>
          )}
        </div>
      </Modal>
    </div>
  )
}

// === Available Skills Tab ===
function AvailableSkillsTab({
  composeSkills,
  userSkills,
  onView,
  onDelete,
  serverConnected,
}: {
  composeSkills: SkillInfo[]
  userSkills: SkillInfo[]
  onView: (skill: SkillInfo) => void
  onDelete: (name: string) => void
  serverConnected: boolean
}) {
  if (composeSkills.length === 0 && userSkills.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <FileCode size={24} strokeWidth={1} className="text-mc-text-muted mx-auto" />
          <p className="text-xs text-mc-text-muted">暂无可用技能</p>
          <p className="text-[10px] text-mc-text-muted">
            {serverConnected ? '技能将自动从 compose/用户目录/项目目录发现' : '请确保 mimo serve 已启动'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Compose 内置技能区 */}
      {composeSkills.length > 0 && (
        <div>
          <h3 className="text-[10px] font-semibold text-mc-text-muted uppercase tracking-wider mb-2">
            内置技能
            <span className="ml-1 font-normal text-mc-text-muted normal-case">{composeSkills.length} 个</span>
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {composeSkills.map((skill) => (
              <SkillCard
                key={skill.name}
                skill={skill}
                isCompose
                onView={onView}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      )}

      {/* 用户/项目技能区 */}
      {userSkills.length > 0 && (
        <div>
          <h3 className="text-[10px] font-semibold text-mc-text-muted uppercase tracking-wider mb-2">
            用户技能
            <span className="ml-1 font-normal text-mc-text-muted normal-case">{userSkills.length} 个</span>
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {userSkills.map((skill) => (
              <SkillCard
                key={skill.name}
                skill={skill}
                isCompose={false}
                onView={onView}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// === Skill Store Tab ===
function SkillStoreTab({ skills, onView, onDownload, onDirectDownload, downloadingName }: {
  skills: SkillInfo[]
  onView: (skill: SkillInfo) => void
  onDownload: () => void
  onDirectDownload: (item: typeof MODELSCOPE_FEATURED[number]) => void
  downloadingName: string | null
}) {
  return (
    <div className="space-y-5">
      {/* 魔搭社区 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[10px] font-semibold text-mc-text-muted uppercase tracking-wider">
            魔搭社区 (ModelScope)
          </h3>
          <a
            href="https://modelscope.cn/skills"
            target="_blank"
            rel="noopener"
            className="text-[10px] text-mc-accent hover:underline"
          >
            打开官网 →
          </a>
        </div>
        <p className="text-[11px] text-mc-text-muted mb-3">
          阿里魔搭社区 Skills 广场，涵盖开发工具、前端、代码质量、多媒体、移动开发等类别。
          支持 Claude Code、Cursor、OpenClaw 等主流 Agent。
        </p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {MODELSCOPE_FEATURED.map((item) => (
            <div key={item.name} className="mc-card p-3 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-mc-text-secondary">{item.icon}</span>
                <span className="text-xs font-medium text-mc-text">{item.name}</span>
              </div>
              <p className="text-[10px] text-mc-text-muted line-clamp-2">{item.desc}</p>
              <button
                onClick={() => onDirectDownload(item)}
                disabled={downloadingName === item.name}
                className={`text-[10px] hover:underline transition-colors ${
                  downloadingName === item.name ? 'text-mc-text-muted cursor-wait' : 'text-mc-accent'
                }`}
              >
                {downloadingName === item.name ? '下载中...' : '下载安装 →'}
              </button>
            </div>
          ))}
        </div>
        <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-lg">
          <p className="text-[10px] text-amber-600">
            提示：魔搭社区技能可通过 URL 下载。点击「下载」按钮，粘贴技能 SKILL.md 链接即可安装。
            也可以直接访问 <a href="https://modelscope.cn/skills" target="_blank" rel="noopener" className="underline">modelscope.cn/skills</a> 浏览全部技能。
          </p>
        </div>
      </div>

      {/* 已发现技能 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[10px] font-semibold text-mc-text-muted uppercase tracking-wider">
            已发现的技能 ({skills.length})
          </h3>
        </div>
        <p className="text-[11px] text-mc-text-muted mb-3">
          mimo serve 自动从 compose 内置包(~16个) 和用户/项目目录发现：
        </p>
        <div className="grid grid-cols-2 gap-3">
          {skills.map((skill) => (
            <SkillCard
              key={skill.name}
              skill={skill}
              isCompose={skill.location.includes('.bundle') || skill.location.includes('compose')}
              onView={onView}
              onDelete={() => {}}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

const MODELSCOPE_FEATURED = [
  {
    name: '代码审查',
    icon: '🔍',
    desc: '系统性代码审查：安全/性能/可维护性',
    url: 'https://modelscope.cn/skills',
    skillUrl: '',
  },
  {
    name: 'API 设计',
    icon: '🔌',
    desc: 'RESTful API 设计规范：命名/版本/错误码',
    url: 'https://modelscope.cn/skills',
    skillUrl: '',
  },
  {
    name: 'Bug 分析',
    icon: '🐛',
    desc: '结构化 Bug 定位：复现→定位→根因→修复',
    url: 'https://modelscope.cn/skills',
    skillUrl: '',
  },
  {
    name: '前端组件',
    icon: '🎨',
    desc: 'React/Vue 组件开发最佳实践',
    url: 'https://modelscope.cn/skills',
    skillUrl: '',
  },
]

// === Skill Card ===
function SkillCard({
  skill,
  isCompose,
  onView,
  onDelete,
}: {
  skill: SkillInfo
  isCompose: boolean
  onView: (skill: SkillInfo) => void
  onDelete: (name: string) => void
}) {
  return (
    <div
      onClick={() => onView(skill)}
      className="mc-card p-4 cursor-pointer hover:border-mc-border-focus transition-colors group"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h4 className="text-xs font-medium text-mc-text truncate">{skill.name}</h4>
            {isCompose ? (
              <span className="text-[9px] text-mc-accent bg-mc-accent/10 px-1.5 py-0.5 rounded shrink-0">内置</span>
            ) : (
              <span className="text-[9px] text-mc-success/70 bg-mc-success/5 px-1.5 py-0.5 rounded shrink-0">用户</span>
            )}
            {skill.hidden && (
              <span className="text-[9px] text-mc-text-muted bg-mc-elevated px-1.5 py-0.5 rounded shrink-0">
                <EyeOff size={9} className="inline" />
              </span>
            )}
          </div>
          {skill.description && (
            <p className="text-[11px] text-mc-text-muted line-clamp-2">{skill.description}</p>
          )}
          <div className="text-[9px] text-mc-text-muted truncate">
            {skill.location}
          </div>
        </div>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onView(skill) }}
            className="p-1 text-mc-text-muted hover:text-mc-text transition-colors"
            title="查看"
          >
            <Edit size={11} />
          </button>
          {!isCompose && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(skill.name) }}
              className="opacity-0 group-hover:opacity-100 p-1 text-mc-text-muted hover:text-mc-error transition-all"
              title="删除"
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function getFallbackContent(name: string): string {
  return `---
name: ${name}
description: ""
---

# ${name}

技能内容不可用（服务端返回时未包含完整内容）
`
}

function getDefaultSkillContent(): string {
  return `---
name: my-skill
description: "技能描述"
---

# 技能标题

在这里编写技能的具体指令和规则...
`
}
