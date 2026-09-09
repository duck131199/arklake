import { createClient } from '@supabase/supabase-js'

type VercelRequest = { method?: string; query?: { id?: string | string[] } }
type VercelResponse = { status: (code: number) => VercelResponse; json: (body: object) => unknown; setHeader: (name: string, value: string) => void }

const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} is not configured`); return value }
const supabaseClient = () => createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed.' })
  }

  try {
    const supabase = supabaseClient()
    const rawId = req.query?.id
    const id = Array.isArray(rawId) ? rawId[0] : rawId
    if (!id) return res.status(404).json({ error: 'Invoice not found.' })
    const now = new Date().toISOString()
    const { error: expiryError } = await supabase.from('invoices').update({ status: 'expired', updated_at: now })
      .eq('id', id).eq('status', 'active').lte('expires_at', now)
    if (expiryError) throw expiryError

    const { data: invoice, error } = await supabase.from('invoices')
      .select('id,invoice_number,amount,asset,status,receiving_wallet_address').eq('id', id).maybeSingle<{
        id: string; invoice_number: string; amount: string | number; asset: string; status: 'active' | 'paid' | 'expired'; receiving_wallet_address: string
      }>()
    if (error) throw error
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' })
    if (invoice.status !== 'active') return res.status(409).json({ error: invoice.status === 'expired' ? 'This invoice has expired.' : 'This invoice has already been paid.' })

    return res.status(200).json({ target: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      amount: String(invoice.amount),
      asset: invoice.asset,
      recipientAddress: invoice.receiving_wallet_address,
    } })
  } catch (error) {
    console.error('Invoice payment target API failed', error)
    return res.status(500).json({ error: 'Payment details are temporarily unavailable.' })
  }
}
