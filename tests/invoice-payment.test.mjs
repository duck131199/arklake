import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const api = readFileSync(new URL('../api/invoice-payment-target.ts', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('invoice payment target is guest-readable and only returns an active snapshot target', () => {
  assert.doesNotMatch(api, /arklake_session|arklake_sessions/)
  assert.match(api, /invoice\.status !== 'active'/)
  assert.match(api, /recipientAddress: invoice\.receiving_wallet_address/)
  assert.doesNotMatch(api, /status:\s*'paid'/)
})

test('guest auth return preserves invoice and stops at review', () => {
  assert.match(app, /arklake_pending_invoice_payment_v1/)
  assert.match(app, /pendingInvoicePayment \? `\/invoice\/\$\{pendingInvoicePayment\.invoiceId}/)
  assert.match(app, /setPaymentStatus\('review'\)/)
  assert.doesNotMatch(app, /pendingInvoicePayment[\s\S]{0,300}submitArklakePayment\(/)
})

test('new payer wallet provisioning waits for the wallet instead of rejecting a non-terminal SDK status', () => {
  assert.doesNotMatch(app, /challengeResult\?\.status !== 'COMPLETE'[\s\S]{0,160}Circle wallet challenge did not complete/)
  assert.match(app, /for \(let attempt = 0; attempt < 6 && !updatedWallet; attempt \+= 1\)/)
  assert.match(app, /Circle wallet provisioning is still in progress\. Please continue in a moment\./)
})

test('Pay with Arklake reuses Circle transfer and only the strict verifier can mark Paid', () => {
  assert.match(app, /action: 'createTransferTransaction'/)
  assert.match(app, /Approve and submit payment/)
  assert.match(app, /await confirmArklakePayment\(txHash\)/)
  assert.match(app, /bindInvoicePaymentIntent\(arklakePaymentIntent, resolvedHash\)/)
  assert.match(app, /intentId: arklakePaymentIntent\.id, intentToken: arklakePaymentIntent\.token/)
  assert.match(app, /Confirming payment/)
  assert.doesNotMatch(app, /fetch\([^\n]+invoice[^\n]+method:\s*['"](?:PATCH|PUT)/)
})

test('connect wallet and WalletConnect scan both use strict auto verification', () => {
  assert.match(app, /connectInvoiceWallet/)
  assert.match(app, /submitExternalUsdcPayment/)
  assert.match(app, /bindInvoicePaymentIntent\(externalPaymentIntent, hash\)/)
  assert.match(app, /autoVerifyInvoicePayment\(\{ invoiceId, txHash: hash, intentId: externalPaymentIntent\.id, intentToken: externalPaymentIntent\.token \}\)/)
  assert.match(app, /createInvoicePaymentIntent\(invoiceId\)/)
  assert.match(app, /submitWalletConnectIntent/)
  assert.match(app, /autoVerifyInvoicePayment\(\{ invoiceId, txHash: submitted\.txHash, intentId: intent\.id, intentToken: intent\.token \}\)/)
})
