// 技能视图 — Phase 4 T4.2 三栏布局
// 左侧分类 + 中间技能列表 + 右侧详情面板

import { useState, useEffect, useMemo } from 'react'
import { useChatStore, selectors } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'
import { isElectron, getAPI } from '@/lib/ipc'
import { mimoClient } from '@/lib/mimoClient'
import { Sparkles, Plus, Trash2, BookOpen, Edit, EyeOff, Download, Package, User, Layers, ExternalLink } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import TitleBar from '@/components/ui/TitleBar'
import StatusDot from '@/components/ui/StatusDot'
import EmptyHint from '@/components/ui/EmptyHint'
import Spinner from '@/components/ui/Spinner'
import type { SkillInfo } from '@/lib/mimoTypes'

type CategoryId = 'all' | 'compose' | 'user' | 'store'

const CATEGORIES: { id: CategoryId; icon: typeof Sparkles; label: string }[] = [
  { id: 'all', icon: Layers, label: '全部' },
  { id: 'compose', icon: Package, label: '内置' },
  { id: 'user', icon: User, label: '用户' },
  { id: 'store', icon: BookOpen, label: '商店' },
]

export default function SkillsView() {
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState<CategoryId>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingSkill, setEditingSkill] = useState<SkillInfo | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [serverConnected, setServerConnected] = useState(false)
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState('')
  const [downloading, setDownloading] = useState(false)

  useEffect(() => { loadSkills() }, [])

  useEffect(() => {
    const unsub = useChatStore.subscribe((state, prev) => {
      if (selectors.serverReady(state) && !selectors.serverReady(prev)) loadSkills()
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
        const data = await getAPI().files.readSkills()
        setSkills(data || [])
      }
    } catch {
      if (isElectron()) {
        try { setSkills(await getAPI().files.readSkills() || []) } catch { setSkills([]) }
      }
    }
    setLoading(false)
  }

  const isComposeSkill = (skill: SkillInfo) =>
    (skill.location || '').includes('.bundle') || (skill.location || '').includes('compose')

  const availableSkills = skills.filter(s => !s.hidden)
  const composeSkills = useMemo(() => availableSkills.filter(isComposeSkill), [availableSkills])
  const userSkills = useMemo(() => availableSkills.filter(s => !isComposeSkill(s)), [availableSkills])

  const filteredSkills = useMemo(() => {
    switch (category) {
      case 'compose': return composeSkills
      case 'user': return userSkills
      case 'store': return [] // 商店不显示本地技能
      default: return availableSkills
    }
  }, [category, availableSkills, composeSkills, userSkills])

  const selectedSkill = useMemo(
    () => availableSkills.find(s => s.name === selectedId) || null,
    [selectedId, availableSkills],
  )

  const handleCreate = () => {
    setEditingSkill(null)
    setEditorContent(getDefaultSkillContent())
    setEditorOpen(true)
  }

  const handleView = (skill: SkillInfo) => {
    setSelectedId(skill.name)
  }

  const handleEdit = (skill: SkillInfo) => {
    setEditingSkill(skill)
    setEditorContent(skill.content || getFallbackContent(skill.name))
    setEditorOpen(true)
  }

  const handleSave = async () => {
    if (!isElectron()) return
    const nameMatch = editorContent.match(/^---\n[\s\S]*?^name:\s*(.+)$/m)
    const name = nameMatch ? nameMatch[1].trim() : `skill-${Date.now()}`
    await getAPI().files.writeSkill(name, editorContent)
    setEditorOpen(false)
    loadSkills()
  }

  const handleDelete = async (name: string) => {
    if (!isElectron()) return
    await getAPI().files.deleteSkill(name)
    if (selectedId === name) setSelectedId(null)
    loadSkills()
  }

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
      useUIStore.getState().addToast(`下载失败: ${err instanceof Error ? err.message : '未知错误'}`, 'error')
    } finally {
      setDownloading(false)
    }
  }

  const categoryCount = (id: CategoryId) => {
    switch (id) {
      case 'all': return availableSkills.length
      case 'compose': return composeSkills.length
      case 'user': return userSkills.length
      case 'store': return 0
    }
  }

  return (
    <div className="flex flex-col h-full">
      <TitleBar
        icon={Sparkles}
        title="技能"
        actions={
          <div className="flex items-center gap-2">
            {!serverConnected && <StatusDot tone="warning" />}
            <Button variant="ghost" size="sm" icon={<Download size={12} />} onClick={() => setDownloadOpen(true)}>下载</Button>
            <Button variant="ghost" size="sm" icon={<Plus size={12} />} onClick={handleCreate}>新建</Button>
          </div>
        }
      />

      <div className="flex flex-1 min-h-0">
        {/* 左侧分类 */}
        <aside className="w-36 shrink-0 border-r border-mc-border-subtle p-2 space-y-0.5">
          {CATEGORIES.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => { setCategory(id); setSelectedId(null) }}
              className={`w-full flex items-center gap-2 px-2.5 py-2 text-xs rounded-md transition-colors ${
                category === id
                  ? 'bg-mc-brand-soft text-mc-brand font-medium'
                  : 'text-mc-text-secondary hover:bg-mc-hover hover:text-mc-text'
              }`}
            >
              <Icon size={13} strokeWidth={1.5} />
              <span className="flex-1 text-left">{label}</span>
              <span className="text-2xs opacity-60">{categoryCount(id)}</span>
            </button>
          ))}
        </aside>

        {/* 中间列表 */}
        <div className="flex-1 overflow-y-auto p-2 min-w-0">
          {loading ? (
            <div className="flex items-center justify-center h-full"><Spinner size={16} /></div>
          ) : category === 'store' ? (
            <StoreContent onDownload={() => setDownloadOpen(true)} />
          ) : filteredSkills.length === 0 ? (
            <EmptyHint
              icon={Sparkles}
              title="暂无技能"
              description={serverConnected ? '技能将自动从 compose/用户目录/项目目录发现' : '请确保 mimo serve 已启动'}
            />
          ) : (
            <div className="space-y-0.5">
              {filteredSkills.map((skill) => (
                <SkillRow
                  key={skill.name}
                  skill={skill}
                  isCompose={isComposeSkill(skill)}
                  selected={selectedId === skill.name}
                  onClick={() => handleView(skill)}
                />
              ))}
            </div>
          )}
        </div>

        {/* 右侧详情 */}
        {selectedSkill && (
          <aside className="w-80 shrink-0 border-l border-mc-border-subtle overflow-y-auto p-4 space-y-3">
            <SkillDetailPanel
              skill={selectedSkill}
              isCompose={isComposeSkill(selectedSkill)}
              onEdit={() => handleEdit(selectedSkill)}
              onDelete={() => handleDelete(selectedSkill.name)}
            />
          </aside>
        )}
      </div>

      {/* Download modal */}
      <Modal open={downloadOpen} onClose={() => setDownloadOpen(false)} title="下载技能">
        <div className="space-y-3">
          <p className="text-xs text-mc-text-muted">输入技能 SKILL.md 文件的 URL，系统将自动下载并保存到本地</p>
          <input type="url" value={downloadUrl} onChange={(e) => setDownloadUrl(e.target.value)} placeholder="https://example.com/SKILL.md" className="w-full bg-mc-bg border border-mc-border rounded-lg px-3 py-2 text-xs text-mc-text focus:outline-none focus:border-mc-brand" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDownloadOpen(false)}>取消</Button>
            <Button variant="brand" size="sm" onClick={handleDownload} disabled={!downloadUrl.trim() || downloading}>{downloading ? '下载中...' : '下载'}</Button>
          </div>
        </div>
      </Modal>

      {/* Editor modal */}
      <Modal open={editorOpen} onClose={() => setEditorOpen(false)} title={editingSkill ? `编辑: ${editingSkill.name}` : '新建技能'} width="max-w-2xl">
        <textarea value={editorContent} onChange={(e) => setEditorContent(e.target.value)} className="w-full h-[400px] bg-mc-bg border border-mc-border rounded-lg p-3 text-xs text-mc-text font-mono leading-relaxed resize-none focus:outline-none focus:border-mc-brand" spellCheck={false} placeholder="输入技能内容（YAML frontmatter + Markdown）..." />
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="ghost" size="sm" onClick={() => setEditorOpen(false)}>关闭</Button>
          {(!editingSkill || !isComposeSkill(editingSkill)) && <Button variant="brand" size="sm" onClick={handleSave}>保存</Button>}
        </div>
      </Modal>
    </div>
  )
}

