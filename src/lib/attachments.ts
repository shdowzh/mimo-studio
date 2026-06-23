// attachments.ts — 附件相关单一事实源
// 集中：扩展名→mime 表、mime→kind、Electron dialog filters、边界常量、从磁盘路径构造草稿附件
//
// mime 判定表需与 electron/services/files.cjs 里的扩展名表保持同步
// （CJS 主进程与 TS 渲染端无法直接共享常量，靠注释标注同步关系）

import type { DraftAttachment } from './mimoTypes'
import { getAPI, isElectron } from './ipc'

// === 边界 ===
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10MB（base64 后 ~13MB，可接受）
export const MAX_TEXT_BYTES = 2 * 1024 * 1024 // 2MB（file:// 让服务端按需 Read，草稿期拦截巨型文件噪音）

// === 扩展名 → mime（与 electron/services/files.cjs EXT_MIME 同步）===
// 注意：服务端 file:// 协议仅在 mime === 'text/plain' 时走 Read tool 读取文本内容，
//       非 text/plain 的非媒体 mime 会落到二进制分支。所以文本/代码文件一律归一成 'text/plain'，
//       与上游 build-request-parts.ts 硬编码 mime: "text/plain" 一致。
const TEXT_EXTS = new Set([
  // 纯文本/配置
  'txt',
  'md',
  'markdown',
  'log',
  'env',
  'gitignore',
  // 结构化数据（统一当 text/plain，服务端按文本读）
  'json',
  'yml',
  'yaml',
  'toml',
  'xml',
  // 前端
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'html',
  'css',
  'scss',
  'vue',
  // 后端/通用
  'py',
  'go',
  'rs',
  'java',
  'kt',
  'c',
  'cpp',
  'cc',
  'h',
  'hpp',
  'rb',
  'php',
  'swift',
  'sh',
  'bash',
  'zsh',
  'bat',
  'ps1',
  'sql',
])

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

export function mimeFromFilename(filename: string): string {
  const dot = filename.lastIndexOf('.')
  const ext = dot >= 0 ? filename.slice(dot + 1).toLowerCase() : ''
  // 无扩展名的常见文件名直接命中
  if (!ext) {
    const base = filename.toLowerCase()
    if (base === 'dockerfile' || base === 'makefile') return 'text/plain'
    return 'application/octet-stream'
  }
  if (IMAGE_MIME[ext]) return IMAGE_MIME[ext]
  if (TEXT_EXTS.has(ext)) return 'text/plain'
  return 'application/octet-stream'
}

export function kindFromMime(mime: string): 'image' | 'text' | 'binary' {
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'text/plain') return 'text'
  // application/octet-stream、application/vnd.* 等都是二进制，
  // 服务端 Read tool 只认 text/plain，发过去会报 UnknownError
  return 'binary'
}

// === Electron dialog filters（native.openFile 用）===
// 顺序：默认项放第一个（Electron dialog 默认用首个 filter）。
// 用户反馈：文本/代码打头时，非技术用户找不到文件以为不支持，故改为"所有文件"优先。
export const FILE_PICKER_FILTERS: { name: string; extensions: string[] }[] = [
  { name: '所有文件', extensions: ['*'] },
  {
    name: '文本/代码',
    extensions: [
      'txt',
      'md',
      'markdown',
      'log',
      'env',
      'gitignore',
      'json',
      'yml',
      'yaml',
      'toml',
      'xml',
      'ts',
      'tsx',
      'js',
      'jsx',
      'mjs',
      'cjs',
      'html',
      'css',
      'scss',
      'vue',
      'py',
      'go',
      'rs',
      'java',
      'kt',
      'c',
      'cpp',
      'cc',
      'h',
      'hpp',
      'rb',
      'php',
      'swift',
      'sh',
      'bash',
      'zsh',
      'bat',
      'ps1',
      'sql',
    ],
  },
  {
    name: '图片',
    extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
  },
]

/**
 * 从磁盘绝对路径构造草稿附件（异步：图片要读 dataUrl + stat）
 * 超限或读取失败时抛错，由调用方 Toast 提示
 */
