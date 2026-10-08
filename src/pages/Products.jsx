import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { formatRupiah } from '../lib/format.js'
import {
  Badge, Button, ErrorText, Field, Loading, MoneyInput, NumberInput, PageHeader, Sheet, TextInput, Toggle,
} from '../components/ui.jsx'

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
              1 dus = {p.dozens_per_box} lusin · {formatRupiah(p.default_price)}/dus
            </p>
          </button>
        ))}
      </div>

      {editing && (
        <Sheet title={editing === 'new' ? 'Produk Baru' : 'Edit Produk'} onClose={() => setEditing(null)}>
          <ProductForm
            product={editing === 'new' ? null : editing}
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

function ProductForm({ product, onSaved }) {
  const [name, setName] = useState(product?.name ?? '')
  const [dozens, setDozens] = useState(product?.dozens_per_box ?? '')
  const [price, setPrice] = useState(product?.default_price ?? 0)
  const [active, setActive] = useState(product?.is_active ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!name.trim()) return setError('Nama produk wajib diisi.')
    if (!(dozens > 0)) return setError('Isi per dus minimal 1 lusin.')
    if (!(price > 0)) return setError('Harga default wajib diisi.')
    setBusy(true)
    setError('')
    const row = { name: name.trim(), dozens_per_box: dozens, default_price: price, is_active: active }
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
      <Field label="Isi per dus (lusin)">
        <NumberInput value={dozens} onChange={setDozens} />
      </Field>
      <Field label="Harga default per dus" hint="Dipakai kalau toko belum pernah beli produk ini.">
        <MoneyInput value={price} onChange={setPrice} />
      </Field>
      <Toggle label="Aktif (bisa dipilih di faktur)" checked={active} onChange={setActive} />
      <ErrorText>{error}</ErrorText>
      <Button size="lg" disabled={busy} onClick={save}>
        {busy ? 'Menyimpan…' : 'Simpan Produk'}
      </Button>
    </div>
  )
}
