import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { stripTypeScriptTypes } from 'node:module'

const source = stripTypeScriptTypes(readFileSync(new URL('../server/circle/activity-core.ts', import.meta.url), 'utf8'))
const context = vm.createContext({ Date, Map, Set })
const module = new vm.SourceTextModule(source, { context })
await module.link(() => { throw new Error('Unexpected import') })
await module.evaluate()
const { normalizeCircleTransactions } = module.namespace

const emailSource = stripTypeScriptTypes(readFileSync(new URL('../server/circle/activity-email.ts', import.meta.url), 'utf8'))
const emailModule = new vm.SourceTextModule(emailSource, { context })
await emailModule.link(() => { throw new Error('Unexpected import') })
await emailModule.evaluate()
const { activityEmail, notificationBelongsToAccount, notificationIdempotencyKey, transactionEmailEnabled } = emailModule.namespace
const base = { walletId: 'wallet-1', blockchain: 'ARC-TESTNET', state: 'CONFIRMED', operation: 'TRANSFER', createDate: '2026-09-07T01:00:00Z', updateDate: '2026-09-07T01:01:00Z' }

test('classifies real one-way transfers as receive and send', () => {
  const result = normalizeCircleTransactions([
    { ...base, id: 'receive-1', transactionType: 'INBOUND', amounts: ['2.5'], tokenId: 'usdc', txHash: '0xaaa' },
    { ...base, id: 'send-1', transactionType: 'OUTBOUND', amounts: ['1'], tokenId: 'eurc', txHash: '0xbbb' },
  ])
  assert.deepEqual(Array.from(result, (item) => item.activityType).sort(), ['receive', 'send'])
  assert.ok(result.every((item) => item.status === 'confirmed'))
})

test('groups opposite token movements in one transaction as one swap', () => {
  const result = normalizeCircleTransactions([
    { ...base, id: 'swap-out', operation: 'CONTRACT_EXECUTION', transactionType: 'OUTBOUND', amounts: ['10'], tokenId: 'usdc', txHash: '0xswap' },
    { ...base, id: 'swap-in', operation: 'CONTRACT_EXECUTION', transactionType: 'INBOUND', amounts: ['9.9'], tokenId: 'eurc', txHash: '0xswap' },
  ])
  assert.equal(result.length, 1)
  assert.equal(result[0].activityType, 'swap')
  assert.equal(result[0].legs.length, 2)
})

test('upgrades Circle inbound plus amount-less contract execution using receipt legs', () => {
  const hash = '0xhistoricalswap'
  const transactions = [
    { ...base, id: 'swap-contract', operation: 'CONTRACT_EXECUTION', transactionType: 'OUTBOUND', amounts: [], txHash: hash },
    { ...base, id: 'swap-in', transactionType: 'INBOUND', amounts: ['0.764335'], tokenId: 'circle-eurc', txHash: hash },
  ]
  const receiptLegs = new Map([[hash, [
    { txHash: hash, logIndex: 1, direction: 'out', amount: '1', tokenId: 'usdc', tokenAddress: '0xusdc', tokenSymbol: 'USDC', tokenDecimals: 6, sourceAddress: '0xwallet', destinationAddress: '0xrouter' },
    { txHash: hash, logIndex: 2, direction: 'in', amount: '0.764335', tokenId: 'registry-eurc', tokenAddress: '0xeurc', tokenSymbol: 'EURC', tokenDecimals: 6, sourceAddress: '0xrouter', destinationAddress: '0xwallet' },
  ]]])
  const tokens = new Map([['circle-eurc', { id: 'circle-eurc', tokenAddress: '0xEURC' }]])
  const result = normalizeCircleTransactions(transactions, tokens, 'wallet-1', receiptLegs)
  assert.equal(result.length, 1)
  assert.equal(result[0].activityType, 'swap')
  assert.deepEqual(Array.from(result[0].legs, (leg) => [leg.direction, leg.amount, leg.tokenSymbol]), [
    ['out', '1', 'USDC'], ['in', '0.764335', 'EURC'],
  ])
  assert.equal(result[0].legs[1].legKey, 'swap-in:in:circle-eurc:0')
})

