export function formatCurrency(value) {
  const n = Number(value)
  if (Number.isNaN(n)) return '-'
  return n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' })
}

export function formatNumber(value, decimals = 0) {
  const n = Number(value)
  if (Number.isNaN(n)) return '-'
  return n.toLocaleString('nl-NL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function formatDate(value) {
  if (!value) return '-'
  const d = value?.toDate ? value.toDate() : new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('nl-NL')
}

export function formatBytes(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return '-'
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB']
  let size = n / 1024
  let i = 0
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i += 1
  }
  return `${size.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} ${units[i]}`
}

export function formatDateTime(value) {
  if (!value) return '-'
  const d = value?.toDate ? value.toDate() : new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('nl-NL')
}
