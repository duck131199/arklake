import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { invoiceEmailEnabled, invoiceEmailIdempotencyKey, processInvoiceEmailOutbox, renderInvoiceEmail } from '../server/invoice-email.ts'
import { shouldSuppressGenericActivityEmail } from '../server/circle/activity-email-suppression.ts'

const migration = readFileSync(new URL('../supabase/migrations/202609090002_invoice_email_outbox.sql', import.meta.url), 'utf8')
const paidSellerMigration = readFileSync(new URL('../supabase/migrations/202609100001_invoice_paid_email_seller.sql', import.meta.url), 'utf8')
const payerConfirmationMigration = readFileSync(new URL('../supabase/migrations/202609100002_invoice_payment_confirmed_email.sql', import.meta.url), 'utf8')
const createApi = readFileSync(new URL('../api/invoices.ts', import.meta.url), 'utf8')
const verifyApi = readFileSync(new URL('../api/invoice-payment-verify.ts', import.meta.url), 'utf8')
const activitySync = readFileSync(new URL('../api/circle/activity-sync.ts', import.meta.url), 'utf8')

const invoice = {
  id: '11111111-1111-4111-8111-111111111111', invoice_number: 'ARK-20260909-EMAIL', account_id: '22222222-2222-4222-8222-222222222222',
  payer_email: 'payer@example.com', amount: '12.5', asset: 'USDC', memo: 'Design services', status: 'active', expires_at: '2026-09-16T01:00:00Z', paid_at: null, payment_tx_hash: null,
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
  const paidUpdate = paidSellerMigration.indexOf("set status = 'paid'")
  const paidEnqueue = paidSellerMigration.indexOf("'invoice_paid', seller_email")
  assert.ok(paidUpdate >= 0 && paidEnqueue > paidUpdate)
  assert.match(paidSellerMigration, /select email into seller_email[\s\S]*from public\.arklake_accounts[\s\S]*where id = target\.account_id/)
  assert.match(paidSellerMigration, /if position\('@' in coalesce\(seller_email, ''\)\) > 1 then[\s\S]*insert into public\.invoice_email_outbox/)
  assert.doesNotMatch(paidSellerMigration, /'invoice_paid', target\.payer_email/)
  assert.match(verifyApi, /mark_verified_invoice_paid/)
  assert.doesNotMatch(createApi, /invoice_paid/)
})

test('missing seller email skips notification without rolling back the Paid transition', () => {
  const paidUpdate = paidSellerMigration.indexOf("set status = 'paid'")
  const sellerLookup = paidSellerMigration.indexOf('select email into seller_email')
  const conditionalEnqueue = paidSellerMigration.indexOf("if position('@' in coalesce(seller_email, '')) > 1 then")
  const paidResult = paidSellerMigration.indexOf("jsonb_build_object('result', 'paid'")
  assert.ok(paidUpdate >= 0 && sellerLookup > paidUpdate && conditionalEnqueue > sellerLookup && paidResult > conditionalEnqueue)
})

test('verified Paid transition independently enqueues one seller and one payer notification', () => {
  const paidUpdate = payerConfirmationMigration.indexOf("set status = 'paid'")
  const sellerEnqueue = payerConfirmationMigration.indexOf("'invoice_paid', seller_email")
  const payerEnqueue = payerConfirmationMigration.indexOf("'invoice_payment_confirmed', target.payer_email")
  assert.ok(paidUpdate >= 0 && sellerEnqueue > paidUpdate && payerEnqueue > sellerEnqueue)
  assert.match(payerConfirmationMigration, /check \(event_type in \('invoice_created', 'invoice_paid', 'invoice_payment_confirmed'\)\)/)
  assert.match(payerConfirmationMigration, /on conflict \(invoice_id, event_type\) do nothing/g)
  assert.match(payerConfirmationMigration, /if position\('@' in coalesce\(seller_email, ''\)\) > 1 then/)
  assert.match(payerConfirmationMigration, /if position\('@' in coalesce\(target\.payer_email, ''\)\) > 1 then/)
  assert.ok(payerConfirmationMigration.indexOf("if target.status = 'paid' then") < sellerEnqueue)
})

