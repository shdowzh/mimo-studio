// 附件 chip — 输入框待发送附件展示
// 图片 kind 显示缩略图；文本 kind 按扩展名选图标；统一带文件名 + 删除按钮
// 动画：mount 走 slide-up（进场）；点 × 后内部置 removing 态走 slide-down-out（出场），
//       onAnimationEnd 才回调父组件真正 remove —— 否则普通 unmount 没有出场过场。

import { useState } from 'react'
import { X, FileText, FileCode, Image as ImageIcon } from 'lucide-react'
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

export default function AttachmentChip({ att, onRemove }: { att: DraftAttachment; onRemove: () => void }) {
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

  return (
    <div
      onAnimationEnd={handleAnimationEnd}
      className={`group relative flex items-center gap-1.5 bg-mc-elevated border border-mc-border rounded-lg pl-1.5 pr-2 py-1 max-w-[200px] ${
        removing ? 'animate-slide-down-out pointer-events-none' : 'animate-slide-up'
      }`}
    >
      {att.kind === 'image' && att.dataUrl ? (
        <img src={att.dataUrl} alt={att.filename} className="w-6 h-6 object-cover rounded shrink-0" />
      ) : att.kind === 'image' ? (
        <ImageIcon size={14} className="text-mc-text-muted shrink-0" />
      ) : (
        <span className="text-mc-text-muted shrink-0">
          <TextIcon filename={att.filename} />
        </span>
      )}
      <span className="text-2xs text-mc-text truncate max-w-[140px]" title={att.filename}>
        {att.filename}
      </span>
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
