// fileUrl.ts 测试 — 验证本地路径 → file:// url 编码
// 重点：Windows 盘符/空格/中文编码，以及 url.fileURLToPath 能正确还原（服务端靠它读文件）

import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { encodeFilePath, encodeFilePathWithRange } from './fileUrl'

describe('encodeFilePath', () => {
  it('Windows 绝对路径：盘符保留、反斜杠转正斜杠', () => {
    expect(encodeFilePath('D:\\foo\\bar.ts')).toBe('file:///D:/foo/bar.ts')
  })

  it('Windows 路径含空格：空格 percent-encode', () => {
    expect(encodeFilePath('D:\\foo\\bar baz.txt')).toBe('file:///D:/foo/bar%20baz.txt')
  })

  it('Windows 路径含中文：UTF-8 percent-encode', () => {
    expect(encodeFilePath('D:\\项目\\文件.txt')).toBe('file:///D:/%E9%A1%B9%E7%9B%AE/%E6%96%87%E4%BB%B6.txt')
  })

  it('Unix 绝对路径：不补盘符前缀', () => {
    expect(encodeFilePath('/home/foo/bar.ts')).toBe('file:///home/foo/bar.ts')
  })

  it('Unix 路径含空格', () => {
    expect(encodeFilePath('/home/foo/bar baz.txt')).toBe('file:///home/foo/bar%20baz.txt')
  })

  // Windows 路径的 fileURLToPath 往返只在 Windows 平台验证
  // （Linux 的 fileURLToPath 不认盘符，还原后多出前导 /，如 '/D:/foo'）
  const itOnWindows = process.platform === 'win32' ? it : it.skip

  itOnWindows('Windows 路径经 fileURLToPath 能还原为原始路径', () => {
    const original = 'D:\\foo\\bar baz.txt'
    const url = encodeFilePath(original)
    // fileURLToPath 在 Windows 上返回带反斜杠的路径，这里只比较正斜杠归一化形式
    const restored = fileURLToPath(url).replace(/\\/g, '/')
    expect(restored).toBe('D:/foo/bar baz.txt')
  })

  // Unix 路径的 fileURLToPath 往返只在非 Windows 平台验证
  // （Windows 的 fileURLToPath 不接受 Unix 风格的绝对路径，会抛 "File URL path must be absolute"）
  const itOnUnix = process.platform === 'win32' ? it.skip : it

  itOnUnix('Unix 路径经 fileURLToPath 能精确还原', () => {
    const original = '/home/foo/bar baz.txt'
    const url = encodeFilePath(original)
    expect(fileURLToPath(url)).toBe(original)
  })

  itOnUnix('中文路径经 fileURLToPath 能还原', () => {
    const original = '/home/项目/文件.txt'
    const url = encodeFilePath(original)
    expect(fileURLToPath(url)).toBe(original)
  })
})

describe('encodeFilePathWithRange', () => {
  it('无选区返回纯 file:// url', () => {
    expect(encodeFilePathWithRange('/foo/bar.ts')).toBe('file:///foo/bar.ts')
  })

  it('带 start/end 行选区', () => {
    expect(encodeFilePathWithRange('/foo/bar.ts', 10, 20)).toBe('file:///foo/bar.ts?start=10&end=20')
  })

  it('仅 start', () => {
    expect(encodeFilePathWithRange('/foo/bar.ts', 5)).toBe('file:///foo/bar.ts?start=5')
  })
})
