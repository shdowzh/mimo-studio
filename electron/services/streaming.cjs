// mimo serve 进程管理
// 负责：启动/停止 mimo serve，暴露端口给渲染器
// 渲染器通过 HTTP/SSE 直连 mimo serve，不再需要主进程代理

const { spawn } = require('child_process')
const { detect: mimoDetect, install: mimoInstall } = require('./mimoInstaller.cjs')

// mimo serve 实例管理
let mimoServeProcess = null
let mimoServePort = 0
let mimoServeReady = false

/**
 * 检测 mimo serve 是否在运行
 */
function isMimoServeRunning() {
  return mimoServeReady && mimoServePort > 0
}

/**
 * 获取 mimo serve 端口
 */
function getMimoServePort() {
  return mimoServePort
}

/**
 * 启动 mimo serve 作为本地代理
 * 返回端口号，失败返回 0
 * 先快速检测 CLI 是否存在，不存在则尝试从内置安装，再不行直接返回
 */
async function startMimoServe() {
  if (mimoServeProcess) {
    return mimoServePort
  }

  // 快速检测 CLI 是否存在
  let cliInfo = await mimoDetect()
  if (!cliInfo.installed) {
    // 尝试从内置 CLI 安装
    console.log('[streaming] MiMo CLI not found, trying bundled install...')
    try {
      await mimoInstall(null)
      cliInfo = await mimoDetect()
    } catch (e) {
      console.log('[streaming] Bundled install failed, skipping serve')
      return 0
    }
    if (!cliInfo.installed) {
      console.log('[streaming] MiMo CLI still not installed, skipping serve')
      return 0
    }
  }

  return new Promise((resolve) => {
    const path = require('path')
    const fs = require('fs')
    const os = require('os')
    const isWin = os.platform() === 'win32'

    // 构建 mimo 命令
    // 优先级：1) ~/.mimocode/bin/mimo  2) PATH 中的 mimo
    let command, args
    const localBin = path.join(
      require('./database.cjs').getMimoDataDir(), 'bin',
      isWin ? 'mimo.exe' : 'mimo'
    )

    const port = 18080 + Math.floor(Math.random() * 100)

    if (fs.existsSync(localBin)) {
      // 本地安装的预编译二进制
      command = localBin
      args = ['serve', '--port', String(port)]
    } else if (isWin) {
      // Windows: mimo 是 npm .cmd 脚本，必须通过 cmd /c 调用
      command = 'cmd'
      args = ['/c', 'mimo', 'serve', '--port', String(port)]
    } else {
      // macOS/Linux: 直接调 mimo
      command = 'mimo'
      args = ['serve', '--port', String(port)]
    }

    try {
      mimoServeProcess = spawn(command, args, {
        stdio: 'pipe',
        detached: false,
        env: { ...process.env, MIMOCODE_SERVER_PASSWORD: '' },
      })

      mimoServeProcess.on('error', () => {
        mimoServeProcess = null
        mimoServeReady = false
        resolve(0)
      })

      mimoServeProcess.on('exit', () => {
        mimoServeProcess = null
        mimoServeReady = false
        mimoServePort = 0
      })

      // 等待服务器就绪 — 匹配 "listening" 关键词
      let output = ''
      const checkReady = (data) => {
        output += data.toString()
        if (output.includes('listening')) {
          mimoServePort = port
          mimoServeReady = true
          resolve(port)
        }
      }
      mimoServeProcess.stdout.on('data', checkReady)
      mimoServeProcess.stderr.on('data', checkReady)

      // 超时（缩短到 10 秒）
      setTimeout(() => {
        if (!mimoServeReady) {
          try { mimoServeProcess.kill() } catch {}
          mimoServeProcess = null
          resolve(0)
        }
      }, 10000)

    } catch (e) {
      resolve(0)
    }
  })
}

/**
 * 停止 mimo serve
 */
function stopMimoServe() {
  if (mimoServeProcess) {
    try { mimoServeProcess.kill() } catch {}
    mimoServeProcess = null
    mimoServeReady = false
    mimoServePort = 0
  }
}

module.exports = { startMimoServe, stopMimoServe, isMimoServeRunning, getMimoServePort }
