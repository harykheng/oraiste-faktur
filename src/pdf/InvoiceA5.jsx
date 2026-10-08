import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

// Template PDF A5 portrait. Hanya merender objek dari buildInvoiceDoc().
// Template lain (mis. struk thermal) cukup dibuat sebagai file baru di folder ini.

const COL = { product: '44%', qty: '12%', price: '21%', subtotal: '23%' }

const s = StyleSheet.create({
  page: { padding: 28, fontSize: 9, fontFamily: 'Helvetica', color: '#111827' },
  header: { borderBottomWidth: 1, borderBottomColor: '#111827', paddingBottom: 8, marginBottom: 10 },
  businessName: { fontSize: 16, fontFamily: 'Helvetica-Bold' },
  muted: { color: '#4b5563' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 14, fontFamily: 'Helvetica-Bold', letterSpacing: 2, marginBottom: 2 },
  right: { textAlign: 'right' },
  bold: { fontFamily: 'Helvetica-Bold' },
  tableHead: {
    flexDirection: 'row', backgroundColor: '#f3f4f6', borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: '#d1d5db', paddingVertical: 4, fontFamily: 'Helvetica-Bold',
  },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#e5e7eb', paddingVertical: 5 },
  cell: { paddingHorizontal: 3 },
  small: { fontSize: 7.5, color: '#4b5563', marginTop: 1 },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: '#111827',
    marginTop: 2, paddingVertical: 6, paddingHorizontal: 3,
  },
  totalText: { fontSize: 12, fontFamily: 'Helvetica-Bold' },
  box: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 4, padding: 8, marginTop: 8 },
  status: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
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

        <View style={s.header}>
          <Text style={s.businessName}>{doc.business.name}</Text>
          {doc.business.whatsapp ? <Text style={s.muted}>WA {doc.business.whatsapp}</Text> : null}
          {doc.business.address ? <Text style={s.muted}>{doc.business.address}</Text> : null}
        </View>

        <View style={s.titleRow}>
          <View>
            <Text style={s.title}>FAKTUR</Text>
            <Text>No. {doc.invoiceNumber}</Text>
            <Text>Tanggal {doc.date}</Text>
          </View>
          <View style={{ maxWidth: '50%' }}>
            <Text style={[s.muted, s.right]}>Kepada</Text>
            <Text style={[s.bold, s.right, { fontSize: 11 }]}>{doc.customerName}</Text>
          </View>
        </View>

        <View style={s.tableHead}>
          <Text style={[s.cell, { width: COL.product }]}>Produk (isi per dus)</Text>
          <Text style={[s.cell, s.right, { width: COL.qty }]}>Qty (dus)</Text>
          <Text style={[s.cell, s.right, { width: COL.price }]}>Harga/dus</Text>
          <Text style={[s.cell, s.right, { width: COL.subtotal }]}>Subtotal</Text>
        </View>
        {doc.items.map((it, i) => (
          <View key={i} style={s.row} wrap={false}>
            <View style={[s.cell, { width: COL.product }]}>
              <Text style={s.bold}>{it.name}</Text>
              <Text style={s.small}>{it.packing}</Text>
            </View>
            <Text style={[s.cell, s.right, { width: COL.qty }]}>{it.qty}</Text>
            <Text style={[s.cell, s.right, { width: COL.price }]}>{it.price}</Text>
            <Text style={[s.cell, s.right, { width: COL.subtotal }]}>{it.subtotal}</Text>
          </View>
        ))}
        <View style={s.totalRow}>
          <Text style={s.totalText}>TOTAL</Text>
          <Text style={s.totalText}>{doc.total}</Text>
        </View>

        <View style={s.box} wrap={false}>
          <Text style={s.status}>{doc.statusText}</Text>
          {doc.paid ? (
            <Text>
              Sudah dibayar {doc.paid} · Sisa {doc.remaining}
            </Text>
          ) : null}
          <Text>
            {doc.term} · Jatuh tempo {doc.dueDate}
          </Text>
        </View>

        {doc.bank ? (
          <View style={s.box} wrap={false}>
            <Text style={s.bold}>Pembayaran transfer ke:</Text>
            <Text>
              {doc.bank.name} {doc.bank.number}
            </Text>
            <Text>a.n. {doc.bank.holder}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  )
}
