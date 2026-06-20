// 设置视图 — Phase 4 T4.1 改造
// 左侧 tab 列 + 右侧内容区；Provider 折叠卡片；主题预览放大；字号实时预览

import { useState, useEffect } from 'react'
import { isElectron, getAPI } from '@/lib/ipc'
import { safeJsonParse } from '@/lib/safeJson'
import { loadAllApiKeys, setApiKey, deleteApiKey } from '@/lib/secret'
import { useMimoInstaller } from '@/hooks/useMimoInstaller'
import { Settings as SettingsIcon, Palette, Info, Shield, Download, AlertCircle, CheckCircle, ChevronDown, ExternalLink, Monitor, Sun, Moon } from 'lucide-react'
import { useThemeStore, type ThemeId } from '@/stores/themeStore'
import { useUIStore } from '@/stores/uiStore'
import { useChatStore, selectors } from '@/stores/chatStore'
import { PROVIDER_TEMPLATES } from '@/config/providerTemplates'
import Button from '@/components/ui/Button'
import StatusDot from '@/components/ui/StatusDot'
import Spinner from '@/components/ui/Spinner'

type SettingsTab = 'appearance' | 'providers' | 'about'

export default function SettingsView() {
  const settingsTab = useUIStore((s) => s.settingsTab)
  const setSettingsTab = useUIStore((s) => s.setSettingsTab)
  const [tab, setTab] = useState<SettingsTab>(settingsTab)

  useEffect(() => { setTab(settingsTab) }, [settingsTab])

  const tabs: { id: SettingsTab; icon: typeof SettingsIcon; label: string }[] = [
    { id: 'appearance', icon: Palette, label: '外观' },
    { id: 'providers', icon: Shield, label: 'Provider' },
    { id: 'about', icon: Info, label: '关于' },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* 工具栏 */}
      <div className="shrink-0 flex items-center gap-2 px-3 h-11 border-b border-mc-border-subtle no-drag">
        <SettingsIcon size={14} className="text-mc-text-muted" />
        <span className="text-xs font-medium text-mc-text">设置</span>
      </div>
      <div className="flex flex-1 min-h-0">
        {/* 左侧 tab 列 */}
        <aside className="w-40 shrink-0 border-r border-mc-border-subtle p-2 space-y-0.5">
          {tabs.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => { setTab(id); setSettingsTab(id) }}
              className={`w-full flex items-center gap-2 px-2.5 py-2 text-xs rounded-md transition-colors ${
                tab === id
                  ? 'bg-mc-bg-active text-mc-brand-text font-medium'
                  : 'text-mc-text-secondary hover:bg-mc-hover hover:text-mc-text'
              }`}
            >
              <Icon size={13} strokeWidth={1.5} />
              {label}
            </button>
          ))}
        </aside>
        {/* 右侧内容区 */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'appearance' && <AppearanceTab />}
          {tab === 'providers' && <ProvidersTab />}
          {tab === 'about' && <AboutTab />}
        </div>
      </div>
    </div>
  )
}

