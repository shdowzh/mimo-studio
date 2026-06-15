// MiMo CLI 检测 + 安装服务
// 安装策略（按优先级）：
// 1. 检测 PATH 中是否已有 mimo（任何来源）
// 2. 检测 ~/.mimocode/bin/mimo（curl 安装脚本位置）
// 3. 都没有 → 从 app 内置 CLI 拷贝（秒装，无需网络）
// 4. 内置不可用 → 从 Gitee 镜像下载（国内快）
// 5. Gitee 失败 → GitHub Releases
// 6. 都失败 → npm install -g（需要 Node.js）

const { exec, execFile, execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')
const https = require('https')
const { createWriteStream, mkdirSync, existsSync, rmSync } = require('fs')
const { getMimoDataDir } = require('./database.cjs')

// 下载源优先级：Gitee 镜像（国内快）→ GitHub（国际）
const GITEE_RELEASE_BASE = 'https://gitee.com/mirrors/mimocode/releases/download'
const GITHUB_RELEASE_BASE = 'https://github.com/XiaomiMiMo/MiMo-Code/releases/latest/download'

// CLI 版本号（用于构造 Gitee 下载 URL）
const CLI_VERSION = 'v0.1.0'

/**
 * 根据当前平台获取预编译二进制的下载文件名
 */
function getAssetName() {
  const platform = os.platform()
  const arch = os.arch()

  if (platform === 'win32') {
    return arch === 'arm64' ? 'mimocode-windows-arm64.zip' : 'mimocode-windows-x64.zip'
  } else if (platform === 'darwin') {
    return arch === 'arm64' ? 'mimocode-darwin-arm64.zip' : 'mimocode-darwin-x64.zip'
  } else {
    return arch === 'arm64' ? 'mimocode-linux-arm64.tar.gz' : 'mimocode-linux-x64.tar.gz'
  }
}

/**
 * 检测 mimo CLI 是否可用
 * 返回 { installed, version, path, source }
 */
function detect() {
  return new Promise((resolve) => {
    exec('mimo --version', (error, stdout) => {
      if (!error && stdout.trim()) {
        resolve({ installed: true, version: stdout.trim(), source: 'path' })
        return
      }

      const binDir = path.join(getMimoDataDir(), 'bin')
      const isWin = os.platform() === 'win32'
      const binName = isWin ? 'mimo.exe' : 'mimo'
      const binPath = path.join(binDir, binName)

      if (existsSync(binPath)) {
        execFile(binPath, ['--version'], (err2, stdout2) => {
          if (!err2 && stdout2.trim()) {
            resolve({ installed: true, version: stdout2.trim(), path: binPath, source: 'local-bin' })
          } else {
            resolve({ installed: false })
          }
        })
      } else {
        resolve({ installed: false })
      }
    })
  })
}

/**
 * 方式 0（最快）：从 app 内置 CLI 拷贝安装
 * app 打包时将对应平台的 mimo 二进制放在 cli/ 目录下
 */
function installFromBundled(eventSender) {
  return new Promise((resolve, reject) => {
    const sendProgress = (msg) => {
      if (eventSender && !eventSender.isDestroyed()) {
        eventSender.send('mimo:installProgress', { stdout: msg })
      }
    }

    const isWin = os.platform() === 'win32'
    const arch = os.arch()
    const binName = isWin ? 'mimo.exe' : 'mimo'

    // 内置 CLI 目录结构: cli/<platform>-<arch>/mimo
    const platformName = isWin ? 'windows' : os.platform() === 'darwin' ? 'darwin' : 'linux'
    const archName = arch === 'arm64' ? 'arm64' : 'x64'
    const bundledDir = path.join(__dirname, '../../cli', `${platformName}-${archName}`)
    const bundledBin = path.join(bundledDir, binName)

    if (!existsSync(bundledBin)) {
      reject(new Error('本平台无内置 CLI'))
      return
    }

    // 如果已安装，比较版本：已装版本 >= 内置版本则跳过
    const binDir = path.join(getMimoDataDir(), 'bin')
    const destPath = path.join(binDir, binName)
    if (existsSync(destPath)) {
      try {
        const existingVersion = execFileSync(destPath, ['--version']).toString().trim()
        // 内置 CLI 版本固定，如果已装的版本不为空就跳过（避免降级）
        if (existingVersion) {
          sendProgress('MiMo CLI 已安装，跳过')
          resolve()
          return
        }
      } catch {}
      // 已装但获取版本失败，可能是损坏的，继续覆盖安装
    }

    sendProgress('正在安装 MiMo CLI...')

    if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true })

    try {
      fs.copyFileSync(bundledBin, destPath)
      if (!isWin) {
        fs.chmodSync(destPath, 0o755)
      }
      sendProgress('MiMo CLI 安装完成！')
      resolve()
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * 从指定 URL 下载并安装预编译二进制
 */
function installFromUrl(downloadUrl, eventSender) {
  return new Promise(async (resolve, reject) => {
    const assetName = getAssetName()
    const binDir = path.join(getMimoDataDir(), 'bin')
    const tempDir = path.join(getMimoDataDir(), '.tmp-install')

    const sendProgress = (msg) => {
      if (eventSender && !eventSender.isDestroyed()) {
        eventSender.send('mimo:installProgress', { stdout: msg })
      }
    }

    try {
      sendProgress(`正在下载 ${assetName}...`)

      if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true })
      if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true })

      const isWin = os.platform() === 'win32'
      const isZip = assetName.endsWith('.zip')
      const archivePath = path.join(tempDir, assetName)

      await downloadFile(downloadUrl, archivePath, (downloaded, total) => {
        if (total > 0) {
          const pct = Math.round(downloaded / total * 100)
          sendProgress(`下载中... ${pct}%`)
        }
      })

      sendProgress('下载完成，正在解压...')

      if (isZip) {
        await extractZip(archivePath, tempDir)
      } else {
        await extractTarGz(archivePath, tempDir)
      }

      const mimoBinName = isWin ? 'mimo.exe' : 'mimo'
      let mimoBinPath = findFile(tempDir, mimoBinName)

      if (!mimoBinPath) {
        const altBinName = isWin ? 'mimocode.exe' : 'mimocode'
        mimoBinPath = findFile(tempDir, altBinName)
      }

      if (!mimoBinPath) {
        throw new Error('下载包中未找到 mimo 可执行文件')
      }

      const destPath = path.join(binDir, mimoBinName)
      if (existsSync(destPath)) rmSync(destPath)

      const srcName = path.basename(mimoBinPath)
      copyFileSync(mimoBinPath, destPath)

      if (srcName.startsWith('mimocode')) {
        const aliasPath = path.join(binDir, mimoBinName)
        if (!existsSync(aliasPath) || aliasPath === destPath) {
          copyFileSync(mimoBinPath, aliasPath)
        }
      }

      if (!isWin) {
        try { fs.chmodSync(destPath, 0o755) } catch {}
      }

      try { rmSync(tempDir, { recursive: true, force: true }) } catch {}

      sendProgress('MiMo CLI 安装完成！')
      resolve()
    } catch (err) {
      try { rmSync(tempDir, { recursive: true, force: true }) } catch {}
      reject(err)
    }
  })
}

