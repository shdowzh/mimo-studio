import { useState, useEffect } from 'react'
import { isElectron, getAPI } from '@/lib/ipc'
import { MessageSquare, Download, CheckCircle, AlertCircle, ChevronRight, SkipForward, Loader2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useMimoInstaller } from '@/hooks/useMimoInstaller'

interface OnboardingProps {
  onComplete: () => void
}

type Step = 1 | 2 | 3

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<Step>(1)
  const [skipped, setSkipped] = useState(false)
  const { status: mimoStatus, version: mimoVersion, log: installLog, progress, stepName, install: installMimo, retry: retryMimo } = useMimoInstaller(false)

  // Step 2: 检测 mimo CLI
  useEffect(() => {
    if (step !== 2) return
    if (!isElectron()) return

    const api = (window as any).electronAPI
    api?.mimo?.detect?.()
      .then((result: any) => {
        if (result?.installed) {
          // 已安装自动跳下一步
          setTimeout(() => setStep(3), 800)
        }
      })
      .catch(() => {})
  }, [step])

  const handleInstallMimo = async () => {
    await installMimo()
  }

  const handleSkip = () => {
    setSkipped(true)
    setStep(3)
  }

  const handleComplete = async () => {
    if (isElectron()) {
      await getAPI().settings.set('first-launch', 'false')
    }
    onComplete()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-mc-bg">
      <div className="w-full max-w-md mx-4">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1 rounded-full transition-all duration-300 ${
                s <= step ? 'w-8 bg-mc-brand' : 'w-4 bg-mc-border'
              }`}
            />
          ))}
        </div>

        {/* Step 1: Welcome */}
        {step === 1 && (
          <div className="text-center space-y-6 animate-fade-in">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-2xl bg-mc-brand-soft flex items-center justify-center">
                <MessageSquare size={28} strokeWidth={1.5} className="text-mc-brand" />
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-light text-mc-text">MiMo Studio</h1>
              <p className="text-sm text-mc-text-muted">AI Agent 编码工作站</p>
            </div>
            <div className="space-y-2 text-left max-w-xs mx-auto">
              {[
                '内置 MiMo 免费模型',
                'Agent 工作流集成',
                '技能 & MCP 扩展',
              ].map((feature) => (
                <div key={feature} className="flex items-center gap-2 text-xs text-mc-text-secondary">
                  <CheckCircle size={12} className="text-mc-success flex-shrink-0" />
                  {feature}
                </div>
              ))}
            </div>
            <Button variant="brand" size="lg" onClick={() => setStep(2)} className="w-full">
              开始使用
              <ChevronRight size={14} />
            </Button>
          </div>
        )}

        {/* Step 2: MiMo CLI */}
        {step === 2 && (
          <div className="text-center space-y-6 animate-fade-in">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-2xl bg-mc-elevated flex items-center justify-center">
                <Download size={28} strokeWidth={1.5} className="text-mc-text-muted" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-light text-mc-text">MiMo CLI</h2>
              <p className="text-sm text-mc-text-muted max-w-xs mx-auto">
                MiMo CLI 提供 mimo serve 本地代理，确保聊天功能稳定运行
              </p>
            </div>

            {/* Status display */}
            <div className="mc-card rounded-2xl p-4 space-y-3">
              {mimoStatus === 'checking' && (
                <div className="flex items-center gap-2 justify-center">
                  <span className="w-2 h-2 bg-mc-text-muted rounded-full animate-pulse" />
                  <span className="text-xs text-mc-text-muted">检测中...</span>
                </div>
              )}

              {mimoStatus === 'installed' && (
                <div className="flex items-center gap-2 justify-center">
                  <CheckCircle size={16} className="text-mc-success" />
                  <span className="text-xs text-mc-success">
                    已安装 {mimoVersion && `(v${mimoVersion})`}
                  </span>
                </div>
              )}

              {mimoStatus === 'not-installed' && (
                <div className="space-y-3">
                  <p className="text-xs text-mc-text-secondary">未检测到 MiMo CLI</p>
                  <Button variant="brand" size="sm" onClick={handleInstallMimo} className="w-full">
                    安装 MiMo CLI
                  </Button>
                </div>
              )}

              {mimoStatus === 'installing' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 justify-center">
                    {progress === null ? (
                      <Download size={14} className="text-mc-brand animate-pulse" />
                    ) : (
                      <span className="text-sm font-medium text-mc-brand">{progress}%</span>
                    )}
                    <span className="text-xs text-mc-text-secondary">正在安装...</span>
                  </div>
                  {stepName && <p className="text-[10px] text-mc-text-muted text-center">{stepName}</p>}
                  {progress !== null && (
                    <div className="w-full bg-mc-elevated rounded-full h-1.5 overflow-hidden">
                      <div className="bg-mc-brand h-1.5 rounded-full transition-all duration-300" style={{ width: `${Math.max(progress, 5)}%` }} />
                    </div>
                  )}
                  {installLog && (
                    <pre className="text-[9px] text-mc-text-muted bg-mc-bg rounded p-2 max-h-[60px] overflow-y-auto text-left font-mono">
                      {installLog.slice(-200)}
                    </pre>
                  )}
                </div>
              )}

              {mimoStatus === 'connecting' && (
                <div className="flex items-center gap-2 justify-center">
                  <Loader2 size={14} className="text-mc-brand animate-spin" />
                  <span className="text-xs text-mc-text-secondary">CLI 已安装，正在连接 MiMo 服务...</span>
                </div>
              )}

              {mimoStatus === 'error' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 justify-center">
                    <AlertCircle size={14} className="text-mc-error" />
                    <span className="text-xs text-mc-error">安装失败</span>
                  </div>
                  {installLog && (
                    <pre className="text-[9px] text-mc-text-muted bg-mc-bg rounded p-2 max-h-[60px] overflow-y-auto text-left font-mono">
                      {installLog.slice(-200)}
                    </pre>
                  )}
                  <Button variant="secondary" size="sm" onClick={retryMimo} className="w-full">
                    重试安装
                  </Button>
                </div>
              )}
            </div>

            <p className="text-[10px] text-mc-text-muted">
              不安装也可以使用 MiMo Free 聊天，但推荐安装以获得最佳体验
            </p>

            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleSkip} className="flex-1" icon={<SkipForward size={10} />}>
                跳过
              </Button>
              {mimoStatus === 'installed' && (
                <Button variant="brand" size="sm" onClick={() => setStep(3)} className="flex-1">
                  下一步
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Done */}
        {step === 3 && (
          <div className="text-center space-y-6 animate-fade-in">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-2xl bg-mc-elevated flex items-center justify-center">
                <CheckCircle size={28} strokeWidth={1.5} className="text-mc-success" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-light text-mc-text">准备就绪</h2>
              <p className="text-sm text-mc-text-muted">所有基础配置已完成</p>
            </div>

            {/* Checklist */}
            <div className="mc-card rounded-2xl p-4 space-y-2.5 text-left">
              <CheckItem label="MiMo API 已配置" done />
              <CheckItem label="默认模型：MiMo" done />
              <CheckItem label="MiMo 工作流技能已创建" done />
              <CheckItem
                label={skipped ? 'MiMo CLI（已跳过）' : mimoStatus === 'installed' ? `MiMo CLI 已安装${mimoVersion ? ` (v${mimoVersion})` : ''}` : 'MiMo CLI（未安装）'}
                done={mimoStatus === 'installed'}
                warn={skipped || mimoStatus !== 'installed'}
              />
            </div>

            <Button variant="brand" size="lg" onClick={handleComplete} className="w-full">
              开始聊天
              <ChevronRight size={14} />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function CheckItem({ label, done, warn }: { label: string; done: boolean; warn?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {done ? (
        <CheckCircle size={12} className="text-mc-success flex-shrink-0" />
      ) : warn ? (
        <AlertCircle size={12} className="text-mc-warning flex-shrink-0" />
      ) : (
        <span className="w-3 h-3 rounded-full border border-mc-border flex-shrink-0" />
      )}
      <span className={`text-xs ${done ? 'text-mc-text-secondary' : warn ? 'text-mc-warning' : 'text-mc-text-muted'}`}>
        {label}
      </span>
    </div>
  )
}
