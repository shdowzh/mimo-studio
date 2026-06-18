const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')

// ============================================================
// 文件日志 — 写入 exe 同目录的 mimo-debug.log
// 打包后用户看不到控制台，有这个文件就能排查问题
// ============================================================
let logStream = null
function initLogFile() {
  try {
    const logDir = app.isPackaged
      ? path.dirname(app.getPath('exe'))
      : path.join(__dirname, '..')
    const logPath = path.join(logDir, 'mimo-debug.log')
    logStream = fs.createWriteStream(logPath, { flags: 'a' })
    logStream.write(`\n=== MiMo Studio ${new Date().toISOString()} ===\n`)
    logStream.write(`packaged: ${app.isPackaged}, electron: ${process.versions.electron}, node: ${process.versions.node}\n`)
    logStream.write(`exe: ${app.getPath('exe')}\n`)
    logStream.write(`resourcesPath: ${process.resourcesPath || 'N/A'}\n`)
    logStream.write(`__dirname: ${__dirname}\n`)
  } catch (e) {
    // 如果连日志文件都创建不了，用 dialog 弹框
  }
}
function debugLog(...args) {
  const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
  console.log(msg)
  if (logStream) {
    logStream.write(`[${new Date().toISOString()}] ${msg}\n`)
  }
}
function debugError(...args) {
  const msg = args.map(a => a instanceof Error ? (a.stack || a.message) : String(a)).join(' ')
  console.error(msg)
  if (logStream) {
    logStream.write(`[${new Date().toISOString()}] ERROR ${msg}\n`)
    try { fs.fsyncSync(logStream.fd) } catch {}
  }
}
const { initDatabase, getDb, closeDatabase } = require('./services/database.cjs')
const { startMimoServe, stopMimoServe, isMimoServeRunning, getMimoServePort, getMimoServePassword, getServeMode } = require('./services/streaming.cjs')
const { detect: mimoDetect, install: mimoInstall, autoInstallIfNeeded } = require('./services/mimoInstaller.cjs')
const { readMemory, writeMemory, readSkills, readSkill, writeSkill, deleteSkill, bootstrapDefaultFiles } = require('./services/files.cjs')
const secret = require('./services/secret.cjs')
// 注册自定义协议（必须在 app.whenReady 之前）
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'mimo-app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      bypassCSP: true,
    },
  },
])

// electron-updater：用 try-catch 包裹，防止缺少 app-update.yml 等打包配置时抛异常
let autoUpdater = null
try {
  autoUpdater = require('electron-updater').autoUpdater
} catch (e) {
  console.warn('[main] electron-updater unavailable:', e.message)
}

// 全局未捕获异常 → 写日志 + 弹错误框
process.on('uncaughtException', (err) => {
  debugError('Uncaught exception:', err)
  try {
    dialog.showErrorBox('程序错误', `MiMo Studio 遇到未处理的错误：\n\n${err.message}\n\n详情见 mimo-debug.log`)
  } catch {}
})
process.on('unhandledRejection', (reason) => {
  debugError('Unhandled rejection:', reason)
})

