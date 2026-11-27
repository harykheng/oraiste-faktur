import { formatDate, formatNumber, formatRupiah } from '../lib/format.js'

// Ubah data mentah (baris invoice_list + invoice_items + settings) menjadi
// "dokumen" berisi teks siap tampil. Semua template (PDF A5, preview layar,
// dan nanti struk thermal) cukup merender objek ini tanpa logika data.
//
// Layout mengikuti faktur cetak DIANA KOSMETIK: status bayar & jatuh tempo
// sengaja TIDAK dicetak di faktur (tetap terlihat di halaman detail aplikasi).
export function buildInvoiceDoc({ invoice, items, settings }) {
  const status = invoice.is_void ? 'void' : invoice.payment_status
  const bank = settings.bank_account_number
    ? { name: settings.bank_name || '', number: settings.bank_account_number, holder: settings.bank_account_holder || '' }
    : null

  // Satu baris bisa dijual per dus ATAU per satuan produk (lusin/pack/dll).
  // Kalau semua baris satuannya sama, satuan cukup ditulis sekali di judul kolom
  // ("Harga / Lusin"); kalau campur, satuan ikut di tiap harga ("11.750/lusin").
  const units = [...new Set(items.map((it) => it.sold_unit))]
  const singleUnit = units.length === 1 ? units[0] : null

  return {
    business: {
      name: settings.business_name,
      // Nama di bawah garis tanda tangan: "ORAISTE - Home Goods" -> "ORAISTE"
      signName: (settings.business_name || '').split(' - ')[0].trim(),
      whatsapp: settings.whatsapp_number || '',
      address: settings.address || '',
    },
    invoiceNumber: invoice.invoice_number,
    date: formatDate(invoice.invoice_date, true),
    customerName: invoice.customer_name_snapshot,
    priceHeader: singleUnit ? `Harga / ${capitalize(singleUnit)}` : 'Harga',
    items: items.map((it, i) => ({
      no: i + 1,
      name: it.product_name_snapshot,
      packing: `1 dus = ${formatNumber(it.box_qty_snapshot)} ${it.unit_label_snapshot}`,
      qty: `${formatNumber(it.qty)} ${it.sold_unit}`,
      price: singleUnit ? formatNumber(it.unit_price) : `${formatNumber(it.unit_price)}/${it.sold_unit}`,
      subtotal: formatNumber(it.line_total),
    })),
    total: formatRupiah(invoice.total),
    status,
    voidReason: invoice.is_void ? invoice.void_reason : null,
    bank,
    fileName: `${invoice.invoice_number.replaceAll('/', '-')}_${invoice.customer_name_snapshot.replace(/[^A-Za-z0-9]+/g, '') || 'Toko'}.pdf`,
  }
}

function capitalize(str) {
  const s = String(str || '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}
