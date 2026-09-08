import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { stripTypeScriptTypes } from 'node:module'

const coreSource = stripTypeScriptTypes(readFileSync(new URL('../api/invoice-core.ts', import.meta.url), 'utf8'))
const context = vm.createContext({ Date, Object, Number, RegExp })
const module = new vm.SourceTextModule(coreSource, { context })
await module.link(() => { throw new Error('Unexpected import') })
await module.evaluate()
const { validateInvoiceCreate, invoiceExpiresAt } = module.namespace

test('accepts a guest payer email and normalizes invoice input', () => {
  const result = validateInvoiceCreate({ payerEmail: ' PAYER@Example.com ', amount: '20.25', memo: ' Design ', expiry: '7 days' })
  assert.deepEqual(JSON.parse(JSON.stringify(result.data)), { payerEmail: 'payer@example.com', amount: '20.25', memo: 'Design', expiry: '7 days' })
})

test('rejects invalid amount, email, expiry and excess precision', () => {
  assert.ok(validateInvoiceCreate({ payerEmail: 'x', amount: '1', expiry: '7 days' }).error)
  assert.ok(validateInvoiceCreate({ payerEmail: 'payer@example.com', amount: '0', expiry: '7 days' }).error)
  assert.ok(validateInvoiceCreate({ payerEmail: 'payer@example.com', amount: '1.0000001', expiry: '7 days' }).error)
  assert.ok(validateInvoiceCreate({ payerEmail: 'payer@example.com', amount: '1', expiry: 'forever' }).error)
})

test('computes expiry on the server from an allowed duration', () => {
  assert.equal(invoiceExpiresAt('24 hours', new Date('2026-09-07T00:00:00.000Z')), '2026-09-08T00:00:00.000Z')
  assert.equal(invoiceExpiresAt('30 days', new Date('2026-09-07T00:00:00.000Z')), '2026-10-07T00:00:00.000Z')
})

test('API and schema enforce account scope and verified paid state', () => {
  const api = readFileSync(new URL('../api/invoices.ts', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../supabase/migrations/202609070002_invoice_core.sql', import.meta.url), 'utf8')
  assert.match(api, /\.eq\('account_id', accountId\)/)
  assert.match(api, /req\.method === 'GET'/)
  assert.match(api, /req\.method === 'POST'/)
  assert.doesNotMatch(api, /req\.method === '(?:PATCH|PUT|DELETE)'/)
  assert.match(migration, /status = 'paid' and paid_at is not null and payment_activity_id is not null/)
  assert.match(migration, /payer_email text not null/)
  assert.doesNotMatch(migration, /payer_account_id/)
})
