// 终端视图 — Phase 4 T4.5
// subBar 工具条：模式标签 + 字号选择 + 清屏按钮
// 修复：二次进入时 fitAddon dimensions 崩溃

import { useEffect, useRef, useState } from 'react'
import { isElectron, getAPI } from '@/lib/ipc'
import { mimoClient } from '@/lib/mimoClient'
import { Terminal as TerminalIcon, AlertCircle, Trash2 } from 'lucide-react'
import TitleBar from '@/components/ui/TitleBar'
import StatusDot from '@/components/ui/StatusDot'

export default function TerminalView() {
  const [serverConnected, setServerConnected] = useState(false)
  const [ptyReady, setPtyReady] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [fontSize, setFontSize] = useState(13)
  const terminalRef = useRef<HTMLDivElement>(null)
  const terminalInstRef = useRef<any>(null)
  const fitAddonRef = useRef<any>(null)

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
      try {
        if (serverConnected) {
          cleanup = await setupPty()
        } else {
          cleanup = await setupLocal()
        }
      } catch (err: any) {
        setErrorMsg(`终端初始化失败: ${err?.message || err}`)
      }
      if (cancelled) cleanup?.()
    }
    setup()

    return () => {
      cancelled = true
      cleanup?.()
      terminalInstRef.current = null
      fitAddonRef.current = null
    }
  }, [serverConnected])

  function safeFit() {
    try {
      if (fitAddonRef.current && terminalRef.current && terminalRef.current.offsetWidth > 0 && terminalRef.current.offsetHeight > 0) {
        fitAddonRef.current.fit()
      }
    } catch {}
  }

  async function setupPty(): Promise<() => void> {
    try {
      const { Terminal } = await import('xterm')
      const { FitAddon } = await import('xterm-addon-fit')
      if (!terminalRef.current) return () => {}

      const term = new Terminal({
        cursorBlink: true, fontSize,
        fontFamily: "'Cascadia Code', 'Fira Code', monospace",
        theme: { background: '#0d0d0d', foreground: '#cccccc', cursor: '#cccccc', selectionBackground: '#3a3a3a' },
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(terminalRef.current)
      terminalInstRef.current = term
      fitAddonRef.current = fit

      // 等容器渲染完成后再 fit
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
      safeFit()

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
      ws.onclose = () => { setPtyReady(false); try { term.writeln('\r\n\x1b[33mPTY 连接已关闭\x1b[0m') } catch {} }
      ws.onerror = () => { setErrorMsg('PTY WebSocket 错误'); try { term.writeln('\r\n\x1b[31mPTY 连接错误\x1b[0m') } catch {} }

      term.onData((d: string) => { if (ws.readyState === WebSocket.OPEN) ws.send(d) })

      const onResize = () => {
        safeFit()
        if (ws.readyState === WebSocket.OPEN && term.cols && term.rows) {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
        }
      }
      window.addEventListener('resize', onResize)

      return () => {
        window.removeEventListener('resize', onResize)
        ws.close()
        try { term.dispose() } catch {}
        terminalInstRef.current = null
        fitAddonRef.current = null
      }
    } catch (err: any) {
      setErrorMsg(`PTY 创建失败: ${err.message || err}`)
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
        cursorBlink: true, fontSize,
        fontFamily: "'Cascadia Code', 'Fira Code', monospace",
        theme: { background: '#0d0d0d', foreground: '#cccccc', cursor: '#cccccc', selectionBackground: '#3a3a3a' },
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.open(terminalRef.current)
      terminalInstRef.current = term
      fitAddonRef.current = fit

      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
      safeFit()

      const api = getAPI()
      const id = await api.terminal.create({})
      setPtyReady(true)

      const unsub = api.terminal.onData(id, (data: string) => { term.write(data) })
      const unsubExit = api.terminal.onExit(id, () => { try { term.writeln('\r\n\x1b[33m进程已退出\x1b[0m') } catch {}; setPtyReady(false) })
      const unsubCleanup = api.terminal.onCleanup(id, () => { unsub(); unsubExit() })

      term.onData((d: string) => { api.terminal.write(id, d) })

      const onResize = () => { safeFit() }
      window.addEventListener('resize', onResize)

      return () => {
        window.removeEventListener('resize', onResize)
        unsub(); unsubExit(); unsubCleanup()
        api.terminal.kill(id)
        try { term.dispose() } catch {}
        terminalInstRef.current = null
        fitAddonRef.current = null
      }
    } catch (err: any) {
      setErrorMsg(`终端启动失败: ${err.message || err}`)
      return () => {}
    }
  }

  const handleClear = () => {
    try { terminalInstRef.current?.clear() } catch {}
  }

  return (
    <div className="flex flex-col h-full">
      <TitleBar
        icon={TerminalIcon}
        title="终端"
        subBar={
          <div className="flex items-center gap-2 w-full">
            <StatusDot tone={ptyReady ? 'success' : serverConnected ? 'warning' : 'muted'} />
            <span className="text-2xs text-mc-text-muted">
              {ptyReady ? (serverConnected ? 'PTY' : '本地') : serverConnected ? '连接中...' : '本地'}
            </span>
            {errorMsg && (
              <span className="text-2xs text-mc-error truncate flex items-center gap-1">
                <AlertCircle size={10} />{errorMsg}
              </span>
            )}
            <div className="flex-1" />
            <select
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="text-2xs bg-mc-surface border border-mc-border-subtle rounded px-1.5 py-0.5 text-mc-text-muted focus:outline-none appearance-none pr-5"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2371717a'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center' }}
            >
              <option value="12">12px</option>
              <option value="13">13px</option>
              <option value="14">14px</option>
              <option value="15">15px</option>
            </select>
            <button
              onClick={handleClear}
              className="p-1 text-mc-text-muted hover:text-mc-text hover:bg-mc-hover rounded transition-colors"
              title="清屏"
            >
              <Trash2 size={12} />
            </button>
          </div>
        }
      />
      <div ref={terminalRef} className="flex-1" style={{ minHeight: 0 }} />
    </div>
  )
}
