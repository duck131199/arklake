export const invoiceExpiryOptions = ['24 hours', '3 days', '7 days', '30 days'] as const
export type InvoiceExpiryOption = typeof invoiceExpiryOptions[number]

const expiryMilliseconds: Record<InvoiceExpiryOption, number> = {
  '24 hours': 24 * 60 * 60 * 1000,
  '3 days': 3 * 24 * 60 * 60 * 1000,
  '7 days': 7 * 24 * 60 * 60 * 1000,
  '30 days': 30 * 24 * 60 * 60 * 1000,
}

export function validateInvoiceCreate(value: unknown) {
  if (!value || typeof value !== 'object') return { error: 'Invalid invoice request.' } as const
  const body = value as Record<string, unknown>
  const payerEmail = typeof body.payerEmail === 'string' ? body.payerEmail.trim().toLowerCase() : ''
  const amount = typeof body.amount === 'string' ? body.amount.trim() : ''
  const memo = typeof body.memo === 'string' ? body.memo.trim() : ''
  const expiry = body.expiry
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) return { error: 'Enter a valid payer email.' } as const
  if (!/^\d+(?:\.\d{1,6})?$/.test(amount) || Number(amount) <= 0) return { error: 'Enter a valid amount greater than 0.' } as const
  if (memo.length > 500) return { error: 'Memo must be 500 characters or fewer.' } as const
  if (!invoiceExpiryOptions.includes(expiry as InvoiceExpiryOption)) return { error: 'Choose a valid expiry.' } as const
  return { data: { payerEmail, amount, memo, expiry: expiry as InvoiceExpiryOption } } as const
}

export function invoiceExpiresAt(expiry: InvoiceExpiryOption, now = new Date()) {
  return new Date(now.getTime() + expiryMilliseconds[expiry]).toISOString()
}

export function maskInvoiceEmail(value: string) {
  const [local, domain] = value.trim().toLowerCase().split('@')
  if (!local || !domain) return 'Private recipient'
  const visible = local.length === 1 ? `${local}*` : `${local[0]}${local.length > 2 ? '…' : '*'}${local.length > 2 ? local.at(-1) : ''}`
  return `${visible}@${domain}`
}
