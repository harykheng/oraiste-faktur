import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { formatDate, formatRupiah } from '../lib/format.js'
import { invoiceBadges } from '../lib/status.js'
import { Badge, Button, Chip, ErrorText, Loading, PageHeader, SearchInput } from '../components/ui.jsx'

const PAGE_SIZE = 50

const FILTERS = [
  { key: 'all', label: 'Semua' },
  { key: 'unpaid', label: 'Belum Lunas' },
  { key: 'overdue', label: 'Lewat Tempo' },
  { key: 'pending', label: 'Belum Dikirim' },
]

export default function InvoiceList() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [invoices, setInvoices] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    let cancelled = false
    let q = supabase
      .from('invoice_list')
      .select('id, invoice_number, invoice_date, customer_name_snapshot, total, is_void, payment_status, is_overdue, delivery_status')
      .order('created_at', { ascending: false })
      .range(0, limit) // ambil 1 lebih untuk tahu masih ada data atau tidak

    if (filter === 'unpaid') q = q.in('payment_status', ['unpaid', 'partial'])
    if (filter === 'overdue') q = q.eq('is_overdue', true)
    if (filter === 'pending') q = q.eq('delivery_status', 'pending').eq('is_void', false)
    if (debouncedSearch) q = q.ilike('customer_name_snapshot', `%${debouncedSearch}%`)

    q.then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setError(`Gagal memuat faktur: ${error.message}`)
        return
      }
      setError('')
      setHasMore(data.length > limit)
      setInvoices(data.slice(0, limit))
    })
    return () => {
      cancelled = true
    }
  }, [filter, debouncedSearch, limit])

  function changeFilter(key) {
    setFilter(key)
    setLimit(PAGE_SIZE)
  }

  return (
    <>
      <PageHeader title="Faktur" />
      <div className="grid gap-3 p-4">
        <Button size="lg" onClick={() => navigate('/faktur/baru')}>
          + Faktur Baru
        </Button>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {FILTERS.map((f) => (
            <Chip key={f.key} active={filter === f.key} onClick={() => changeFilter(f.key)}>
              {f.label}
            </Chip>
          ))}
        </div>

        <SearchInput placeholder="Cari nama toko…" value={search} onChange={(e) => setSearch(e.target.value)} />

        <ErrorText>{error}</ErrorText>
        {invoices === null && !error && <Loading />}
        {invoices?.length === 0 && <p className="p-6 text-center text-gray-500">Belum ada faktur.</p>}

        {invoices?.map((inv) => (
          <Link
            key={inv.id}
            to={`/faktur/${inv.id}`}
            className={`block rounded-2xl border bg-white p-4 active:bg-gray-50 ${inv.is_void ? 'border-gray-300 opacity-70' : 'border-gray-200'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-lg font-bold">{inv.customer_name_snapshot}</p>
                <p className="text-sm text-gray-500">
                  {inv.invoice_number} · {formatDate(inv.invoice_date)}
                </p>
              </div>
              <p className={`shrink-0 text-lg font-bold ${inv.is_void ? 'text-gray-500 line-through' : ''}`}>
                {formatRupiah(inv.total)}
              </p>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {invoiceBadges(inv).map((b) => (
                <Badge key={b.label} tone={b.tone}>
                  {b.label}
                </Badge>
              ))}
            </div>
          </Link>
        ))}

        {hasMore && (
          <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
            Tampilkan lebih banyak
          </Button>
        )}
      </div>
    </>
  )
}
