import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import {
  MARGIN_TIERS, addDays, formatDate, formatNumber, formatRupiah, jakartaToday, priceWithMargin, termLabel,
} from '../lib/format.js'
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
  // Daftar produk baru ditampilkan setelah harga terakhir toko siap, supaya urutannya
  // tidak berpindah di bawah jari dan harga awal yang terisi sudah benar.
  const [pricesReady, setPricesReady] = useState(false)
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
    setPricesReady(false)
    setProductQuery('')
    changeTerm(c.default_term_days)
    const { data, error } = await supabase.rpc('get_last_prices', { p_customer_id: c.id })
    if (customerIdRef.current !== c.id) return // toko sudah diganti lagi
    if (error) {
      setLoadError(`Gagal memuat harga terakhir: ${error.message}`)
    } else {
      setLastPrices(Object.fromEntries(data.map((r) => [r.product_id, r])))
    }
    setPricesReady(true) // kalau gagal pun tetap lanjut dengan harga normal
  }

  function changeTerm(days) {
    setTermDays(days)
    setPaidInFull(Number(days) === 0)
  }

  // Harga per dus dasar (sebelum dikonversi ke satuan lain) + asalnya.
  // Urutan: harga terakhir toko ini > modal + persen toko ini > harga default produk.
  function priceInfoFor(p) {
    const last = lastPrices[p.id]
    if (last) return { price: last.unit_price, source: 'harga terakhir toko ini' }
    const pct = customer?.default_margin_percent
    if (pct && p.cost_price > 0) {
      return { price: priceWithMargin(p.cost_price, pct, p.box_qty), source: `modal +${pct}%` }
    }
    return { price: p.default_price, source: 'harga normal' }
  }

  function basePricePerDus(p) {
    return priceInfoFor(p).price
  }

  // Semua pilihan harga per dus untuk produk ini: terakhir toko ini, normal, modal +15/20/25%.
  function priceOptionsFor(p) {
    const opts = []
    const last = lastPrices[p.id]
    if (last) opts.push({ key: 'last', label: 'Terakhir', source: 'harga terakhir toko ini', perDus: last.unit_price })
    opts.push({ key: 'normal', label: 'Normal', source: 'harga normal', perDus: p.default_price })
    if (p.cost_price > 0) {
      for (const pct of MARGIN_TIERS) {
        opts.push({ key: `m${pct}`, label: `Modal +${pct}%`, source: `modal +${pct}%`, perDus: priceWithMargin(p.cost_price, pct, p.box_qty) })
      }
    }
    return opts
  }

  // Harga per 1 satuan jual baris ini (dus, atau satuan produk) dari harga per dus.
  function priceForUnit(p, perDus, unit) {
    return unit === 'dus' ? perDus : Math.round(perDus / p.box_qty)
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
    const base = priceInfoFor(p)
    const options = priceOptionsFor(p)
    // Pilihan yang harganya sama dengan harga baris ini (kalau diubah manual: tidak ada).
    const matched = options.find((o) => priceForUnit(p, o.perDus, line.unit) === line.price)
    // null = tidak perlu label sumber harga (lagi jual per satuan, bukan per dus).
    const priceSource = !isDus ? null : line.price === base.price ? base.source : (matched?.source ?? 'diubah')

    return (
      <div key={p.id} className={`grid gap-3 rounded-xl border p-3 ${line.qty > 0 ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}>
        <p className="font-bold">{p.name}</p>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className="text-sm text-gray-600">
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
              <p className="mb-1 text-sm font-semibold text-gray-600">Pilih harga per {unitLabel}</p>
              <div className="mb-2 grid grid-cols-2 gap-2 min-[430px]:grid-cols-3">
                {options.map((o) => {
                  const optPrice = priceForUnit(p, o.perDus, line.unit)
                  return (
                    <button
                      key={o.key}
                      type="button"
                      className={`min-h-14 rounded-xl border px-0.5 text-center active:bg-gray-100 ${
                        optPrice === line.price ? 'border-blue-700 bg-white ring-2 ring-blue-200' : 'border-gray-300 bg-white'
                      }`}
                      onClick={() => setPrice(p, optPrice)}
                    >
                      <span className="block whitespace-nowrap text-xs font-semibold text-gray-600">{o.label}</span>
                      <span className="block whitespace-nowrap text-[0.95rem] font-bold">{formatNumber(optPrice)}</span>
                    </button>
                  )
                })}
              </div>
              <MoneyInput value={line.price} onChange={(v) => setPrice(p, v)} aria-label={`Harga per ${unitLabel} ${p.name}`} />
              <p className="mt-1 text-sm text-gray-600">
                per {unitLabel}
                {priceSource ? ` · ${priceSource}` : ''} · subtotal <b>{formatRupiah(line.qty * line.price)}</b>
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-600">
            {formatRupiah(base.price)}/dus · {base.source}
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
              {!pricesReady && <Loading text="Memuat harga terakhir toko…" />}
              {pricesReady && products.length === 0 && <p className="text-gray-500">Belum ada produk aktif. Tambah dulu di menu Produk.</p>}
              {pricesReady && boughtBefore.length > 0 && <p className="text-sm font-semibold text-gray-500">Pernah dibeli toko ini</p>}
              {pricesReady && boughtBefore.map(renderProduct)}
              {pricesReady && boughtBefore.length > 0 && others.length > 0 && <p className="text-sm font-semibold text-gray-500">Produk lain</p>}
              {pricesReady && others.map(renderProduct)}
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
