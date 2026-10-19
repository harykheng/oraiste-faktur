import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  addMonths, endOfMonth, formatDate, formatRupiah, jakartaToday, startOfMonth,
} from '../lib/format.js'
import { Chip, ErrorText, Field, Loading, PageHeader, TextInput } from '../components/ui.jsx'

function presetRange(key) {
  const today = jakartaToday()
  if (key === 'today') return { from: today, to: today }
  if (key === 'month') return { from: startOfMonth(today), to: endOfMonth(today) }
  if (key === 'lastMonth') {
    const first = addMonths(today, -1)
    return { from: first, to: endOfMonth(first) }
  }
  return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` }
}

const PRESETS = [
  { key: 'today', label: 'Hari ini' },
  { key: 'month', label: 'Bulan ini' },
  { key: 'lastMonth', label: 'Bulan lalu' },
  { key: 'year', label: 'Tahun ini' },
  { key: 'custom', label: 'Pilih tanggal' },
]

function percent(profit, base) {
  return base > 0 ? `${Math.round((profit / base) * 100)}%` : '-'
}

function profitTone(n) {
  return n < 0 ? 'text-red-700' : 'text-green-700'
}

function signed(n) {
  return (n > 0 ? '+' : n < 0 ? '-' : '') + formatRupiah(Math.abs(n))
}

export default function Profit() {
  const [preset, setPreset] = useState('month')
  const [range, setRange] = useState(() => presetRange('month'))
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!range.from || !range.to || range.from > range.to) return
    let cancelled = false
    setReport(null)
    setError('')
    supabase.rpc('get_profit_report', { p_from: range.from, p_to: range.to }).then(({ data, error }) => {
      if (cancelled) return
      if (error) return setError(`Gagal memuat laporan: ${error.message}`)
      setReport(data)
    })
    return () => {
      cancelled = true
    }
  }, [range.from, range.to])

  function choose(key) {
    setPreset(key)
    if (key !== 'custom') setRange(presetRange(key))
  }

  const invalidRange = range.from && range.to && range.from > range.to
  const profit = report ? report.sales_costed - report.cost_total : 0

  return (
    <>
      <PageHeader title="Laba Rugi" />
      <div className="grid gap-4 p-4">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {PRESETS.map((p) => (
            <Chip key={p.key} active={preset === p.key} onClick={() => choose(p.key)}>
              {p.label}
            </Chip>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dari">
              <TextInput type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
            </Field>
            <Field label="Sampai">
              <TextInput type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
            </Field>
          </div>
        )}

        <p className="text-gray-600">
          {range.from === range.to
            ? formatDate(range.from, true)
            : `${formatDate(range.from, true)} – ${formatDate(range.to, true)}`}
        </p>

        {invalidRange && <ErrorText>Tanggal “Dari” harus sebelum “Sampai”.</ErrorText>}
        <ErrorText>{error}</ErrorText>
        {!report && !error && !invalidRange && <Loading />}

        {report && (
          <>
            <div className={`rounded-2xl border p-5 ${profit < 0 ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
              <p className="font-medium text-gray-700">{profit < 0 ? 'Rugi' : 'Laba kotor'}</p>
              <p className={`text-3xl font-bold ${profitTone(profit)}`}>{formatRupiah(Math.abs(profit))}</p>
              <p className="mt-1 text-gray-700">Margin {percent(profit, report.sales_costed)} dari penjualan</p>
            </div>

            <div className="grid gap-2 rounded-2xl border border-gray-200 bg-white p-4">
              <Row label="Penjualan" value={formatRupiah(report.sales_total)} />
              <Row label="Modal (HPP)" value={formatRupiah(report.cost_total)} />
              <Row label="Jumlah faktur" value={report.invoice_count} />
              <Row label="Sudah dibayar" value={formatRupiah(report.paid_total)} />
              <Row label="Belum dibayar" value={formatRupiah(report.unpaid_total)} />
            </div>

            {report.uncosted_count > 0 && (
              <p className="rounded-xl bg-yellow-50 p-3 text-yellow-900">
                {report.uncosted_count} barang belum punya harga modal (penjualan {formatRupiah(report.uncosted_sales)}),
                jadi tidak ikut dihitung. Isi harga modalnya di menu Produk.
              </p>
            )}
            {report.loss_count > 0 && (
              <p className="rounded-xl bg-red-50 p-3 text-red-900">
                {report.loss_count} barang dijual di bawah harga modal.
              </p>
            )}

            <Breakdown title="Per produk" rows={report.by_product} nameKey="product_name" />
            <Breakdown title="Per toko" rows={report.by_customer} nameKey="customer_name" />

            <p className="text-sm text-gray-500">
              Laba kotor = penjualan − modal. Belum termasuk biaya operasional. Faktur dibatalkan tidak dihitung.
            </p>
          </>
        )}
      </div>
    </>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-gray-600">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  )
}

function Breakdown({ title, rows, nameKey }) {
  if (!rows?.length) return null
  return (
    <section className="grid gap-2">
      <h2 className="text-lg font-bold">{title}</h2>
      {rows.map((r) => {
        const profit = r.sales_costed - r.cost
        const hasCost = r.sales_costed > 0
        return (
          <div key={r[nameKey]} className="flex items-start justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4">
            <div className="min-w-0">
              <p className="truncate font-bold">{r[nameKey]}</p>
              <p className="text-sm text-gray-600">Penjualan {formatRupiah(r.sales)}</p>
            </div>
            <div className="shrink-0 text-right">
              {hasCost ? (
                <>
                  <p className={`font-bold ${profitTone(profit)}`}>{signed(profit)}</p>
                  <p className="text-sm text-gray-600">{percent(profit, r.sales_costed)}</p>
                </>
              ) : (
                <p className="text-sm text-gray-500">Modal kosong</p>
              )}
            </div>
          </div>
        )
      })}
    </section>
  )
}
