import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { autoVerifyInvoicePayment, resolveCirclePaymentTxHash } from '../src/invoice-payment-auto-confirm.ts'

const invoiceId = '08a05d3d-d72d-4000-ae71-1ffb34d97249'
const txHash = `0x${'a'.repeat(64)}`
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

test('Pay with Arklake resolves a delayed Circle hash by its persisted intent credentials', async () => {
  const calls = []
  const fetcher = async (_url, init) => {
    calls.push(JSON.parse(init.body))
    return calls.length === 1 ? response(200, { pending: true }) : response(200, { txHash })
  }
  assert.equal(await resolveCirclePaymentTxHash({ endpoint: '/api/circle/wallet', intentId: 'intent-id', intentToken: 'intent-token', fetcher, sleep: async () => {} }), txHash)
  assert.deepEqual(calls[0], { action: 'resolveTransferTransactionHash', intentId: 'intent-id', intentToken: 'intent-token' })
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

test('both app and external-wallet payment rails automatically verify and reload the invoice', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /intentId: arklakePaymentIntent\?\.id, intentToken: arklakePaymentIntent\?\.token/)
  assert.match(app, /await confirmArklakePayment\(arklakePaymentIntent, txHash\)/)
  assert.match(app, /submitExternalInvoicePayment[\s\S]+bindInvoicePaymentIntent\(externalPaymentIntent, hash\)[\s\S]+autoVerifyInvoicePayment\(\{ invoiceId, txHash: hash, intentId: externalPaymentIntent\.id, intentToken: externalPaymentIntent\.token \}\)[\s\S]+await loadInvoice\(\)/)
  assert.doesNotMatch(app, /paymentOption === '(?:arklake|wallet)'[\s\S]{0,1200}(?:Transaction hash|Verify payment)/)
})

test('Circle transfer recovery follows the persisted challenge correlation ID and wallet ownership', () => {
  const api = readFileSync(new URL('../api/circle/wallet.ts', import.meta.url), 'utf8')
  assert.match(api, /circle_challenge_id/)
  assert.match(api, /challenge\.correlationIds/)
  assert.match(api, /circle_transaction_id: transactionId/)
  assert.match(api, /transaction\.id !== transactionId \|\| transaction\.walletId !== walletId/)
  assert.doesNotMatch(api, /transactions\.find[\s\S]{0,300}refId/)
  assert.match(api, /getCircleRecoverySession\(cookieHeader\)/)
  assert.match(api, /attempt\.payer_wallet_id !== walletId/)
  assert.doesNotMatch(api, /resolveTransferTransactionHash = async \(userToken/)
})

test('F5 recovery uses the authenticated server session without client Circle signing credentials', () => {
  const client = readFileSync(new URL('../src/invoice-payment-auto-confirm.ts', import.meta.url), 'utf8')
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(client, /credentials: 'include'/)
  assert.doesNotMatch(client, /input\.userToken|input\.walletId/)
  assert.doesNotMatch(app, /const confirmArklakePayment[\s\S]{0,180}!circleAuth/)
})

test('client timeout keeps the attempt blocked while a definitive Circle failure permits retry', async () => {
  await assert.rejects(resolveCirclePaymentTxHash({ endpoint: '/api/circle/wallet', intentId: 'i', intentToken: 't', attempts: 1, fetcher: async () => response(200, { pending: true }) }), (error) => error.retryAllowed === false)
  await assert.rejects(resolveCirclePaymentTxHash({ endpoint: '/api/circle/wallet', intentId: 'i', intentToken: 't', fetcher: async () => response(409, { error: 'failed', retryAllowed: true }) }), (error) => error.retryAllowed === true)
})
