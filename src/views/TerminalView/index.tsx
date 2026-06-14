// 终端视图 — mimo serve PTY WebSocket / 本地 shell

import { useEffect, useRef, useState } from 'react'
import { isElectron, getAPI } from '@/lib/ipc'
import { mimoClient } from '@/lib/mimoClient'
import { AlertCircle } from 'lucide-react'

export default function TerminalView() {
  const [serverConnected, setServerConnected] = useState(false)
  const [ptyReady, setPtyReady] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const terminalRef = useRef<HTMLDivElement>(null)
  const terminalInstRef = useRef<any>(null)

  useEffect(() => {
    const check = async () => {
      try { setServerConnected(await mimoClient.isAvailable()) }
      catch { setServerConnected(false) }
    }
    check()
    const i = setInterval(check, 10000)
    return () => clearInterval(i)
  }, [])

  useEffect(() => {
    if (!terminalRef.current) return
    let cancelled = false
    let cleanup: (() => void) | undefined

    async function setup() {
      setErrorMsg(null)
      setPtyReady(false)
      if (serverConnected) {
        cleanup = await setupPty()
      } else {
        cleanup = await setupLocal()
      }
      if (cancelled) cleanup?.()
    }
    setup()

    return () => { cancelled = true; cleanup?.() }
  }, [serverConnected])

  async function setupPty(): Promise<() => void> {
    try {
      const { Terminal } = await import('xterm')
      const { FitAddon } = await import('xterm-addon-fit')
      if (!terminalRef.current) return () => {}

      const term = new Terminal({
        cursorBlink: true, fontSize: 13,
        fontFamily: "'Cascadia Code', 'Fira Code', monospace",
        theme: { background: '#0d0d0d', foreground: '#cccccc', cursor: '#cccccc', selectionBackground: '#3a3a3a' },
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(terminalRef.current)
      fit.fit()
      terminalInstRef.current = term

      const pty = await mimoClient.createPty({})
      const ws = mimoClient.connectPty(pty.id)
      ws.binaryType = 'arraybuffer'

      ws.onmessage = (e) => {
        try {
          if (e.data instanceof ArrayBuffer) term.write(new Uint8Array(e.data))
          else if (typeof e.data === 'string') term.write(e.data)
        } catch {}
      }
      ws.onopen = () => setPtyReady(true)
      ws.onclose = () => { setPtyReady(false); term.writeln('\r\n\x1b[33mPTY 连接已关闭\x1b[0m') }
      ws.onerror = () => { setErrorMsg('PTY WebSocket 错误'); term.writeln('\r\n\x1b[31mPTY 连接错误\x1b[0m') }

      term.onData((d: string) => { if (ws.readyState === WebSocket.OPEN) ws.send(d) })

      const onResize = () => { try { fit.fit() } catch {} }
      window.addEventListener('resize', onResize)

      return () => { ws.close(); term.dispose(); window.removeEventListener('resize', onResize) }
    } catch (err: any) {
      setErrorMsg(`PTY 创建失败: ${err.message || err}`)
      // 回退到本地终端
      return setupLocal()
    }
  }

  async function setupLocal(): Promise<() => void> {
    if (!isElectron()) {
      setErrorMsg('非 Electron 环境，终端不可用')
      return () => {}
    }
    try {
      const { Terminal } = await import('xterm')
      const { FitAddon } = await import('xterm-addon-fit')
      if (!terminalRef.current) return () => {}

      const term = new Terminal({
        cursorBlink: true, fontSize: 13,
        fontFamily: "'Cascadia Code', 'Fira Code', monospace",
        theme: { background: '#0d0d0d', foreground: '#cccccc', cursor: '#cccccc', selectionBackground: '#3a3a3a' },
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(terminalRef.current)
      fit.fit()
      terminalInstRef.current = term

      const api = getAPI()
      const id = await api.terminal.create({})
      setPtyReady(true)

      const unsub = api.terminal.onData(id, (data: string) => { term.write(data) })
      const unsubExit = api.terminal.onExit(id, () => { term.writeln('\r\n\x1b[33m进程已退出\x1b[0m'); setPtyReady(false) })

      term.onData((d: string) => { api.terminal.write(id, d) })

      const onResize = () => { try { fit.fit() } catch {} }
      window.addEventListener('resize', onResize)

      return () => { unsub(); unsubExit(); api.terminal.kill(id); term.dispose(); window.removeEventListener('resize', onResize) }
    } catch (err: any) {
      setErrorMsg(`终端启动失败: ${err.message || err}`)
      return () => {}
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center h-8 px-3 border-b border-mc-border-subtle gap-2">
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${ptyReady ? 'bg-mc-success' : serverConnected ? 'bg-mc-warning' : 'bg-mc-text-muted'}`} />
        <span className="text-[10px] text-mc-text-muted truncate">
          {ptyReady ? '终端已连接' : serverConnected ? 'PTY 连接中...' : '本地终端'}
        </span>
        {errorMsg && (
          <span className="text-[9px] text-red-500 truncate flex items-center gap-1">
            <AlertCircle size={10} />{errorMsg}
          </span>
        )}
      </div>
      <div ref={terminalRef} className="flex-1" />
    </div>
  )
}
