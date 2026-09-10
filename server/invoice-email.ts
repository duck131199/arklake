import type { SupabaseClient } from '@supabase/supabase-js'
import QRCode from 'qrcode'

type InvoiceEmailEvent = 'invoice_created' | 'invoice_paid' | 'invoice_payment_confirmed'
type InvoiceEmailJob = {
  id: string
  account_id: string
  invoice_id: string
  event_type: InvoiceEmailEvent
  recipient_email: string
  attempts: number
}
type InvoiceEmailRecord = {
  id: string
  invoice_number: string
  account_id: string
  payer_email: string
  amount: string | number
  asset: string
  memo: string
  status: 'active' | 'paid' | 'expired'
  created_at: string
  expires_at: string
  paid_at: string | null
  payment_tx_hash: string | null
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!)

const retryAt = (attempts: number) => new Date(Date.now() + Math.min(60, 2 ** Math.min(attempts, 5)) * 60_000).toISOString()
const displayDate = (value: string) => {
  const date = new Date(value)
  const day = date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
  const time = date.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' })
  return `${day} · ${time} UTC`
}

export function invoiceEmailEnabled(value: string | undefined) {
  return value === 'true'
}

export function invoiceEmailIdempotencyKey(invoiceId: string, eventType: InvoiceEmailEvent) {
  return `invoice-email-${invoiceId}-${eventType}`
}

export async function renderInvoiceEmail(eventType: InvoiceEmailEvent, invoice: InvoiceEmailRecord, sellerEmail: string, recipientEmail: string, publicUrl: string) {
  const amount = `${invoice.amount} ${invoice.asset}`
  const isPaid = eventType !== 'invoice_created'
  const isPayerConfirmation = eventType === 'invoice_payment_confirmed'
  const subject = isPayerConfirmation ? `Payment confirmed for ${invoice.invoice_number}` : isPaid ? `Payment received for ${invoice.invoice_number}` : 'You received an invoice'
  const headline = isPayerConfirmation ? 'Invoice payment confirmed' : isPaid ? 'Invoice paid' : 'You received an invoice'
  const supporting = isPayerConfirmation ? 'Your payment has been verified on-chain.' : isPaid ? 'Payment has been verified on-chain.' : 'Review the details below and pay securely through Arklake.'
  const invoiceUrl = `${publicUrl.replace(/\/$/, '')}/invoice/${encodeURIComponent(invoice.id)}`
  const arcscanUrl = invoice.payment_tx_hash ? `https://testnet.arcscan.app/tx/${encodeURIComponent(invoice.payment_tx_hash)}` : null
  const transactionLabel = invoice.payment_tx_hash ? `${invoice.payment_tx_hash.slice(0, 10)}...${invoice.payment_tx_hash.slice(-9)}` : ''
  const details = isPaid ? [
    ['Invoice number', invoice.invoice_number], [isPayerConfirmation ? 'Paid to' : 'Paid by', isPayerConfirmation ? sellerEmail : invoice.payer_email], ['Amount', amount],
    ['Paid at', displayDate(invoice.paid_at || invoice.expires_at)], ['Payment details', `${invoice.asset} · Arc Testnet`],
  ] : [
    ['From', sellerEmail], ['Bill to', recipientEmail], ['Invoice number', invoice.invoice_number],
    ['Description', invoice.memo || '—'], ['Amount due', amount], ['Payment details', `${invoice.asset} · Arc Testnet`],
    ['Created at', displayDate(invoice.created_at)], ['Expires', displayDate(invoice.expires_at)],
  ]
  const rows = details.map(([label, value]) => `<tr><td style="padding:9px 0;color:#708593">${escapeHtml(label)}</td><td align="right" style="padding:9px 0;color:#102a43;font-weight:600">${escapeHtml(value)}</td></tr>`).join('')
  const qrContent = isPaid ? null : await QRCode.toBuffer(invoiceUrl, { type: 'png', width: 144, margin: 1, color: { dark: '#102a43', light: '#ffffff' } })
  const action = isPaid
    ? `<p style="margin:26px 0 0"><a href="${escapeHtml(invoiceUrl)}" style="display:inline-block;border-radius:999px;background:#102a43;padding:13px 22px;color:#fff;font-size:14px;font-weight:700;text-decoration:none">View paid invoice</a></p><div style="margin-top:24px;padding-top:22px;border-top:1px solid #edf2f2"><p style="margin:0;color:#708593;font-size:12px;line-height:18px">Transaction</p><p style="margin:6px 0 0;color:#102a43;font-size:12px;line-height:18px">${escapeHtml(transactionLabel)}</p>${arcscanUrl ? `<p style="margin:9px 0 0"><a href="${escapeHtml(arcscanUrl)}" style="color:#176b70;font-size:12px;line-height:18px">View on Arcscan</a></p>` : ''}</div>`
    : `<p style="margin:26px 0 0"><a href="${escapeHtml(invoiceUrl)}" style="display:inline-block;border-radius:999px;background:#102a43;padding:13px 22px;color:#fff;font-size:14px;font-weight:700;text-decoration:none">View &amp; pay invoice</a></p><div style="margin-top:26px;padding-top:24px;border-top:1px solid #edf2f2;text-align:center"><img src="cid:invoice-public-link-qr" width="108" height="108" alt="QR code to open invoice" style="display:block;margin:0 auto;border:0"><p style="margin:12px 0 0;color:#708593;font-size:12px;line-height:18px">Scan to open this invoice</p><p style="margin:10px 0 0"><a href="${escapeHtml(invoiceUrl)}" style="color:#176b70;font-size:12px;line-height:18px">Open invoice in browser</a></p></div><p style="margin:22px 0 0;color:#708593;font-size:12px;line-height:19px">Review the invoice details on Arklake before completing your payment.</p>`
  const textAction = isPaid
    ? `\n\nView paid invoice: ${invoiceUrl}${arcscanUrl ? `\n\nTransaction: ${transactionLabel}\nView on Arcscan: ${arcscanUrl}` : ''}`
    : `\n\nView & pay invoice: ${invoiceUrl}\n\nVerify the invoice number, amount, and recipient before paying.`
  const text = `${headline}\n\n${supporting}\n\n${details.map(([label, value]) => `${label}: ${value}`).join('\n')}${textAction}`
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head><body style="margin:0;background:#f3f8f8"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:36px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px"><tr><td align="center" style="padding-bottom:12px;font-family:Arial,sans-serif;color:#102a43"><img src="https://arklake.site/brand/arklake-mark-trimmed.png" width="36" height="36" alt="Arklake" style="display:block;border:0"><div style="padding-top:7px;font-size:18px;font-weight:700">Arklake</div></td></tr><tr><td style="border:1px solid #e7eeee;border-radius:20px;background:#fff;padding:34px 32px;font-family:Arial,sans-serif;color:#102a43"><h1 style="margin:0;font-size:28px;line-height:36px">${escapeHtml(headline)}</h1><p style="margin:14px 0 0;color:#526b7a;font-size:16px;line-height:25px">${escapeHtml(supporting)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:25px;border-top:1px solid #edf2f2;font-size:14px;line-height:21px">${rows}</table>${action}</td></tr><tr><td align="center" style="padding:18px 12px 0;font-family:Arial,sans-serif;color:#8aa0aa;font-size:12px">Arklake · Simple, secure payments</td></tr></table></td></tr></table></body></html>`
  return { subject, text, html, ...(qrContent ? { attachments: [{ filename: 'arklake-invoice-qr.png', content: qrContent.toString('base64'), content_type: 'image/png', content_id: 'invoice-public-link-qr' }] } : {}) }
}

