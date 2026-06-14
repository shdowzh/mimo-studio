// MiMo CLI 检测 + 安装服务
// 安装策略（按优先级）：
// 1. 检测 PATH 中是否已有 mimo（任何来源）
// 2. 检测 ~/.mimocode/bin/mimo（curl 安装脚本位置）
// 3. 都没有 → 从 GitHub Releases 下载预编译二进制（不需要 npm！）
// 4. 如果 GitHub 下载失败 → 回退到 npm install -g（需要 Node.js）
//
// 关于冲突：
// - 预编译二进制下载到 ~/.mimocode/bin/mimo，和 curl 脚本安装位置一致
// - 如果用户之前用 npm 全局安装了，PATH 会优先命中全局版本
// - 两者并存不冲突

const { exec, execFile } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')
const https = require('https')
const { createWriteStream, mkdirSync, existsSync, rmSync } = require('fs')
const { getMimoDataDir } = require('./database.cjs')

const GITHUB_RELEASE_BASE = 'https://github.com/XiaomiMiMo/MiMo-Code/releases/latest/download'

/**
 * 根据当前平台获取预编译二进制的下载文件名
 */
function getAssetName() {
  const platform = os.platform()  // win32 / darwin / linux
  const arch = os.arch()          // x64 / arm64

  if (platform === 'win32') {
    return arch === 'arm64' ? 'mimocode-windows-arm64.zip' : 'mimocode-windows-x64.zip'
  } else if (platform === 'darwin') {
    return arch === 'arm64' ? 'mimocode-darwin-arm64.zip' : 'mimocode-darwin-x64.zip'
  } else {
    // linux — glibc (不是 musl)
    return arch === 'arm64' ? 'mimocode-linux-arm64.tar.gz' : 'mimocode-linux-x64.tar.gz'
  }
}

/**
 * 检测 mimo CLI 是否可用
 * 返回 { installed, version, path, source }
 */
