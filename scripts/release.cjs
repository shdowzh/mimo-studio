// Release script — 构建所有平台安装包并输出到 release/ 目录
// Usage: node scripts/release.cjs [version] [platform]

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const version = process.argv[2] || process.env.npm_package_version || '1.0.0'
const releaseDir = path.join(__dirname, '..', 'release')
const cliDir = path.join(__dirname, '..', 'cli')

const GITHUB_RELEASE_BASE = 'https://github.com/XiaomiMiMo/MiMo-Code/releases/latest/download'

console.log(`\n🚀 MiMo Studio Release v${version}\n`)

// 1. 构建前端
console.log('[1/5] Building frontend...')
execSync('npx vite build', { stdio: 'inherit', cwd: path.join(__dirname, '..') })

// 2. 下载内置 MiMo CLI
console.log('[2/5] Downloading bundled MiMo CLI...')
downloadBundledCli()

// 3. 清理旧的 release
console.log('[3/5] Cleaning old release...')
if (fs.existsSync(releaseDir)) {
  fs.rmSync(releaseDir, { recursive: true, force: true })
}

// 4. 构建平台安装包
const platform = process.argv[3] || process.platform
console.log(`[4/5] Building for ${platform}...`)

const buildCmd = platform === 'win32' ? 'electron-builder --win'
  : platform === 'darwin' ? 'electron-builder --mac'
  : 'electron-builder --linux'

execSync(`npx ${buildCmd}`, { stdio: 'inherit', cwd: path.join(__dirname, '..') })

// 5. 生成校验和
console.log('[5/5] Generating checksums...')
const checksums = []
if (fs.existsSync(releaseDir)) {
  const crypto = require('crypto')
  function walk(dirFile) {
    const files = fs.readdirSync(dirFile)
    for (const f of files) {
      const fp = path.join(dirFile, f)
      if (fs.statSync(fp).isDirectory()) { walk(fp); continue }
      if (f.endsWith('.blockmap') || f.endsWith('.yml')) continue
      const hash = crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex')
      checksums.push(`${hash}  ${f}`)
    }
  }
  walk(releaseDir)
  fs.writeFileSync(path.join(releaseDir, 'SHA256SUMS'), checksums.join('\n') + '\n')
}

console.log('\n✅ Release complete!')
console.log(`   Output: ${releaseDir}`)
if (checksums.length > 0) {
  console.log('   Files:')
  checksums.forEach(c => console.log(`     ${c}`))
}

// === 下载内置 CLI ===
function getAssetName() {
  const platform = os.platform()
  const arch = os.arch()
  if (platform === 'win32') return arch === 'arm64' ? 'mimocode-windows-arm64.zip' : 'mimocode-windows-x64.zip'
  if (platform === 'darwin') return arch === 'arm64' ? 'mimocode-darwin-arm64.zip' : 'mimocode-darwin-x64.zip'
  return arch === 'arm64' ? 'mimocode-linux-arm64.tar.gz' : 'mimocode-linux-x64.tar.gz'
}

function downloadBundledCli() {
  const assetName = getAssetName()
  const platformName = os.platform() === 'win32' ? 'windows' : os.platform() === 'darwin' ? 'darwin' : 'linux'
  const archName = os.arch() === 'arm64' ? 'arm64' : 'x64'
  const targetDir = path.join(cliDir, `${platformName}-${archName}`)
  const binName = os.platform() === 'win32' ? 'mimo.exe' : 'mimo'
  const targetBin = path.join(targetDir, binName)

  // 已存在就跳过
  if (fs.existsSync(targetBin)) {
    console.log(`  ✓ Bundled CLI already exists: ${targetBin}`)
    return
  }

  fs.mkdirSync(targetDir, { recursive: true })
  const archivePath = path.join(targetDir, assetName)
  const url = `${GITHUB_RELEASE_BASE}/${assetName}`

  console.log(`  Downloading ${url}...`)
  execSync(`curl -L --progress-bar -o "${archivePath}" "${url}"`, { stdio: 'inherit' })

  console.log('  Extracting...')
  if (assetName.endsWith('.zip')) {
    execSync(`unzip -o "${archivePath}" -d "${targetDir}"`, { stdio: 'inherit' })
  } else {
    execSync(`tar -xzf "${archivePath}" -C "${targetDir}"`, { stdio: 'inherit' })
  }

  if (os.platform() !== 'win32') {
    try { fs.chmodSync(targetBin, 0o755) } catch {}
  }

  try { fs.unlinkSync(archivePath) } catch {}

  console.log(`  ✓ Bundled CLI installed: ${targetBin}`)
}