/**
 * 在目录中递归查找文件
 */
function findFile(dir, fileName) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isFile() && entry.name === fileName) return fullPath
    if (entry.isDirectory()) {
      const found = findFile(fullPath, fileName)
      if (found) return found
    }
  }
  return null
}

/**
 * npm 全局安装（最后手段）
 */
function installFromNpm(eventSender) {
  return new Promise((resolve, reject) => {
    const isWin = os.platform() === 'win32'
    const cmd = isWin ? 'npm.cmd' : 'npm'
    const child = exec(`${cmd} install -g @mimo-ai/cli`, (error) => {
      if (error) reject(error)
      else resolve()
    })
    child.stdout?.on('data', (data) => {
      if (eventSender && !eventSender.isDestroyed()) {
        eventSender.send('mimo:installProgress', { stdout: data.toString() })
      }
    })
    child.stderr?.on('data', (data) => {
      if (eventSender && !eventSender.isDestroyed()) {
        eventSender.send('mimo:installProgress', { stderr: data.toString() })
      }
    })
  })
}

/**
 * 智能安装：内置 → Gitee 镜像（重试2次）→ GitHub（重试2次）→ npm
 * 整体超时 5 分钟
 */
async function install(eventSender) {
  const sendProgress = (msg) => {
    if (eventSender && !eventSender.isDestroyed()) {
      eventSender.send('mimo:installProgress', { stdout: msg })
    }
  }

  const INSTALL_TIMEOUT = 5 * 60 * 1000 // 5 分钟整体超时
  const PER_SOURCE_RETRIES = 2

  const installPromise = (async () => {
    // 1. 内置 CLI（秒装，无需网络）
    try {
      await installFromBundled(eventSender)
      return
    } catch (e) {
      // 无内置，继续
    }

    // 2. Gitee 镜像（国内快），重试 PER_SOURCE_RETRIES 次
    const assetName = getAssetName()
    const giteeUrl = `${GITEE_RELEASE_BASE}/${CLI_VERSION}/${assetName}`
    for (let i = 0; i < PER_SOURCE_RETRIES; i++) {
      try {
        if (i > 0) sendProgress(`Gitee 重试 (${i + 1}/${PER_SOURCE_RETRIES})...`)
        await installFromUrl(giteeUrl, eventSender)
        return
      } catch (e) {
        console.log(`[installer] Gitee attempt ${i + 1} failed: ${e.message}`)
        if (i < PER_SOURCE_RETRIES - 1) await sleep(2000)
      }
    }

    // 3. GitHub 预编译二进制，重试 PER_SOURCE_RETRIES 次
    const githubUrl = `${GITHUB_RELEASE_BASE}/${assetName}`
    for (let i = 0; i < PER_SOURCE_RETRIES; i++) {
      try {
        if (i > 0) sendProgress(`GitHub 重试 (${i + 1}/${PER_SOURCE_RETRIES})...`)
        await installFromUrl(githubUrl, eventSender)
        return
      } catch (e) {
        console.log(`[installer] GitHub attempt ${i + 1} failed: ${e.message}`)
        if (i < PER_SOURCE_RETRIES - 1) await sleep(2000)
      }
    }

    // 4. npm 全局安装（最后手段，不重试）
    sendProgress('所有下载源均已尝试，正在通过 npm 安装...')
    await installFromNpm(eventSender)
  })()

  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('安装超时（5分钟），请检查网络连接后重试')), INSTALL_TIMEOUT)
  })

  try {
    await Promise.race([installPromise, timeout])
  } catch (e) {
    sendProgress(e.message)
    throw e
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 首次启动时自动静默安装
 */
async function autoInstallIfNeeded(mainWindow) {
  const result = await detect()
  if (result.installed) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mimo:status', result)
    }
    return
  }

  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mimo:status', { installed: false, installing: true })
    }
    await install(mainWindow)
    const afterInstall = await detect()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mimo:status', { ...afterInstall, justInstalled: true })
    }
  } catch (err) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mimo:status', { installed: false, error: err.message })
    }
  }
}

