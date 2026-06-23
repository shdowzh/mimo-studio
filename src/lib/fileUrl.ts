// fileUrl.ts — 把本地绝对路径编码成服务端 resolvePart 能识别的 file:// url
// 精确复刻上游 packages/app/src/context/file/path.ts:encodeFilePath
//
// 服务端 packages/opencode/src/session/prompt.ts 用 `new URL(part.url)` + `fileURLToPath`
// 还原路径后调 Read tool 读取（带 bypassCwdCheck，允许读任意绝对路径）。
// 因此 url 必须是合法的 file:// URL，且 fileURLToPath 能正确还原回原始路径。

/**
 * 把本地绝对路径编码成 file:// url
 *
 * Windows 要点：
 *   D:\foo\bar baz.txt
 *   → D:/foo/bar baz.txt       （反斜杠转正斜杠）
 *   → /D:/foo/bar baz.txt      （盘符路径补前导 /，file:// URL 要求路径段以 / 开头）
 *   → file:///D:/foo/bar%20baz.txt （逐段 encodeURIComponent，但保留盘符冒号）
 *
 * Unix 要点：
 *   /home/foo/bar baz.txt
 *   → 不匹配盘符正则，不补前缀
 *   → file:///home/foo/bar%20baz.txt
 */
export function encodeFilePath(absPath: string): string {
  // 1. 反斜杠 → 正斜杠（Windows）
  let p = absPath.replace(/\\/g, '/')
  // 2. Windows 盘符：D:/path → /D:/path（file:// URL 要求路径以 / 开头）
  if (/^[a-zA-Z]:\//.test(p)) {
    p = '/' + p
  }
  // 3. 逐段 encodeURIComponent，但保留盘符冒号（D: 段不编码）
  //    分隔符 / 不参与编码
  const segments = p.split('/')
  const encoded = segments.map((seg) => (/^[a-zA-Z]:$/.test(seg) ? seg : encodeURIComponent(seg)))
  return 'file://' + encoded.join('/')
}

/**
 * 构造带行选区的 file:// url（二期用，一期预留）
 * 服务端 text/plain 文件支持 ?start=&end= 按行读取
 */
export function encodeFilePathWithRange(absPath: string, start?: number, end?: number): string {
  const base = encodeFilePath(absPath)
  if (start == null && end == null) return base
  const params = new URLSearchParams()
  if (start != null) params.set('start', String(start))
  if (end != null) params.set('end', String(end))
  return `${base}?${params.toString()}`
}
