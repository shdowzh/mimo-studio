// 共享的 MiMo CLI 安装 Hook
// SettingsView (MimoCliInstall) 和 Onboarding (Step 2) 共用

import { useState, useEffect } from 'react'
import { isElectron } from '@/lib/ipc'

export type InstallStatus = 'checking' | 'installed' | 'not-installed' | 'installing' | 'error' | 'connecting'

export interface UseMimoInstallerResult {
  status: InstallStatus
  version: string
  log: string
  progress: number | null
  stepName: string
  install: () => Promise<void>
  retry: () => Promise<void>
}

export function useMimoInstaller(autoCheck = true): UseMimoInstallerResult {
  const [status, setStatus] = useState<InstallStatus>('checking')
  const [version, setVersion] = useState('')
  const [log, setLog] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [stepName, setStepName] = useState('')

  // 从进度日志中解析百分比和步骤名
  const parseProgress = (fullLog: string) => {
    const lines = fullLog.split('\n')
    for (let i = lines.length - 1; i >= 0; i--) {
      const pctMatch = lines[i].match(/(\d+)%/)
      if (pctMatch) {
        setProgress(parseInt(pctMatch[1], 10))
        break
      }
    }
    if (fullLog.includes('下载完成') || fullLog.includes('解压')) setStepName('正在解压...')
    else if (fullLog.includes('安装完成')) setStepName('安装完成')
    else if (fullLog.includes('下载')) setStepName('正在下载...')
  }

  // 自动检测
  useEffect(() => {
    if (!autoCheck) return
    if (!isElectron()) {
      setStatus('not-installed')
      return
    }
    const api = (window as any).electronAPI
    api?.mimo?.detect?.()
      .then((r: any) => {
        if (r?.installed) { setStatus('installed'); setVersion(r.version || '') }
        else { setStatus('not-installed') }
      })
      .catch(() => setStatus('not-installed'))
  }, [autoCheck])

  const install = async () => {
    if (!isElectron()) return
    setStatus('installing')
    setLog('')
    setProgress(null)
    setStepName('')

    const api = (window as any).electronAPI
    const unsub = api?.mimo?.onInstallProgress?.((d: any) => {
      const newData = (d.stdout || d.stderr || '')
      setLog(p => {
        const updated = p + newData
        parseProgress(updated)
        return updated
      })
    })

    try {
      await api?.mimo?.install?.()
      const r = await api?.mimo?.detect?.()
      if (r?.installed) {
        setStatus('connecting')
        setVersion(r.version || '')
        // 安装成功后自动连接服务器
        try {
          const { connectToServer } = await import('@/lib/api')
          await connectToServer()
        } catch {}
        setStatus('installed')
      } else {
        setStatus('error')
      }
    } catch (e: any) {
      setStatus('error')
      setLog(p => p + '\n' + (e?.message || 'Unknown error'))
    } finally {
      unsub?.()
    }
  }

  const retry = async () => {
    await install()
  }

  return { status, version, log, progress, stepName, install, retry }
}