function detect() {
  return new Promise((resolve) => {
    // 1) 先检测 PATH
    exec('mimo --version', (error, stdout) => {
      if (!error && stdout.trim()) {
        resolve({
          installed: true,
          version: stdout.trim(),
          source: 'path',
        })
        return
      }

      // 2) 再检测 ~/.mimocode/bin/mimo（curl 安装脚本 / 预编译二进制位置）
      const binDir = path.join(getMimoDataDir(), 'bin')
      const isWin = os.platform() === 'win32'
      const binName = isWin ? 'mimo.exe' : 'mimo'
      const binPath = path.join(binDir, binName)

      if (existsSync(binPath)) {
        execFile(binPath, ['--version'], (err2, stdout2) => {
          if (!err2 && stdout2.trim()) {
            resolve({
              installed: true,
              version: stdout2.trim(),
              path: binPath,
              source: 'local-bin',
            })
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
 * 方式 1：从 GitHub Releases 下载预编译二进制（推荐，不需要 npm）
 */
function installFromGitHub(eventSender) {
  return new Promise(async (resolve, reject) => {
    const assetName = getAssetName()
    const downloadUrl = `${GITHUB_RELEASE_BASE}/${assetName}`
    const binDir = path.join(getMimoDataDir(), 'bin')
    const tempDir = path.join(getMimoDataDir(), '.tmp-install')

    // 发送进度
    const sendProgress = (msg) => {
      if (eventSender && !eventSender.isDestroyed()) {
        eventSender.send('mimo:installProgress', { stdout: msg })
      }
    }

    try {
      sendProgress(`正在下载 ${assetName}...`)

      // 创建临时目录
      if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true })
      if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true })

      const isWin = os.platform() === 'win32'
      const isZip = assetName.endsWith('.zip')
      const archivePath = path.join(tempDir, assetName)

      // 下载文件
      await downloadFile(downloadUrl, archivePath, (downloaded, total) => {
        if (total > 0) {
          const pct = Math.round(downloaded / total * 100)
          sendProgress(`下载中... ${pct}%`)
        }
      })

      sendProgress('下载完成，正在解压...')

      // 解压
      if (isZip) {
        // Windows / macOS: .zip
        await extractZip(archivePath, tempDir)
      } else {
        // Linux: .tar.gz
        await extractTarGz(archivePath, tempDir)
      }

      // 找到解压后的 mimo 可执行文件
      const mimoBinName = isWin ? 'mimo.exe' : 'mimo'
      let mimoBinPath = null

      // 在解压目录中搜索 mimo 可执行文件
      const findMimoBin = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          if (entry.isFile() && entry.name === mimoBinName) {
            return fullPath
          }
          if (entry.isDirectory()) {
            const found = findMimoBin(fullPath)
            if (found) return found
          }
        }
        return null
      }

      mimoBinPath = findMimoBin(tempDir)

      if (!mimoBinPath) {
        // 有些 release 可能在根目录就叫 mimocode 而不是 mimo
        const altBinName = isWin ? 'mimocode.exe' : 'mimocode'
        const findAlt = (dir) => {
          const entries = fs.readdirSync(dir, { withFileTypes: true })
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name)
            if (entry.isFile() && entry.name === altBinName) {
              return fullPath
            }
            if (entry.isDirectory()) {
              const found = findAlt(fullPath)
              if (found) return found
            }
          }
          return null
        }
        mimoBinPath = findAlt(tempDir)
      }

      if (!mimoBinPath) {
        throw new Error('下载包中未找到 mimo 可执行文件')
      }

      // 移动到最终位置
      const destPath = path.join(binDir, mimoBinName)
      if (existsSync(destPath)) rmSync(destPath)

      // 如果文件名是 mimocode，也复制为 mimo（两个名字都能用）
      const srcName = path.basename(mimoBinPath)
      copyFileSync(mimoBinPath, destPath)

      // 如果源文件叫 mimocode，额外再建一个 mimo 的别名
      if (srcName.startsWith('mimocode')) {
        const aliasPath = path.join(binDir, mimoBinName)
        if (!existsSync(aliasPath) || aliasPath === destPath) {
          copyFileSync(mimoBinPath, aliasPath)
        }
      }

      // 设置可执行权限 (非 Windows)
      if (!isWin) {
        try { fs.chmodSync(destPath, 0o755) } catch {}
      }

      // 清理临时目录
      try { rmSync(tempDir, { recursive: true, force: true }) } catch {}

      sendProgress('mimo CLI 安装完成！')
      resolve()
    } catch (err) {
      // 清理临时文件
      try { rmSync(tempDir, { recursive: true, force: true }) } catch {}
      reject(err)
    }
  })
}

/**
 * 方式 2（回退）：npm install -g（需要 Node.js）
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
    const arch = os.arch() // x64 / arm64
    const binName = isWin ? 'mimo.exe' : 'mimo'

    // 内置 CLI 目录结构: cli/<platform>-<arch>/mimo
    const platformName = os.platform() === 'win32' ? 'windows' : os.platform() === 'darwin' ? 'darwin' : 'linux'
    const archName = arch === 'arm64' ? 'arm64' : 'x64'
    const bundledDir = path.join(__dirname, '../../cli', `${platformName}-${archName}`)
    const bundledBin = path.join(bundledDir, binName)

    if (!existsSync(bundledBin)) {
      reject(new Error('本平台无内置 CLI'))
      return
    }

    sendProgress('正在从内置 CLI 安装...')

    const binDir = path.join(getMimoDataDir(), 'bin')
    if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true })

    const destPath = path.join(binDir, binName)
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
 * 智能安装：内置 CLI → GitHub 预编译二进制 → npm
 */
async function install(eventSender) {
  // 1. 优先用内置 CLI（秒装，无需网络）
  try {
    await installFromBundled(eventSender)
    return
  } catch (e) {
    // 无内置，继续下一步
  }

  // 2. GitHub 预编译二进制
  try {
    await installFromGitHub(eventSender)
    return
  } catch (githubErr) {
    // GitHub 下载失败，尝试 npm
    if (eventSender && !eventSender.isDestroyed()) {
      eventSender.send('mimo:installProgress', {
        stdout: `GitHub 下载失败 (${githubErr.message})，尝试 npm 安装...`
      })
    }
  }

  // 3. npm 全局安装（最后手段）
  await installFromNpm(eventSender)
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
      mainWindow.webContents.send('mimo:status', {
        ...afterInstall,
        justInstalled: true,
      })
    }
  } catch (err) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mimo:status', {
        installed: false,
        error: err.message,
      })
    }
  }
}

// === 工具函数 ===

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const follow = (currentUrl, redirectCount = 0) => {
      if (redirectCount > 10) {
        reject(new Error('Too many redirects'))
        return
      }

      const mod = currentUrl.startsWith('https') ? require('https') : require('http')
      const req = mod.get(currentUrl, { timeout: 60000 }, (res) => {
        // 处理重定向
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          follow(res.headers.location, redirectCount + 1)
          return
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }

        const total = parseInt(res.headers['content-length'] || '0', 10)
        let downloaded = 0

        const file = createWriteStream(destPath)
        res.on('data', (chunk) => {
          downloaded += chunk.length
          onProgress?.(downloaded, total)
        })
        res.pipe(file)
        file.on('finish', () => {
          file.close()
          resolve()
        })
        file.on('error', reject)
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Download timeout')) })
    }
    follow(url)
  })
}

function extractZip(archivePath, destDir) {
  // 使用 PowerShell 在 Windows 上解压（无需额外依赖）
  // 或者使用 Node 内置的解压方法
  return new Promise((resolve, reject) => {
    if (os.platform() === 'win32') {
      // Windows: 用 PowerShell Expand-Archive
      const psCmd = `powershell -NoProfile -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force"`
      exec(psCmd, (error) => {
        if (error) reject(error)
        else resolve()
      })
    } else {
      // macOS/Linux: 用 unzip 命令
      exec(`unzip -o "${archivePath}" -d "${destDir}"`, (error) => {
        if (error) reject(error)
        else resolve()
      })
    }
  })
}

function extractTarGz(archivePath, destDir) {
  return new Promise((resolve, reject) => {
    exec(`tar -xzf "${archivePath}" -C "${destDir}"`, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

function copyFileSync(src, dest) {
  const data = fs.readFileSync(src)
  fs.writeFileSync(dest, data)
}

module.exports = { detect, install, autoInstallIfNeeded }
