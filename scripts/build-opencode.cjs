// 编译 opencode server 为可嵌入的 JS 文件
// Usage: node scripts/build-opencode.cjs [path-to-mimocode-fork]
//
// 需要 Bun 运行时。从 MiMo Code 源码编译服务端，产出 node.js 供
// streaming.cjs 的嵌入模式直接 import。

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const forkPath = process.argv[2]
  || process.env.MIMO_OPENCODE_ROOT
  || path.join(__dirname, '..', '..', 'MiMo-Code-main')

const opencodeDir = path.join(forkPath, 'packages', 'opencode')
const distDir = path.join(__dirname, '..', 'opencode-dist')

console.log('🔨 Build OpenCode Server for Embedded Mode\n')
console.log(`   Fork:     ${forkPath}`)
console.log(`   Package:  ${opencodeDir}`)
console.log(`   Output:   ${distDir}\n`)

// 1. 检查 fork 是否存在
if (!fs.existsSync(opencodeDir)) {
  console.error(`❌ MiMo Code fork not found at: ${forkPath}`)
  console.error('   Set MIMO_OPENCODE_ROOT env var or pass path as argument.')
  process.exit(1)
}

// 2. 检查 Bun
try {
  const bunVer = execSync('bun --version', { encoding: 'utf-8' }).trim()
  console.log(`   Bun:      ${bunVer}`)
} catch {
  console.error('❌ Bun is required to build opencode server.')
  console.error('   Install: https://bun.sh')
  process.exit(1)
}

// 3. 安装依赖（如果需要）
const nodeModules = path.join(forkPath, 'node_modules')
if (!fs.existsSync(nodeModules)) {
  console.log('[1/3] Installing monorepo dependencies...')
  execSync('bun install', { stdio: 'inherit', cwd: forkPath })
} else {
  console.log('[1/3] Dependencies already installed ✓')
}

// 4. 编译 opencode server
console.log('[2/3] Building opencode server (this may take a few minutes)...')
execSync('bun run build', { stdio: 'inherit', cwd: opencodeDir })

// 5. 检查产出
const serverEntry = path.join(opencodeDir, 'dist', 'node', 'node.js')
if (!fs.existsSync(serverEntry)) {
  console.error(`❌ Build did not produce expected output: ${serverEntry}`)
  console.error('   Check the build output above for errors.')
  process.exit(1)
}

// 6. 复制到项目目录
console.log('[3/3] Copying server dist to opencode-dist/...')
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true })
}
copyDirRecursive(path.join(opencodeDir, 'dist', 'node'), distDir)

// 7. 检查 wasm 文件
const wasmFiles = fs.readdirSync(distDir).filter(f => f.endsWith('.wasm'))
if (wasmFiles.length > 0) {
  console.log(`   WASM files: ${wasmFiles.join(', ')}`)
}

console.log('\n✅ OpenCode server built successfully!')
console.log(`   ${distDir}/node.js`)
console.log('\n   The app will now use embedded mode (no subprocess).')

// === 工具函数 ===

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}
