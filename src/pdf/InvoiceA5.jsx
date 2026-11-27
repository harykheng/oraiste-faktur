import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

// Template PDF A5 portrait, layout mengikuti faktur cetak DIANA KOSMETIK.
// Hanya merender objek dari buildInvoiceDoc().
// Template lain (mis. struk thermal) cukup dibuat sebagai file baru di folder ini.

const COL = { no: '7%', product: '39%', qty: '16%', price: '18%', subtotal: '20%' }

// Tinggi baris teks di bawah garis TTD = tinggi baris TOTAL, supaya garis
// TOTAL sejajar dengan garis tanda tangan di sebelah kirinya.
const FOOT_LINE = 13

const s = StyleSheet.create({
  page: { padding: 24, fontSize: 9, fontFamily: 'Helvetica', color: '#000000' },
  bold: { fontFamily: 'Helvetica-Bold' },
  right: { textAlign: 'right' },
  center: { textAlign: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  invoiceNo: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  businessName: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 1 },
  tableHead: {
    flexDirection: 'row', borderBottomWidth: 1.5, borderColor: '#000000',
    paddingBottom: 3, fontFamily: 'Helvetica-Bold', fontSize: 8.5,
  },
  row: { flexDirection: 'row', paddingTop: 3 },
  cell: { paddingHorizontal: 3 },
  small: { fontSize: 7, marginTop: 0.5 },
  footer: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 22 },
  signs: { flex: 1, flexDirection: 'row' },
  sign: { flex: 1, alignItems: 'center' },
  signLine: {
    width: 80, marginTop: 28, borderTopWidth: 0.75, borderColor: '#000000',
    paddingTop: 3, height: 3 + FOOT_LINE, textAlign: 'center',
  },
  totals: { width: 140 },
  grandRow: {
    flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.75, borderColor: '#000000',
    paddingTop: 3, height: 3 + FOOT_LINE,
  },
  grandText: { fontSize: 10.5, fontFamily: 'Helvetica-Bold' },
  bank: { marginTop: 14, fontSize: 8 },
  voidBanner: {
    backgroundColor: '#111827', color: '#ffffff', padding: 6, marginBottom: 10, textAlign: 'center',
  },
})

export default function InvoiceA5({ doc }) {
  return (
    <Document title={`Faktur ${doc.invoiceNumber}`} author={doc.business.name}>
      <Page size="A5" orientation="portrait" style={s.page}>
        {doc.status === 'void' && (
          <View style={s.voidBanner}>
            <Text style={[s.bold, { fontSize: 14, letterSpacing: 3 }]}>DIBATALKAN</Text>
            <Text>Alasan: {doc.voidReason}</Text>
          </View>
        )}

        {/* Kiri: nomor + nama usaha + tanggal. Kanan: nama toko pembeli. */}
        <View style={s.header}>
          <View style={{ maxWidth: '55%' }}>
            <Text style={s.invoiceNo}>FAKTUR NO: {doc.invoiceNumber}</Text>
            <Text style={s.businessName}>{doc.business.name}</Text>
            {doc.business.whatsapp ? <Text>Telp/WA: {doc.business.whatsapp}</Text> : null}
            <Text style={{ marginTop: 1 }}>
              Tanggal: <Text style={s.bold}>{doc.date}</Text>
            </Text>
          </View>
          <View style={{ maxWidth: '43%' }}>
            <Text style={[s.bold, s.right]}>{doc.customerName}</Text>
          </View>
        </View>

        {/* Tabel item: garis tebal di bawah judul kolom, tanpa garis antar baris */}
        <View style={s.tableHead}>
          <Text style={[s.cell, s.center, { width: COL.no }]}>No</Text>
          <Text style={[s.cell, { width: COL.product }]}>Nama Produk</Text>
          <Text style={[s.cell, s.center, { width: COL.qty }]}>Qty</Text>
          <Text style={[s.cell, s.right, { width: COL.price }]}>{doc.priceHeader}</Text>
          <Text style={[s.cell, s.right, { width: COL.subtotal }]}>Subtotal</Text>
        </View>
        {doc.items.map((it) => (
          <View key={it.no} style={s.row} wrap={false}>
            <Text style={[s.cell, s.center, { width: COL.no }]}>{it.no}</Text>
            <View style={[s.cell, { width: COL.product }]}>
              <Text>{it.name}</Text>
              <Text style={s.small}>{it.packing}</Text>
            </View>
            <Text style={[s.cell, s.center, { width: COL.qty }]}>{it.qty}</Text>
            <Text style={[s.cell, s.right, { width: COL.price }]}>{it.price}</Text>
            <Text style={[s.cell, s.right, s.bold, { width: COL.subtotal }]}>{it.subtotal}</Text>
          </View>
        ))}

        {/* TTD + TOTAL dalam satu baris, garis TOTAL sejajar garis TTD */}
        <View style={s.footer} wrap={false}>
          <View style={s.signs}>
            <View style={s.sign}>
              <Text>Cap & TTD Penerima,</Text>
              <Text style={s.signLine}> </Text>
            </View>
            <View style={s.sign}>
              <Text>Hormat Kami,</Text>
              <Text style={s.signLine}>{doc.business.signName}</Text>
            </View>
          </View>
          <View style={s.totals}>
            <View style={s.grandRow}>
              <Text style={s.grandText}>TOTAL</Text>
              <Text style={s.grandText}>{doc.total}</Text>
            </View>
          </View>
        </View>

        {doc.bank ? (
          <Text style={s.bank} wrap={false}>
            Pembayaran transfer ke: {doc.bank.name} {doc.bank.number} a.n. {doc.bank.holder}
          </Text>
        ) : null}
      </Page>
    </Document>
  )
}