// === 工具函数 ===

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const follow = (currentUrl, redirectCount = 0) => {
      if (redirectCount > 10) { reject(new Error('Too many redirects')); return }

      const mod = currentUrl.startsWith('https') ? require('https') : require('http')
      const req = mod.get(currentUrl, { timeout: 60000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          follow(res.headers.location, redirectCount + 1)
          return
        }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return }

        const total = parseInt(res.headers['content-length'] || '0', 10)
        let downloaded = 0

        const file = createWriteStream(destPath)
        res.on('data', (chunk) => { downloaded += chunk.length; onProgress?.(downloaded, total) })
        res.pipe(file)
        file.on('finish', () => { file.close(); resolve() })
        file.on('error', reject)
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Download timeout')) })
    }
    follow(url)
  })
}

function extractZip(archivePath, destDir) {
  return new Promise((resolve, reject) => {
    if (os.platform() === 'win32') {
      const psCmd = `powershell -NoProfile -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force"`
      exec(psCmd, (error) => { if (error) reject(error); else resolve() })
    } else {
      exec(`unzip -o "${archivePath}" -d "${destDir}"`, (error) => { if (error) reject(error); else resolve() })
    }
  })
}

function extractTarGz(archivePath, destDir) {
  return new Promise((resolve, reject) => {
    exec(`tar -xzf "${archivePath}" -C "${destDir}"`, (error) => { if (error) reject(error); else resolve() })
  })
}

function copyFileSync(src, dest) {
  const data = fs.readFileSync(src)
  fs.writeFileSync(dest, data)
}

/**
 * 静默安装（不依赖 BrowserWindow eventSender）
 * 用于 streaming.cjs 等后端调用场景，进度通过回调输出
 */
function installSilent(onProgress) {
  const emitter = {
    send: (channel, data) => {
      if (onProgress) onProgress(data)
    },
    isDestroyed: () => false,
  }
  return install(emitter)
}

module.exports = { detect, install, autoInstallIfNeeded, installSilent }
