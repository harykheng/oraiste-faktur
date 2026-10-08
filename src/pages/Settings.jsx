import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { Button, ConfirmSheet, ErrorText, Field, Loading, PageHeader, TextArea, TextInput } from '../components/ui.jsx'

const FIELDS = [
  'business_name', 'invoice_prefix', 'whatsapp_number', 'address',
  'bank_name', 'bank_account_number', 'bank_account_holder',
]

export default function Settings() {
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)

  useEffect(() => {
    supabase.from('settings').select('*').eq('id', 1).single().then(({ data, error }) => {
      if (error) return setError(`Gagal memuat pengaturan: ${error.message}`)
      setForm(Object.fromEntries(FIELDS.map((f) => [f, data[f] ?? ''])))
    })
  }, [])

  function set(field, value) {
    setSaved(false)
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function save() {
    if (!form.business_name.trim()) return setError('Nama usaha wajib diisi.')
    if (!/^[A-Z0-9]{1,10}$/.test(form.invoice_prefix)) {
      return setError('Prefix faktur hanya huruf/angka, maksimal 10 karakter (mis. SPN).')
    }
    setBusy(true)
    setError('')
    const row = Object.fromEntries(FIELDS.map((f) => [f, form[f].trim() || null]))
    const { error } = await supabase.from('settings').update(row).eq('id', 1)
    setBusy(false)
    if (error) return setError(`Gagal menyimpan: ${error.message}`)
    setSaved(true)
  }

  if (!form) {
    return (
      <>
        <PageHeader title="Pengaturan" />
        <div className="p-4">{error ? <ErrorText>{error}</ErrorText> : <Loading />}</div>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Pengaturan" />
      <div className="grid gap-4 p-4">
        <Field label="Nama usaha">
          <TextInput value={form.business_name} onChange={(e) => set('business_name', e.target.value)} />
        </Field>
        <Field label="Prefix nomor faktur" hint={`Contoh nomor: ${form.invoice_prefix || 'SPN'}/2610/0001`}>
          <TextInput
            value={form.invoice_prefix}
            autoCapitalize="characters"
            onChange={(e) => set('invoice_prefix', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          />
        </Field>
        <Field label="No. WhatsApp usaha">
          <TextInput type="tel" inputMode="tel" value={form.whatsapp_number} onChange={(e) => set('whatsapp_number', e.target.value)} />
        </Field>
        <Field label="Alamat">
          <TextArea value={form.address} onChange={(e) => set('address', e.target.value)} />
        </Field>

        <h2 className="mt-2 text-lg font-bold">Rekening transfer</h2>
        <Field label="Nama bank">
          <TextInput value={form.bank_name} onChange={(e) => set('bank_name', e.target.value)} placeholder="Mis. BCA" />
        </Field>
        <Field label="Nomor rekening">
          <TextInput inputMode="numeric" value={form.bank_account_number} onChange={(e) => set('bank_account_number', e.target.value)} />
        </Field>
        <Field label="Atas nama">
          <TextInput value={form.bank_account_holder} onChange={(e) => set('bank_account_holder', e.target.value)} />
        </Field>

        <ErrorText>{error}</ErrorText>
        {saved && <p className="rounded-xl bg-green-50 p-3 text-green-800">Pengaturan tersimpan.</p>}
        <Button size="lg" disabled={busy} onClick={save}>
          {busy ? 'Menyimpan…' : 'Simpan Pengaturan'}
        </Button>

        <Button variant="dangerOutline" className="mt-6" onClick={() => setConfirmLogout(true)}>
          Keluar dari akun
        </Button>
      </div>

      {confirmLogout && (
        <ConfirmSheet
          title="Keluar dari akun?"
          message="Setelah keluar, harus login lagi dengan email dan password."
          confirmLabel="Ya, keluar"
          onConfirm={() => supabase.auth.signOut()}
          onClose={() => setConfirmLogout(false)}
        />
      )}
    </>
  )
}
