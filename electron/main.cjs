const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { initDatabase, getDb, closeDatabase } = require('./services/database.cjs')
const { startMimoServe, stopMimoServe, isMimoServeRunning, getMimoServePort, getServeMode } = require('./services/streaming.cjs')
const { detect: mimoDetect, install: mimoInstall, autoInstallIfNeeded } = require('./services/mimoInstaller.cjs')
const { readMemory, writeMemory, readSkills, readSkill, writeSkill, deleteSkill, bootstrapDefaultFiles } = require('./services/files.cjs')

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
    mainWindow.show()
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

  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

function setupIPC() {
  // === Mimo Server 管理 ===
  ipcMain.handle('mimo:startServer', async () => {
    const port = await startMimoServe()
    return { port, password: '' }
  })

  ipcMain.handle('mimo:stopServer', async () => {
    stopMimoServe()
  })

  ipcMain.handle('mimo:serverStatus', async () => {
    return { running: isMimoServeRunning(), port: getMimoServePort(), mode: getServeMode() }
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

    const proc = cp.spawn(shell, [], {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
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
    // Windows cmd.exe 不支持 resize；PTY 方式由 mimo serve 处理
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
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: filters || [],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('native:showItemInFolder', (event, filePath) => {
    shell.showItemInFolder(filePath)
  })
}

app.whenReady().then(() => {
  initDatabase()
  bootstrapDefaultFiles()
  setupIPC()
  createWindow()

  // 首次启动时自动安装 MiMo CLI（如果缺失），非阻塞
  autoInstallIfNeeded(mainWindow).catch(err => {
    console.error('[main] Auto-install failed:', err.message)
  })

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
