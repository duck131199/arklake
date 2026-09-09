import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { autoVerifyInvoicePayment, resolveCirclePaymentTxHash } from '../src/invoice-payment-auto-confirm.ts'

const invoiceId = '08a05d3d-d72d-4000-ae71-1ffb34d97249'
const txHash = `0x${'a'.repeat(64)}`
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

test('Pay with Arklake resolves a delayed Circle hash by the current invoice reference', async () => {
  const calls = []
  const fetcher = async (_url, init) => {
    calls.push(JSON.parse(init.body))
    return calls.length === 1 ? response(200, { pending: true }) : response(200, { txHash })
  }
  assert.equal(await resolveCirclePaymentTxHash({ endpoint: '/api/circle/wallet', userToken: 'user-token', walletId: 'wallet-id', invoiceId, fetcher, sleep: async () => {} }), txHash)
  assert.deepEqual(calls[0], { action: 'resolveTransferTransactionHash', userToken: 'user-token', walletId: 'wallet-id', referenceId: invoiceId })
})

test('auto verification binds the submitted hash to the exact invoice and retries pending confirmations', async () => {
  const calls = []
  const fetcher = async (_url, init) => {
    calls.push(JSON.parse(init.body))
    return calls.length === 1
      ? response(422, { retryable: true, error: 'Transaction confirmation is still pending.' })
      : response(200, { paid: true, txHash })
  }
  assert.deepEqual(await autoVerifyInvoicePayment({ invoiceId, txHash, fetcher, sleep: async () => {} }), { txHash })
  assert.deepEqual(calls, [{ invoiceId, txHash }, { invoiceId, txHash }])
})

test('auto verification forwards payment-intent credentials', async () => {
  let body
  await autoVerifyInvoicePayment({ invoiceId, txHash, intentId: 'intent-id', intentToken: 'intent-token', fetcher: async (_url, init) => {
    body = JSON.parse(init.body)
    return response(200, { paid: true, txHash })
  } })
  assert.deepEqual(body, { invoiceId, txHash, intentId: 'intent-id', intentToken: 'intent-token' })
})

test('failed verification never reports Paid and is not retried', async () => {
  let calls = 0
  await assert.rejects(autoVerifyInvoicePayment({ invoiceId, txHash, fetcher: async () => {
    calls += 1
    return response(422, { retryable: false, error: 'The transfer amount does not match this invoice.' })
  }, sleep: async () => {} }), /does not match/)
  assert.equal(calls, 1)
})

test('pending confirmations time out without reporting Paid', async () => {
  let calls = 0
  await assert.rejects(autoVerifyInvoicePayment({ invoiceId, txHash, attempts: 2, fetcher: async () => {
    calls += 1
    return response(422, { retryable: true, error: 'Transaction confirmation is still pending.' })
  }, sleep: async () => {} }), /taking longer than expected/)
  assert.equal(calls, 2)
})

test('both direct payment rails automatically verify and reload the invoice', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /referenceId: invoiceId/)
  assert.match(app, /await confirmArklakePayment\(txHash\)/)
  assert.match(app, /submitExternalUsdcPayment[\s\S]+bindInvoicePaymentIntent\(externalPaymentIntent, hash\)[\s\S]+autoVerifyInvoicePayment\(\{ invoiceId, txHash: hash, intentId: externalPaymentIntent\.id, intentToken: externalPaymentIntent\.token \}\)[\s\S]+await loadInvoice\(\)/)
  assert.doesNotMatch(app, /paymentOption === '(?:arklake|wallet)'[\s\S]{0,1200}(?:Transaction hash|Verify payment)/)
})

test('Circle transfer lookup is correlated by refId and wallet ownership', () => {
  const api = readFileSync(new URL('../api/circle/wallet.ts', import.meta.url), 'utf8')
  assert.match(api, /refId: referenceId/)
  assert.match(api, /candidate\.refId === referenceId && candidate\.walletId === walletId/)
})
