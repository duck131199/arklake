import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../supabase/migrations/202609090003_pay_with_arklake_attempt_guard.sql', import.meta.url), 'utf8')
const api = readFileSync(new URL('../api/circle/wallet.ts', import.meta.url), 'utf8')
const intentApi = readFileSync(new URL('../api/invoice-payment-intent.ts', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('database permits only one unresolved Pay with Arklake attempt per invoice', () => {
  assert.match(migration, /unique index[\s\S]+invoice_payment_intents_one_unresolved_arklake[\s\S]+\(invoice_id\)[\s\S]+payment_rail = 'arklake'[\s\S]+status in \('submitting', 'submitted', 'confirming'\)/)
  assert.match(migration, /start_arklake_invoice_payment_intent[\s\S]+for update[\s\S]+exception when unique_violation[\s\S]+already_in_progress/)
  assert.match(intentApi, /payment_rail', 'arklake'[\s\S]+\.in\('status', \['submitting', 'submitted', 'confirming'\]\)/)
})

test('attempt and Circle challenge are persisted before SDK execution', () => {
  assert.match(api, /start_arklake_invoice_payment_intent/)
  assert.match(api, /circleIdempotencyKey = start\.idempotency_key[\s\S]+idempotencyKey: circleIdempotencyKey/)
  assert.match(api, /record_arklake_invoice_payment_challenge/)
  assert.match(app, /saveArklakePaymentAttempt\(intent\)/)
  const request = app.indexOf("action: 'createTransferTransaction'")
  const execute = app.indexOf('sdk.execute(data.challengeId', request)
  assert.ok(request > -1 && execute > request)
})

test('regular Send stays a direct transfer while Pay with Arklake uses its stable intent idempotency key', () => {
  assert.doesNotMatch(api, /getReferenceId/)
  assert.doesNotMatch(api, /refId:/)
  assert.match(api, /let circleIdempotencyKey: string = crypto\.randomUUID\(\)/)
  assert.match(api, /circleIdempotencyKey = start\.idempotency_key/)
})

test('Pay with Arklake builds an atomic V2 payment from DB-authoritative invoice and payer wallet data', () => {
  assert.match(api, /CIRCLE_CONTRACT_EXECUTION_URL/)
  assert.match(api, /\.from\('invoices'\)[\s\S]+invoice_number,memo,receiving_wallet_address,amount,asset,status,expires_at/)
  assert.match(api, /\.from\('arklake_wallets'\)[\s\S]+circle_wallet_id', walletId/)
  assert.match(api, /buildArklakeInvoicePaymentBatch\([\s\S]+paymentReference: invoice\.invoice_number[\s\S]+memo: invoice\.memo \|\| ''/)
  assert.match(api, /contractAddress: circleWallet\.address[\s\S]+abiFunctionSignature: invoicePaymentBatchSignature/)
})

test('reload resumes persisted recovery and cannot render a fresh submit attempt', () => {
  assert.match(app, /loadArklakePaymentAttempt\(invoiceId\)/)
  assert.match(app, /getArklakePaymentIntentStatus\(intent\)/)
  assert.match(app, /attemptStatus !== 'created'[\s\S]+setPaymentStatus\('submitted'\)[\s\S]+confirmArklakePayment\(intent\)/)
  assert.match(intentApi, /A payment is already being confirmed for this invoice\./)
})

test('only Circle terminal failure releases the unresolved attempt lock', () => {
  assert.match(api, /challenge\.status === 'FAILED'[\s\S]+markAttemptFailed/)
  assert.match(api, /transaction\.state === 'FAILED'[\s\S]+markAttemptFailed/)
  assert.match(migration, /fail_arklake_invoice_payment_intent[\s\S]+status in \('submitting', 'submitted', 'confirming'\)/)
  assert.doesNotMatch(migration, /updated_at <|interval.*failed/i)
})

test('Connect wallet and Scan paths remain generic and use their existing bind flow', () => {
  assert.match(app, /createInvoicePaymentIntent\(invoiceId\)/)
  assert.match(app, /bindInvoicePaymentIntent\(externalPaymentIntent, hash\)/)
  assert.match(app, /submitWalletConnectIntent/)
})
