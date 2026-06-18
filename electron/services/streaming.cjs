// MiMo Serve 进程管理
// 策略：优先直接嵌入编译好的服务端（import），不可用时 fallback 到 spawn 子进程
// 渲染器始终通过 HTTP/SSE 直连，不感知底层实现差异

const { spawn } = require('child_process')
const { createServer } = require('net')
const crypto = require('crypto')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { detect: mimoDetect, install: mimoInstall, installSilent } = require('./mimoInstaller.cjs')

// === 状态 ===
let serverListener = null      // 嵌入模式：Server.Listener { stop() }
let mimoServeProcess = null   // spawn 模式：ChildProcess
let mimoServePort = 0
let mimoServePassword = ''
let mimoServeReady = false
let mode = 'unknown'          // 'embedded' | 'spawn'

// ================================================================
// 公开 API（与旧版兼容）
// ================================================================

function isMimoServeRunning() {
  return mimoServeReady && mimoServePort > 0
}

function getMimoServePort() {
  return mimoServePort
}

function getMimoServePassword() {
  return mimoServePassword
}

function ensurePassword() {
  // 不生成随机密码 — MiMo serve 的 SSE 端点不支持非空密码
  return ''
}

/** 返回当前模式：'embedded' | 'spawn' | 'unknown' */
function getServeMode() {
  return mode
}

/**
 * 启动 mimo serve
 * 1. 先尝试 import 编译好的 opencode server（嵌入模式）
 * 2. 不可用则 spawn mimo 子进程（spawn 模式）
 * 3. 都失败返回 0
 */
async function startMimoServe() {
  if (mimoServeReady && mimoServePort > 0) {
    return mimoServePort
  }

  // === 策略 1：嵌入模式（直接 import 编译好的服务端） ===
  try {
    const port = await startEmbedded()
    if (port > 0) {
      mode = 'embedded'
      mimoServePort = port
      mimoServeReady = true
      console.log(`[streaming] Embedded server ready on port ${port}`)
      return port
    }
  } catch (e) {
    console.log('[streaming] Embedded unavailable, falling back to spawn:', e.message)
  }

  // === 策略 2：spawn 子进程 ===
  try {
    const port = await startViaSpawn()
    if (port > 0) {
      mode = 'spawn'
      mimoServePort = port
      mimoServeReady = true
      console.log(`[streaming] Spawned server ready on port ${port}`)
      return port
    }
  } catch (e) {
    console.error('[streaming] Spawn failed:', e.message)
  }

  return 0
}

/**
 * 停止 mimo serve（兼容两种模式）
 */
function stopMimoServe() {
  // 嵌入模式
  if (mode === 'embedded' && serverListener) {
    try {
      serverListener.stop()
      console.log('[streaming] Embedded server stopped')
    } catch (e) {
      console.error('[streaming] Error stopping embedded server:', e.message)
    }
    serverListener = null
  }

  // spawn 模式
  if (mimoServeProcess) {
    try {
      // Windows 上杀进程树
      if (os.platform() === 'win32') {
        try {
          require('child_process').execSync(
            `taskkill /f /t /pid ${mimoServeProcess.pid} 2>nul`,
            { timeout: 5000, stdio: 'ignore' }
          )
        } catch {}
      } else {
        mimoServeProcess.kill('SIGTERM')
      }
    } catch {}
    mimoServeProcess = null
    console.log('[streaming] Spawned server stopped')
  }

  mimoServeReady = false
  mimoServePort = 0
  mimoServePassword = ''
  mode = 'unknown'
}

// ================================================================
// 嵌入模式 — 直接 import 编译好的 opencode server
// ================================================================

async function startEmbedded() {
  const password = ensurePassword()
  const serverPath = findOpencodeDist()
  if (!serverPath) {
    throw new Error('No compiled opencode server found. ' +
      'Build it with: cd <mimocode-fork> && bun run build --filter=@mimo-ai/cli')
  }

  console.log('[streaming] Loading embedded server from:', serverPath)

  // 动态 import ESM 模块（CJS 中合法）
  const { Log, Server } = await import(pathToFileURL(serverPath))

  // 初始化日志
  if (Log && Log.init) {
    await Log.init({ level: 'WARN' })
  }

  // 找空闲端口
  const port = await findFreePort(18080, 18179)

  // 启动服务器
  serverListener = await Server.listen({
    port,
    hostname: '127.0.0.1',
    username: 'opencode',
    password,
  })

  // 轮询等待健康检查通过
  await waitForHealth(port, 30_000)

  return port
}

