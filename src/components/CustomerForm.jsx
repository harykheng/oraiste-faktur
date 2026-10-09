import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { Button, ErrorText, Field, NumberInput, TextArea, TextInput } from './ui.jsx'

// full=false: form singkat (nama, WA, tempo) untuk "Toko Baru" di layar Buat Faktur.
export default function CustomerForm({ customer, full = false, onSaved }) {
  const [name, setName] = useState(customer?.name ?? '')
  const [whatsapp, setWhatsapp] = useState(customer?.whatsapp_number ?? '')
  const [termDays, setTermDays] = useState(customer?.default_term_days ?? 0)
  const [address, setAddress] = useState(customer?.address ?? '')
  const [mapUrl, setMapUrl] = useState(customer?.map_url ?? '')
  const [notes, setNotes] = useState(customer?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!name.trim()) {
      setError('Nama toko wajib diisi.')
      return
    }

    // Link lokasi: boleh kosong, tapi kalau diisi harus berupa URL yang valid
    // (tanpa http(s):// di depan juga diterima, nanti ditambahkan otomatis).
    // `new URL()` di browser terlalu longgar (teks ngasal pun lolos dengan
    // di-encode), jadi dicek manual: harus ada domain berisi titik, tanpa spasi.
    let normalizedMapUrl = mapUrl.trim()
    if (normalizedMapUrl && !/^https?:\/\//i.test(normalizedMapUrl)) {
      normalizedMapUrl = `https://${normalizedMapUrl}`
    }
    if (normalizedMapUrl && !/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(normalizedMapUrl)) {
      setError('Link lokasi (Maps/Waze) tidak valid.')
      return
    }

    setBusy(true)
    setError('')
    const row = {
      name: name.trim(),
      whatsapp_number: whatsapp.trim() || null,
      default_term_days: Number(termDays) || 0,
    }
    if (full) {
      row.address = address.trim() || null
      row.map_url = normalizedMapUrl || null
      row.notes = notes.trim() || null
    }
    const query = customer
      ? supabase.from('customers').update(row).eq('id', customer.id)
      : supabase.from('customers').insert(row)
    const { data, error } = await query.select().single()
    setBusy(false)
    if (error) {
      setError(`Gagal menyimpan: ${error.message}`)
      return
    }
    onSaved(data)
  }

  return (
    <div className="grid gap-4">
      <Field label="Nama toko">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="words" />
      </Field>
      <Field label="No. WhatsApp">
        <TextInput type="tel" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="08…" />
      </Field>
      <Field label="Tempo default (hari)" hint="0 = cash">
        <NumberInput value={termDays} onChange={setTermDays} />
      </Field>
      {full && (
        <>
          <Field label="Alamat">
            <TextArea value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <Field label="Link Google Maps / Waze" hint="Tempel link dari tombol Bagikan di app Maps atau Waze.">
            <TextInput
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="https://maps.app.goo.gl/…"
              value={mapUrl}
              onChange={(e) => setMapUrl(e.target.value)}
            />
          </Field>
          <Field label="Catatan">
            <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </>
      )}
      <ErrorText>{error}</ErrorText>
      <Button size="lg" disabled={busy} onClick={save}>
        {busy ? 'Menyimpan…' : 'Simpan Toko'}
      </Button>
    </div>
  )
}
