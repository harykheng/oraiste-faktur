import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { formatRupiah } from '../lib/format.js'
import {
  Badge, Button, ErrorText, Field, Loading, MoneyInput, NumberInput, PageHeader, Select,
  Sheet, TextArea, TextInput, Toggle,
} from '../components/ui.jsx'

const PRESET_UNITS = ['lusin', 'pack', 'pcs']
const CUSTOM_UNIT = '__custom__'

export default function Products() {
  const [products, setProducts] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | product

  async function load() {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('is_active', { ascending: false })
      .order('name')
    if (error) return setError(`Gagal memuat produk: ${error.message}`)
    setProducts(data)
  }

  useEffect(() => {
    load()
  }, [])

  // Satuan yang sudah pernah dipakai produk lain, supaya gampang dipilih lagi.
  const unitOptions = useMemo(() => {
    const used = (products ?? []).map((p) => p.unit_label)
    return Array.from(new Set([...PRESET_UNITS, ...used])).sort((a, b) => a.localeCompare(b))
  }, [products])

  return (
    <>
      <PageHeader title="Produk" />
      <div className="grid gap-3 p-4">
        <Button size="lg" onClick={() => setEditing('new')}>
          + Produk Baru
        </Button>
        <ErrorText>{error}</ErrorText>
        {products === null && !error && <Loading />}
        {products?.length === 0 && <p className="p-6 text-center text-gray-500">Belum ada produk.</p>}
        {products?.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`rounded-2xl border border-gray-200 bg-white p-4 text-left active:bg-gray-50 ${p.is_active ? '' : 'opacity-60'}`}
            onClick={() => setEditing(p)}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-lg font-bold">{p.name}</p>
              {!p.is_active && <Badge>Nonaktif</Badge>}
            </div>
            <p className="text-sm text-gray-600">
              1 dus = {p.box_qty} {p.unit_label} · {formatRupiah(p.default_price)}/dus
            </p>
          </button>
        ))}
      </div>

      {editing && (
        <Sheet title={editing === 'new' ? 'Produk Baru' : 'Edit Produk'} onClose={() => setEditing(null)}>
          <ProductForm
            product={editing === 'new' ? null : editing}
            unitOptions={unitOptions}
            onSaved={() => {
              setEditing(null)
              load()
            }}
          />
        </Sheet>
      )}
    </>
  )
}

function ProductForm({ product, unitOptions, onSaved }) {
  const [name, setName] = useState(product?.name ?? '')
  const [boxQty, setBoxQty] = useState(product?.box_qty ?? '')
  const [unitLabel, setUnitLabel] = useState(product?.unit_label ?? 'lusin')
  // Mode "Lainnya" di-track terpisah, supaya input teksnya tidak hilang
  // begitu dikosongkan sambil mengetik.
  const [customUnit, setCustomUnit] = useState(() => !unitOptions.includes(unitLabel))
  // price & costPrice selalu per dus — ini yang disimpan ke database.
  const [price, setPrice] = useState(product?.default_price ?? 0)
  const [costPrice, setCostPrice] = useState(product?.cost_price ?? 0)
  const [notes, setNotes] = useState(product?.notes ?? '')
  const [active, setActive] = useState(product?.is_active ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const boxQtyNum = Number(boxQty) || 0
  const perUnit = boxQtyNum > 0 ? Math.round(price / boxQtyNum) : 0
  const costPerUnit = boxQtyNum > 0 ? Math.round(costPrice / boxQtyNum) : 0
  const unitLabelTrimmed = unitLabel.trim() || 'satuan'
  const margin = costPrice > 0 && price > 0 ? price - costPrice : null

  function selectUnit(value) {
    if (value === CUSTOM_UNIT) {
      setCustomUnit(true)
      setUnitLabel('')
    } else {
      setCustomUnit(false)
      setUnitLabel(value)
    }
  }

  async function save() {
    if (!name.trim()) return setError('Nama produk wajib diisi.')
    if (!(boxQty > 0)) return setError('Isi per dus wajib diisi (lebih dari 0).')
    if (!unitLabel.trim()) return setError('Satuan wajib diisi (mis. lusin, pack, pcs).')
    if (!(price > 0)) return setError('Harga default wajib diisi.')
    setBusy(true)
    setError('')
    const row = {
      name: name.trim(),
      box_qty: boxQty,
      unit_label: unitLabel.trim(),
      default_price: price,
      cost_price: costPrice > 0 ? costPrice : null,
      notes: notes.trim() || null,
      is_active: active,
    }
    const { error } = product
      ? await supabase.from('products').update(row).eq('id', product.id)
      : await supabase.from('products').insert(row)
    setBusy(false)
    if (error) return setError(`Gagal menyimpan: ${error.message}`)
    onSaved()
  }

  return (
    <div className="grid gap-4">
      <Field label="Nama produk">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} />
      </Field>

      <Field label="Isi per dus" hint="Angka + satuan, mis. 50 lusin, atau 200 pack.">
        <div className="grid gap-2">
          <NumberInput value={boxQty} onChange={setBoxQty} aria-label="Jumlah isi per dus" />
          <Select
            value={customUnit ? CUSTOM_UNIT : unitLabel}
            onChange={(e) => selectUnit(e.target.value)}
            aria-label="Satuan"
          >
            {unitOptions.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
            <option value={CUSTOM_UNIT}>Lainnya…</option>
          </Select>
        </div>
        {customUnit && (
          <TextInput
            className="mt-2"
            value={unitLabel}
            onChange={(e) => setUnitLabel(e.target.value)}
            placeholder="Ketik satuan sendiri, mis. botol"
            aria-label="Satuan lainnya"
          />
        )}
      </Field>

      <Field label="Harga default per dus" hint="Dipakai kalau toko belum pernah beli produk ini.">
        <MoneyInput value={price} onChange={setPrice} />
      </Field>
      {boxQtyNum > 0 && (
        <Field
          label={`Harga per ${unitLabelTrimmed}`}
          hint={`Otomatis saling terhubung dengan harga per dus (1 dus = ${boxQtyNum} ${unitLabelTrimmed}).`}
        >
          <MoneyInput value={perUnit} onChange={(v) => setPrice(v * boxQtyNum)} />
        </Field>
      )}

      <Field label="Harga modal per dus" hint="Opsional, cuma buat catatan kamu — tidak pernah muncul di faktur.">
        <MoneyInput value={costPrice} onChange={setCostPrice} />
      </Field>
      {boxQtyNum > 0 && (
        <Field label={`Harga modal per ${unitLabelTrimmed}`} hint="Saling terhubung dengan harga modal per dus di atas.">
          <MoneyInput value={costPerUnit} onChange={(v) => setCostPrice(v * boxQtyNum)} />
        </Field>
      )}
      {margin !== null && (
        <p className="-mt-2 text-sm text-gray-600">
          Untung ≈ {formatRupiah(margin)} per dus ({Math.round((margin / price) * 100)}% dari harga jual)
        </p>
      )}

      <Field label="Catatan" hint="Opsional, mis. “1 bal = 50 pack, 1 pack = 5 pcs”.">
        <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <Toggle label="Aktif (bisa dipilih di faktur)" checked={active} onChange={setActive} />
      <ErrorText>{error}</ErrorText>
      <Button size="lg" disabled={busy} onClick={save}>
        {busy ? 'Menyimpan…' : 'Simpan Produk'}
      </Button>
    </div>
  )
}
