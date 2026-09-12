import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import { createInvoicePdf, wrapInvoiceDescription } from '../server/invoice-pdf-core.ts'

const endpoint = readFileSync(new URL('../api/invoice-pdf.ts', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('creates a real one-page branded invoice PDF', async () => {
  const bytes = await createInvoicePdf({
    invoiceNumber: 'ARK-20260908-TEST', seller: 'seller@example.com', payer: 'payer@example.com', amount: '20', asset: 'USDC', memo: 'Design work', status: 'active', createdAt: '2026-09-08T01:00:00Z', expiresAt: '2026-09-15T01:00:00Z', paidAt: null, timeZone: 'Asia/Bangkok',
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

test('public and seller detail expose invoice download with paid time but without receipt behavior', () => {
  assert.match(app, /invoice-pdf\?id=\$\{encodeURIComponent\(invoice\.id\)\}/)
  assert.match(app, /scope=seller/)
  assert.match(endpoint, /paid_at/)
  assert.match(endpoint, /paidAt: invoice\.paid_at/)
  assert.doesNotMatch(endpoint, /payment_activity_id|receipt/i)
})

test('paid invoice PDF uses paid_at and keeps invoice presentation semantics', async () => {
  const bytes = await createInvoicePdf({
    invoiceNumber: 'ARK-20260908-PAID', seller: 'seller@example.com', payer: 'payer@example.com', amount: '1', asset: 'USDC', memo: 'Consulting', status: 'paid', createdAt: '2026-09-08T01:00:00Z', expiresAt: '2026-09-15T01:00:00Z', paidAt: '2026-09-09T03:30:00Z', timeZone: 'Asia/Bangkok',
  })
  assert.equal(Buffer.from(bytes).subarray(0, 4).toString(), '%PDF')
  assert.equal((await PDFDocument.load(bytes)).getSubject(), 'Invoice')
  const core = readFileSync(new URL('../server/invoice-pdf-core.ts', import.meta.url), 'utf8')
  assert.match(core, /'Paid at'/)
  assert.match(core, /'DESCRIPTION'/)
  assert.match(core, /'FROM \/ BILL TO'/)
  assert.match(core, /'AMOUNT DUE'/)
  assert.match(core, /'PAYMENT DETAILS'/)
  assert.match(core, /· Arc Testnet/)
  assert.match(core, /Arc Testnet/)
  assert.doesNotMatch(core, /Payment of .* is due by the expiry time above/)
  assert.doesNotMatch(core, /`Paid on /)
  assert.doesNotMatch(core, /setSubject\('Receipt'\)/)
})

test('PDF Description is conditional, preserves newlines and wraps beyond 92 characters without overflow', async () => {
  const document = await PDFDocument.create()
  const font = await document.embedFont('Helvetica')
  const description = `${'A'.repeat(120)}\nSecond explicit line\n${'long description '.repeat(20)}`
  const lines = wrapInvoiceDescription(description, font, 11, 491)
  assert.ok(lines.length > 3)
  assert.equal(lines.some((line) => line === 'Second explicit line'), true)
  assert.ok(lines.every((line) => font.widthOfTextAtSize(line, 11) <= 491))

  const longBytes = await createInvoicePdf({
    invoiceNumber: 'ARK-20260908-LONG', seller: 'seller@example.com', payer: 'payer@example.com', amount: '1', asset: 'USDC', memo: 'x'.repeat(500), status: 'expired', createdAt: '2026-09-08T01:00:00Z', expiresAt: '2026-09-15T01:00:00Z', paidAt: null,
  })
  assert.ok((await PDFDocument.load(longBytes)).getPageCount() > 1)

  const emptyBytes = await createInvoicePdf({
    invoiceNumber: 'ARK-20260908-EMPTY', seller: 'seller@example.com', payer: 'payer@example.com', amount: '1', asset: 'USDC', memo: '   ', status: 'active', createdAt: '2026-09-08T01:00:00Z', expiresAt: '2026-09-15T01:00:00Z', paidAt: null,
  })
  assert.equal((await PDFDocument.load(emptyBytes)).getPageCount(), 1)
  const core = readFileSync(new URL('../server/invoice-pdf-core.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(core, /slice\(0, 92\)/)
  assert.match(core, /if \(description\)/)
})

test('invoice UI uses an optional 500-character Description textarea and hides empty descriptions', () => {
  assert.match(app, /<textarea[\s\S]*maxLength=\{500\}[\s\S]*rows=\{3\}/)
  assert.match(app, /memo\.trim\(\) \? <ReviewInvoiceRow label="Description"/)
  assert.match(app, /invoice\.memo\.trim\(\) \? <ReviewInvoiceRow label="Description"/)
  assert.match(app, /invoice\.memo\.trim\(\) \? <div><p[^>]*>Description<\/p>/)
  assert.doesNotMatch(app, /ReviewInvoiceRow label="Memo"/)
})