let mainWindow
let isQuitting = false
const terminalSessions = new Map()

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      webSecurity: false,  // 允许 mimo-app:// → http://127.0.0.1 的跨域 SSE 连接
    },
    backgroundColor: '#09090b',
    titleBarStyle: 'hiddenInset',
    titleBarOverlay: {
      color: '#09090b',
      symbolColor: '#a1a1aa',
      height: 36,
    },
    show: false,
  })

  mainWindow.once('ready-to-show', () => {
    debugLog('window ready-to-show')
    mainWindow.show()
  })

  // 页面加载失败时记录日志
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    debugError(`page load failed: ${errorDescription} (code=${errorCode}) url=${validatedURL}`)
  })
  mainWindow.webContents.on('did-finish-load', () => {
    debugLog('page did-finish-load')
  })
  mainWindow.webContents.on('dom-ready', () => {
    debugLog('page dom-ready')
  })
  // 渲染进程控制台消息转发到日志
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    debugLog(`[renderer] ${message}`)
  })

  // 窗口关闭：弹确认框 → 杀干净所有进程 → 关数据库
  mainWindow.on('close', async (e) => {
    if (isQuitting) return
    e.preventDefault()

    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['确定退出', '取消'],
      defaultId: 0,
      cancelId: 1,
      title: '退出 MiMo Studio',
      message: '确定要退出 MiMo Studio 吗？',
      detail: '退出后将关闭所有 Agent 任务和终端会话。',
    })

    if (response === 1) return // 用户取消

    isQuitting = true
    cleanupAll()
    app.quit()
  })

  // 生产环境用自定义协议加载，保证 ES module CORS 头正确
  // file:// 协议下 ES module 会被 CORS 策略拦截导致白屏
  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    debugLog('loading dev URL: http://localhost:5173')
    mainWindow.loadURL('http://localhost:5173')
  } else {
    const appUrl = 'mimo-app://app/dist/index.html'
    debugLog(`loading production URL: ${appUrl}`)
    debugLog(`baseDir for protocol: ${path.join(__dirname, '..')}`)
    mainWindow.loadURL(appUrl)
  }
}

function setupIPC() {
  // === Mimo Server 管理 ===
  ipcMain.handle('mimo:startServer', async () => {
    const port = await startMimoServe()
    return { port, password: getMimoServePassword() }
  })

  ipcMain.handle('mimo:stopServer', async () => {
    stopMimoServe()
  })

  ipcMain.handle('mimo:serverStatus', async () => {
    return {
      running: isMimoServeRunning(),
      port: getMimoServePort(),
      password: getMimoServePassword(),
      mode: getServeMode(),
    }
  })

  // === Mimo CLI 检测/安装 ===
  ipcMain.handle('mimo:detect', () => {
    return mimoDetect()
  })

  ipcMain.handle('mimo:install', (event) => {
    return mimoInstall(mainWindow)
  })

  // === 本地设置 ===
  const db = getDb
  ipcMain.handle('settings:get', (event, key) => {
    const row = db().prepare('SELECT value FROM settings WHERE key = ?').get(key)
    return row ? row.value : null
  })

  ipcMain.handle('settings:set', (event, key, value) => {
    db().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
  })

  // === API Key（safeStorage 加密存储）===
  // 注意：渲染层不应再通过 settings:get('apiKeys') 读 Key —— 老代码会拿到空，
  //       因为加密表落在另一个键上，旧 'apiKeys' 在 init 时已被迁移并删除。
  ipcMain.handle('secret:getApiKey', (event, providerId) => {
    return secret.getApiKey(providerId)
  })

  ipcMain.handle('secret:setApiKey', (event, providerId, plain) => {
    secret.setApiKey(providerId, plain)
  })

  ipcMain.handle('secret:deleteApiKey', (event, providerId) => {
    secret.deleteApiKey(providerId)
  })

  ipcMain.handle('secret:listApiKeyProviders', () => {
    return secret.listApiKeyProviders()
  })

  ipcMain.handle('secret:isEncryptionAvailable', () => {
    return secret.isEncryptionAvailable()
  })

  // === 终端（本地 shell — 可用于 mimo serve 离线时）===
  const cp = require('child_process')

  ipcMain.handle('terminal:create', (event, opts) => {
    const id = require('crypto').randomUUID()
    const shell = opts?.shell || (process.platform === 'win32' ? 'cmd.exe' : process.env.SHELL || '/bin/bash')
    const cwd = opts?.cwd || process.cwd()

    // 确保 PATH 包含 mimo 可能的安装位置
    const env = { ...process.env }
    const pathExt = process.platform === 'win32' ? [
      path.join(os.homedir(), '.mimocode', 'bin'),
      path.join(os.homedir(), 'AppData', 'Roaming', 'npm'),
    ] : []
    const existingPath = env.PATH || ''
    for (const p of pathExt) {
      if (fs.existsSync(p) && !existingPath.includes(p)) {
        env.PATH = p + ';' + env.PATH
      }
    }

    const args = process.platform === 'win32' && shell.toLowerCase().includes('cmd') ? ['/K'] : []
    const proc = cp.spawn(shell, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: false,
    })

    proc.stdout.on('data', (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`terminal:data:${id}`, data.toString('utf-8'))
      }
    })

    proc.stderr.on('data', (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`terminal:data:${id}`, data.toString('utf-8'))
      }
    })

    proc.on('exit', (code) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`terminal:exit:${id}`, code)
        // 通知渲染层清理该 session 的 data listener
        mainWindow.webContents.send(`terminal:cleanup:${id}`)
      }
      terminalSessions.delete(id)
    })

    proc.on('error', (err) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`terminal:data:${id}`, `\r\n\x1b[31m${err.message}\x1b[0m\r\n`)
      }
    })

    terminalSessions.set(id, { id, proc, opts, alive: true })
    return id
  })

  ipcMain.handle('terminal:write', (event, sessionId, data) => {
    const session = terminalSessions.get(sessionId)
    if (session?.proc && session.alive) {
      session.proc.stdin.write(data)
    }
  })

  ipcMain.handle('terminal:resize', (event, sessionId, cols, rows) => {
    // 本地 shell 模式：Unix 上用 ioctl，Windows cmd.exe 不支持
    const session = terminalSessions.get(sessionId)
    if (session?.proc && session.alive && process.platform !== 'win32') {
      try {
        // Node.js 不直接暴露 ioctl；这里仅作占位，实际 PTY resize 由渲染层 WebSocket 完成
      } catch {}
    }
  })

  ipcMain.handle('terminal:kill', (event, sessionId) => {
    const session = terminalSessions.get(sessionId)
    if (session?.proc) {
      session.alive = false
      try { session.proc.kill() } catch {}
    }
    terminalSessions.delete(sessionId)
  })

  // === 文件 I/O ===
  ipcMain.handle('files:readMemory', (event, type) => {
    return readMemory(type)
  })

  ipcMain.handle('files:writeMemory', (event, type, content) => {
    writeMemory(type, content)
  })

  ipcMain.handle('files:readSkills', () => {
    return readSkills()
  })

  ipcMain.handle('files:readSkill', (event, name) => {
    return readSkill(name)
  })

  ipcMain.handle('files:writeSkill', (event, name, content) => {
    writeSkill(name, content)
  })

  ipcMain.handle('files:deleteSkill', (event, name) => {
    deleteSkill(name)
  })

  // === 原生功能 ===
  ipcMain.handle('native:openDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('native:openFile', async (event, filters) => {
    // 校验 filters：只接受 { name: string, extensions: string[] }[] 结构
    let safeFilters = []
    if (Array.isArray(filters)) {
      safeFilters = filters.filter(f =>
        f && typeof f.name === 'string' &&
        Array.isArray(f.extensions) &&
        f.extensions.every(e => typeof e === 'string')
      )
    }
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: safeFilters,
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('native:showItemInFolder', (event, filePath) => {
    shell.showItemInFolder(filePath)
  })
}