test('the one historical failed Paid job remains recorded but cannot be retried', () => {
  assert.match(paidSellerMigration, /invoice\.invoice_number = 'ARK-20260908-EB1FC4A3'/)
  assert.match(paidSellerMigration, /outbox\.event_type = 'invoice_paid'/)
  assert.match(paidSellerMigration, /outbox\.status = 'failed'/)
  assert.match(paidSellerMigration, /next_attempt_at = 'infinity'::timestamptz/)
  assert.doesNotMatch(paidSellerMigration, /delete from public\.invoice_email_outbox/)
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

test('Paid email confirms verified payment to the seller without receipt language', async () => {
  const paidInvoice = { ...invoice, status: 'paid', paid_at: '2026-09-10T02:55:28Z', payment_tx_hash: `0x${'a'.repeat(64)}` }
  const message = await renderInvoiceEmail('invoice_paid', paidInvoice, 'seller@example.com', 'seller@example.com', 'https://arklake.site')
  assert.equal(message.subject, 'Payment received for ARK-20260909-EMAIL')
  assert.match(message.text, /^Invoice paid/m)
  assert.match(message.text, /Payment has been verified on-chain\./)
  assert.match(message.text, /Invoice number: ARK-20260909-EMAIL/)
  assert.match(message.text, /Paid by: payer@example\.com/)
  assert.match(message.text, /Amount: 12\.5 USDC/)
  assert.match(message.text, /Paid at: Sep 10, 2026 · 2:55 AM UTC/)
  assert.match(message.text, /Payment details: USDC · Arc Testnet/)
  assert.match(message.text, /Transaction: 0xaaaaaaaa\.\.\.aaaaaaaaa/)
  assert.match(message.text, /View on Arcscan: https:\/\/testnet\.arcscan\.app\/tx\//)
  assert.match(message.text, /View paid invoice: https:\/\/arklake\.site\/invoice\//)
  assert.match(message.html, /View paid invoice/)
  assert.match(message.html, /View on Arcscan/)
  assert.ok(message.html.indexOf('View paid invoice') < message.html.indexOf('Transaction'))
  assert.match(message.html, />0xaaaaaaaa\.\.\.aaaaaaaaa</)
  assert.match(message.html, /href="https:\/\/testnet\.arcscan\.app\/tx\/0x[a-f0-9]{64}"/)
  assert.doesNotMatch(`${message.subject}\n${message.text}\n${message.html}`, /receipt/i)
  assert.equal(message.attachments, undefined)
  assert.equal(invoiceEmailIdempotencyKey(invoice.id, 'invoice_paid'), `invoice-email-${invoice.id}-invoice_paid`)
})

test('payer confirmation renders the verified invoice payment with stable idempotency', async () => {
  const paidInvoice = { ...invoice, status: 'paid', paid_at: '2026-09-10T02:55:28Z', payment_tx_hash: `0x${'b'.repeat(64)}` }
  const message = await renderInvoiceEmail('invoice_payment_confirmed', paidInvoice, 'seller@example.com', 'payer@example.com', 'https://arklake.site')
  assert.equal(message.subject, 'Payment confirmed for ARK-20260909-EMAIL')
  assert.match(message.text, /^Invoice payment confirmed/m)
  assert.match(message.text, /Your payment has been verified on-chain\./)
  assert.match(message.text, /Invoice number: ARK-20260909-EMAIL/)
  assert.match(message.text, /Paid to: seller@example\.com/)
  assert.match(message.text, /Amount: 12\.5 USDC/)
  assert.match(message.text, /Paid at: Sep 10, 2026 · 2:55 AM UTC/)
  assert.match(message.text, /Payment details: USDC · Arc Testnet/)
  assert.match(message.text, /Transaction: 0xbbbbbbbb\.\.\.bbbbbbbbb/)
  assert.match(message.html, /View paid invoice/)
  assert.match(message.html, /View on Arcscan/)
  assert.doesNotMatch(`${message.subject}\n${message.text}\n${message.html}`, /receipt/i)
  assert.equal(invoiceEmailIdempotencyKey(invoice.id, 'invoice_payment_confirmed'), `invoice-email-${invoice.id}-invoice_payment_confirmed`)
})

test('generic Send and Receive are suppressed only by an exact invoice intent transaction hash', () => {
  const invoiceHashes = new Set(['0xabcdef'])
  assert.equal(shouldSuppressGenericActivityEmail('send', '0xABCDEF', invoiceHashes), true)
  assert.equal(shouldSuppressGenericActivityEmail('receive', '0xabcdef', invoiceHashes), true)
  assert.equal(shouldSuppressGenericActivityEmail('send', '0xabcdee', invoiceHashes), false)
  assert.equal(shouldSuppressGenericActivityEmail('receive', null, invoiceHashes), false)
  assert.equal(shouldSuppressGenericActivityEmail('swap', '0xabcdef', invoiceHashes), false)
})

test('activity email suppression guards both enqueue and delivery races', () => {
  assert.match(activitySync, /invoicePaymentHashes[\s\S]*shouldSuppressGenericActivityEmail\(activity\.activityType, activity\.txHash, invoicePaymentHashes\)[\s\S]*status: suppressed \? 'suppressed' : 'pending'/)
  assert.match(activitySync, /eq\('tx_hash', activity\.tx_hash\.toLowerCase\(\)\)[\s\S]*status: 'suppressed'/)
  assert.match(activitySync, /Invoice payment notification is sent by the invoice email flow/)
})
