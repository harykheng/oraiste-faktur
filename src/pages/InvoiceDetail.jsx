import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { formatDate, formatRupiah, formatTimestampDate } from '../lib/format.js'
import { METHOD_LABEL, invoiceBadges } from '../lib/status.js'
import { sharePdf } from '../lib/sharePdf.js'
import { buildInvoiceDoc } from '../invoice/buildInvoiceDoc.js'
import InvoicePreview from '../invoice/InvoicePreview.jsx'
import { renderInvoicePdf } from '../pdf/renderInvoicePdf.js'
import {
  BackButton, Badge, Button, ConfirmSheet, ErrorText, Field, Loading, MoneyInput,
  PageHeader, Segmented, Sheet, TextArea,
} from '../components/ui.jsx'

export default function InvoiceDetail() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const isNew = params.get('baru') === '1'
  const navigate = useNavigate()

  const [data, setData] = useState(null) // { invoice, items, payments, settings }
  const [loadError, setLoadError] = useState('')
  const [file, setFile] = useState(null)
  const [pdfError, setPdfError] = useState('')
  const [shareMessage, setShareMessage] = useState('')
  const [sheet, setSheet] = useState(null) // 'pay' | 'deliver' | 'void'

  const load = useCallback(async () => {
    const [inv, items, payments, settings] = await Promise.all([
      supabase.from('invoice_list').select('*').eq('id', id).single(),
      supabase.from('invoice_items').select('*').eq('invoice_id', id).order('product_name_snapshot'),
      supabase.from('payments').select('*').eq('invoice_id', id).order('created_at'),
      supabase.from('settings').select('*').eq('id', 1).single(),
    ])
    const error = inv.error || items.error || payments.error || settings.error
    if (error) {
      setLoadError(`Gagal memuat faktur: ${error.message}`)
      return
    }
    setData({ invoice: inv.data, items: items.data, payments: payments.data, settings: settings.data })
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const doc = useMemo(() => (data ? buildInvoiceDoc(data) : null), [data])

  // Siapkan PDF di belakang begitu data siap, supaya saat tombol ditekan
  // navigator.share bisa langsung dipanggil (syarat iOS Safari).
  useEffect(() => {
    if (!doc) return
    let cancelled = false
    setFile(null)
    setPdfError('')
    renderInvoicePdf(doc).then(
      (f) => !cancelled && setFile(f),
      (err) => !cancelled && setPdfError(`Gagal membuat PDF: ${err.message}`),
    )
    return () => {
      cancelled = true
    }
  }, [doc])

  function share() {
    if (!file) return
    setShareMessage('')
    sharePdf(file).then(
      (result) => {
        if (result === 'downloaded') setShareMessage('HP ini tidak bisa share file langsung. PDF diunduh, kirim manual lewat WhatsApp.')
      },
      (err) => setShareMessage(`Gagal membuka menu share: ${err.message}`),
    )
  }

  if (loadError) {
    return (
      <>
        <PageHeader title="Faktur" left={<BackButton onClick={() => navigate('/')} />} />
        <div className="p-4">
          <ErrorText>{loadError}</ErrorText>
        </div>
      </>
    )
  }
  if (!data) return <Loading />

  const { invoice, payments } = data
  const canAct = !invoice.is_void

  return (
    <>
      <PageHeader title={invoice.invoice_number} left={<BackButton onClick={() => navigate('/')} />} />
      <div className="grid gap-4 p-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {isNew && (
          <div className="rounded-2xl bg-green-50 p-4 text-center">
            <p className="text-xl font-bold text-green-800">✓ Faktur jadi</p>
            <p className="text-green-800">
              {invoice.customer_name_snapshot} · {formatRupiah(invoice.total)}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {invoiceBadges(invoice).map((b) => (
            <Badge key={b.label} tone={b.tone}>
              {b.label}
            </Badge>
          ))}
        </div>

        {canAct && (
          <div className="grid gap-2">
            <Button variant="whatsapp" size="lg" disabled={!file} onClick={share}>
              {file ? (isNew ? 'Kirim ke WhatsApp' : 'Kirim Ulang') : 'Menyiapkan PDF…'}
            </Button>
            <ErrorText>{pdfError}</ErrorText>
            {shareMessage && <p className="rounded-xl bg-amber-50 p-3 text-amber-900">{shareMessage}</p>}
          </div>
        )}

        {isNew && (
          <Button variant="secondary" onClick={() => navigate('/')}>
            Selesai, kembali ke daftar
          </Button>
        )}

        <InvoicePreview doc={doc} />

        <section className="grid gap-2 rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-lg font-bold">Pembayaran</h2>
          {payments.length === 0 && <p className="text-gray-500">Belum ada pembayaran.</p>}
          {payments.map((p) => (
            <div key={p.id} className="flex justify-between gap-3">
              <span className="text-gray-700">
                {formatDate(p.paid_at)} · {METHOD_LABEL[p.method]}
              </span>
              <span className="font-semibold">{formatRupiah(p.amount)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-gray-200 pt-2 font-bold">
            <span>Sisa tagihan</span>
            <span>{formatRupiah(invoice.is_void ? 0 : invoice.remaining_amount)}</span>
          </div>
          <p className="text-sm text-gray-600">
            {invoice.delivery_status === 'pending'
              ? 'Barang belum dikirim.'
              : `Barang diserahkan ${formatTimestampDate(invoice.delivered_at)}.`}
          </p>
        </section>

        {canAct && (
          <div className="grid gap-2">
            {invoice.remaining_amount > 0 && (
              <Button size="lg" onClick={() => setSheet('pay')}>
                Catat Pembayaran
              </Button>
            )}
            {invoice.delivery_status === 'pending' && (
              <Button variant="secondary" size="lg" onClick={() => setSheet('deliver')}>
                Tandai Terkirim
              </Button>
            )}
            <Button variant="dangerOutline" className="mt-4" onClick={() => setSheet('void')}>
              Batalkan Faktur
            </Button>
          </div>
        )}

        {invoice.is_void && (
          <Button variant="dangerOutline" onClick={() => setSheet('delete')}>
            Hapus Faktur
          </Button>
        )}
      </div>

      {sheet === 'pay' && (
        <PaymentSheet invoice={invoice} onClose={() => setSheet(null)} onDone={() => { setSheet(null); load() }} />
      )}
      {sheet === 'deliver' && (
        <DeliverSheet invoice={invoice} onClose={() => setSheet(null)} onDone={() => { setSheet(null); load() }} />
      )}
      {sheet === 'void' && (
        <VoidSheet invoice={invoice} onClose={() => setSheet(null)} onDone={() => { setSheet(null); load() }} />
      )}
      {sheet === 'delete' && (
        <DeleteSheet invoice={invoice} onClose={() => setSheet(null)} onDone={() => navigate('/')} />
      )}
    </>
  )
}

function PaymentSheet({ invoice, onClose, onDone }) {
  const [amount, setAmount] = useState(invoice.remaining_amount)
  const [method, setMethod] = useState('cash')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!(amount > 0)) return setError('Isi jumlah pembayaran.')
    if (amount > invoice.remaining_amount) {
      return setError(`Jumlah melebihi sisa tagihan (${formatRupiah(invoice.remaining_amount)}).`)
    }
    setBusy(true)
    const { error } = await supabase.from('payments').insert({ invoice_id: invoice.id, amount, method })
    setBusy(false)
    if (error) return setError(`Gagal menyimpan: ${error.message}`)
    onDone()
  }

  return (
    <Sheet title="Catat Pembayaran" onClose={onClose}>
      <div className="grid gap-4">
        <p className="text-gray-700">Sisa tagihan {formatRupiah(invoice.remaining_amount)}</p>
        <Field label="Jumlah dibayar">
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <div>
          <p className="mb-1 font-medium text-gray-700">Metode</p>
          <Segmented
            value={method}
            onChange={setMethod}
            options={[
              { value: 'cash', label: 'Tunai' },
              { value: 'transfer', label: 'Transfer' },
            ]}
          />
        </div>
        <ErrorText>{error}</ErrorText>
        <Button size="lg" disabled={busy} onClick={save}>
          {busy ? 'Menyimpan…' : 'Simpan Pembayaran'}
        </Button>
      </div>
    </Sheet>
  )
}

function DeliverSheet({ invoice, onClose, onDone }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    setBusy(true)
    const { error } = await supabase.from('invoices').update({ delivery_status: 'delivered' }).eq('id', invoice.id)
    setBusy(false)
    if (error) return setError(`Gagal menyimpan: ${error.message}`)
    onDone()
  }

  return (
    <ConfirmSheet
      title="Tandai terkirim?"
      message={`Barang untuk ${invoice.customer_name_snapshot} sudah dikirim hari ini. Ini tidak bisa dibatalkan.`}
      confirmLabel="Ya, sudah terkirim"
      variant="primary"
      busy={busy}
      onConfirm={confirm}
      onClose={onClose}
    >
      <ErrorText>{error}</ErrorText>
    </ConfirmSheet>
  )
}

function DeleteSheet({ invoice, onClose, onDone }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    setBusy(true)
    const { error } = await supabase.rpc('delete_void_invoice', { p_invoice_id: invoice.id })
    setBusy(false)
    if (error) return setError(`Gagal menghapus: ${error.message}`)
    onDone()
  }

  return (
    <ConfirmSheet
      title="Hapus faktur ini?"
      message={`Faktur ${invoice.invoice_number} akan dihapus PERMANEN, termasuk riwayat pembayarannya. Ini tidak bisa dibatalkan.`}
      confirmLabel="Ya, hapus permanen"
      busy={busy}
      onConfirm={confirm}
      onClose={onClose}
    >
      <ErrorText>{error}</ErrorText>
    </ConfirmSheet>
  )
}

function VoidSheet({ invoice, onClose, onDone }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    if (!reason.trim()) return setError('Alasan wajib diisi.')
    setBusy(true)
    const { error } = await supabase
      .from('invoices')
      .update({ is_void: true, void_reason: reason.trim() })
      .eq('id', invoice.id)
    setBusy(false)
    if (error) return setError(`Gagal membatalkan: ${error.message}`)
    onDone()
  }

  return (
    <ConfirmSheet
      title="Batalkan faktur?"
      message={`Faktur ${invoice.invoice_number} akan ditandai DIBATALKAN dan tidak bisa dipakai lagi. Kalau ada yang salah, buat faktur baru setelah ini.`}
      confirmLabel="Ya, batalkan faktur"
      busy={busy}
      onConfirm={confirm}
      onClose={onClose}
    >
      <Field label="Alasan pembatalan (wajib)">
        <TextArea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Mis. salah qty" />
      </Field>
      <div className="mt-2">
        <ErrorText>{error}</ErrorText>
      </div>
    </ConfirmSheet>
  )
}
