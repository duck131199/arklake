import { createClient } from '@supabase/supabase-js'
import { maskInvoiceEmail } from './invoice-core.js'

type VercelRequest = { method?: string; query?: { id?: string | string[] } }
type VercelResponse = { status: (code: number) => VercelResponse; json: (body: object) => unknown; setHeader: (name: string, value: string) => void }

const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} is not configured`); return value }
const supabaseClient = () => createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
const publicFields = 'id,invoice_number,account_id,payer_email,amount,asset,memo,status,expires_at,created_at'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed.' })
  }

  const rawId = req.query?.id
  const id = Array.isArray(rawId) ? rawId[0] : rawId
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(404).json({ error: 'Invoice not found.' })
  }

  try {
    const supabase = supabaseClient()
    const now = new Date().toISOString()
    const { error: expiryError } = await supabase.from('invoices').update({ status: 'expired', updated_at: now })
      .eq('id', id).eq('status', 'active').lte('expires_at', now)
    if (expiryError) throw expiryError

    const { data: invoice, error } = await supabase.from('invoices').select(publicFields).eq('id', id).maybeSingle<{
      id: string; invoice_number: string; account_id: string; payer_email: string; amount: string | number; asset: string; memo: string;
      status: 'active' | 'paid' | 'expired'; expires_at: string; created_at: string
    }>()
    if (error) throw error
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' })

    const { data: seller } = await supabase.from('arklake_accounts').select('email').eq('id', invoice.account_id).maybeSingle<{ email: string }>()
    return res.status(200).json({
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        seller: seller?.email ? maskInvoiceEmail(seller.email) : 'Arklake seller',
        payer: maskInvoiceEmail(invoice.payer_email),
        amount: String(invoice.amount),
        asset: invoice.asset,
        memo: invoice.memo,
        status: invoice.status,
        createdAt: invoice.created_at,
        expiresAt: invoice.expires_at,
      },
    })
  } catch (error) {
    console.error('Public invoice API failed', error)
    return res.status(500).json({ error: 'Invoice is temporarily unavailable.' })
  }
}
