// Preview faktur di layar, layout sama dengan PDF (format faktur DIANA KOSMETIK).
// Merender objek dari buildInvoiceDoc(). Status bayar tidak ditampilkan di sini
// karena tidak dicetak di faktur; status ada di badge & bagian Pembayaran.
export default function InvoicePreview({ doc }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 text-[0.9rem] text-black">
      {doc.status === 'void' && (
        <div className="mb-3 rounded-xl bg-gray-900 p-3 text-center text-white">
          <p className="text-xl font-bold tracking-widest">DIBATALKAN</p>
          <p className="text-sm">Alasan: {doc.voidReason}</p>
        </div>
      )}

      <div className="flex justify-between gap-3 pb-3">
        <div className="min-w-0">
          <p className="font-bold">FAKTUR NO: {doc.invoiceNumber}</p>
          <p className="text-lg font-bold leading-tight">{doc.business.name}</p>
          {doc.business.whatsapp && <p>Telp/WA: {doc.business.whatsapp}</p>}
          <p>
            Tanggal: <span className="font-bold">{doc.date}</span>
          </p>
        </div>
        <p className="max-w-[45%] text-right font-bold">{doc.customerName}</p>
      </div>

      <div className="grid grid-cols-[1.5rem_1fr_auto] gap-x-2 border-b-2 border-black pb-1 text-sm font-bold">
        <span className="text-center">No</span>
        <span>Nama Produk</span>
        <span className="text-right">Subtotal</span>
      </div>
      {doc.items.map((it) => (
        <div key={it.no} className="grid grid-cols-[1.5rem_1fr_auto] gap-x-2 pt-2">
          <span className="text-center">{it.no}</span>
          <div className="min-w-0">
            <p>{it.name}</p>
            <p className="text-sm text-gray-600">
              {it.qty} × {it.price} · {it.packing}
            </p>
          </div>
          <span className="text-right font-bold">{it.subtotal}</span>
        </div>
      ))}

      <div className="mt-6 flex items-end gap-3">
        <div className="grid flex-1 grid-cols-2 gap-2 text-center text-sm">
          <div>
            <p>Cap & TTD Penerima,</p>
            <p className="mx-auto mt-8 w-full max-w-24 border-t border-black pt-1 leading-5">&nbsp;</p>
          </div>
          <div>
            <p>Hormat Kami,</p>
            <p className="mx-auto mt-8 w-full max-w-24 border-t border-black pt-1 leading-5">{doc.business.signName}</p>
          </div>
        </div>
        <div className="flex w-[45%] justify-between border-t border-black pt-1 font-bold leading-5">
          <span>TOTAL</span>
          <span>{doc.total}</span>
        </div>
      </div>

      {doc.bank && (
        <p className="mt-4 text-sm text-gray-700">
          Pembayaran transfer ke: {doc.bank.name} {doc.bank.number} a.n. {doc.bank.holder}
        </p>
      )}
    </div>
  )
}