app.whenReady().then(async () => {
  initLogFile()
  debugLog('app.whenReady — starting initialization')

  // === 注册自定义协议 handler（必须在 app.whenReady 之后，否则 Session not ready） ===
  // file:// 协议缺少 CORS 头，ES module 脚本会被 Chromium 拦截 → 白屏/黑屏
  // mimo-app:// 协议在每次请求中都附带 Access-Control-Allow-Origin 头
  protocol.handle('mimo-app', (request) => {
    const url = new URL(request.url)
    // pathname 以 / 开头（如 /dist/index.html），去掉前导 / 避免 Windows 上被当绝对路径
    let filePath = path.normalize(url.pathname.replace(/^\//, ''))
    const baseDir = path.join(__dirname, '..')
    const resolved = path.resolve(baseDir, filePath)

    debugLog(`protocol: ${request.url} → ${resolved}`)

    if (!resolved.startsWith(baseDir)) {
      debugError(`protocol: BLOCKED path traversal attempt: ${resolved}`)
      return new Response('Forbidden', { status: 403 })
    }

    if (!fs.existsSync(resolved)) {
      debugError(`protocol: 404 ${resolved}`)
      return new Response('Not Found', { status: 404 })
    }

    const mimeMap = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.mjs': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
      '.svg': 'image/svg+xml',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
    }
    const ext = path.extname(resolved).toLowerCase()
    const mime = mimeMap[ext] || 'application/octet-stream'

    try {
      const data = fs.readFileSync(resolved)
      return new Response(data, {
        headers: {
          'Content-Type': mime,
          'Access-Control-Allow-Origin': '*',
        },
      })
    } catch (err) {
      debugError(`protocol: read error ${resolved}: ${err.message}`)
      return new Response('Not Found', { status: 404 })
    }
  })
  debugLog('protocol handler registered')

  debugLog('webSecurity disabled — CORS bypass for localhost SSE')

  // 关键初始化步骤包装 try-catch，失败时弹错误框而非静默崩溃
  try {
    debugLog('initDatabase...')
    initDatabase()
    debugLog('initDatabase OK')
    // safeStorage 要求 app ready — 之后再迁移老明文 apiKeys
    try { secret.migrateLegacyIfNeeded() } catch (e) { debugLog('secret migration:', e.message) }
    debugLog('bootstrapDefaultFiles...')
    bootstrapDefaultFiles()
    debugLog('setupIPC...')
    setupIPC()
    debugLog('createWindow...')
    createWindow()

    // 首次启动时自动安装 MiMo CLI（如果缺失），非阻塞
    autoInstallIfNeeded(mainWindow).catch(err => {
      console.error('[main] Auto-install failed:', err.message)
    })

    // 自动更新检查（仅生产环境）
    setupAutoUpdater()
  } catch (e) {
    debugError('Fatal startup error:', e)
    dialog.showErrorBox('启动失败', `MiMo Studio 初始化时遇到错误：\n\n${e.message}\n\n详情见 mimo-debug.log`)
    app.quit()
    return
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 清理所有资源（退出时调用）
function cleanupAll() {
  // 1. 杀掉所有终端子进程
  for (const [id, session] of terminalSessions) {
    try { if (session.alive) session.proc.kill() } catch {}
    terminalSessions.delete(id)
  }

  // 2. 停止 mimo serve（先走优雅关闭）
  try { stopMimoServe() } catch {}

  // 3. Windows 上强制杀干净残留 mimo 进程树
  if (process.platform === 'win32') {
    try {
      require('child_process').execSync('taskkill /f /t /im mimo.exe 2>nul', { timeout: 5000, stdio: 'ignore' })
    } catch {}
  }

  // 4. 关闭数据库
  try { closeDatabase() } catch {}
}

app.on('window-all-closed', () => {
  if (!isQuitting && process.platform !== 'darwin') {
    cleanupAll()
    app.quit()
  }
})

app.on('before-quit', () => {
  if (!isQuitting) cleanupAll()
})

// === 自动更新 ===

function setupAutoUpdater() {
  // 仅生产环境（打包后）检查更新
  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) return
  if (!autoUpdater) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    console.log(`[updater] Update available: v${info.version}`)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:available', { version: info.version })
    }
  })

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:progress', {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
      })
    }
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[updater] Update downloaded: v${info.version}`)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:downloaded', { version: info.version })
    }
  })

  autoUpdater.on('error', (err) => {
    console.warn('[updater] Error:', err?.message || err)
  })

  // 延迟 5 秒后检查更新（避免启动时阻塞）
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => {
      console.warn('[updater] checkForUpdates failed:', err?.message || err)
    })
  }, 5000)
}

// IPC: 手动检查更新
ipcMain.handle('updater:check', async () => {
  if (!autoUpdater) return { available: false, error: 'electron-updater 不可用' }
  try {
    const result = await autoUpdater.checkForUpdates()
    return { available: !!result?.updateInfo, version: result?.updateInfo?.version || null }
  } catch (err) {
    return { available: false, error: err?.message || String(err) }
  }
})

// IPC: 安装已下载的更新
ipcMain.handle('updater:install', () => {
  if (!autoUpdater) return
  autoUpdater.quitAndInstall()
})
