export function formatMessageTime(timestamp?: number): string {
  if (!timestamp) return ''

  const date = new Date(timestamp)
  const now = new Date()
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)

  const pad = (n: number) => String(n).padStart(2, '0')
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())

  if (isSameDay(date, now)) return `${hours}:${minutes}`
  if (isSameDay(date, yesterday)) return `昨天 ${hours}:${minutes}`

  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 7) {
    return `${weekdays[date.getDay()]} ${hours}:${minutes}`
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${hours}:${minutes}`
}
