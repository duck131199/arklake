import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { invoiceExpiresAt, validateInvoiceCreate } from '../server/invoice-core.js'
import { processInvoiceEmailOutbox } from '../server/invoice-email.js'

type VercelRequest = { method?: string; headers: { cookie?: string }; body?: unknown; query?: { id?: string | string[] } }
type VercelResponse = { status: (code: number) => VercelResponse; json: (body: object) => unknown; setHeader: (name: string, value: string) => void }
type Session = { account_id: string; expires_at: string; revoked_at: string | null }

const cookieName = 'arklake_session'
const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} is not configured`); return value }
const supabaseClient = () => createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })

function sessionId(cookieHeader?: string) {
  const value = (cookieHeader || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1)
  if (!value) return null
  const [body, signature] = value.split('.')
  if (!body || !signature) return null
  const expected = Buffer.from(crypto.createHmac('sha256', required('ARKLAKE_SESSION_SECRET')).update(body).digest('base64url'))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null
  try { return (JSON.parse(Buffer.from(body, 'base64url').toString()) as { sid?: string }).sid || null } catch { return null }
}

async function accountIdForRequest(req: VercelRequest, supabase: ReturnType<typeof supabaseClient>) {
  const sid = sessionId(req.headers.cookie)
  if (!sid) return null
  const { data } = await supabase.from('arklake_sessions').select('account_id,expires_at,revoked_at').eq('sid', sid).maybeSingle<Session>()
  if (!data || data.revoked_at || new Date(data.expires_at).getTime() <= Date.now()) return null
  return data.account_id
}

async function expireInvoices(supabase: ReturnType<typeof supabaseClient>, accountId: string) {
  const now = new Date().toISOString()
  const { error } = await supabase.from('invoices').update({ status: 'expired', updated_at: now })
    .eq('account_id', accountId).eq('status', 'active').lte('expires_at', now)
  if (error) throw error
}

const invoiceFields = 'id,invoice_number,payer_email,amount,asset,memo,status,receiving_circle_wallet_id,receiving_wallet_address,expires_at,paid_at,payment_activity_id,created_at,updated_at'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const supabase = supabaseClient()
    const accountId = await accountIdForRequest(req, supabase)
    if (!accountId) return res.status(401).json({ error: 'Authentication required.' })

    if (req.method === 'GET') {
      await expireInvoices(supabase, accountId)
      const rawId = req.query?.id
      const id = Array.isArray(rawId) ? rawId[0] : rawId
      let query = supabase.from('invoices').select(invoiceFields).eq('account_id', accountId)
      if (id) {
        const { data, error } = await query.eq('id', id).maybeSingle()
        if (error) throw error
        if (!data) return res.status(404).json({ error: 'Invoice not found.' })
        return res.status(200).json({ invoice: data })
      }
      const { data, error } = await query.order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      return res.status(200).json({ invoices: data || [] })
    }

    if (req.method === 'POST') {
      const parsed = validateInvoiceCreate(req.body)
      if ('error' in parsed) return res.status(400).json({ error: parsed.error })
      const { data: wallet, error: walletError } = await supabase.from('arklake_wallets')
        .select('circle_wallet_id,address').eq('account_id', accountId).eq('blockchain', 'ARC-TESTNET').eq('account_type', 'SCA').maybeSingle<{ circle_wallet_id: string; address: string }>()
      if (walletError) throw walletError
      if (!wallet?.circle_wallet_id || !wallet.address) return res.status(409).json({ error: 'Receiving wallet is not ready.' })
      const input = parsed.data
      const { data, error } = await supabase.from('invoices').insert({
        account_id: accountId,
        receiving_circle_wallet_id: wallet.circle_wallet_id,
        receiving_wallet_address: wallet.address,
        payer_email: input.payerEmail,
        amount: input.amount,
        asset: 'USDC',
        memo: input.memo,
        expires_at: invoiceExpiresAt(input.expiry),
      }).select(invoiceFields).single()
      if (error) throw error
      await processInvoiceEmailOutbox(supabase, accountId, {
        enabled: process.env.ARKLAKE_INVOICE_EMAIL_ENABLED,
        apiKey: process.env.RESEND_API_KEY,
        from: process.env.RESEND_FROM_EMAIL,
        publicUrl: process.env.ARKLAKE_PUBLIC_URL,
      }).catch((deliveryError) => console.error('ARKLAKE_INVOICE_EMAIL_DELIVERY_FAILED', deliveryError instanceof Error ? deliveryError.message : 'Unknown error'))
      return res.status(201).json({ invoice: data })
    }

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed.' })
  } catch (error) {
    console.error('Invoice API failed', error)
    return res.status(500).json({ error: 'Invoice service is unavailable.' })
  }
}