export async function attachmentFromPath(absPath: string): Promise<DraftAttachment> {
  if (!isElectron()) throw new Error('附件需要 Electron 环境')
  const api = getAPI()
  const filename = absPath.split(/[/\\]/).pop() || absPath
  const mime = mimeFromFilename(filename)
  const kind = kindFromMime(mime)
  const stat = await api.files.stat(absPath)

  if (stat.isDirectory) throw new Error('不能附加目录，请选择文件')

  // 二进制文件（xlsx / pdf / docx 等）：服务端 Read tool 只认 text/plain，发过去必报错
  if (kind === 'binary') {
    throw new Error(
      `不支持此类型文件（${mime}），仅支持文本/代码文件和图片。建议让 AI 自行读取该文件`,
    )
  }

  const base: DraftAttachment = {
    id: crypto.randomUUID(),
    filename,
    mime,
    kind,
    absolutePath: absPath,
    sizeBytes: stat.size,
  }

  if (kind === 'image') {
    if (stat.size > MAX_IMAGE_BYTES) {
      throw new Error(`图片过大（${(stat.size / 1024 / 1024).toFixed(1)}MB > 10MB）`)
    }
    base.dataUrl = await api.files.readAsDataUrl(absPath)
  } else {
    if (stat.size > MAX_TEXT_BYTES) {
      throw new Error(`文本文件过大（${(stat.size / 1024 / 1024).toFixed(1)}MB > 2MB），建议让 AI 自行读取`)
    }
  }

  return base
}

/**
 * 从浏览器 File 对象构造草稿附件（剪贴板截图 / 拖入的网页图片）
 *
 * 适用场景：File 对象没有磁盘路径（webUtils.getPathForFile 返回 ''）—— 通常是：
 *   - 截图工具粘贴（ShareX / Snipping Tool / macOS shift-cmd-4 clipboard）
 *   - 从浏览器拖出的图片
 *
 * 限制：当前只支持图片。文本类 File 没有持久路径，发出去服务端 Read tool 也无从读取。
 *      非图片 File 走这条会被 reject —— 让用户先存盘再拖。
 *
 * 实现细节：FileReader.readAsDataURL 走渲染端 Blob → base64，不经主进程 IPC。
 *          mime 优先用 File.type（浏览器嗅探更准），fallback 用扩展名表。
 */
export async function attachmentFromClipboardFile(file: File): Promise<DraftAttachment> {
  // 截图常被命名为 'image.png' / 空字符串 / 时间戳 —— 兜底取 file.type 后缀
  const filename = file.name || `clipboard-${Date.now()}.${file.type.split('/')[1] || 'bin'}`
  const mime = file.type || mimeFromFilename(filename)
  const kind = kindFromMime(mime)

  if (kind !== 'image') {
    throw new Error(`不支持粘贴此类型文件（${mime || '未知'}），仅支持图片和文本/代码文件`)
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`图片过大（${(file.size / 1024 / 1024).toFixed(1)}MB > 10MB）`)
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('读取剪贴板图片失败'))
    reader.readAsDataURL(file)
  })

  return {
    id: crypto.randomUUID(),
    filename,
    mime,
    kind,
    // 无 absolutePath —— chatFlow.ts 按 dataUrl 优先判定，自然走内联
    dataUrl,
    sizeBytes: file.size,
  }
}

// === 批量统一入口 ===
//
// 来源（AttachmentSource）：
//   - { kind: 'path', path }  —— 来自 Electron 对话框选择 / 拖入文件取到的磁盘路径
//   - { kind: 'file', file }  —— 来自 paste / drop 的浏览器 File 对象（截图、网页图片）
//
// 部分成功语义：每项独立 try/catch，失败收集到 errors，不影响其他项。
//              调用方拿到 { ok, errors } 后：ok 进 chip 列表，errors 逐条 toast。

export type AttachmentSource = { kind: 'path'; path: string } | { kind: 'file'; file: File }

export interface BatchResult {
  ok: DraftAttachment[]
  errors: string[]
}

export async function buildAttachmentsBatch(items: AttachmentSource[]): Promise<BatchResult> {
  const ok: DraftAttachment[] = []
  const errors: string[] = []

  // 顺序 await 而非 Promise.all：保证错误顺序与输入顺序一致，便于用户对应排查
  for (const item of items) {
    try {
      const att =
        item.kind === 'path' ? await attachmentFromPath(item.path) : await attachmentFromClipboardFile(item.file)
      ok.push(att)
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }

  return { ok, errors }
}