/** 在多个可能位置查找编译好的 opencode server */
function findOpencodeDist() {
  const candidates = [
    // 1. 环境变量指定
    process.env.MIMO_OPENCODE_DIST,
    // 2. 项目根下的 opencode-dist/
    path.join(__dirname, '..', '..', 'opencode-dist', 'node.js'),
    // 3. MiMo-Code fork monorepo（默认位置）
    path.join(__dirname, '..', '..', '..', 'MiMo-Code-main', 'packages', 'opencode', 'dist', 'node', 'node.js'),
    // 4. 同级的 MiMo-Code 仓库
    path.join(__dirname, '..', '..', '..', 'mimocode', 'packages', 'opencode', 'dist', 'node', 'node.js'),
    // 5. electron 目录下的 opencode-dist（打包时放这里）
    path.join(__dirname, 'opencode-dist', 'node.js'),
    // 6. app resources 路径（生产环境）
    path.join(process.resourcesPath || '', 'opencode-dist', 'node.js'),
  ].filter(Boolean)

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p
    }
  }

  return null
}

// ================================================================
// Spawn 模式 — 启动 mimo 子进程
// ================================================================

async function startViaSpawn() {
  const password = ensurePassword()
  // 检测 CLI 是否可用
  let cliInfo = await mimoDetect()
  if (!cliInfo.installed) {
    console.log('[streaming] MiMo CLI not found, trying bundled install...')
    try {
      await installSilent((data) => {
        const msg = data.stdout || data.stderr || ''
        if (msg.trim()) console.log(`[streaming] CLI install: ${msg.trim()}`)
      })
      cliInfo = await mimoDetect()
    } catch (e) {
      console.log('[streaming] Bundled install failed, cannot spawn serve')
      return 0
    }
    if (!cliInfo.installed) {
      console.log('[streaming] MiMo CLI still not installed')
      return 0
    }
  }

  return new Promise((resolve) => {
    const isWin = os.platform() === 'win32'
    const localBin = path.join(
      require('./database.cjs').getMimoDataDir(), 'bin',
      isWin ? 'mimo.exe' : 'mimo'
    )
    const port = 18080 + Math.floor(Math.random() * 100)

    let command, args

    if (fs.existsSync(localBin)) {
      command = localBin
      args = ['serve', '--port', String(port)]
    } else if (isWin) {
      command = 'cmd'
      args = ['/c', 'mimo', 'serve', '--port', String(port)]
    } else {
      command = 'mimo'
      args = ['serve', '--port', String(port)]
    }

    try {
      mimoServeProcess = spawn(command, args, {
        stdio: 'pipe',
        detached: false,
        env: { ...process.env, MIMOCODE_SERVER_PASSWORD: password },
      })

      mimoServeProcess.on('error', () => {
        mimoServeProcess = null
        resolve(0)
      })

      mimoServeProcess.on('exit', () => {
        mimoServeProcess = null
        if (mimoServeReady) {
          mimoServeReady = false
          mimoServePort = 0
        }
      })

      let output = ''
      const checkReady = (data) => {
        output += data.toString()
        if (output.includes('listening')) {
          resolve(port)
        }
      }
      mimoServeProcess.stdout?.on('data', checkReady)
      mimoServeProcess.stderr?.on('data', checkReady)

      setTimeout(() => {
        if (mimoServeProcess && !mimoServeReady) {
          try { mimoServeProcess.kill() } catch {}
          mimoServeProcess = null
          resolve(0)
        }
      }, 10_000)

    } catch {
      resolve(0)
    }
  })
}

// ================================================================
// 工具函数
// ================================================================

/** 在 [start, end] 范围内找空闲端口 */
function findFreePort(start, end) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      if (port > end) {
        reject(new Error(`No free port in range ${start}-${end}`))
        return
      }
      const server = createServer()
      server.on('error', () => tryPort(port + 1))
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(port))
      })
    }
    tryPort(start)
  })
}

/** 轮询 health endpoint 直到就绪或超时 */
async function waitForHealth(port, timeout) {
  const deadline = Date.now() + timeout
  const url = `http://127.0.0.1:${port}/global/health`
  const auth = mimoServePassword
    ? 'Basic ' + Buffer.from(`opencode:${mimoServePassword}`).toString('base64')
    : null

  while (Date.now() < deadline) {
    try {
      const headers = auth ? { Authorization: auth } : undefined
      const res = await fetch(url, { signal: AbortSignal.timeout(3000), headers })
      if (res.ok) return
    } catch {
      // 还没就绪
    }
    await sleep(200)
  }

  throw new Error(`Health check timed out after ${timeout}ms`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Windows 上 import() ESM 需要 file:// 协议 */
function pathToFileURL(p) {
  // Node.js 的 url.pathToFileURL 是最正确的做法
  try {
    return require('url').pathToFileURL(p).href
  } catch {
    // Fallback: 手动构造
    let normalized = p.replace(/\\/g, '/')
    if (!normalized.startsWith('/')) normalized = '/' + normalized
    return 'file://' + normalized
  }
}

// ================================================================
module.exports = {
  startMimoServe,
  stopMimoServe,
  isMimoServeRunning,
  getMimoServePort,
  getMimoServePassword,
  getServeMode,
}
