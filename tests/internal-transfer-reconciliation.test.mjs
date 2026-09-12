import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { arcTestnetChainIdHex, counterpartyActivityType, internalCounterpartyAddress, reconciledDedupKey, verifyInternalUsdcTransfer } from '../server/circle/internal-transfer.ts'

const invoicePaymentUsdcAddress = '0x3600000000000000000000000000000000000000'

const source = '0x1111111111111111111111111111111111111111'
const destination = '0x2222222222222222222222222222222222222222'
const hash = `0x${'ab'.repeat(32)}`
const topic = (address) => `0x${address.slice(2).padStart(64, '0')}`
const base = {
  blockchain: 'ARC-TESTNET', txHash: hash, activityType: 'send', status: 'confirmed', confirmedAt: '2026-09-11T05:00:00Z',
  sourceAddress: source, destinationAddress: destination, legs: [{ amount: '1.25', tokenAddress: invoicePaymentUsdcAddress, tokenSymbol: 'USDC' }],
}
const receipt = {
  status: '0x1', transactionHash: hash, logs: [{ address: invoicePaymentUsdcAddress, data: '0x1312d0', logIndex: '0x2', topics: [
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', topic(source), topic(destination),
  ] }],
}

test('verified internal transfer materializes the opposite wallet direction with deterministic dedup', () => {
  assert.deepEqual(verifyInternalUsdcTransfer(base, receipt), { sourceAddress: source, destinationAddress: destination, amount: '1.25', logIndex: 2 })
  assert.equal(internalCounterpartyAddress(base), destination)
  assert.equal(counterpartyActivityType(base, destination), 'receive')
  const inbound = { ...base, activityType: 'receive' }
  assert.equal(internalCounterpartyAddress(inbound), source)
  assert.equal(counterpartyActivityType(inbound, source), 'send')
  assert.equal(reconciledDedupKey('wallet-b', 'ARC-TESTNET', hash.toUpperCase()), `wallet-b:ARC-TESTNET:${hash}`)
})

test('internal reconciliation rejects unconfirmed, spoofed, wrong-token, and unmatched transfers', () => {
  assert.equal(verifyInternalUsdcTransfer({ ...base, status: 'pending' }, receipt), null)
  assert.equal(verifyInternalUsdcTransfer({ ...base, destinationAddress: '0x3333333333333333333333333333333333333333' }, receipt), null)
  assert.equal(verifyInternalUsdcTransfer(base, { ...receipt, logs: [{ ...receipt.logs[0], address: '0x4444444444444444444444444444444444444444' }] }), null)
  assert.equal(verifyInternalUsdcTransfer(base, { ...receipt, logs: [{ ...receipt.logs[0], data: '0x1' }] }), null)
  assert.equal(arcTestnetChainIdHex, '0x4cef52')
})

test('activity sync derives counterpart accounts server-side and keeps existing guards', () => {
  const sync = readFileSync(new URL('../api/circle/activity-sync.ts', import.meta.url), 'utf8')
  assert.match(sync, /\.ilike\('address', address\).*\.neq\('account_id', currentAccountId\)\.limit\(2\)/s)
  assert.match(sync, /counterpartMatches\?\.length === 1/)
  assert.match(sync, /verifyInternalUsdcTransfer\(activity, receipt\)/)
  assert.match(sync, /new Set\(\[currentAccountId\]\)/)
  assert.doesNotMatch(sync, /req\.body[^\n]*accountId/)
  assert.match(sync, /onConflict: 'dedup_key', ignoreDuplicates: true/)
  assert.match(sync, /onConflict: 'activity_id,channel', ignoreDuplicates: true/)
  assert.match(sync, /notificationStatus[\s\S]*activityEmailMaySend/)
  assert.match(sync, /invoice_payment_intents/)
  assert.match(sync, /deliverActivityEmails\(supabase, accountId, emailEnabledAt\)/)
})

test('native wallet sync replaces reconciliation-only legs without broadening database access', () => {
  const sync = readFileSync(new URL('../api/circle/activity-sync.ts', import.meta.url), 'utf8')
  const migration = readFileSync(new URL('../supabase/migrations/202609110002_internal_transfer_reconciliation.sql', import.meta.url), 'utf8')
  assert.match(sync, /\.delete\(\)\.in\('activity_id', nativeActivityIds\)\.like\('leg_key', 'reconciled:%'\)/)
  assert.match(migration, /grant delete on table public\.wallet_activity_legs to service_role/)
  assert.doesNotMatch(migration, /anon|authenticated/)
})