// === 技能行（紧凑列表项）===
function SkillRow({ skill, isCompose, selected, onClick }: {
  skill: SkillInfo; isCompose: boolean; selected: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors ${
        selected ? 'bg-mc-brand-soft text-mc-text' : 'text-mc-text-secondary hover:bg-mc-hover hover:text-mc-text'
      }`}
    >
      <Sparkles size={13} strokeWidth={1.5} className={selected ? 'text-mc-brand' : 'text-mc-text-muted'} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium truncate">{skill.name}</span>
          {isCompose && <span className="text-2xs text-mc-brand bg-mc-brand-soft px-1 py-0.5 rounded">内置</span>}
          {skill.hidden && <EyeOff size={9} className="text-mc-text-muted" />}
        </div>
        {skill.description && <p className="text-2xs text-mc-text-muted truncate">{skill.description}</p>}
      </div>
    </button>
  )
}

// === 技能详情面板 ===
function SkillDetailPanel({ skill, isCompose, onEdit, onDelete }: {
  skill: SkillInfo; isCompose: boolean; onEdit: () => void; onDelete: () => void
}) {
  return (
    <>
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-medium text-mc-text">{skill.name}</h3>
          <div className="flex items-center gap-1.5 mt-1">
            {isCompose ? (
              <span className="text-2xs text-mc-brand bg-mc-brand-soft px-1.5 py-0.5 rounded">内置</span>
            ) : (
              <span className="text-2xs text-mc-success bg-mc-success/10 px-1.5 py-0.5 rounded">用户</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" icon={<Edit size={11} />} onClick={onEdit}>编辑</Button>
          {!isCompose && <Button variant="danger" size="sm" icon={<Trash2 size={11} />} onClick={onDelete}>删除</Button>}
        </div>
      </div>

      {skill.description && (
        <p className="text-xs text-mc-text-secondary leading-relaxed">{skill.description}</p>
      )}

      {skill.location && (
        <div className="text-2xs text-mc-text-muted font-mono truncate bg-mc-bg px-2 py-1 rounded">{skill.location}</div>
      )}

      {/* 内容预览 */}
      {skill.content && (
        <div className="mt-2">
          <div className="text-2xs text-mc-text-muted uppercase tracking-wider mb-1">内容预览</div>
          <pre className="text-2xs text-mc-text-muted bg-mc-bg rounded p-3 max-h-[300px] overflow-y-auto font-mono leading-relaxed whitespace-pre-wrap">
            {skill.content.slice(0, 2000)}{skill.content.length > 2000 ? '\n...' : ''}
          </pre>
        </div>
      )}
    </>
  )
}

// === 商店内容 ===
function StoreContent({ onDownload }: { onDownload: () => void }) {
  return (
    <div className="space-y-4 p-2">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-2xs font-semibold text-mc-text-muted uppercase tracking-wider">魔搭社区 (ModelScope)</h3>
          <a href="https://modelscope.cn/skills" target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-2xs text-mc-brand hover:underline">
            打开官网 <ExternalLink size={9} />
          </a>
        </div>
        <p className="text-2xs text-mc-text-muted mb-3">阿里魔搭社区 Skills 广场，涵盖开发工具、前端、代码质量等类别。</p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {MODELSCOPE_FEATURED.map((item) => (
            <div key={item.name} className="mc-card p-3 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-2xs">{item.icon}</span>
                <span className="text-xs font-medium text-mc-text">{item.name}</span>
              </div>
              <p className="text-2xs text-mc-text-muted line-clamp-2">{item.desc}</p>
            </div>
          ))}
        </div>
        <Button variant="secondary" size="sm" icon={<Download size={12} />} onClick={onDownload} className="w-full">
          从 URL 下载技能
        </Button>
      </div>
    </div>
  )
}

const MODELSCOPE_FEATURED = [
  { name: '代码审查', icon: '🔍', desc: '系统性代码审查：安全/性能/可维护性' },
  { name: 'API 设计', icon: '🔌', desc: 'RESTful API 设计规范：命名/版本/错误码' },
  { name: 'Bug 分析', icon: '🐛', desc: '结构化 Bug 定位：复现→定位→根因→修复' },
  { name: '前端组件', icon: '🎨', desc: 'React/Vue 组件开发最佳实践' },
]

function getFallbackContent(name: string): string {
  return `---\nname: ${name}\ndescription: ""\n---\n\n# ${name}\n\n技能内容不可用（服务端返回时未包含完整内容）\n`
}

function getDefaultSkillContent(): string {
  return `---\nname: my-skill\ndescription: "技能描述"\n---\n\n# 技能标题\n\n在这里编写技能的具体指令和规则...\n`
}
