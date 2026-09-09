import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { createInvoicePdf, type InvoicePdfData } from './invoice-pdf-core.js'
import { maskInvoiceEmail } from './invoice-core.js'

type VercelRequest = { method?: string; headers: { cookie?: string }; query?: { id?: string | string[]; scope?: string | string[]; timeZone?: string | string[] } }
type VercelResponse = { status: (code: number) => VercelResponse; json: (body: object) => unknown; setHeader: (name: string, value: string | number) => void; end: (body: Uint8Array) => unknown }
type Session = { account_id: string; expires_at: string; revoked_at: string | null }
type InvoiceRow = { id: string; invoice_number: string; account_id: string; payer_email: string; amount: string | number; asset: string; memo: string; status: 'active' | 'paid' | 'expired'; expires_at: string; created_at: string }

const cookieName = 'arklake_session'
const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} is not configured`); return value }
const supabaseClient = () => createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
const fields = 'id,invoice_number,account_id,payer_email,amount,asset,memo,status,expires_at,created_at'

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' })
  const rawId = req.query?.id
  const id = Array.isArray(rawId) ? rawId[0] : rawId
  const rawScope = req.query?.scope
  const scope = Array.isArray(rawScope) ? rawScope[0] : rawScope
  const rawTimeZone = req.query?.timeZone
  const requestedTimeZone = Array.isArray(rawTimeZone) ? rawTimeZone[0] : rawTimeZone
  let timeZone = 'Asia/Bangkok'
  if (requestedTimeZone) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: requestedTimeZone }); timeZone = requestedTimeZone } catch { /* use product default */ }
  }
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return res.status(404).json({ error: 'Invoice not found.' })

  try {
    const supabase = supabaseClient()
    let accountId: string | null = null
    if (scope === 'seller') {
      const sid = sessionId(req.headers.cookie)
      if (!sid) return res.status(401).json({ error: 'Authentication required.' })
      const { data: session } = await supabase.from('arklake_sessions').select('account_id,expires_at,revoked_at').eq('sid', sid).maybeSingle<Session>()
      if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) return res.status(401).json({ error: 'Authentication required.' })
      accountId = session.account_id
    }

    const now = new Date().toISOString()
    let expiry = supabase.from('invoices').update({ status: 'expired', updated_at: now }).eq('id', id).eq('status', 'active').lte('expires_at', now)
    if (accountId) expiry = expiry.eq('account_id', accountId)
    const { error: expiryError } = await expiry
    if (expiryError) throw expiryError

    let query = supabase.from('invoices').select(fields).eq('id', id)
    if (accountId) query = query.eq('account_id', accountId)
    const { data: invoice, error } = await query.maybeSingle<InvoiceRow>()
    if (error) throw error
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' })
    const { data: seller } = await supabase.from('arklake_accounts').select('email').eq('id', invoice.account_id).maybeSingle<{ email: string }>()
    const pdfData: InvoicePdfData = {
      invoiceNumber: invoice.invoice_number,
      seller: scope === 'seller' ? seller?.email || 'Arklake seller' : seller?.email ? maskInvoiceEmail(seller.email) : 'Arklake seller',
      payer: scope === 'seller' ? invoice.payer_email : maskInvoiceEmail(invoice.payer_email),
      amount: String(invoice.amount), asset: invoice.asset, memo: invoice.memo, status: invoice.status,
      createdAt: invoice.created_at, expiresAt: invoice.expires_at, timeZone,
    }
    const pdf = await createInvoicePdf(pdfData)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number}.pdf"`)
    res.setHeader('Content-Length', pdf.length)
    return res.status(200).end(pdf)
  } catch (error) {
    console.error('Invoice PDF failed', error)
    return res.status(500).json({ error: 'Invoice PDF is temporarily unavailable.' })
  }
}
