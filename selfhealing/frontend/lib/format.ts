export function timeAgo(iso: string): string {
  const date = new Date(iso)
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  const intervals: [number, string][] = [
    [31536000, 'y'],
    [2592000, 'mo'],
    [86400, 'd'],
    [3600, 'h'],
    [60, 'm'],
  ]
  for (const [secs, label] of intervals) {
    const value = Math.floor(seconds / secs)
    if (value >= 1) return `${value}${label}`
  }
  return 'now'
}

export function fullDate(iso: string): string {
  const date = new Date(iso)
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}

export function relativeDays(iso: string): string {
  const date = new Date(iso)
  const diff = Math.floor((Date.now() - date.getTime()) / 86400000)
  if (diff <= 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return fullDate(iso)
}
