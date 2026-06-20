// 安全 JSON 解析 — 持久化数据损坏时返回兜底值而非抛错崩溃
// localStorage / settings 里的数据可能被损坏或手动篡改，
// 直接 JSON.parse 会让整个渲染进程崩白屏。统一走这里兜底。

/**
 * 解析 JSON 字符串，失败时返回 fallback。
 * @param raw  待解析字符串（null/undefined/空串均返回 fallback）
 * @param fallback 解析失败或输入为空时的兜底值
 */
export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch (err) {
    console.warn('[safeJsonParse] 解析失败，使用兜底值:', err)
    return fallback
  }
}
