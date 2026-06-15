import { useState, useEffect } from 'react'
import { isElectron, getAPI } from '@/lib/ipc'
import { useMimoInstaller } from '@/hooks/useMimoInstaller'
import { Settings as SettingsIcon, Palette, Info, Shield, RefreshCw, Download, AlertCircle, CheckCircle, Loader2 } from 'lucide-react'
import { useThemeStore, THEMES, type ThemeId } from '@/stores/themeStore'
import { useUIStore } from '@/stores/uiStore'
import { useChatStore } from '@/stores/chatStore'
import { PROVIDER_TEMPLATES } from '@/config/providerTemplates'

type SettingsTab = 'appearance' | 'providers' | 'about'

export default function SettingsView() {
  const settingsTab = useUIStore((s) => s.settingsTab)
  const setSettingsTab = useUIStore((s) => s.setSettingsTab)
  const [tab, setTab] = useState<SettingsTab>(settingsTab)

  // 当外部导航过来时同步 tab
  useEffect(() => {
    setTab(settingsTab)
  }, [settingsTab])

  const tabs: { id: SettingsTab; icon: typeof SettingsIcon; label: string }[] = [
    { id: 'appearance', icon: Palette, label: '外观' },
    { id: 'providers', icon: Shield, label: 'Provider' },
    { id: 'about', icon: Info, label: '关于' },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="h-[36px] drag" />
      <div className="flex items-center h-10 px-4 border-b border-mc-border-subtle">
        <div className="flex items-center gap-2">
          <SettingsIcon size={14} strokeWidth={1.5} className="text-mc-text-muted" />
          <span className="text-xs font-medium text-mc-text-secondary">设置</span>
        </div>
      </div>
      <div className="flex items-center gap-1 px-4 py-2 border-b border-mc-border-subtle/50">
        {tabs.map(({ id, icon: Icon, label }) => (
          <button key={id} onClick={() => { setTab(id); setSettingsTab(id) }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors ${tab === id ? 'bg-mc-elevated text-mc-text' : 'text-mc-text-muted hover:text-mc-text hover:bg-mc-hover'}`}
          >
            <Icon size={12} />{label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'appearance' && <AppearanceTab />}
        {tab === 'providers' && <ProvidersTab />}
        {tab === 'about' && <AboutTab />}
      </div>
    </div>
  )
}

// === Appearance ===
function AppearanceTab() {
  const { theme, setTheme } = useThemeStore()
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

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h3 className="text-xs font-medium text-mc-text mb-3">主题</h3>
        <div className="grid grid-cols-5 gap-2">
          {THEMES.map((t) => (
            <button key={t.id} onClick={() => setTheme(t.id)}
              className={`flex flex-col items-center gap-1.5 p-2 rounded-lg border transition-all ${theme === t.id ? 'border-mc-accent bg-mc-hover' : 'border-mc-border hover:border-mc-border-focus'}`}
            >
              <div className="w-full rounded overflow-hidden border border-mc-border-subtle">
                <div className="h-2" style={{ background: t.preview.bg }} />
                <div className="flex h-4">
                  <div className="w-1/3" style={{ background: t.preview.surface }} />
                  <div className="flex-1 flex flex-col gap-px p-0.5" style={{ background: t.preview.bg }}>
                    <div className="h-1 rounded-sm" style={{ background: t.preview.elevated }} />
                    <div className="h-1 rounded-sm w-3/4" style={{ background: t.preview.elevated }} />
                  </div>
                </div>
              </div>
              <span className="text-[10px] text-mc-text-muted">{t.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-xs font-medium text-mc-text mb-3">字体大小</h3>
        <div className="mc-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-mc-text-secondary">界面字号</span>
            <span className="text-xs text-mc-text-muted bg-mc-elevated px-2 py-0.5 rounded">{fontSize}px</span>
          </div>
          <input type="range" min={12} max={18} step={1} value={fontSize}
            onChange={(e) => handleFontSizeChange(parseInt(e.target.value, 10))}
            className="w-full accent-mc-accent"
          />
          <div className="flex justify-between text-[10px] text-mc-text-muted">
            <span>12px</span><span>18px</span>
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

  // 响应式：从 zustand 读取 server 状态（不再做一次性检查）
  const serverConnected = useChatStore((s) => s.serverConnected)
  const serverReady = useChatStore((s) => s.serverReady)
  const serverOk = serverConnected || serverReady

  useEffect(() => { loadKeys() }, [])

  const loadKeys = async () => {
    if (!isElectron()) return
    const raw = await getAPI().settings.get('apiKeys')
    const keys = raw ? JSON.parse(raw) : {}
    setApiKeys(keys)
    // 加载已配置 Provider 的动态模型
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
      } catch {}
      setFetchingModels(prev => ({ ...prev, [pid]: false }))
    }
    setDynamicModels(prev => ({ ...prev, ...newModels }))
  }

  const saveKey = async (id: string, key: string) => {
    if (!isElectron()) return
    setSaving(id)
    const keys = { ...apiKeys }
    if (key.trim()) {
      keys[id] = key.trim()
    } else {
      delete keys[id]
    }
    // 1. 存本地
    await getAPI().settings.set('apiKeys', JSON.stringify(keys))
    setApiKeys(keys)

    // 2. 如果 MiMo Serve 在线，同步到服务端
    if (serverOk) {
      try {
        const { mimoClient } = await import('@/lib/mimoClient')
        if (key.trim()) {
          await mimoClient.setAuth(id, key.trim())
        } else {
          await mimoClient.removeAuth(id).catch(() => {})
        }
      } catch { /* 服务端同步失败不阻塞 */ }
    }

    setSaving(null)

    // Key 变更后刷新模型列表
    if (key.trim()) {
      const { fetchModelsForProvider } = await import('@/lib/providerModels')
      setFetchingModels(prev => ({ ...prev, [id]: true }))
      try {
        const result = await fetchModelsForProvider(id, key.trim())
        if (result && result.fetched) {
          setDynamicModels(prev => ({
            ...prev,
            [id]: result.models.map(m => ({ id: m.id, name: m.name || m.id })),
          }))
        }
      } catch {}
      setFetchingModels(prev => ({ ...prev, [id]: false }))
    } else {
      setDynamicModels(prev => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      {/* MiMo */}
      <div>
        <h3 className="text-xs font-medium text-mc-text mb-3">MiMo Serve</h3>
        <div className={`mc-card p-4 space-y-3 ${serverOk ? 'border-mc-success/30' : ''}`}>
          <div className="flex items-center gap-3">
            <Shield size={16} strokeWidth={1.5} className={serverOk ? 'text-mc-success' : 'text-mc-text-muted'} />
            <div className="flex-1">
              <h4 className="text-xs font-medium text-mc-text">MiMo Auto</h4>
              <p className="text-[10px] text-mc-text-muted">官方免费模型，启动 mimo serve 即可使用完整 Agent 能力（工具调用/文件操作/权限）</p>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded ${serverOk ? 'text-mc-success bg-mc-success/10' : 'text-mc-text-muted bg-mc-elevated'}`}>
              {serverOk ? '已连接' : '未连接'}
            </span>
          </div>
          {!serverOk && <MimoCliInstall />}
        </div>
      </div>

      {/* 外部 Provider */}
      <div>
        <h3 className="text-xs font-medium text-mc-text mb-3">外部 Provider</h3>
        <p className="text-[10px] text-mc-text-muted mb-3">填入 API Key 后自动获取可用模型列表。Key 安全存储于本地。</p>
        <div className="space-y-2">
          {PROVIDER_TEMPLATES.slice(0, 7).map((tpl) => {
            const isConfigured = !!apiKeys[tpl.id]
            const dynModels = dynamicModels[tpl.id]
            const isFetching = fetchingModels[tpl.id]
            // 优先显示动态获取的模型，否则显示模板模型
            const displayModels = dynModels || tpl.models

            return (
            <div key={tpl.id} className={`mc-card p-4 ${isConfigured ? 'border-mc-success/20' : ''}`}>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Shield size={13} strokeWidth={1.5} className={isConfigured ? 'text-mc-success' : 'text-mc-text-muted'} />
                  <h4 className="text-xs font-medium text-mc-text">{tpl.name}</h4>
                  {isConfigured && <span className="text-[9px] text-mc-success bg-mc-success/5 px-1.5 py-0.5 rounded">已配置</span>}
                  {dynModels && <span className="text-[9px] text-mc-success bg-mc-success/5 px-1.5 py-0.5 rounded" title="已从 API 获取 {dynModels.length} 个模型">🔄 {dynModels.length} 个模型</span>}
                  {isFetching && <RefreshCw size={10} className="animate-spin text-mc-accent" />}
                  {tpl.website && (
                    <a href={tpl.website} target="_blank" rel="noopener"
                      className="text-[9px] text-mc-accent hover:underline ml-auto"
                    >获取 Key →</a>
                  )}
                </div>
                <p className="text-[10px] text-mc-text-muted font-mono">{tpl.endpoint}</p>
                <div className="flex flex-wrap gap-1">
                  {displayModels.map(m => (
                    <span key={m.id} className={`text-[9px] px-1.5 py-0.5 rounded ${dynModels ? 'text-mc-success bg-mc-success/5' : 'text-mc-text-muted bg-mc-elevated'}`}>{m.name}</span>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input type="password"
                    value={apiKeys[tpl.id] || ''}
                    onChange={(e) => saveKey(tpl.id, e.target.value)}
                    placeholder={apiKeys[tpl.id] ? '••••••••（已配置）' : `输入 ${tpl.envKey || tpl.name} API Key...`}
                    className="flex-1 bg-mc-bg border border-mc-border rounded-lg px-3 py-1.5 text-xs text-mc-text focus:outline-none focus:border-mc-border-focus"
                  />
                  {saving === tpl.id && <RefreshCw size={12} className="animate-spin text-mc-text-muted" />}
                </div>
              </div>
            </div>
            )
          })}

          {/* 自定义 Provider */}
          <CustomProviderCard
            apiKeys={apiKeys}
            serverOk={serverOk}
            onKeysUpdate={setApiKeys}
          />
        </div>
      </div>
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
  const [apiKey, setApiKey] = useState('')
  const [saved, setSaved] = useState(false)

  if (saved) {
    return (
      <div className="mc-card p-4 border-dashed">
        <div className="flex items-center gap-2 text-xs text-mc-success">
          <Shield size={13} />自定义 Provider 已添加，可在聊天中选择
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
          <span className="text-[9px] text-mc-text-muted bg-mc-elevated px-1.5 py-0.5 rounded">OpenAI 兼容</span>
        </div>
        <p className="text-[10px] text-mc-text-muted">支持任何 OpenAI 兼容 API（Ollama、vLLM、LocalAI 等）</p>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="显示名称（如 Ollama Local）"
          className="w-full bg-mc-bg border border-mc-border rounded-lg px-3 py-1.5 text-xs text-mc-text focus:outline-none focus:border-mc-border-focus"
        />
        <input type="text" value={endpoint} onChange={(e) => setEndpoint(e.target.value)}
          placeholder="Endpoint URL（如 http://localhost:11434/v1）"
          className="w-full bg-mc-bg border border-mc-border rounded-lg px-3 py-1.5 text-xs text-mc-text focus:outline-none focus:border-mc-border-focus"
        />
        <div className="flex items-center gap-2">
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder="API Key（本地部署可不填）"
            className="flex-1 bg-mc-bg border border-mc-border rounded-lg px-3 py-1.5 text-xs text-mc-text focus:outline-none focus:border-mc-border-focus"
          />
          <button
            onClick={async () => {
              if (!name.trim() || !endpoint.trim()) return
              const customId = 'custom_' + name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')
              // 保存到 apiKeys
              const keys = { ...apiKeys, [customId]: apiKey.trim() || 'none' }
              await getAPI().settings.set('apiKeys', JSON.stringify(keys))
              // 保存 Provider 元数据
              const existingRaw = await getAPI().settings.get('customProviders')
              const existing = existingRaw ? JSON.parse(existingRaw) : []
              const updated = [...existing.filter((p: any) => p.id !== customId), { id: customId, name: name.trim(), endpoint: endpoint.trim(), type: 'openai-compatible' as const, models: [] }]
              await getAPI().settings.set('customProviders', JSON.stringify(updated))
              // 同步到服务端
              if (serverOk && apiKey.trim()) {
                const { mimoClient } = await import('@/lib/mimoClient')
                mimoClient.setAuth(customId, apiKey.trim()).catch(() => {})
              }
              onKeysUpdate(keys)
              setSaved(true)
            }}
            disabled={!name.trim() || !endpoint.trim()}
            className="px-3 py-1.5 text-xs bg-mc-accent text-white rounded-lg hover:opacity-90 disabled:opacity-30 transition-opacity whitespace-nowrap"
          >
            添加
          </button>
        </div>
      </div>
    </div>
  )
}

// === MiMo CLI Install ===
function MimoCliInstall() {
  const { status, version, log, progress, stepName, install, retry } = useMimoInstaller()

  if (status === 'checking') return <p className="text-[10px] text-mc-text-muted">检测 MiMo CLI...</p>
  if (status === 'installed') return (
    <div className="flex items-center gap-2 text-[10px] text-mc-success"><CheckCircle size={12} />MiMo CLI 已安装{version ? ` (v${version})` : ''}</div>
  )
  if (status === 'connecting') return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[10px] text-mc-text-secondary">
        <Loader2 size={12} className="animate-spin text-mc-accent" />CLI 已安装，正在连接 MiMo 服务...
      </div>
    </div>
  )
  if (status === 'installing') return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[10px] text-mc-text-secondary">
        {progress === null ? (
          <Download size={12} className="animate-pulse text-mc-accent" />
        ) : (
          <span className="text-mc-accent text-xs font-medium">{progress}%</span>
        )}
        正在安装 MiMo CLI...
      </div>
      {stepName && <p className="text-[9px] text-mc-text-muted">{stepName}</p>}
      {progress !== null && (
        <div className="w-full bg-mc-elevated rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-mc-accent h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${Math.max(progress, 5)}%` }}
          />
        </div>
      )}
      {log ? <pre className="text-[9px] text-mc-text-muted bg-mc-bg rounded p-2 max-h-[40px] overflow-y-auto font-mono">{log.slice(-300)}</pre> : null}
    </div>
  )
  if (status === 'error') return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[10px] text-mc-error"><AlertCircle size={12} />安装失败</div>
      {log ? <pre className="text-[9px] text-mc-text-muted bg-mc-bg rounded p-2 max-h-[80px] overflow-y-auto font-mono">{log.slice(-300)}</pre> : null}
      <button onClick={retry} className="text-[10px] text-mc-accent hover:underline">重试安装</button>
    </div>
  )
  return (
    <div className="space-y-2">
      <p className="text-[10px] text-mc-text-muted">未安装 MiMo CLI — 安装后可获得完整 Agent 能力（工具调用、文件操作、技能系统等）</p>
      <button onClick={install} className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-lg bg-mc-accent text-white hover:opacity-90 transition-opacity">
        <Download size={12} />安装 MiMo CLI
      </button>
    </div>
  )
}

// === About ===
function AboutTab() {
  return (
    <div className="max-w-lg space-y-4">
      <div className="text-center py-4 space-y-2">
        <h2 className="text-lg font-light text-mc-text">MiMo Studio</h2>
        <p className="text-xs text-mc-text-muted">v1.0.0</p>
        <p className="text-[10px] text-mc-text-muted">基于 MiMo Code 开源项目 · AI Agent 编码工作站</p>
      </div>
      <div className="mc-card p-4 space-y-2 text-xs text-mc-text-secondary">
        <div className="flex justify-between">
          <span className="text-mc-text-muted">Electron</span>
          <span>35.x</span>
        </div>
        <div className="flex justify-between">
          <span className="text-mc-text-muted">React</span>
          <span>19.x</span>
        </div>
        <div className="flex justify-between">
          <span className="text-mc-text-muted">数据目录</span>
          <span className="text-mc-text-muted font-mono text-[10px]">~/.mimocode/</span>
        </div>
      </div>
    </div>
  )
}
