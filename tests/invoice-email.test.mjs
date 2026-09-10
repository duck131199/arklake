import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { invoiceEmailEnabled, invoiceEmailIdempotencyKey, processInvoiceEmailOutbox, renderInvoiceEmail } from '../server/invoice-email.ts'

const migration = readFileSync(new URL('../supabase/migrations/202609090002_invoice_email_outbox.sql', import.meta.url), 'utf8')
const createApi = readFileSync(new URL('../api/invoices.ts', import.meta.url), 'utf8')
const verifyApi = readFileSync(new URL('../api/invoice-payment-verify.ts', import.meta.url), 'utf8')
const activitySync = readFileSync(new URL('../api/circle/activity-sync.ts', import.meta.url), 'utf8')

const invoice = {
  id: '11111111-1111-4111-8111-111111111111', invoice_number: 'ARK-20260909-EMAIL', account_id: '22222222-2222-4222-8222-222222222222',
  amount: '12.5', asset: 'USDC', memo: 'Design services', status: 'active', expires_at: '2026-09-16T01:00:00Z', paid_at: null, payment_tx_hash: null,
  created_at: '2026-09-09T01:00:00Z',
}

function fakeSupabase({ failProvider = false } = {}) {
  let claimed = false
  const updates = []
  const job = { id: '33333333-3333-4333-8333-333333333333', account_id: invoice.account_id, invoice_id: invoice.id, event_type: 'invoice_created', recipient_email: 'payer@example.com', attempts: 1 }
  const builder = (table, patch) => {
    const chain = {
      select() { return chain }, eq() { return chain }, update() { return chain },
      async maybeSingle() { return table === 'invoices' ? { data: invoice, error: null } : { data: { email: 'seller@example.com' }, error: null } },
      then(resolve) { if (table === 'invoice_email_outbox' && patch) updates.push(patch); return Promise.resolve(resolve({ data: null, error: null })) },
    }
    return chain
  }
  return {
    client: {
      async rpc() { if (claimed) return { data: [], error: null }; claimed = true; return { data: [job], error: null } },
      from(table) { return { select: () => builder(table), update: (patch) => builder(table, patch) } },
    },
    updates,
    fetch: async () => failProvider
      ? new Response(JSON.stringify({ message: 'provider unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } })
      : new Response(JSON.stringify({ id: 'resend-message-1' }), { status: 200, headers: { 'content-type': 'application/json' } }),
  }
}

test('invoice_created is enqueued from immutable payer_email and schema prevents duplicates', () => {
  assert.match(migration, /after insert on public\.invoices/)
  assert.match(migration, /'invoice_created', new\.payer_email/)
  assert.match(migration, /unique \(invoice_id, event_type\)/)
  assert.match(migration, /on conflict \(invoice_id, event_type\) do nothing/)
})

test('invoice_paid is enqueued only inside the verified atomic Paid transition', () => {
  const paidUpdate = migration.indexOf("set status = 'paid'")
  const paidEnqueue = migration.indexOf("'invoice_paid', target.payer_email")
  assert.ok(paidUpdate >= 0 && paidEnqueue > paidUpdate)
  assert.match(verifyApi, /mark_verified_invoice_paid/)
  assert.doesNotMatch(createApi, /invoice_paid/)
})

test('claim is concurrent-safe and sent jobs are outside its candidates', async () => {
  const claimFunction = migration.slice(migration.indexOf('create or replace function public.claim_invoice_email_jobs'), migration.indexOf('revoke all on function public.claim_invoice_email_jobs'))
  assert.match(migration, /for update skip locked/)
  assert.match(claimFunction, /status in \('pending', 'failed'\)/)
  assert.doesNotMatch(claimFunction, /'sent'/)
  const fake = fakeSupabase()
  let providerCalls = 0
  const send = async (...args) => { providerCalls += 1; return fake.fetch(...args) }
  const options = { enabled: 'true', apiKey: 'test-key', from: 'Arklake <test@arklake.site>', fetch: send }
  await Promise.all([
    processInvoiceEmailOutbox(fake.client, invoice.account_id, options),
    processInvoiceEmailOutbox(fake.client, invoice.account_id, options),
  ])
  assert.equal(providerCalls, 1)
  assert.equal(fake.updates.some((patch) => patch.status === 'sent'), true)
})

test('feature flag defaults off and never calls the provider', async () => {
  assert.equal(invoiceEmailEnabled(undefined), false)
  assert.equal(invoiceEmailEnabled('false'), false)
  assert.equal(invoiceEmailEnabled('true'), true)
  let touched = false
  const result = await processInvoiceEmailOutbox({ rpc() { touched = true } }, invoice.account_id, { fetch: async () => { touched = true; throw new Error('must not send') } })
  assert.deepEqual(result, { enabled: false, sent: 0, failed: 0 })
  assert.equal(touched, false)
})

test('provider failure remains retryable and handlers isolate it from invoice state', async () => {
  const fake = fakeSupabase({ failProvider: true })
  const result = await processInvoiceEmailOutbox(fake.client, invoice.account_id, { enabled: 'true', apiKey: 'test-key', from: 'test@arklake.site', fetch: fake.fetch })
  assert.deepEqual(result, { enabled: true, sent: 0, failed: 1 })
  assert.equal(fake.updates.some((patch) => patch.status === 'failed' && patch.next_attempt_at), true)
  assert.match(createApi, /processInvoiceEmailOutbox[\s\S]*\.catch/)
  assert.match(verifyApi, /processInvoiceEmailOutbox[\s\S]*\.catch/)
  assert.match(activitySync, /processInvoiceEmailOutbox/)
})

test('new invoice template is complete and its QR contains only the public invoice URL', async () => {
  const message = await renderInvoiceEmail('invoice_created', invoice, 'seller@example.com', 'payer@example.com', 'https://arklake.site')
  assert.equal(message.subject, 'You received an invoice')
  assert.match(message.text, /From: seller@example\.com/)
  assert.match(message.text, /Bill to: payer@example\.com/)
  assert.match(message.text, /Invoice number: ARK-20260909-EMAIL/)
  assert.match(message.text, /Description: Design services/)
  assert.match(message.text, /Amount due: 12\.5 USDC/)
  assert.match(message.text, /Payment details: USDC · Arc Testnet/)
  assert.match(message.text, /Created at:/)
  assert.match(message.text, /Expires:/)
  assert.match(message.text, /https:\/\/arklake\.site\/invoice\/11111111/)
  assert.match(message.html, /View &amp; pay invoice/)
  assert.match(message.html, /cid:invoice-public-link-qr/)
  assert.match(message.html, /width="108" height="108"/)
  assert.match(message.html, /Open invoice in browser/)
  assert.doesNotMatch(message.html, />https:\/\/arklake\.site\/invoice\//)
  assert.match(message.html, /Review the invoice details on Arklake before completing your payment\./)
  assert.match(message.text, /Sep 9, 2026 · 1:00 AM UTC/)
  assert.equal(message.attachments?.length, 1)
  assert.equal(message.attachments?.[0].content_id, 'invoice-public-link-qr')
  assert.equal(message.attachments?.[0].content_type, 'image/png')
  assert.equal('contentId' in message.attachments?.[0], false)
  assert.ok(message.attachments?.[0].content.length > 100)
  assert.doesNotMatch(message.text, /ethereum:|transfer\?|uint256=/)
  assert.equal(invoiceEmailIdempotencyKey(invoice.id, 'invoice_created'), `invoice-email-${invoice.id}-invoice_created`)
})