export async function processInvoiceEmailOutbox(
  supabase: SupabaseClient,
  accountId: string,
  options: { enabled?: string; apiKey?: string; from?: string; publicUrl?: string; fetch?: typeof fetch } = {},
) {
  if (!invoiceEmailEnabled(options.enabled)) return { enabled: false, sent: 0, failed: 0 }
  if (!options.apiKey || !options.from) throw new Error('Invoice email delivery is not configured')
  const send = options.fetch || fetch
  const { data: jobs, error: claimError } = await supabase.rpc('claim_invoice_email_jobs', { p_account_id: accountId, p_limit: 10 })
  if (claimError) throw claimError
  let sent = 0
  let failed = 0
  for (const job of (jobs || []) as InvoiceEmailJob[]) {
    try {
      const { data: invoice, error: invoiceError } = await supabase.from('invoices')
        .select('id,invoice_number,account_id,payer_email,amount,asset,memo,status,created_at,expires_at,paid_at,payment_tx_hash')
        .eq('id', job.invoice_id).eq('account_id', accountId).maybeSingle<InvoiceEmailRecord>()
      if (invoiceError || !invoice) throw invoiceError || new Error('Invoice was not found')
      if (job.event_type !== 'invoice_created' && (invoice.status !== 'paid' || !invoice.paid_at || !invoice.payment_tx_hash)) {
        throw new Error('Invoice is not verified paid')
      }
      const { data: seller, error: sellerError } = await supabase.from('arklake_accounts').select('email').eq('id', accountId).maybeSingle<{ email: string }>()
      if (sellerError || !seller?.email) throw sellerError || new Error('Seller email was not found')
      const message = await renderInvoiceEmail(job.event_type, invoice, seller.email, job.recipient_email, options.publicUrl || 'https://arklake.site')
      const response = await send('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': invoiceEmailIdempotencyKey(invoice.id, job.event_type) },
        body: JSON.stringify({ from: options.from, to: [job.recipient_email], ...message }),
      })
      const payload = await response.json().catch(() => null) as { id?: string; message?: string } | null
      if (!response.ok || !payload?.id) throw new Error(payload?.message || `Resend returned HTTP ${response.status}`)
      await supabase.from('invoice_email_outbox').update({ status: 'sent', provider_message_id: payload.id, sent_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString() }).eq('id', job.id).eq('account_id', accountId).eq('status', 'sending')
      sent += 1
    } catch (error) {
      await supabase.from('invoice_email_outbox').update({ status: 'failed', next_attempt_at: retryAt(job.attempts), last_error: error instanceof Error ? error.message.slice(0, 500) : 'Email delivery failed', updated_at: new Date().toISOString() }).eq('id', job.id).eq('account_id', accountId).eq('status', 'sending')
      failed += 1
    }
  }
  return { enabled: true, sent, failed }
}
