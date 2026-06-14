// 聊天顶栏 — 只显示已配置的模型，默认 MiMo Auto

import { useChatStore } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'
import { PanelLeft, Wifi, WifiOff, ChevronDown, Settings, Key, RefreshCw, Check } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { mimoClient } from '@/lib/mimoClient'
import { fetchDynamicModels } from '@/lib/providerModels'

interface ModelOption {
  providerId: string
  modelId: string
  label: string
  providerName: string
  source: 'mimo' | 'dynamic' | 'template'
}

export default function ChatHeader() {
  const currentSessionID = useChatStore((s) => s.currentSessionID)
  const sessions = useChatStore((s) => s.sessions)
  const sessionStatus = useChatStore((s) => currentSessionID ? s.sessionStatus[currentSessionID] : undefined)
  const serverConnected = useChatStore((s) => s.serverConnected)
  const currentProvider = useChatStore((s) => s.currentProvider)
  const currentModel = useChatStore((s) => s.currentModel)
  const setModel = useChatStore((s) => s.setModel)
  const { toggleConversationList } = useUIStore()

  const [pickerOpen, setPickerOpen] = useState(false)
  const [mimoModels, setMimoModels] = useState<ModelOption[]>([])
  const [configuredModels, setConfiguredModels] = useState<ModelOption[]>([])
  const [modelsLoading, setModelsLoading] = useState(true)
  const pickerRef = useRef<HTMLDivElement>(null)

  const currentSession = sessions.find(s => s.id === currentSessionID)
  const isBusy = sessionStatus?.type === 'busy'

  // 加载可用模型（挂载时 + serverConnected 变化时）
  useEffect(() => {
    let cancelled = false
    async function load() {
      setModelsLoading(true)
      await loadModels()
      if (!cancelled) setModelsLoading(false)
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverConnected])

  useEffect(() => {
    if (!pickerOpen) return
    const h = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [pickerOpen])

  const loadModels = async () => {
    const mimo: ModelOption[] = []
    const configured: ModelOption[] = []

    // MiMo 始终可选（即使离线也显示，方便用户知道需要连接 MiMo Serve）
    mimo.push({
      providerId: 'mimo', modelId: '',
      label: serverConnected ? 'MiMo Auto（默认）' : 'MiMo Auto（需连接 MiMo Serve）',
      providerName: 'MiMo', source: 'mimo',
    })

    // MiMo Serve 在线 — 从服务端获取 Provider 列表
    if (serverConnected) {
      try {
        const data: any = await mimoClient.listProviders()
        const all: any[] = Array.isArray(data) ? data : (data.all || [])
        for (const p of all) {
          const modelsRaw: any = p.models || {}
          const modelList: any[] = Array.isArray(modelsRaw) ? modelsRaw : Object.values(modelsRaw)
          for (const m of modelList) {
            if (!m.id) continue
            const isMimoProvider = p.id === 'mimo' || p.id === 'opencode'
            if (isMimoProvider) {
              // 替换默认 MiMo 条目
              if (mimo.length === 1 && mimo[0].modelId === '') mimo.length = 0
              mimo.push({ providerId: p.id, modelId: m.id, label: m.name || m.id, providerName: p.name, source: 'mimo' })
            } else {
              configured.push({ providerId: p.id, modelId: m.id, label: `${p.name} · ${m.name || m.id}`, providerName: p.name, source: 'dynamic' })
            }
          }
        }
      } catch { /* 服务端获取失败，继续用 fallback */ }
    }

    // 离线或不完整的 Provider — 从本地 API Key 动态获取
    if (!serverConnected || configured.length === 0) {
      try {
        const dynamicProviders = await fetchDynamicModels()
        // 去重：跳过已在 server 列表中出现的 provider
        const serverProviderIds = new Set(configured.map(m => m.providerId))
        for (const dp of dynamicProviders) {
          if (serverProviderIds.has(dp.providerId)) continue
          const source = dp.fetched ? 'dynamic' as const : 'template' as const
          for (const m of dp.models) {
            configured.push({
              providerId: dp.providerId, modelId: m.id,
              label: `${dp.providerName} · ${m.name || m.id}`,
              providerName: dp.providerName, source,
            })
          }
        }
      } catch {}
    }

    setMimoModels(mimo)
    setConfiguredModels(configured)

    // 设置默认值
    if (!currentModel) {
      if (mimo.length > 0) setModel(mimo[0].providerId, mimo[0].modelId)
      else if (configured.length > 0) setModel(configured[0].providerId, configured[0].modelId)
    }
  }

  const handleSelect = (opt: ModelOption) => {
    setModel(opt.providerId, opt.modelId)
    setPickerOpen(false)
  }

  const allOptions = [
    // MiMo 模型（始终显示）
    ...(mimoModels.length > 0 ? [{ label: serverConnected ? 'MiMo Serve' : 'MiMo（需连接 MiMo Serve）', items: mimoModels }] : []),
    // 外部 Provider
    ...(configuredModels.length > 0 ? [{ label: '外部 Provider', items: configuredModels }] : []),
  ]

  // 判断模型是否当前选中（动态计算，确保切换后立即反映）
  const isActive = (opt: ModelOption) =>
    currentProvider === opt.providerId && currentModel === opt.modelId

  // 当前显示名 + ID 以便验证
  const activeOption = allOptions.flatMap(g => g.items).find(o => isActive(o))
  const displayName = activeOption?.label || (serverConnected ? 'MiMo Auto' : '选择模型')
  const displayDetail = activeOption
    ? `${activeOption.providerId}/${activeOption.modelId || 'auto'}`
    : ''

  return (
    <div className="flex items-center justify-between h-10 px-3 border-b border-mc-border-subtle drag">
      <div className="flex items-center gap-2 no-drag">
        {!useUIStore.getState().conversationListOpen && (
          <button onClick={toggleConversationList} className="p-1.5 text-mc-text-muted hover:text-mc-text hover:bg-mc-hover rounded transition-colors" title="展开对话列表">
            <PanelLeft size={14} strokeWidth={1.5} />
          </button>
        )}
        <span className="text-xs font-medium text-mc-text-secondary truncate max-w-[200px]">
          {currentSession?.title || 'MiMo Studio'}
        </span>
        {isBusy && (
          <span className="flex items-center gap-1 text-[10px] text-mc-accent">
            <span className="w-1 h-1 rounded-full bg-mc-accent animate-pulse" />Agent
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 no-drag">
        <div className="text-[10px]">
          {serverConnected ? <Wifi size={10} className="text-mc-success" /> : <WifiOff size={10} className="text-mc-error" />}
        </div>

        {/* Model Picker */}
        <div className="relative" ref={pickerRef}>
          <button
            onClick={() => setPickerOpen(!pickerOpen)}
            className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md hover:bg-mc-hover transition-colors"
            title={`当前: ${displayDetail || '未选择'}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${serverConnected ? 'bg-mc-success' : configuredModels.length > 0 ? 'bg-mc-accent' : 'bg-mc-error'}`} />
            <span className="max-w-[120px] truncate text-mc-text">{displayName}</span>
            {displayDetail && <span className="text-[9px] text-mc-text-muted truncate max-w-[100px] hidden sm:inline">{displayDetail}</span>}
            <ChevronDown size={10} className={`transition-transform text-mc-text-muted ${pickerOpen ? 'rotate-180' : ''}`} />
          </button>

          {pickerOpen && (
            <div className="absolute right-0 mt-1 w-72 bg-mc-surface border border-mc-border rounded-lg shadow-xl z-50 py-1 animate-fade-in max-h-[420px] overflow-y-auto">
              {allOptions.map((group, gi) => (
                <div key={gi}>
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-mc-text-muted uppercase tracking-wider border-b border-mc-border-subtle/50">
                    {group.label}
                    {group.label === 'MiMo Serve' && <span className="ml-1 text-mc-success normal-case font-normal">✓</span>}
                  </div>
                  {group.items.map((opt) => (
                    <button
                      key={opt.providerId + '/' + opt.modelId}
                      onClick={() => handleSelect(opt)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                        isActive(opt)
                          ? 'bg-mc-accent/15 text-mc-text font-medium'
                          : 'text-mc-text-secondary hover:bg-mc-hover hover:text-mc-text'
                      }`}
                    >
                      <span className="w-4 shrink-0 flex justify-center">
                        {isActive(opt) ? <Check size={12} className="text-mc-accent" /> : null}
                      </span>
                      <span className="flex-1 text-left truncate">{opt.label}</span>
                      {opt.source === 'dynamic' && <RefreshCw size={9} className="text-mc-success shrink-0" />}
                      {opt.source === 'template' && <Key size={9} className="text-mc-text-muted shrink-0" />}
                    </button>
                  ))}
                </div>
              ))}

              {allOptions.length === 0 && (
                <div className="px-3 py-4 text-center text-[11px] text-mc-text-muted">
                  {modelsLoading ? (
                    <p className="flex items-center justify-center gap-2">
                      <RefreshCw size={10} className="animate-spin" />加载模型列表...
                    </p>
                  ) : (
                    <>
                      <p>暂无可用模型</p>
                      <button
                        onClick={() => { setPickerOpen(false); useUIStore.getState().setCurrentView('settings'); useUIStore.getState().setSettingsTab('providers') }}
                        className="mt-1 text-mc-accent hover:underline"
                      >
                        去设置配置 API Key →
                      </button>
                    </>
                  )}
                </div>
              )}

              <div className="border-t border-mc-border mt-1 pt-1">
                <button
                  onClick={() => { setPickerOpen(false); useUIStore.getState().setCurrentView('settings'); useUIStore.getState().setSettingsTab('providers') }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-mc-text-muted hover:text-mc-text hover:bg-mc-hover transition-colors"
                >
                  <Settings size={11} />管理 Provider 配置
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

