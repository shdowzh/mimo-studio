// Release script — 构建所有平台安装包并输出到 release/ 目录
// Usage: node scripts/release.cjs [version]

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const version = process.argv[2] || process.env.npm_package_version || '1.0.0'
const releaseDir = path.join(__dirname, '..', 'release')
const distDir = path.join(__dirname, '..', 'dist')

console.log(`\n🚀 MiMo Studio Release v${version}\n`)

// 1. 构建前端
console.log('[1/4] Building frontend...')
execSync('npx vite build', { stdio: 'inherit', cwd: path.join(__dirname, '..') })

// 2. 清理旧的 release
if (fs.existsSync(releaseDir)) {
  console.log('[2/4] Cleaning old release...')
  fs.rmSync(releaseDir, { recursive: true, force: true })
}

// 3. 构建平台安装包
const platform = process.argv[3] || process.platform
console.log(`[3/4] Building for ${platform}...`)

const buildCmd = platform === 'win32' ? 'electron-builder --win'
  : platform === 'darwin' ? 'electron-builder --mac'
  : 'electron-builder --linux'

execSync(`npx ${buildCmd}`, { stdio: 'inherit', cwd: path.join(__dirname, '..') })

// 4. 生成校验和
console.log('[4/4] Generating checksums...')
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
