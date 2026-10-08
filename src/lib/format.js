const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const MONTHS_LONG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

// 1250000 -> "1.250.000"
export function formatNumber(n) {
  const v = Math.round(Number(n) || 0)
  return (v < 0 ? '-' : '') + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

// 1250000 -> "Rp 1.250.000"
export function formatRupiah(n) {
  return 'Rp ' + formatNumber(n)
}

// "Rp 1.250.000" / "1250000" -> 1250000
export function parseDigits(str) {
  const digits = String(str ?? '').replace(/\D/g, '').slice(0, 13)
  return digits ? Number(digits) : 0
}

function jakartaIsoDate(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const get = (type) => parts.find((p) => p.type === type).value
  return `${get('year')}-${get('month')}-${get('day')}`
}

// Tanggal hari ini di Asia/Jakarta, "YYYY-MM-DD"
export function jakartaToday() {
  return jakartaIsoDate(new Date())
}

export function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

// "2026-10-08" -> "8 Okt 2026" (long: "8 Oktober 2026")
export function formatDate(isoDate, long = false) {
  if (!isoDate) return '-'
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number)
  return `${d} ${(long ? MONTHS_LONG : MONTHS)[m - 1]} ${y}`
}

// timestamptz -> tanggal di Asia/Jakarta
export function formatTimestampDate(ts, long = false) {
  if (!ts) return '-'
  return formatDate(jakartaIsoDate(new Date(ts)), long)
}

export function termLabel(days) {
  return Number(days) === 0 ? 'Cash' : `Tempo ${days} hari`
}
