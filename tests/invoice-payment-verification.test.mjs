import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { encodeAbiParameters, keccak256, stringToHex } from 'viem'
import { buildServerModules } from './server-module-fixture.mjs'

const built = buildServerModules(['server/invoice-payment-verify-core.ts', 'server/invoice-payment-contract.ts'])
const {
  erc20TransferTopic,
  invoicePaymentChainId,
  invoicePaymentUsdcAddress,
  invoicePaymentEventTopic,
  invoiceUsdcBaseUnits,
  normalizePaymentTxHash,
  verifyInvoicePaymentReceipt,
} = await built.import('server/invoice-payment-verify-core.js')
const { arklakeInvoicePaymentV2Address, invoicePaymentEventDataAbi } = await built.import('server/invoice-payment-contract.js')

const recipient = '0xd94074edb1da4c98959d455172beb58e4400324f'
const payer = '0xb1f9ee64333564050964241688899166307d446e'
const topic = (address) => `0x${address.slice(2).padStart(64, '0')}`
const transfer = ({ token = invoicePaymentUsdcAddress, to = recipient, amount = 1_000_000n } = {}) => ({
  address: token,
  topics: [erc20TransferTopic, topic(payer), topic(to)],
  data: `0x${amount.toString(16).padStart(64, '0')}`,
})
const reference = 'ARK-20260912-B1C18C96'
const memo = 'Test memo'
const invoiceEvent = ({ eventPayer = payer, eventRecipient = recipient, token = invoicePaymentUsdcAddress, amount = 1_000_000n, eventReference = reference, eventMemo = memo } = {}) => ({
  address: arklakeInvoicePaymentV2Address,
  topics: [invoicePaymentEventTopic, keccak256(stringToHex(eventReference)), topic(eventPayer), topic(eventRecipient)],
  data: encodeAbiParameters(invoicePaymentEventDataAbi, [token, amount, eventReference, eventMemo]),
})
const valid = (overrides = {}) => verifyInvoicePaymentReceipt({
  chainId: `0x${invoicePaymentChainId.toString(16)}`,
  latestBlock: '0x65',
  blockTimestamp: '0x6aa11280',
  receipt: { status: '0x1', blockNumber: '0x64', logs: [
    transfer({ token: '0xfffffffffffffffffffffffffffffffffffffffe', amount: 1_000_000_000_000_000_000n }),
    transfer(),
  ] },
  invoice: { amount: '1', asset: 'USDC', recipientAddress: recipient, createdAt: '2026-09-08T00:00:00.000Z', expiresAt: '2026-09-15T00:00:00.000Z' },
  ...overrides,
})
const validArklake = (overrides = {}) => valid({
  receipt: { status: '0x1', blockNumber: '0x64', logs: [transfer(), invoiceEvent()] },
  arklakeProof: { payerAddress: payer, paymentReference: reference, memo },
  ...overrides,
})

test('normalizes tx hashes and converts exact six-decimal invoice amounts', () => {
  const upper = `0x${'AB'.repeat(32)}`
  assert.equal(normalizePaymentTxHash(` ${upper} `), upper.toLowerCase())
  assert.equal(normalizePaymentTxHash('0x1234'), null)
  assert.equal(invoiceUsdcBaseUnits('1'), 1_000_000n)
  assert.equal(invoiceUsdcBaseUnits('1.335482'), 1_335_482n)
  assert.equal(invoiceUsdcBaseUnits('1.0000001'), null)
})

test('accepts the known Arc Testnet USDC payment shape and ignores unrelated logs', () => {
  const result = valid()
  assert.equal(result.ok, true)
  assert.equal(result.confirmations, 2)
})

test('rejects malformed chain and missing, pending, failed, or shallow receipts', () => {
  assert.deepEqual(valid({ chainId: '0x1' }), { ok: false, reason: 'wrong-chain' })
  assert.deepEqual(valid({ receipt: null }), { ok: false, reason: 'missing-receipt' })
  assert.deepEqual(valid({ receipt: { logs: [] } }), { ok: false, reason: 'pending-receipt' })
  assert.deepEqual(valid({ receipt: { status: '0x0', blockNumber: '0x64', logs: [] } }), { ok: false, reason: 'failed-receipt' })
  assert.deepEqual(valid({ latestBlock: '0x64' }), { ok: false, reason: 'insufficient-confirmations' })
})

test('rejects wrong token, recipient, amount, and non-USDC invoice targets', () => {
  assert.deepEqual(valid({ receipt: { status: '0x1', blockNumber: '0x64', logs: [transfer({ token: '0x1111111111111111111111111111111111111111' })] } }), { ok: false, reason: 'wrong-token' })
  assert.deepEqual(valid({ receipt: { status: '0x1', blockNumber: '0x64', logs: [transfer({ to: '0x2222222222222222222222222222222222222222' })] } }), { ok: false, reason: 'wrong-recipient' })
  assert.deepEqual(valid({ receipt: { status: '0x1', blockNumber: '0x64', logs: [transfer({ amount: 999_999n })] } }), { ok: false, reason: 'wrong-amount' })
  assert.deepEqual(valid({ invoice: { amount: '1', asset: 'EURC', recipientAddress: recipient, createdAt: '2026-09-08T00:00:00.000Z', expiresAt: '2026-09-15T00:00:00.000Z' } }), { ok: false, reason: 'wrong-asset' })
})

