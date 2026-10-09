import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { termLabel } from '../lib/format.js'
import { Button, ConfirmSheet, ErrorText, Loading, PageHeader, SearchInput, Sheet } from '../components/ui.jsx'
import CustomerForm from '../components/CustomerForm.jsx'

export default function Customers() {
  const [customers, setCustomers] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | customer
  const [confirmDelete, setConfirmDelete] = useState(null) // null | customer
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  async function load() {
    const { data, error } = await supabase.from('customers').select('*').order('name')
    if (error) return setError(`Gagal memuat toko: ${error.message}`)
    setCustomers(data)
  }

  useEffect(() => {
    load()
  }, [])

  async function deleteCustomer() {
    setDeleteBusy(true)
    setDeleteError('')
    const { error } = await supabase.from('customers').delete().eq('id', confirmDelete.id)
    setDeleteBusy(false)
    if (error) {
      setDeleteError(
        error.code === '23503'
          ? 'Toko ini sudah pernah dipakai di faktur, jadi tidak bisa dihapus.'
          : `Gagal menghapus: ${error.message}`,
      )
      return
    }
    setConfirmDelete(null)
    setEditing(null)
    load()
  }

  const q = search.trim().toLowerCase()
  const filtered = (customers ?? []).filter((c) => !q || c.name.toLowerCase().includes(q))

  return (
    <>
      <PageHeader title="Toko" />
      <div className="grid gap-3 p-4">
        <Button size="lg" onClick={() => setEditing('new')}>
          + Toko Baru
        </Button>
        <SearchInput placeholder="Cari toko…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <ErrorText>{error}</ErrorText>
        {customers === null && !error && <Loading />}
        {customers?.length === 0 && <p className="p-6 text-center text-gray-500">Belum ada toko.</p>}
        {filtered.map((c) => (
          <div key={c.id} className="rounded-2xl border border-gray-200 bg-white p-4">
            <button type="button" className="block w-full text-left active:opacity-70" onClick={() => setEditing(c)}>
              <p className="text-lg font-bold">{c.name}</p>
              <p className="text-sm text-gray-600">
                {termLabel(c.default_term_days)}
                {c.whatsapp_number ? ` · WA ${c.whatsapp_number}` : ''}
              </p>
            </button>
            {c.map_url && (
              <a
                href={c.map_url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 flex min-h-12 w-fit items-center font-semibold text-blue-700"
              >
                📍 Buka Lokasi
              </a>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <Sheet title={editing === 'new' ? 'Toko Baru' : 'Edit Toko'} onClose={() => setEditing(null)}>
          <div className="grid gap-4">
            <CustomerForm
              full
              customer={editing === 'new' ? null : editing}
              onSaved={() => {
                setEditing(null)
                load()
              }}
            />
            {editing !== 'new' && (
              <Button variant="dangerOutline" onClick={() => setConfirmDelete(editing)}>
                Hapus Toko
              </Button>
            )}
          </div>
        </Sheet>
      )}

      {confirmDelete && (
        <ConfirmSheet
          title="Hapus toko?"
          message={`${confirmDelete.name} akan dihapus permanen. Kalau toko ini sudah pernah dipakai di faktur, penghapusan akan ditolak.`}
          confirmLabel="Ya, hapus"
          busy={deleteBusy}
          onConfirm={deleteCustomer}
          onClose={() => {
            setConfirmDelete(null)
            setDeleteError('')
          }}
        >
          <ErrorText>{deleteError}</ErrorText>
        </ConfirmSheet>
      )}
    </>
  )
}
