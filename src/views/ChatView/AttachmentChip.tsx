// 附件 chip — 输入框待发送附件展示
// 三类视觉：
//   - image：缩略图（dataUrl 直显，丢失时退回 ImageIcon）
//   - text/代码：FileCode（代码扩展名）或 FileText（普通文本）图标
//   - binary：File 通用图标 + 扩展名徽章；hover 提示"将以路径形式发送，AI 会按需读取"
//             视觉上用 border-dashed 区分"路径附件"和"内联附件"
// 角标 ⚠️：当 warning prop 传入时，在 chip 右上角叠一个小三角标，hover title 显示完整警告
//          —— 用于图片附件 + 当前模型不支持 vision 时提示用户
// 动画：mount 走 slide-up（进场）；点 × 后内部置 removing 态走 slide-down-out（出场），
//       onAnimationEnd 才回调父组件真正 remove —— 否则普通 unmount 没有出场过场。

import { useState } from 'react'
import { X, FileText, FileCode, File as FileIcon, Image as ImageIcon, AlertTriangle } from 'lucide-react'
import type { DraftAttachment } from '@/lib/mimoTypes'

const CODE_EXTS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
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
  'html',
  'css',
  'scss',
  'vue',
  'json',
  'yml',
  'yaml',
  'toml',
  'xml',
])

function TextIcon({ filename }: { filename: string }) {
  const ext = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase()
  return CODE_EXTS.has(ext) ? <FileCode size={14} /> : <FileText size={14} />
}

// 取扩展名（大写、最多 4 字），无扩展名时返回 'FILE' 兜底
function extBadge(filename: string): string {
  const dot = filename.lastIndexOf('.')
  if (dot < 0 || dot === filename.length - 1) return 'FILE'
  return filename.slice(dot + 1, dot + 5).toUpperCase()
}

export default function AttachmentChip({
  att,
  onRemove,
  warning,
}: {
  att: DraftAttachment
  onRemove: () => void
  /** 非空时在 chip 右上角显示 ⚠️ 角标，title 显示该警告（如"当前模型可能不支持图片"） */
  warning?: string
}) {
  const [removing, setRemoving] = useState(false)

  const handleRemoveClick = () => {
    if (removing) return // 防止动画期间重复点击
    setRemoving(true)
  }

  const handleAnimationEnd = (e: React.AnimationEvent<HTMLDivElement>) => {
    // 仅响应出场动画结束（进场 slide-up 不触发 remove）
    if (removing && e.animationName === 'slideDownOut') {
      onRemove()
    }
  }

  const isBinary = att.kind === 'binary'
  // binary 文件用 dashed 边框 + 文件路径 title，与"内联附件"区分
  const tooltip = isBinary ? `${att.filename}\n将以路径形式发送，AI 会按需读取` : att.filename

  return (
    <div
      onAnimationEnd={handleAnimationEnd}
      className={`group relative flex items-center gap-1.5 bg-mc-elevated rounded-lg pl-1.5 pr-2 py-1 max-w-[220px] ${
        isBinary ? 'border border-dashed border-mc-border' : 'border border-mc-border'
      } ${warning ? 'ring-1 ring-mc-warning/40' : ''} ${
        removing ? 'animate-slide-down-out pointer-events-none' : 'animate-slide-up'
      }`}
    >
      {att.kind === 'image' && att.dataUrl ? (
        <img src={att.dataUrl} alt={att.filename} className="w-6 h-6 object-cover rounded shrink-0" />
      ) : att.kind === 'image' ? (
        <ImageIcon size={14} className="text-mc-text-muted shrink-0" />
      ) : isBinary ? (
        <span className="flex items-center gap-1 text-mc-text-muted shrink-0">
          <FileIcon size={14} />
          <span className="text-[10px] font-mono uppercase tracking-tight">{extBadge(att.filename)}</span>
        </span>
      ) : (
        <span className="text-mc-text-muted shrink-0">
          <TextIcon filename={att.filename} />
        </span>
      )}
      <span className="text-2xs text-mc-text truncate max-w-[140px]" title={tooltip}>
        {att.filename}
      </span>
      {warning && (
        <span
          className="shrink-0 text-mc-warning"
          title={warning}
          aria-label="附件警告"
        >
          <AlertTriangle size={11} />
        </span>
      )}
      <button
        onClick={handleRemoveClick}
        className="shrink-0 text-mc-text-muted hover:text-mc-error transition-colors"
        title="移除附件"
      >
        <X size={12} />
      </button>
    </div>
  )
}
