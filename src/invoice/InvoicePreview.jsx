// Preview faktur di layar. Merender objek dari buildInvoiceDoc().
export default function InvoicePreview({ doc }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 text-[0.9rem]">
      {doc.status === 'void' && (
        <div className="mb-3 rounded-xl bg-gray-900 p-3 text-center text-white">
          <p className="text-xl font-bold tracking-widest">DIBATALKAN</p>
          <p className="text-sm">Alasan: {doc.voidReason}</p>
        </div>
      )}

      <div className="border-b border-gray-200 pb-3">
        <p className="text-lg font-bold">{doc.business.name}</p>
        {doc.business.whatsapp && <p className="text-gray-600">WA {doc.business.whatsapp}</p>}
        {doc.business.address && <p className="whitespace-pre-line text-gray-600">{doc.business.address}</p>}
      </div>

      <div className="flex justify-between gap-3 py-3">
        <div>
          <p className="text-lg font-bold tracking-wide">FAKTUR</p>
          <p>{doc.invoiceNumber}</p>
          <p className="text-gray-600">{doc.date}</p>
        </div>
        <div className="text-right">
          <p className="text-gray-600">Kepada</p>
          <p className="font-bold">{doc.customerName}</p>
        </div>
      </div>

      <div className="divide-y divide-gray-100 border-y border-gray-200">
        {doc.items.map((it, i) => (
          <div key={i} className="flex justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="font-semibold">{it.name}</p>
              <p className="text-gray-600">
                {it.packing} · {it.qty} dus × {it.price}
              </p>
            </div>
            <p className="shrink-0 font-semibold">{it.subtotal}</p>
          </div>
        ))}
      </div>

      <div className="flex items-baseline justify-between py-3">
        <span className="font-bold">TOTAL</span>
        <span className="text-xl font-bold">{doc.total}</span>
      </div>

      <div className="grid gap-1 rounded-xl bg-gray-50 p-3">
        <p className="font-bold">{doc.statusText}</p>
        {doc.paid && (
          <p>
            Sudah dibayar {doc.paid} · Sisa {doc.remaining}
          </p>
        )}
        <p>
          {doc.term} · Jatuh tempo {doc.dueDate}
        </p>
        {doc.bank && (
          <p className="text-gray-700">
            Transfer: {doc.bank.name} {doc.bank.number} a.n. {doc.bank.holder}
          </p>
        )}
      </div>
    </div>
  )
}
