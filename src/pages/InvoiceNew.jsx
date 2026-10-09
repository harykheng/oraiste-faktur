import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { addDays, formatDate, formatRupiah, jakartaToday, termLabel } from '../lib/format.js'
import {
  BackButton, Button, Chip, ConfirmSheet, ErrorText, Field, Loading, MoneyInput, NumberInput,
  PageHeader, SearchInput, Segmented, Sheet, Stepper, TextInput, Toggle,
} from '../components/ui.jsx'
import CustomerForm from '../components/CustomerForm.jsx'

const TERM_PRESETS = [0, 7, 14, 30]

function Section({ title, children }) {
  return (
    <section className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4">
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </section>
  )
}

export default function InvoiceNew() {
  const navigate = useNavigate()
  const [customers, setCustomers] = useState(null)
  const [products, setProducts] = useState(null)
  const [loadError, setLoadError] = useState('')

  const [customer, setCustomer] = useState(null)
  const customerIdRef = useRef(null)
  const [customerQuery, setCustomerQuery] = useState('')
  const [showNewCustomer, setShowNewCustomer] = useState(false)

  // product_id -> { unit_price, last_invoice_date } dari faktur non-void toko ini
  // (unit_price selalu dinormalisasi per dus oleh get_last_prices).
  const [lastPrices, setLastPrices] = useState({})
  // product_id -> { unit, qty, price }. unit: 'dus' atau satuan produk
  // (lusin/pack/dll). qty = jumlah dalam `unit`. price = harga per 1 `unit`.
  // Baris cuma ada di sini kalau produknya sudah "disentuh" (qty pernah > 0).
  const [lines, setLines] = useState({})
  const [productQuery, setProductQuery] = useState('')

  const today = jakartaToday()
  const [invoiceDate, setInvoiceDate] = useState(today)
  const [termDays, setTermDays] = useState(0)
  const [delivery, setDelivery] = useState('delivered')
  const [paidInFull, setPaidInFull] = useState(true)
  const [method, setMethod] = useState('cash')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [confirmLeave, setConfirmLeave] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('products').select('*').eq('is_active', true).order('name'),
    ]).then(([c, p]) => {
      if (c.error || p.error) {
        setLoadError(`Gagal memuat data: ${(c.error || p.error).message}`)
        return
      }
      setCustomers(c.data)
      setProducts(p.data)
    })
  }, [])

  async function chooseCustomer(c) {
    setCustomer(c)
    customerIdRef.current = c.id
    setLines({})
    setLastPrices({})
    setProductQuery('')
    changeTerm(c.default_term_days)
    const { data, error } = await supabase.rpc('get_last_prices', { p_customer_id: c.id })
    if (customerIdRef.current !== c.id) return // toko sudah diganti lagi
    if (error) {
      setLoadError(`Gagal memuat harga terakhir: ${error.message}`)
      return
    }
    setLastPrices(Object.fromEntries(data.map((r) => [r.product_id, r])))
  }

  function changeTerm(days) {
    setTermDays(days)
    setPaidInFull(Number(days) === 0)
  }

  // Harga per dus default (dasar) sebelum dikonversi ke satuan lain.
  function basePricePerDus(p) {
    return lastPrices[p.id]?.unit_price ?? p.default_price
  }

  // Qty 0 = produk dibuang dari faktur (baris dihapus, kartu balik ringkas).
  function setQty(p, qty) {
    setLines((prev) => {
      if (!(qty > 0)) {
        const { [p.id]: _removed, ...rest } = prev
        return rest
      }
      return {
        ...prev,
        [p.id]: { unit: 'dus', price: basePricePerDus(p), ...prev[p.id], qty },
      }
    })
  }

  function setPrice(p, price) {
    setLines((prev) => ({
      ...prev,
      [p.id]: { unit: 'dus', qty: 0, price: basePricePerDus(p), ...prev[p.id], price },
    }))
  }

  // Ganti satuan jual baris ini (dus <-> satuan produk), qty & harga
  // dikonversi supaya nilainya tetap setara (lalu bisa diubah manual lagi).
  function setUnit(p, unit) {
    setLines((prev) => {
      const cur = prev[p.id] ?? { unit: 'dus', qty: 0, price: basePricePerDus(p) }
      if (cur.unit === unit) return prev
      const boxQty = p.box_qty
      const toSatuan = unit !== 'dus'
      const qty = Math.round(toSatuan ? cur.qty * boxQty : cur.qty / boxQty)
      const price = Math.round(toSatuan ? cur.price / boxQty : cur.price * boxQty)
      return { ...prev, [p.id]: { unit, qty, price } }
    })
  }

  // Produk yang pernah dibeli toko ini di atas (terbaru dulu), sisanya urut nama.
  const { boughtBefore, others } = useMemo(() => {
    const q = productQuery.trim().toLowerCase()
    const list = (products ?? []).filter((p) => !q || p.name.toLowerCase().includes(q))
    const bought = list
      .filter((p) => lastPrices[p.id])
      .sort((a, b) => lastPrices[b.id].last_invoice_date.localeCompare(lastPrices[a.id].last_invoice_date))
    return { boughtBefore: bought, others: list.filter((p) => !lastPrices[p.id]) }
  }, [products, productQuery, lastPrices])

  const selected = (products ?? []).filter((p) => (lines[p.id]?.qty ?? 0) > 0)
  const total = selected.reduce((sum, p) => sum + lines[p.id].qty * lines[p.id].price, 0)
  const filteredCustomers = (customers ?? []).filter(
    (c) => !customerQuery.trim() || c.name.toLowerCase().includes(customerQuery.trim().toLowerCase()),
  )

  async function submit() {
    setSubmitError('')
    if (!customer) return setSubmitError('Pilih toko dulu.')
    if (!invoiceDate) return setSubmitError('Tanggal faktur wajib diisi.')
    if (invoiceDate > today) return setSubmitError('Tanggal faktur tidak boleh di masa depan.')
    if (selected.length === 0) return setSubmitError('Pilih minimal 1 produk.')
    const noPrice = selected.find((p) => !(lines[p.id].price > 0))
    if (noPrice) return setSubmitError(`Harga ${noPrice.name} belum diisi.`)

    setSubmitting(true)
    const { data, error } = await supabase.rpc('create_invoice', {
      payload: {
        customer_id: customer.id,
        invoice_date: invoiceDate,
        term_days: Number(termDays) || 0,
        delivery_status: delivery,
        paid_in_full: paidInFull,
        payment_method: method,
        items: selected.map((p) => ({
          product_id: p.id,
          qty: lines[p.id].qty,
          unit_price: lines[p.id].price,
          sold_unit: lines[p.id].unit === 'dus' ? 'dus' : p.unit_label,
        })),
      },
    })
    if (error) {
      setSubmitting(false)
      setSubmitError(`Gagal membuat faktur: ${error.message}`)
      return
    }
    navigate(`/faktur/${data.id}?baru=1`, { replace: true })
  }

  function leave() {
    if (selected.length > 0) setConfirmLeave(true)
    else navigate('/')
  }

  function renderProduct(p) {
    const active = Boolean(lines[p.id])
    const line = lines[p.id] ?? { unit: 'dus', qty: 0, price: basePricePerDus(p) }
    const isDus = line.unit === 'dus'
    const unitLabel = isDus ? 'dus' : p.unit_label
    const last = lastPrices[p.id]
    const isDefaultPrice = isDus && line.price === basePricePerDus(p)
    // null = tidak perlu label sumber harga (lagi jual per satuan, bukan per dus).
    const priceSource = !isDus ? null : isDefaultPrice ? (last ? 'harga terakhir toko ini' : 'harga normal') : 'diubah'

    return (
      <div key={p.id} className={`grid gap-3 rounded-xl border p-3 ${line.qty > 0 ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}>
        <p className="font-bold">{p.name}</p>
        <div className="flex items-center justify-between gap-3">
          <p className="whitespace-nowrap text-sm text-gray-600">
            1 dus = {p.box_qty} {p.unit_label}
          </p>
          <Stepper value={line.qty} onChange={(v) => setQty(p, v)} />
        </div>
        {active ? (
          <div className="grid gap-2">
            <Segmented
              value={line.unit}
              onChange={(u) => setUnit(p, u)}
              options={[
                { value: 'dus', label: 'Per dus' },
                { value: p.unit_label, label: `Per ${p.unit_label}` },
              ]}
            />
            <div>
              <MoneyInput value={line.price} onChange={(v) => setPrice(p, v)} aria-label={`Harga per ${unitLabel} ${p.name}`} />
              <p className="mt-1 text-sm text-gray-600">
                per {unitLabel}
                {priceSource ? ` · ${priceSource}` : ''} · subtotal <b>{formatRupiah(line.qty * line.price)}</b>
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-600">
            {formatRupiah(basePricePerDus(p))}/dus · {last ? 'harga terakhir toko ini' : 'harga normal'}
          </p>
        )}
      </div>
    )
  }

  if (loadError && !customers) {
    return (
      <div className="p-4">
        <ErrorText>{loadError}</ErrorText>
      </div>
    )
  }
  if (!customers || !products) return <Loading />

  const dueDate = addDays(invoiceDate || today, Number(termDays) || 0)

  return (
    <>
      <PageHeader title="Faktur Baru" left={<BackButton label="← Batal" onClick={leave} />} />
      <div className="grid gap-4 p-4 pb-[calc(10rem+env(safe-area-inset-bottom))]">
        <ErrorText>{loadError}</ErrorText>

        <Section title="1. Toko">
          {customer ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-blue-50 p-3">
              <div className="min-w-0">
                <p className="truncate text-lg font-bold">{customer.name}</p>
                <p className="text-sm text-gray-600">{termLabel(customer.default_term_days)}</p>
              </div>
              <Button variant="secondary" onClick={() => setCustomer(null)}>
                Ganti
              </Button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <SearchInput placeholder="Cari toko…" value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} />
                <Button className="shrink-0" onClick={() => setShowNewCustomer(true)}>
                  + Toko Baru
                </Button>
              </div>
              <div className="grid max-h-80 gap-2 overflow-y-auto">
                {filteredCustomers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="min-h-12 rounded-xl border border-gray-200 px-3 py-2 text-left active:bg-gray-100"
                    onClick={() => chooseCustomer(c)}
                  >
                    <span className="block font-semibold">{c.name}</span>
                    <span className="block text-sm text-gray-500">{termLabel(c.default_term_days)}</span>
                  </button>
                ))}
                {filteredCustomers.length === 0 && <p className="text-gray-500">Toko tidak ditemukan.</p>}
              </div>
            </>
          )}
        </Section>

        {customer && (
          <>
            <Section title="2. Produk">
              <SearchInput placeholder="Cari produk…" value={productQuery} onChange={(e) => setProductQuery(e.target.value)} />
              {products.length === 0 && <p className="text-gray-500">Belum ada produk aktif. Tambah dulu di menu Produk.</p>}
              {boughtBefore.length > 0 && <p className="text-sm font-semibold text-gray-500">Pernah dibeli toko ini</p>}
              {boughtBefore.map(renderProduct)}
              {boughtBefore.length > 0 && others.length > 0 && <p className="text-sm font-semibold text-gray-500">Produk lain</p>}
              {others.map(renderProduct)}
            </Section>

            <Section title="3. Pembayaran & Pengiriman">
              <Field label="Tanggal faktur">
                <TextInput type="date" value={invoiceDate} max={today} onChange={(e) => setInvoiceDate(e.target.value)} />
              </Field>

              <div>
                <p className="mb-1 font-medium text-gray-700">Tempo (hari)</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {TERM_PRESETS.map((d) => (
                    <Chip key={d} active={Number(termDays) === d} onClick={() => changeTerm(d)}>
                      {d === 0 ? 'Cash' : `${d} hari`}
                    </Chip>
                  ))}
                </div>
                <NumberInput className="mt-2" value={termDays} onChange={changeTerm} aria-label="Tempo dalam hari" />
                <p className="mt-1 text-sm text-gray-600">
                  {Number(termDays) === 0 ? 'Cash' : 'Tempo'} · Jatuh tempo {formatDate(dueDate)}
                </p>
              </div>

              <div>
                <p className="mb-1 font-medium text-gray-700">Barang</p>
                <Segmented
                  value={delivery}
                  onChange={setDelivery}
                  options={[
                    { value: 'delivered', label: 'Diserahkan sekarang' },
                    { value: 'pending', label: 'Kirim nanti' },
                  ]}
                />
              </div>

              <Toggle label="Sudah dibayar lunas" checked={paidInFull} onChange={setPaidInFull} />
              {paidInFull && (
                <Segmented
                  value={method}
                  onChange={setMethod}
                  options={[
                    { value: 'cash', label: 'Tunai' },
                    { value: 'transfer', label: 'Transfer' },
                  ]}
                />
              )}
            </Section>
          </>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 grid gap-2 border-t border-gray-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        <ErrorText>{submitError}</ErrorText>
        <div className="flex items-baseline justify-between">
          <span className="text-gray-600">Total ({selected.length} produk)</span>
          <span className="text-2xl font-bold">{formatRupiah(total)}</span>
        </div>
        <Button size="lg" disabled={submitting || !customer || selected.length === 0} onClick={submit}>
          {submitting ? 'Membuat faktur…' : 'Buat Faktur'}
        </Button>
      </div>

      {showNewCustomer && (
        <Sheet title="Toko Baru" onClose={() => setShowNewCustomer(false)}>
          <CustomerForm
            onSaved={(c) => {
              setCustomers((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)))
              setShowNewCustomer(false)
              chooseCustomer(c)
            }}
          />
        </Sheet>
      )}

      {confirmLeave && (
        <ConfirmSheet
          title="Buang faktur ini?"
          message="Produk yang sudah dipilih akan hilang."
          confirmLabel="Ya, buang"
          onConfirm={() => navigate('/')}
          onClose={() => setConfirmLeave(false)}
        />
      )}
    </>
  )
}