test('reuses an unambiguous Circle leg when its token ID has no resolvable contract metadata', () => {
  const hash = '0xnativealias'
  const transactions = [
    { ...base, id: 'contract', operation: 'CONTRACT_EXECUTION', transactionType: 'OUTBOUND', amounts: [], txHash: hash },
    { ...base, id: 'inbound', transactionType: 'INBOUND', amounts: ['1.335482'], tokenId: 'circle-native-usdc', txHash: hash },
  ]
  const receiptLegs = new Map([[hash, [
    { txHash: hash, logIndex: 1, direction: 'out', amount: '1', tokenId: 'eurc', tokenAddress: '0xeurc', tokenSymbol: 'EURC', tokenDecimals: 6, sourceAddress: '0xwallet', destinationAddress: '0xrouter' },
    { txHash: hash, logIndex: 2, direction: 'in', amount: '1.335482', tokenId: 'erc20-usdc', tokenAddress: '0xusdc', tokenSymbol: 'USDC', tokenDecimals: 6, sourceAddress: '0xrouter', destinationAddress: '0xwallet' },
  ]]])
  const result = normalizeCircleTransactions(transactions, new Map(), 'wallet-1', receiptLegs)
  assert.equal(result[0].legs.length, 2)
  assert.equal(result[0].legs[1].legKey, 'inbound:in:circle-native-usdc:0')
})

test('does not mislabel contract execution without proven money movement', () => {
  const result = normalizeCircleTransactions([
    { ...base, id: 'approval', operation: 'CONTRACT_EXECUTION', transactionType: 'OUTBOUND', amounts: [], tokenId: 'usdc', txHash: '0xapproval' },
  ])
  assert.equal(result.length, 0)
})

test('dedup keys and leg keys remain stable across repeated syncs', () => {
  const transaction = { ...base, id: 'receive-1', transactionType: 'INBOUND', amounts: ['2.5'], tokenId: 'usdc', txHash: '0xABC' }
  assert.deepEqual(normalizeCircleTransactions([transaction]), normalizeCircleTransactions([transaction]))
  assert.notEqual(normalizeCircleTransactions([transaction], new Map(), 'wallet-1')[0].dedupKey, normalizeCircleTransactions([transaction], new Map(), 'wallet-2')[0].dedupKey)
})

test('transaction email content matches receive, send, and swap movements', () => {
  const common = { id: 'activity-1', status: 'confirmed', occurredAt: '2026-09-07T01:00:00Z', confirmedAt: '2026-09-07T01:01:00Z', blockchain: 'ARC-TESTNET', txHash: '0xabc' }
  assert.match(activityEmail({ ...common, type: 'receive', legs: [{ direction: 'in', amount: '2.5', symbol: 'USDC' }] }).text, /You received 2.5 USDC/)
  const send = activityEmail({ ...common, type: 'send', legs: [{ direction: 'out', amount: '1', symbol: 'EURC' }] })
  assert.equal(send.subject, '1 EURC sent successfully')
  assert.match(send.text, /^EURC sent successfully/)
  assert.match(activityEmail({ ...common, type: 'swap', legs: [{ direction: 'out', amount: '1', symbol: 'USDC' }, { direction: 'in', amount: '0.76', symbol: 'EURC' }] }).text, /Swap successful\n\nYour swap has been confirmed\.\n\n1 USDC → 0.76 EURC/)
})

test('transaction email uses one stable provider idempotency key per activity', () => {
  assert.equal(notificationIdempotencyKey('activity-1'), notificationIdempotencyKey('activity-1'))
  assert.notEqual(notificationIdempotencyKey('activity-1'), notificationIdempotencyKey('activity-2'))
  const migration = readFileSync(new URL('../supabase/migrations/202609070001_wallet_activity_foundation.sql', import.meta.url), 'utf8')
  assert.match(migration, /unique \(activity_id, channel\)/)
  assert.match(migration, /select account_id, id, 'suppressed'.*Existing confirmed activity/s)
  assert.match(migration, /on conflict \(activity_id, channel\) do nothing/)
})

test('transaction email feature flag is off by default and only explicit true enables it', () => {
  assert.equal(transactionEmailEnabled(undefined), false)
  assert.equal(transactionEmailEnabled('false'), false)
  assert.equal(transactionEmailEnabled('TRUE'), false)
  assert.equal(transactionEmailEnabled('true'), true)
  const syncSource = readFileSync(new URL('../api/circle/activity-sync.ts', import.meta.url), 'utf8')
  assert.match(syncSource, /const confirmedIds = emailEnabled \?/)
  assert.match(syncSource, /const notifications = emailEnabled \?/)
})

test('notification jobs are isolated to their owning account', () => {
  assert.equal(notificationBelongsToAccount('account-a', 'account-a'), true)
  assert.equal(notificationBelongsToAccount('account-b', 'account-a'), false)
  const syncSource = readFileSync(new URL('../api/circle/activity-sync.ts', import.meta.url), 'utf8')
  assert.match(syncSource, /select\('id,account_id,activity_id,status,attempts'\)\.eq\('account_id', accountId\)/)
  assert.equal((syncSource.match(/\.eq\('account_id', accountId\)/g) || []).length, 5)
})
