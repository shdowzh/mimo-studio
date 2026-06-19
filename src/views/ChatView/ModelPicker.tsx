// 模型选择器 — 从 ChatHeader 抽出来，供 MessageInput 底部工具栏使用

import { useState, useEffect, useRef } from 'react'
import { ChevronDown, Settings, Key, RefreshCw, Check, Circle } from 'lucide-react'
import { useChatStore } from '@/stores/chatStore'
import { useUIStore } from '@/stores/uiStore'
import { mimoClient } from '@/lib/mimoClient'
import { fetchDynamicModels } from '@/lib/providerModels'
import Spinner from '@/components/ui/Spinner'

interface ModelOption {
  providerId: string
  modelId: string
  label: string
  providerName: string
  source: 'mimo' | 'dynamic' | 'template'
}

interface ModelPickerProps {
  variant?: 'default' | 'compact'
}

export default function ModelPicker({ variant = 'default' }: ModelPickerProps) {
  const serverConnected = useChatStore((s) => s.serverState.status !== 'disconnected')
  const currentProvider = useChatStore((s) => s.currentProvider)
  const currentModel = useChatStore((s) => s.currentModel)
  const setModel = useChatStore((s) => s.setModel)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [mimoModels, setMimoModels] = useState<ModelOption[]>([])
  const [configuredModels, setConfiguredModels] = useState<ModelOption[]>([])
  const [modelsLoading, setModelsLoading] = useState(true)
  const pickerRef = useRef<HTMLDivElement>(null)

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

    mimo.push({
      providerId: 'mimo', modelId: '',
      label: serverConnected ? 'MiMo Auto（默认）' : 'MiMo Auto（需连接 MiMo Serve）',
      providerName: 'MiMo', source: 'mimo',
    })

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
              if (mimo.length === 1 && mimo[0].modelId === '') mimo.length = 0
              mimo.push({ providerId: p.id, modelId: m.id, label: m.name || m.id, providerName: p.name, source: 'mimo' })
            } else {
              configured.push({ providerId: p.id, modelId: m.id, label: `${p.name} · ${m.name || m.id}`, providerName: p.name, source: 'dynamic' })
            }
          }
        }
      } catch { }
    }

    if (!serverConnected || configured.length === 0) {
      try {
        const dynamicProviders = await fetchDynamicModels()
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
      } catch { }
    }

    setMimoModels(mimo)
    setConfiguredModels(configured)

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
    ...(mimoModels.length > 0 ? [{ label: serverConnected ? 'MiMo Code 模型' : 'MiMo（需连接 MiMo Serve）', items: mimoModels }] : []),
    ...(configuredModels.length > 0 ? [{ label: serverConnected ? '更多模型（经 MiMo Code）' : '离线可用（仅文本）', items: configuredModels }] : []),
  ]

  const isActive = (opt: ModelOption) => currentProvider === opt.providerId && currentModel === opt.modelId

  const activeOption = allOptions.flatMap(g => g.items).find(o => isActive(o))
  const displayName = activeOption?.label || (serverConnected ? 'MiMo Auto' : '选择模型')

  const isCompact = variant === 'compact'

  return (
    <div className="relative" ref={pickerRef}>
      <button
        onClick={() => setPickerOpen(!pickerOpen)}
        className={
          'flex items-center gap-1.5 rounded-lg border transition-colors ' +
          (isCompact
            ? 'px-2 py-1 text-2xs bg-mc-elevated/50 border-mc-border-subtle hover:border-mc-border'
            : 'px-2.5 py-1.5 text-xs bg-mc-surface border-mc-border-subtle hover:border-mc-border')
        }
        title={`当前: ${activeOption ? `${activeOption.providerId}/${activeOption.modelId || 'auto'}` : '未选择'}`}
      >
        <Circle
          size={isCompact ? 8 : 10}
          className={serverConnected ? 'text-mc-success fill-mc-success' : configuredModels.length > 0 ? 'text-mc-brand fill-mc-brand' : 'text-mc-error fill-mc-error'}
        />
        <span className={`truncate text-mc-text ${isCompact ? 'max-w-[140px]' : 'max-w-[200px]'}`}>{displayName}</span>
        <ChevronDown size={isCompact ? 10 : 11} className={`text-mc-text-muted transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
      </button>

      {pickerOpen && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-72 bg-mc-surface border border-mc-border rounded-xl shadow-xl z-50 py-1 animate-fade-in max-h-[420px] overflow-y-auto">
          {allOptions.map((group, gi) => (
            <div key={gi}>
              <div className="px-3 py-1.5 text-2xs font-semibold text-mc-text-muted uppercase tracking-wider border-b border-mc-border-subtle/50">
                {group.label}
                {serverConnected && group.items === mimoModels && group.items.length > 0 && group.items[0]?.providerId === 'mimo' && <span className="ml-1 text-mc-success normal-case font-normal">✓</span>}
              </div>
              {group.items.map((opt) => (
                <button
                  key={opt.providerId + '/' + opt.modelId}
                  onClick={() => handleSelect(opt)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                    isActive(opt)
                      ? 'bg-mc-bg-active text-mc-brand-text font-medium'
                      : 'text-mc-text-secondary hover:bg-mc-hover hover:text-mc-text'
                  }`}
                >
                  <span className="w-4 shrink-0 flex justify-center">
                    {isActive(opt) ? <Check size={12} className="text-mc-brand" /> : null}
                  </span>
                  <span className="flex-1 text-left truncate">{opt.label}</span>
                  {opt.source === 'dynamic' && <RefreshCw size={9} className="text-mc-success shrink-0" />}
                  {opt.source === 'template' && <Key size={9} className="text-mc-text-muted shrink-0" />}
                </button>
              ))}
            </div>
          ))}

          {allOptions.length === 0 && (
            <div className="px-3 py-4 text-center text-2xs text-mc-text-muted">
              {modelsLoading ? (
                <p className="flex items-center justify-center gap-2">
                  <Spinner size={10} tone="muted" />加载模型列表...
                </p>
              ) : (
                <>
                  <p>暂无可用模型</p>
                  <button
                    onClick={() => { setPickerOpen(false); useUIStore.getState().setCurrentView('settings'); useUIStore.getState().setSettingsTab('providers') }}
                    className="mt-1 text-mc-brand hover:underline"
                  >
                    去设置配置 API Key →
                  </button>
                </>
              )}
            </div>
          )}

          <div className="border-t border-mc-border-subtle mt-1 pt-1">
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
  )
}