test('rejects historical transfers and sums all canonical USDC sent to the recipient', () => {
  assert.deepEqual(valid({ blockTimestamp: '0x6a9e4800' }), { ok: false, reason: 'outside-invoice-window' })
  assert.deepEqual(valid({ receipt: { status: '0x1', blockNumber: '0x64', logs: [transfer(), transfer({ amount: 1n })] } }), { ok: false, reason: 'wrong-amount' })
})

test('Pay with Arklake requires the exact V2 InvoicePayment proof and payer transfer', () => {
  assert.equal(validArklake().ok, true)
  assert.deepEqual(validArklake({ receipt: { status: '0x1', blockNumber: '0x64', logs: [transfer()] } }), { ok: false, reason: 'missing-invoice-event' })
  assert.deepEqual(validArklake({ receipt: { status: '0x1', blockNumber: '0x64', logs: [transfer(), invoiceEvent({ eventReference: `${reference}-BAD` })] } }), { ok: false, reason: 'wrong-reference' })
  assert.deepEqual(validArklake({ receipt: { status: '0x1', blockNumber: '0x64', logs: [transfer(), invoiceEvent({ eventMemo: 'Wrong memo' })] } }), { ok: false, reason: 'wrong-memo' })
  assert.deepEqual(validArklake({ arklakeProof: { payerAddress: '0x3333333333333333333333333333333333333333', paymentReference: reference, memo } }), { ok: false, reason: 'wrong-payer' })
  assert.deepEqual(validArklake({ receipt: { status: '0x1', blockNumber: '0x64', logs: [transfer(), invoiceEvent({ eventRecipient: '0x4444444444444444444444444444444444444444' })] } }), { ok: false, reason: 'wrong-recipient' })
  assert.deepEqual(validArklake({ receipt: { status: '0x1', blockNumber: '0x64', logs: [transfer(), invoiceEvent({ token: '0x5555555555555555555555555555555555555555' })] } }), { ok: false, reason: 'wrong-token' })
  assert.deepEqual(validArklake({ receipt: { status: '0x1', blockNumber: '0x64', logs: [transfer(), invoiceEvent({ amount: 999_999n })] } }), { ok: false, reason: 'wrong-amount' })
})

test('Connect Wallet infers the exact payer from V2 proof and requires its matching USDC transfer', () => {
  const proof = { paymentReference: reference, memo }
  assert.equal(valid({ receipt: { status: '0x1', blockNumber: '0x64', logs: [transfer(), invoiceEvent()] }, arklakeProof: proof }).ok, true)
  assert.deepEqual(valid({ receipt: { status: '0x1', blockNumber: '0x64', logs: [transfer(), invoiceEvent({ eventPayer: '0x3333333333333333333333333333333333333333' })] }, arklakeProof: proof }), { ok: false, reason: 'wrong-payer' })
  assert.deepEqual(valid({ receipt: { status: '0x1', blockNumber: '0x64', logs: [transfer()] }, arklakeProof: proof }), { ok: false, reason: 'missing-invoice-event' })
})

test('API verifies on-chain before invoking the atomic Paid transition', () => {
  const api = readFileSync(new URL('../api/invoice-payment-verify.ts', import.meta.url), 'utf8')
  const verification = api.indexOf('const verified = verifyInvoicePaymentReceipt')
  const transition = api.indexOf("supabase.rpc('mark_verified_invoice_paid'")
  assert.ok(verification > -1 && transition > verification)
  assert.match(api, /rpc\('eth_chainId'\)/)
  assert.match(api, /rpc\('eth_getTransactionReceipt'/)
  assert.match(api, /rpc\('eth_blockNumber'\)/)
  assert.match(api, /rpc\('eth_getBlockByNumber'/)
  assert.match(api, /payment_rail === 'arklake'/)
  assert.match(api, /intentToken\.startsWith\('wallet\.'\)/)
  assert.match(api, /paymentReference: invoice\.invoice_number, memo: invoice\.memo \|\| ''/)
  assert.doesNotMatch(api, /wallet balance|activity-sync|createTransferTransaction/i)
})

test('migration makes Paid atomic, idempotent, activity-optional, and race-safe', () => {
  const sql = readFileSync(new URL('../supabase/migrations/202609080001_invoice_payment_verification.sql', import.meta.url), 'utf8')
  assert.match(sql, /payment_tx_hash text/)
  assert.match(sql, /unique index[\s\S]+payment_tx_hash/)
  assert.match(sql, /for update/)
  assert.match(sql, /target\.payment_tx_hash = p_tx_hash[\s\S]+idempotent/)
  assert.match(sql, /target\.status <> 'active' or target\.expires_at <= now\(\)[\s\S]+expired/)
  assert.match(sql, /target\.status = 'paid'[\s\S]+already_paid/)
  assert.match(sql, /exists \(select 1 from public\.invoices where payment_tx_hash = p_tx_hash and id <> target\.id\)/)
  assert.match(sql, /exception when unique_violation[\s\S]+tx_reused/)
  assert.match(sql, /payment_activity_id = linked_activity_id/)
  assert.doesNotMatch(sql, /insert into public\.wallet_activities/)
  assert.match(sql, /p_paid_at < target\.created_at or p_paid_at > target\.expires_at/)
  assert.match(sql, /revoke all on function[\s\S]+from public, anon, authenticated/)
  assert.match(sql, /grant execute on function[\s\S]+to service_role/)
})
