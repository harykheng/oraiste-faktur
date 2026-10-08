import { createElement } from 'react'

// @react-pdf/renderer besar, jadi dimuat hanya saat PDF pertama kali dibuat.
export async function renderInvoicePdf(doc) {
  const [{ pdf }, { default: InvoiceA5 }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./InvoiceA5.jsx'),
  ])
  const blob = await pdf(createElement(InvoiceA5, { doc })).toBlob()
  return new File([blob], doc.fileName, { type: 'application/pdf' })
}
