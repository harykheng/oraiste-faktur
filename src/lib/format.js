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

// Pilihan persen untung di atas harga modal (dipakai di form Produk & Toko).
export const MARGIN_TIERS = [15, 20, 25]

// Harga jual = modal + persen untung, DIBULATKAN KE ATAS per satuan (lusin/pack/dll)
// ke kelipatan 500 (mis. 19.550 -> 20.000, 20.400 -> 20.500), lalu dikali isi per dus
// supaya harga per satuan tetap rapi. Kalau harga per satuan masih di bawah 5.000,
// kelipatannya 100 saja supaya pembulatan tidak menggelembungkan harga terlalu jauh.
// Hitungan pakai bilangan bulat (bukan desimal) supaya tidak meleset karena floating point.
export function priceWithMargin(costPerDus, percent, boxQty = 0) {
  const qty = Number(boxQty) > 0 ? Number(boxQty) : 1
  const numerator = Number(costPerDus) * (100 + percent) // = harga per dus x 100
  const rawPerUnit = numerator / (qty * 100)
  const step = rawPerUnit >= 5000 ? 500 : 100
  const perUnit = Math.ceil(numerator / (qty * 100 * step)) * step
  return perUnit * qty
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
