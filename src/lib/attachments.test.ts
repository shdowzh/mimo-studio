// attachments.ts 测试 — mime 判定与 kind 分类，buildAttachmentsBatch 错误聚合语义
// attachmentFromPath / attachmentFromClipboardFile 依赖 Electron IPC / 浏览器 File API，
// 不在单元测试范围（需集成测试）；这里只测纯函数 + 错误收集行为。

import { describe, it, expect } from 'vitest'
import { mimeFromFilename, kindFromMime, buildAttachmentsBatch } from './attachments'

describe('mimeFromFilename', () => {
  it('图片扩展名返回对应 image mime', () => {
    expect(mimeFromFilename('a.png')).toBe('image/png')
    expect(mimeFromFilename('a.jpg')).toBe('image/jpeg')
    expect(mimeFromFilename('a.jpeg')).toBe('image/jpeg')
    expect(mimeFromFilename('a.gif')).toBe('image/gif')
    expect(mimeFromFilename('a.webp')).toBe('image/webp')
  })

  it('代码/文本扩展名统一返回 text/plain（服务端 file:// 仅认 text/plain 走 Read）', () => {
    expect(mimeFromFilename('a.ts')).toBe('text/plain')
    expect(mimeFromFilename('a.tsx')).toBe('text/plain')
    expect(mimeFromFilename('a.js')).toBe('text/plain')
    expect(mimeFromFilename('a.py')).toBe('text/plain')
    expect(mimeFromFilename('a.md')).toBe('text/plain')
    expect(mimeFromFilename('a.json')).toBe('text/plain')
    expect(mimeFromFilename('a.yml')).toBe('text/plain')
    expect(mimeFromFilename('a.sh')).toBe('text/plain')
  })

  it('无扩展名的已知文件名命中', () => {
    expect(mimeFromFilename('Dockerfile')).toBe('text/plain')
    expect(mimeFromFilename('Makefile')).toBe('text/plain')
  })

  it('无扩展名且未知 → octet-stream', () => {
    expect(mimeFromFilename('README')).toBe('application/octet-stream')
  })

  it('未知扩展名 → octet-stream', () => {
    expect(mimeFromFilename('a.xyz')).toBe('application/octet-stream')
  })

  it('扩展名大小写不敏感', () => {
    expect(mimeFromFilename('A.PNG')).toBe('image/png')
    expect(mimeFromFilename('A.TS')).toBe('text/plain')
  })
})

describe('kindFromMime', () => {
  it('image/* → image', () => {
    expect(kindFromMime('image/png')).toBe('image')
    expect(kindFromMime('image/jpeg')).toBe('image')
  })

  it('非 image → text', () => {
    expect(kindFromMime('text/plain')).toBe('text')
  })

  it('application/octet-stream / application/vnd.* → binary', () => {
    expect(kindFromMime('application/octet-stream')).toBe('binary')
    expect(kindFromMime('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('binary')
    expect(kindFromMime('application/pdf')).toBe('binary')
  })
})

describe('buildAttachmentsBatch', () => {
  it('空输入 → 空结果，不抛', async () => {
    const result = await buildAttachmentsBatch([])
    expect(result).toEqual({ ok: [], errors: [] })
  })

  it('部分成功语义：每项独立 try/catch，失败收集进 errors 不影响其他项', async () => {
    // node 测试环境无 window 全局，attachmentFromPath 调用 isElectron() 即抛错
    // 这里只验聚合行为：N 项失败 → ok 为空 + errors 累加到 N，不短路
    const result = await buildAttachmentsBatch([
      { kind: 'path', path: 'D:/x.ts' },
      { kind: 'path', path: 'D:/y.ts' },
      { kind: 'path', path: 'D:/z.ts' },
    ])
    expect(result.ok).toEqual([])
    expect(result.errors).toHaveLength(3)
    // 每条都应是非空错误字符串（具体消息内容是平台细节，不硬编码）
    for (const msg of result.errors) {
      expect(typeof msg).toBe('string')
      expect(msg.length).toBeGreaterThan(0)
    }
  })
})
