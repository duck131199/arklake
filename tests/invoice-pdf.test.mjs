import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { createInvoicePdf } from '../api/invoice-pdf-core.ts'

const endpoint = readFileSync(new URL('../api/invoice-pdf.ts', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('creates a real one-page branded invoice PDF', async () => {
  const bytes = await createInvoicePdf({
    invoiceNumber: 'ARK-20260908-TEST', seller: 'seller@example.com', payer: 'payer@example.com', amount: '20', asset: 'USDC', memo: 'Design work', status: 'active', createdAt: '2026-09-08T01:00:00Z', expiresAt: '2026-09-15T01:00:00Z', timeZone: 'Asia/Bangkok',
  })
  assert.equal(Buffer.from(bytes).subarray(0, 4).toString(), '%PDF')
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1)
})

test('public PDF masks emails while seller PDF is account scoped', () => {
  assert.match(endpoint, /scope === 'seller'/)
  assert.match(endpoint, /arklake_sessions/)
  assert.match(endpoint, /query = query\.eq\('account_id', accountId\)/)
  assert.match(endpoint, /maskInvoiceEmail\(invoice\.payer_email\)/)
  assert.match(endpoint, /Content-Type', 'application\/pdf'/)
  assert.match(endpoint, /requestedTimeZone/)
  assert.match(app, /resolvedOptions\(\)\.timeZone/)
})

test('public and seller detail expose invoice download without receipt behavior', () => {
  assert.match(app, /invoice-pdf\?id=\$\{encodeURIComponent\(invoice\.id\)\}/)
  assert.match(app, /scope=seller/)
  assert.doesNotMatch(endpoint, /payment_activity_id|paid_at|receipt/i)
})
