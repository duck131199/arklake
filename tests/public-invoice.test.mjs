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
const { maskInvoiceEmail } = module.namespace

test('masks payer and seller email before public display', () => {
  assert.equal(maskInvoiceEmail('payer@example.com'), 'p…r@example.com')
  assert.equal(maskInvoiceEmail('a@example.com'), 'a*@example.com')
  assert.equal(maskInvoiceEmail('invalid'), 'Private recipient')
})

test('public API is read-only and does not require an Arklake session', () => {
  const source = readFileSync(new URL('../api/public-invoice.ts', import.meta.url), 'utf8')
  assert.match(source, /req\.method !== 'GET'/)
  assert.doesNotMatch(source, /arklake_session|arklake_sessions|sessionId/)
  assert.doesNotMatch(source, /receiving_circle_wallet_id|receiving_wallet_address/)
})

test('public response uses an explicit payer-safe field allowlist', () => {
  const source = readFileSync(new URL('../api/public-invoice.ts', import.meta.url), 'utf8')
  assert.match(source, /invoiceNumber: invoice\.invoice_number/)
  assert.match(source, /payer: maskInvoiceEmail\(invoice\.payer_email\)/)
  assert.match(source, /seller: seller\?\.email \? maskInvoiceEmail\(seller\.email\)/)
  assert.doesNotMatch(source, /accountId:|account_id: invoice\.account_id/)
})

test('public UI exposes all three payment entry options', () => {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(source, /Pay with Arklake/)
  assert.match(source, /Connect wallet/)
  assert.match(source, /Scan to pay/)
  assert.match(source, /currentPath\.startsWith\('\/invoice\/'\)/)
  assert.match(source, /window\.location\.origin}\/invoice\/\$\{invoice\.id}/)
})

test('public invoice logo returns an authenticated session to the app', () => {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(source, /href=\{sessionStatus === 'authenticated' \? '\/app' : '\/'\}/)
  assert.match(source, /onNavigate\(sessionStatus === 'authenticated' \? '\/app' : '\/'\)/)
})