// === Appearance ===
function AppearanceTab() {
  const { theme, resolvedTheme, setTheme } = useThemeStore()
  const [fontSize, setFontSize] = useState(14)

  useEffect(() => {
    if (!isElectron()) return
    getAPI().settings.get('fontSize').then((val) => {
      if (val) setFontSize(parseInt(val, 10) || 14)
    })
  }, [])

  const handleFontSizeChange = async (size: number) => {
    setFontSize(size)
    if (isElectron()) await getAPI().settings.set('fontSize', String(size))
    document.documentElement.style.fontSize = `${size}px`
  }

  const themeOptions: { id: ThemeId; label: string; icon: typeof Monitor }[] = [
    { id: 'system', label: '跟随系统', icon: Monitor },
    { id: 'light', label: '浅色', icon: Sun },
    { id: 'dark', label: '深色', icon: Moon },
  ]

  return (
    <div className="max-w-xl space-y-8">
      {/* 主题 */}
      <div>
        <h3 className="text-sm font-medium text-mc-text mb-1">主题</h3>
        <p className="text-2xs text-mc-text-muted mb-4">
          当前应用：{resolvedTheme === 'dark' ? '深色' : '浅色'}
          {theme === 'system' && '（跟随系统）'}
        </p>
        <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-mc-elevated border border-mc-border-subtle">
          {themeOptions.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTheme(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-all ${
                theme === id
                  ? 'bg-mc-surface text-mc-brand-text shadow-sm font-medium'
                  : 'text-mc-text-secondary hover:text-mc-text'
              }`}
              aria-pressed={theme === id}
              aria-label={label}
            >
              <Icon size={13} strokeWidth={1.5} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 字体大小 */}
      <div>
        <h3 className="text-sm font-medium text-mc-text mb-4">字体大小</h3>
        <div className="mc-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-mc-text-secondary">界面字号</span>
            <span className="text-xs text-mc-brand-text bg-mc-brand-soft px-2 py-0.5 rounded font-medium">{fontSize}px</span>
          </div>
          <input
            type="range"
            min={12}
            max={18}
            step={1}
            value={fontSize}
            onChange={(e) => handleFontSizeChange(parseInt(e.target.value, 10))}
            className="w-full accent-mc-brand"
          />
          <div className="flex justify-between text-2xs text-mc-text-muted">
            <span>12px</span><span>14px</span><span>16px</span><span>18px</span>
          </div>
          {/* 实时预览 */}
          <div className="p-3 rounded-lg bg-mc-bg border border-mc-border-subtle">
            <p className="text-mc-text-secondary" style={{ fontSize: `${fontSize}px` }}>
              这是当前字号 {fontSize}px 的预览文字。The quick brown fox jumps over the lazy dog.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// === Providers ===
function ProvidersTab() {
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [dynamicModels, setDynamicModels] = useState<Record<string, { id: string; name: string }[]>>({})
  const [fetchingModels, setFetchingModels] = useState<Record<string, boolean>>({})

  const serverConnected = useChatStore(selectors.serverConnected)
  const serverReady = useChatStore(selectors.serverReady)
  const serverOk = serverConnected || serverReady

  useEffect(() => { loadKeys() }, [])

  const loadKeys = async () => {
    if (!isElectron()) return
    const keys = await loadAllApiKeys()
    setApiKeys(keys)
    refreshAllModels(keys)
  }

  const refreshAllModels = async (keys: Record<string, string>) => {
    const { fetchModelsForProvider } = await import('@/lib/providerModels')
    const newModels: Record<string, { id: string; name: string }[]> = {}
    for (const pid of Object.keys(keys)) {
      if (!keys[pid]) continue
      setFetchingModels(prev => ({ ...prev, [pid]: true }))
      try {
        const result = await fetchModelsForProvider(pid, keys[pid])
        if (result && result.fetched) {
          newModels[pid] = result.models.map(m => ({ id: m.id, name: m.name || m.id }))
        }
      } catch (e) { console.warn('[SettingsView] refresh dyn models failed:', e) }
      setFetchingModels(prev => ({ ...prev, [pid]: false }))
    }
    setDynamicModels(prev => ({ ...prev, ...newModels }))
  }

  const saveKey = async (id: string, key: string) => {
    if (!isElectron()) return
    setSaving(id)
    const trimmed = key.trim()
    if (trimmed) { await setApiKey(id, trimmed) } else { await deleteApiKey(id) }
    setApiKeys(prev => {
      const next = { ...prev }
      if (trimmed) next[id] = trimmed; else delete next[id]
      return next
    })
    if (serverOk) {
      try {
        const { mimoClient } = await import('@/lib/mimoClient')
        if (trimmed) { await mimoClient.setAuth(id, trimmed) } else { await mimoClient.removeAuth(id).catch(() => {}) }
      } catch (e) { console.warn('[SettingsView] sync key to server failed:', e) }
    }
    setSaving(null)
    if (trimmed) {
      const { fetchModelsForProvider } = await import('@/lib/providerModels')
      setFetchingModels(prev => ({ ...prev, [id]: true }))
      try {
        const result = await fetchModelsForProvider(id, trimmed)
        if (result && result.fetched) {
          setDynamicModels(prev => ({ ...prev, [id]: result.models.map(m => ({ id: m.id, name: m.name || m.id })) }))
        }
      } catch (e) { console.warn('[SettingsView] fetch models failed:', e) }
      setFetchingModels(prev => ({ ...prev, [id]: false }))
    } else {
      setDynamicModels(prev => { const next = { ...prev }; delete next[id]; return next })
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* MiMo CLI */}
      <div>
        <h3 className="text-sm font-medium text-mc-text mb-3">MiMo Serve</h3>
        <div className={`mc-card p-4 ${serverOk ? 'border-mc-success/30' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-mc-elevated flex items-center justify-center shrink-0">
              <Shield size={16} strokeWidth={1.5} className={serverOk ? 'text-mc-success' : 'text-mc-text-muted'} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-medium text-mc-text">MiMo Auto</h4>
                <StatusDot tone={serverOk ? 'success' : 'warning'} />
                <span className="text-2xs text-mc-text-muted">{serverOk ? '已连接' : '未连接'}</span>
              </div>
              <p className="text-2xs text-mc-text-muted">官方免费模型，启动 mimo serve 即可使用完整 Agent 能力</p>
            </div>
          </div>
          {!serverOk && <div className="mt-3 pt-3 border-t border-mc-border-subtle"><MimoCliInstall /></div>}
        </div>
      </div>

      {/* 外部 Provider */}
      <div>
        <h3 className="text-sm font-medium text-mc-text mb-1">外部 Provider</h3>
        <p className="text-2xs text-mc-text-muted mb-3">填入 API Key 后自动获取可用模型列表。Key 安全存储于本地。</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {PROVIDER_TEMPLATES.slice(0, 7).map((tpl) => (
            <ProviderCard
              key={tpl.id}
              template={tpl}
              apiKey={apiKeys[tpl.id] || ''}
              isConfigured={!!apiKeys[tpl.id]}
              dynModels={dynamicModels[tpl.id]}
              isFetching={fetchingModels[tpl.id]}
              isSaving={saving === tpl.id}
              onSave={(key) => saveKey(tpl.id, key)}
            />
          ))}
          <CustomProviderCard apiKeys={apiKeys} serverOk={serverOk} onKeysUpdate={setApiKeys} />
        </div>
      </div>
    </div>
  )
}

// === Provider 折叠卡片 ===
function ProviderCard({ template, apiKey, isConfigured, dynModels, isFetching, isSaving, onSave }: {
  template: typeof PROVIDER_TEMPLATES[number]
  apiKey: string
  isConfigured: boolean
  dynModels?: { id: string; name: string }[]
  isFetching?: boolean
  isSaving?: boolean
  onSave: (key: string) => void
}) {
  const [expanded, setExpanded] = useState(!isConfigured)
  const displayModels = dynModels || template.models

  return (
    <div className={`mc-card overflow-hidden ${isConfigured ? 'border-mc-success/20' : ''}`}>
      {/* 折叠 header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-mc-hover/50 transition-colors text-left"
      >
        <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${isConfigured ? 'bg-mc-success/10' : 'bg-mc-elevated'}`}>
          <Shield size={14} className={isConfigured ? 'text-mc-success' : 'text-mc-text-muted'} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-mc-text">{template.name}</span>
            {isConfigured && <StatusDot tone="success" />}
            {isFetching && <Spinner size={10} tone="muted" />}
          </div>
          <p className="text-2xs text-mc-text-muted truncate">{template.endpoint}</p>
        </div>
        <ChevronDown size={12} className={`text-mc-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {/* 展开内容 */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-mc-border-subtle space-y-2">
          {/* 模型 chips */}
          <div className="flex flex-wrap gap-1">
            {displayModels.map(m => (
              <span key={m.id} className={`text-2xs px-1.5 py-0.5 rounded ${dynModels ? 'text-mc-success bg-mc-success/5' : 'text-mc-text-muted bg-mc-elevated'}`}>{m.name}</span>
            ))}
          </div>
          {/* API Key 输入 */}
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => onSave(e.target.value)}
              placeholder={apiKey ? '••••••••（已配置）' : `输入 ${template.envKey || template.name} API Key...`}
              className="flex-1 bg-mc-bg border border-mc-border rounded-md px-3 py-1.5 text-xs text-mc-text focus:outline-none focus:border-mc-brand"
            />
            {isSaving && <Spinner size={12} tone="muted" />}
          </div>
          {template.website && (
            <a href={template.website} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-2xs text-mc-brand hover:underline">
              获取 Key <ExternalLink size={9} />
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// === 自定义 Provider 卡片 ===
function CustomProviderCard({ apiKeys, serverOk, onKeysUpdate }: {
  apiKeys: Record<string, string>
  serverOk: boolean
  onKeysUpdate: (keys: Record<string, string>) => void
}) {
  const [name, setName] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [apiKey, setApiKeyInput] = useState('')
  const [saved, setSaved] = useState(false)

  if (saved) {
    return (
      <div className="mc-card p-4 border-dashed">
        <div className="flex items-center gap-2 text-xs text-mc-success">
          <CheckCircle size={13} />自定义 Provider 已添加
        </div>
      </div>
    )
  }

  return (
    <div className="mc-card p-4 border-dashed">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Shield size={13} strokeWidth={1.5} className="text-mc-text-muted" />
          <h4 className="text-xs font-medium text-mc-text">自定义 Provider</h4>
          <span className="text-2xs text-mc-text-muted bg-mc-elevated px-1.5 py-0.5 rounded">OpenAI 兼容</span>
        </div>
        <p className="text-2xs text-mc-text-muted">支持 Ollama、vLLM、LocalAI 等</p>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="显示名称" className="w-full bg-mc-bg border border-mc-border rounded-md px-3 py-1.5 text-xs text-mc-text focus:outline-none focus:border-mc-brand" />
        <input type="text" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="Endpoint URL" className="w-full bg-mc-bg border border-mc-border rounded-md px-3 py-1.5 text-xs text-mc-text focus:outline-none focus:border-mc-brand" />
        <div className="flex items-center gap-2">
          <input type="password" value={apiKey} onChange={(e) => setApiKeyInput(e.target.value)} placeholder="API Key（可选）" className="flex-1 bg-mc-bg border border-mc-border rounded-md px-3 py-1.5 text-xs text-mc-text focus:outline-none focus:border-mc-brand" />
          <Button variant="brand" size="sm" disabled={!name.trim() || !endpoint.trim()} onClick={async () => {
            const customId = 'custom_' + name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')
            const keyValue = apiKey.trim() || 'none'
            await setApiKey(customId, keyValue)
            const keys = { ...apiKeys, [customId]: keyValue }
            const existingRaw = await getAPI().settings.get('customProviders')
            const existing = safeJsonParse<any[]>(existingRaw, [])
            const updated = [...existing.filter((p: any) => p.id !== customId), { id: customId, name: name.trim(), endpoint: endpoint.trim(), type: 'openai-compatible' as const, models: [] }]
            await getAPI().settings.set('customProviders', JSON.stringify(updated))
            if (serverOk && apiKey.trim()) {
              const { mimoClient } = await import('@/lib/mimoClient')
              mimoClient.setAuth(customId, apiKey.trim()).catch(() => {})
            }
            onKeysUpdate(keys)
            setSaved(true)
          }}>添加</Button>
        </div>
      </div>
    </div>
  )
}

// === MiMo CLI Install ===
function MimoCliInstall() {
  const { status, version, log, progress, stepName, install, retry } = useMimoInstaller()

  if (status === 'checking') return <p className="text-2xs text-mc-text-muted">检测 MiMo CLI...</p>
  if (status === 'installed') return (
    <div className="flex items-center gap-2 text-2xs text-mc-success"><CheckCircle size={12} />MiMo CLI 已安装{version ? ` (v${version})` : ''}</div>
  )
  if (status === 'connecting') return (
    <div className="flex items-center gap-2 text-2xs text-mc-text-secondary"><Spinner size={12} />CLI 已安装，正在连接 MiMo 服务...</div>
  )
  if (status === 'installing') return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-2xs text-mc-text-secondary">
        {progress === null ? <Download size={12} className="animate-pulse text-mc-brand" /> : <span className="text-mc-brand text-xs font-medium">{progress}%</span>}
        正在安装 MiMo CLI...
      </div>
      {stepName && <p className="text-2xs text-mc-text-muted">{stepName}</p>}
      {progress !== null && (
        <div className="w-full bg-mc-elevated rounded-full h-1.5 overflow-hidden">
          <div className="bg-mc-brand h-1.5 rounded-full transition-all duration-300" style={{ width: `${Math.max(progress, 5)}%` }} />
        </div>
      )}
      {log && <pre className="text-2xs text-mc-text-muted bg-mc-bg rounded p-2 max-h-[40px] overflow-y-auto font-mono">{log.slice(-300)}</pre>}
    </div>
  )
  if (status === 'error') return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-2xs text-mc-error"><AlertCircle size={12} />安装失败</div>
      {log && <pre className="text-2xs text-mc-text-muted bg-mc-bg rounded p-2 max-h-[80px] overflow-y-auto font-mono">{log.slice(-300)}</pre>}
      <button onClick={retry} className="text-2xs text-mc-brand hover:underline">重试安装</button>
    </div>
  )
  return (
    <div className="space-y-2">
      <p className="text-2xs text-mc-text-muted">未安装 MiMo CLI — 安装后可获得完整 Agent 能力</p>
      <Button variant="brand" size="sm" icon={<Download size={12} />} onClick={install}>安装 MiMo CLI</Button>
    </div>
  )
}

// === About ===
function AboutTab() {
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error'>('idle')
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const [updateProgress, setUpdateProgress] = useState(0)

  useEffect(() => {
    if (!isElectron()) return
    const api = getAPI()
    const unsub1 = api.updater.onAvailable((data) => { setUpdateStatus('available'); setUpdateVersion(data.version) })
    const unsub2 = api.updater.onProgress((data) => { setUpdateStatus('downloading'); setUpdateProgress(Math.round(data.percent)) })
    const unsub3 = api.updater.onDownloaded((data) => { setUpdateStatus('downloaded'); setUpdateVersion(data.version) })
    return () => { unsub1(); unsub2(); unsub3() }
  }, [])

  const handleCheckUpdate = async () => {
    if (!isElectron()) return
    setUpdateStatus('checking')
    try {
      const result = await getAPI().updater.check()
      if (result.error) setUpdateStatus('error')
      else if (result.available) { setUpdateStatus('available'); setUpdateVersion(result.version || null) }
      else setUpdateStatus('up-to-date')
    } catch { setUpdateStatus('error') }
  }

  return (
    <div className="max-w-lg space-y-4">
      <div className="text-center py-4 space-y-2">
        <h2 className="text-lg font-light text-mc-text">MiMo Studio</h2>
        <p className="text-xs text-mc-text-muted">v{__APP_VERSION__}</p>
        <p className="text-2xs text-mc-text-muted">基于 MiMo Code 开源项目 · AI Agent 编码工作站</p>
      </div>
      <div className="mc-card p-4 space-y-2 text-xs text-mc-text-secondary">
        <div className="flex justify-between"><span className="text-mc-text-muted">Electron</span><span>35.x</span></div>
        <div className="flex justify-between"><span className="text-mc-text-muted">React</span><span>19.x</span></div>
        <div className="flex justify-between"><span className="text-mc-text-muted">数据目录</span><span className="text-mc-text-muted font-mono text-2xs">~/.mimocode/</span></div>
      </div>
      <div className="mc-card p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-mc-text-secondary">版本更新</span>
          {updateStatus === 'idle' && <Button variant="secondary" size="sm" onClick={handleCheckUpdate}>检查更新</Button>}
          {updateStatus === 'checking' && <Spinner size={12} tone="muted" />}
          {updateStatus === 'up-to-date' && <span className="text-2xs text-mc-success">已是最新版本</span>}
          {updateStatus === 'available' && <span className="text-2xs text-mc-brand">发现新版本 v{updateVersion}</span>}
          {updateStatus === 'downloading' && <span className="text-2xs text-mc-brand">下载中 {updateProgress}%</span>}
          {updateStatus === 'downloaded' && <Button variant="brand" size="sm" onClick={() => getAPI().updater.install()}>重启安装 v{updateVersion}</Button>}
          {updateStatus === 'error' && <Button variant="ghost" size="sm" onClick={handleCheckUpdate}>重试</Button>}
        </div>
      </div>
    </div>
  )
}
