import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { normalizePaymentTxHash, verifyInvoicePaymentReceipt, type InvoicePaymentReceipt } from '../server/invoice-payment-verify-core.js'
import { processInvoiceEmailOutbox } from '../server/invoice-email.js'

type VercelRequest = { method?: string; body?: unknown }
type VercelResponse = { status: (code: number) => VercelResponse; json: (body: object) => unknown; setHeader: (name: string, value: string) => void }
type InvoiceRow = {
  id: string; account_id: string; receiving_circle_wallet_id: string; receiving_wallet_address: string
  amount: string | number; asset: string; status: 'active' | 'paid' | 'expired'; created_at: string; expires_at: string; payment_tx_hash: string | null
}

const rpcUrl = 'https://rpc.testnet.arc.network'
const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} is not configured`); return value }
const supabaseClient = () => createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })

async function rpc(method: string, params: unknown[] = []) {
  const response = await fetch(rpcUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(15000),
  })
  const payload = await response.json().catch(() => null) as { result?: unknown; error?: unknown } | null
  if (!response.ok || !payload || payload.error) throw new Error('Arc RPC request failed')
  return payload.result
}

const verificationMessage: Record<string, string> = {
  'wrong-chain': 'This transaction is not on Arc Testnet.',
  'missing-receipt': 'Transaction not found or not confirmed yet.',
  'failed-receipt': 'This transaction failed on-chain.',
  'pending-receipt': 'Transaction confirmation is still pending.',
  'insufficient-confirmations': 'Transaction confirmation is still pending.',
  'wrong-asset': 'This invoice cannot be verified as an Arc Testnet USDC payment.',
  'invalid-invoice': 'This invoice payment target is invalid.',
  'wrong-token': 'No canonical USDC transfer was found in this transaction.',
  'wrong-recipient': 'The USDC transfer was sent to another recipient.',
  'wrong-amount': 'The USDC transfer amount does not match this invoice.',
  'outside-invoice-window': 'This transaction was not made while the invoice was active.',
}
const retryableVerification = new Set(['missing-receipt', 'pending-receipt', 'insufficient-confirmations'])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed.' })
  }
  const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {}
  const invoiceId = typeof body.invoiceId === 'string' ? body.invoiceId : ''
  const txHash = normalizePaymentTxHash(body.txHash)
  const intentId = typeof body.intentId === 'string' ? body.intentId : ''
  const intentToken = typeof body.intentToken === 'string' ? body.intentToken : ''
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(invoiceId) || !txHash) {
    return res.status(400).json({ error: 'Enter a valid transaction hash.' })
  }

  try {
    const supabase = supabaseClient()
    if (!/^[0-9a-f-]{36}$/i.test(intentId) || intentToken.length < 32) return res.status(400).json({ error: 'Payment intent credentials are required.' })
    const publicTokenHash = createHash('sha256').update(intentToken).digest('hex')
    const { data: intent, error: intentError } = await supabase.from('invoice_payment_intents')
      .select('id,status').eq('id', intentId).eq('invoice_id', invoiceId).eq('public_token_hash', publicTokenHash).eq('tx_hash', txHash)
      .maybeSingle<{ id: string; status: string }>()
    if (intentError) throw intentError
    if (!intent) return res.status(409).json({ error: 'This transaction is not bound to this payment intent.' })
    const { data: invoice, error } = await supabase.from('invoices')
      .select('id,account_id,receiving_circle_wallet_id,receiving_wallet_address,amount,asset,status,created_at,expires_at,payment_tx_hash')
      .eq('id', invoiceId).maybeSingle<InvoiceRow>()
    if (error) throw error
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' })
    if (invoice.status === 'paid') {
      if (invoice.payment_tx_hash?.toLowerCase() !== txHash) return res.status(409).json({ error: 'This invoice has already been paid with another transaction.' })
      await supabase.from('invoice_payment_intents').update({ status: 'paid', updated_at: new Date().toISOString() }).eq('id', intentId)
      return res.status(200).json({ paid: true, txHash, idempotent: true })
    }
    const mayFinishSubmittedPayment = intent.status === 'submitted' || intent.status === 'confirming'
    if ((invoice.status === 'expired' || new Date(invoice.expires_at).getTime() <= Date.now()) && !mayFinishSubmittedPayment) {
      return res.status(409).json({ error: 'This invoice has expired.' })
    }

    const [chainId, receiptValue, latestBlock] = await Promise.all([
      rpc('eth_chainId'), rpc('eth_getTransactionReceipt', [txHash]), rpc('eth_blockNumber'),
    ])
    const receipt = receiptValue as InvoicePaymentReceipt | null
    const block = receipt?.blockNumber ? await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]) as { timestamp?: string } | null : null
    const verified = verifyInvoicePaymentReceipt({
      chainId: String(chainId || ''), latestBlock: String(latestBlock || ''), blockTimestamp: String(block?.timestamp || ''), receipt,
      invoice: { amount: String(invoice.amount), asset: invoice.asset, recipientAddress: invoice.receiving_wallet_address, createdAt: invoice.created_at, expiresAt: invoice.expires_at },
    })
    if (!verified.ok) {
      await supabase.from('invoice_payment_intents').update({ status: retryableVerification.has(verified.reason) ? 'confirming' : 'failed', updated_at: new Date().toISOString() }).eq('id', intentId)
      return res.status(422).json({ error: verificationMessage[verified.reason], retryable: retryableVerification.has(verified.reason) })
    }

    const { data: result, error: transitionError } = await supabase.rpc('mark_verified_invoice_paid', {
      p_invoice_id: invoice.id,
      p_tx_hash: txHash,
      p_recipient_address: invoice.receiving_wallet_address.toLowerCase(),
      p_amount: String(invoice.amount),
      p_asset: invoice.asset,
      p_paid_at: verified.paidAt,
    })
    if (transitionError) throw transitionError
    const transition = result as { result?: string; paid_at?: string; payment_activity_id?: string | null } | null
    if (transition?.result === 'paid' || transition?.result === 'idempotent') {
      await supabase.from('invoice_payment_intents').update({ status: 'paid', updated_at: new Date().toISOString() }).eq('id', intentId)
      await processInvoiceEmailOutbox(supabase, invoice.account_id, {
        enabled: process.env.ARKLAKE_INVOICE_EMAIL_ENABLED,
        apiKey: process.env.RESEND_API_KEY,
        from: process.env.RESEND_FROM_EMAIL,
        publicUrl: process.env.ARKLAKE_PUBLIC_URL,
      }).catch((deliveryError) => console.error('ARKLAKE_INVOICE_EMAIL_DELIVERY_FAILED', deliveryError instanceof Error ? deliveryError.message : 'Unknown error'))
      return res.status(200).json({
      paid: true, txHash, paidAt: transition.paid_at, paymentActivityId: transition.payment_activity_id || null,
      idempotent: transition.result === 'idempotent', confirmations: verified.confirmations,
      })
    }
    if (transition?.result === 'not_found') return res.status(404).json({ error: 'Invoice not found.' })
    if (transition?.result === 'expired') return res.status(409).json({ error: 'This invoice has expired.' })
    if (transition?.result === 'already_paid') return res.status(409).json({ error: 'This invoice has already been paid with another transaction.' })
    if (transition?.result === 'tx_reused') return res.status(409).json({ error: 'This transaction has already been used for another invoice.' })
    return res.status(409).json({ error: 'Invoice payment target changed before verification completed.' })
  } catch (error) {
    console.error('INVOICE_PAYMENT_VERIFICATION_FAILED', error instanceof Error ? error.message : 'Unknown error')
    return res.status(502).json({ error: 'Payment verification is temporarily unavailable.' })
  }
}
