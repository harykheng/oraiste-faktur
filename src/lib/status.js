export const PAYMENT_LABEL = {
  paid: 'Lunas',
  partial: 'Sebagian',
  unpaid: 'Belum Bayar',
  void: 'Dibatalkan',
}

const PAYMENT_TONE = { paid: 'green', partial: 'amber', unpaid: 'gray', void: 'void' }

export const METHOD_LABEL = { cash: 'Tunai', transfer: 'Transfer' }

// Badge untuk baris dari view invoice_list.
export function invoiceBadges(inv) {
  if (inv.is_void) return [{ label: 'Dibatalkan', tone: 'void' }]
  const badges = [{ label: PAYMENT_LABEL[inv.payment_status], tone: PAYMENT_TONE[inv.payment_status] }]
  if (inv.is_overdue) badges.push({ label: 'Lewat Tempo', tone: 'red' })
  badges.push(
    inv.delivery_status === 'pending'
      ? { label: 'Belum Dikirim', tone: 'amber' }
      : { label: 'Terkirim', tone: 'blue' },
  )
  return badges
}
