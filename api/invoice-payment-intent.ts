import { createHash, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { invoicePaymentChainId, normalizePaymentTxHash } from '../server/invoice-payment-verify-core.js'

type VercelRequest = { method?: string; body?: unknown; query?: Record<string, string | string[] | undefined> }
type VercelResponse = { status: (code: number) => VercelResponse; json: (body: object) => unknown; setHeader: (name: string, value: string) => void }
type Invoice = { id: string; invoice_number: string; memo: string | null; receiving_wallet_address: string; amount: string | number; asset: string; status: string; expires_at: string }

const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} is not configured`); return value }
const supabaseClient = () => createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {}
  try {
    const supabase = supabaseClient()
    if (req.method === 'POST' && body.action === 'create') {
      const invoiceId = typeof body.invoiceId === 'string' ? body.invoiceId : ''
      const requestedRail = body.paymentRail === 'arklake' ? 'arklake' : body.paymentRail === 'wallet' ? 'wallet' : 'generic'
      const paymentRail = requestedRail === 'arklake' ? 'arklake' : 'generic'
      if (!uuid.test(invoiceId)) return res.status(400).json({ error: 'Invalid invoice.' })
      const now = new Date().toISOString()
      await supabase.from('invoices').update({ status: 'expired', updated_at: now }).eq('id', invoiceId).eq('status', 'active').lte('expires_at', now)
      const { data: invoice, error } = await supabase.from('invoices')
        .select('id,invoice_number,memo,receiving_wallet_address,amount,asset,status,expires_at').eq('id', invoiceId).maybeSingle<Invoice>()
      if (error) throw error
      if (!invoice) return res.status(404).json({ error: 'Invoice not found.' })
      if (invoice.status !== 'active' || new Date(invoice.expires_at).getTime() <= Date.now()) return res.status(409).json({ error: 'This invoice is not payable.' })
      if (invoice.asset !== 'USDC') return res.status(409).json({ error: 'Scan to pay currently supports USDC invoices only.' })
      if (paymentRail === 'arklake') {
        const { data: existing, error: existingError } = await supabase.from('invoice_payment_intents')
          .select('id').eq('invoice_id', invoice.id).eq('payment_rail', 'arklake')
          .in('status', ['submitting', 'submitted', 'confirming']).limit(1)
        if (existingError) throw existingError
        if (existing?.length) return res.status(409).json({ error: 'A payment is already being confirmed for this invoice.', paymentInProgress: true })
      }
      const token = `${requestedRail === 'wallet' ? 'wallet.' : ''}${randomBytes(32).toString('base64url')}`
      const { data: intent, error: insertError } = await supabase.from('invoice_payment_intents').insert({
        invoice_id: invoice.id,
        public_token_hash: tokenHash(token),
        receiving_wallet_address: invoice.receiving_wallet_address.toLowerCase(),
        amount: invoice.amount,
        asset: invoice.asset,
        chain_id: invoicePaymentChainId,
        expires_at: invoice.expires_at,
        payment_rail: paymentRail,
      }).select('id').single<{ id: string }>()
      if (insertError) throw insertError
      return res.status(201).json({ intent: {
        id: intent.id, token, invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, memo: invoice.memo || '',
        recipientAddress: invoice.receiving_wallet_address, amount: String(invoice.amount), asset: invoice.asset,
        chainId: invoicePaymentChainId, expiresAt: invoice.expires_at,
      } })
    }

    if (req.method === 'POST' && body.action === 'bind') {
      const intentId = typeof body.intentId === 'string' ? body.intentId : ''
      const token = typeof body.token === 'string' ? body.token : ''
      const txHash = normalizePaymentTxHash(body.txHash)
      if (!uuid.test(intentId) || token.length < 32 || !txHash) return res.status(400).json({ error: 'Invalid payment intent.' })
      const { data, error } = await supabase.rpc('bind_invoice_payment_intent_tx', {
        p_intent_id: intentId, p_public_token_hash: tokenHash(token), p_tx_hash: txHash,
      })
      if (error) throw error
      const result = data as { result?: string; invoice_id?: string } | null
      if (result?.result === 'bound' || result?.result === 'idempotent') return res.status(200).json({ bound: true, invoiceId: result.invoice_id, txHash })
      if (result?.result === 'not_found') return res.status(404).json({ error: 'Payment intent not found.' })
      if (result?.result === 'expired') return res.status(409).json({ error: 'This payment intent has expired.' })
      if (result?.result === 'tx_reused') return res.status(409).json({ error: 'This transaction is already bound to another payment.' })
      return res.status(409).json({ error: 'This payment intent can no longer accept that transaction.' })
    }

    if (req.method === 'POST' && body.action === 'status') {
      const intentId = typeof body.intentId === 'string' ? body.intentId : ''
      const token = typeof body.token === 'string' ? body.token : ''
      if (!uuid.test(intentId) || token.length < 32) return res.status(400).json({ error: 'Invalid payment intent.' })
      const { data: intent, error } = await supabase.from('invoice_payment_intents')
        .select('invoice_id,status,circle_challenge_id').eq('id', intentId).eq('public_token_hash', tokenHash(token))
        .eq('payment_rail', 'arklake').maybeSingle<{ invoice_id: string; status: string; circle_challenge_id: string | null }>()
      if (error) throw error
      if (!intent) return res.status(404).json({ error: 'Payment intent not found.' })
      return res.status(200).json({ invoiceId: intent.invoice_id, status: intent.status, recoverable: Boolean(intent.circle_challenge_id) })
    }

    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed.' })
  } catch (error) {
    console.error('INVOICE_PAYMENT_INTENT_FAILED', error instanceof Error ? error.message : 'Unknown error')
    return res.status(500).json({ error: 'Payment intent is temporarily unavailable.' })
  }
}
