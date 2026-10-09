import { formatDate, formatNumber, formatRupiah } from '../lib/format.js'

const STATUS_TEXT = {
  paid: 'LUNAS',
  partial: 'DIBAYAR SEBAGIAN',
  unpaid: 'BELUM DIBAYAR',
  void: 'DIBATALKAN',
}

// Ubah data mentah (baris invoice_list + invoice_items + settings) menjadi
// "dokumen" berisi teks siap tampil. Semua template (PDF A5, preview layar,
// dan nanti struk thermal) cukup merender objek ini tanpa logika data.
export function buildInvoiceDoc({ invoice, items, settings }) {
  const status = invoice.is_void ? 'void' : invoice.payment_status
  const bank = settings.bank_account_number
    ? { name: settings.bank_name || '', number: settings.bank_account_number, holder: settings.bank_account_holder || '' }
    : null

  return {
    business: {
      name: settings.business_name,
      whatsapp: settings.whatsapp_number || '',
      address: settings.address || '',
    },
    invoiceNumber: invoice.invoice_number,
    date: formatDate(invoice.invoice_date, true),
    customerName: invoice.customer_name_snapshot,
    items: items.map((it) => ({
      name: it.product_name_snapshot,
      packing: `1 dus = ${formatNumber(it.box_qty_snapshot)} ${it.unit_label_snapshot}`,
      // Satu baris bisa dijual per dus ATAU per satuan produk (lusin/pack/dll),
      // jadi qty & harga disertai satuannya masing-masing, bukan selalu "dus".
      qty: `${formatNumber(it.qty)} ${it.sold_unit}`,
      price: `${formatRupiah(it.unit_price)}/${it.sold_unit}`,
      subtotal: formatRupiah(it.line_total),
    })),
    total: formatRupiah(invoice.total),
    status,
    statusText: STATUS_TEXT[status],
    paid: invoice.paid_amount > 0 && status === 'partial' ? formatRupiah(invoice.paid_amount) : null,
    remaining: status === 'partial' ? formatRupiah(invoice.remaining_amount) : null,
    term: invoice.term_days === 0 ? 'Cash' : `Tempo ${invoice.term_days} hari`,
    dueDate: formatDate(invoice.due_date, true),
    isOverdue: Boolean(invoice.is_overdue),
    voidReason: invoice.is_void ? invoice.void_reason : null,
    bank,
    fileName: `${invoice.invoice_number.replaceAll('/', '-')}_${invoice.customer_name_snapshot.replace(/[^A-Za-z0-9]+/g, '') || 'Toko'}.pdf`,
  }
}
