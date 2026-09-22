import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  GatewayReadinessError,
  correlateGatewayWallets,
  inspectGatewayReadiness,
  parseUsdcBaseUnits,
} from '../server/circle/gateway-readiness.ts'

const arc = { id: 'arc-wallet-id', address: `0x${'a'.repeat(40)}`, blockchain: 'ARC-TESTNET', accountType: 'SCA' }
const polygon = { id: 'polygon-wallet-id', address: `0x${'b'.repeat(40)}`, blockchain: 'MATIC-AMOY', accountType: 'SCA' }
const eoa = { id: 'polygon-eoa-id', address: `0x${'c'.repeat(40)}`, blockchain: 'MATIC-AMOY', accountType: 'EOA' }

function fixture(overrides = {}) {
  const calls = []
  const values = { wallets: [arc, polygon], bytecode: '0x6001', usdc: '0', allowance: '0', available: '0', pending: '0', ...overrides }
  const dependencies = {
    now: () => '2026-09-20T00:00:00.000Z',
    listWallets: async () => { calls.push('wallets'); if (values.walletError) throw values.walletError; return values.wallets },
    readBytecode: async () => { calls.push('bytecode'); if (values.bytecodeError) throw values.bytecodeError; return values.bytecode },
    readUsdcBalance: async () => { calls.push('usdc'); if (values.rpcError) throw values.rpcError; return values.usdc },
    readAllowance: async () => { calls.push('allowance'); if (values.rpcError) throw values.rpcError; return values.allowance },
    readGatewayBalances: async () => { calls.push('gateway'); if (values.gatewayError) throw values.gatewayError; return { available: values.available, pending: values.pending } },
  }
  return { calls, run: () => inspectGatewayReadiness(arc, dependencies) }
}

test('no Polygon SCA is a known wallet-missing state and Polygon EOA is ignored', async () => {
  const f = fixture({ wallets: [arc, eoa] })
  const result = await f.run()
  assert.equal(result.readinessStatus, 'POLYGON_WALLET_MISSING')
  assert.equal(result.polygon.walletFound, false)
  assert.deepEqual(f.calls, ['wallets'])
})

test('an existing but undeployed Polygon SCA stops at the bytecode state', async () => {
  const f = fixture({ bytecode: '0x' })
  const result = await f.run()
  assert.equal(result.readinessStatus, 'POLYGON_SCA_UNDEPLOYED')
  assert.equal(result.polygon.bytecodeDetected, false)
  assert.deepEqual(f.calls, ['wallets', 'bytecode'])
})

for (const scenario of [
  { name: 'zero wallet and Gateway balances', values: {}, status: 'POLYGON_READY_NO_USDC' },
  { name: 'wallet USDC without a deposit', values: { usdc: '1000000' }, status: 'USDC_READY_NOT_DEPOSITED' },
  { name: 'pending Gateway balance without available balance', values: { pending: '1' }, status: 'GATEWAY_PENDING' },
  { name: 'available Gateway balance', values: { available: '1' }, status: 'GATEWAY_READY' },
  { name: 'available balance when a pending balance also exists', values: { available: '1', pending: '2' }, status: 'GATEWAY_READY' },
]) {
  test(`${scenario.name} maps to ${scenario.status}`, async () => {
    const result = await fixture(scenario.values).run()
    assert.equal(result.readinessStatus, scenario.status)
    assert.equal(result.gateway.availableBalanceBaseUnits, scenario.values.available || '0')
    assert.equal(result.gateway.pendingBalanceBaseUnits, scenario.values.pending || '0')
  })
}

test('allowance is informational and does not alter financial readiness', async () => {
  for (const allowance of ['0', '1000000', (2n ** 256n - 1n).toString()]) {
    const result = await fixture({ allowance }).run()
    assert.equal(result.readinessStatus, 'POLYGON_READY_NO_USDC')
    assert.equal(result.polygon.gatewayAllowanceBaseUnits, allowance)
  }
})

test('Arc wallet correlation is exact across ID, address, blockchain and account type', () => {
  for (const changed of [
    { ...arc, id: 'wrong' }, { ...arc, address: `0x${'d'.repeat(40)}` },
    { ...arc, blockchain: 'MATIC-AMOY' }, { ...arc, accountType: 'EOA' },
  ]) {
    assert.throws(() => correlateGatewayWallets([changed, polygon], arc), (error) => error.code === 'ARC_WALLET_MISMATCH')
  }
})

test('multiple qualifying Polygon SCAs fail instead of selecting one', () => {
  const second = { ...polygon, id: 'second', address: `0x${'d'.repeat(40)}` }
  assert.throws(() => correlateGatewayWallets([arc, polygon, second], arc), (error) => error.code === 'AMBIGUOUS_POLYGON_WALLETS')
})

test('Circle wallet failure is UNKNOWN-class provider failure, never wallet missing', async () => {
  await assert.rejects(fixture({ walletError: new Error('timeout') }).run(), (error) => error.code === 'CIRCLE_PROVIDER_UNAVAILABLE' && error.stage === 'circle_wallets')
})

test('an explicit Circle validation error keeps its exact semantics', async () => {
  const error = new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', 'circle_wallets', 502, false)
  await assert.rejects(fixture({ walletError: error }).run(), (actual) => actual === error)
})

test('Polygon bytecode and token RPC failures are UNKNOWN-class errors', async () => {
  await assert.rejects(fixture({ bytecodeError: new Error('rpc') }).run(), (error) => error.code === 'POLYGON_RPC_UNAVAILABLE' && error.stage === 'polygon_bytecode')
  await assert.rejects(fixture({ rpcError: new Error('rpc') }).run(), (error) => error.code === 'POLYGON_RPC_UNAVAILABLE' && error.stage === 'polygon_token_state')
})

test('Gateway failure is UNKNOWN-class error, never zero available', async () => {
  await assert.rejects(fixture({ gatewayError: new Error('timeout') }).run(), (error) => error.code === 'GATEWAY_PROVIDER_UNAVAILABLE' && error.stage === 'gateway_balances')
})

test('missing or malformed required provider values are rejected', async () => {
  for (const values of [{ available: undefined }, { pending: undefined }, { available: '-1' }, { usdc: 'unknown' }]) {
    await assert.rejects(fixture(values).run(), (error) => error.code === 'INVALID_PROVIDER_RESPONSE')
  }
  for (const value of [undefined, '', '-1', '1.0000001', '1,0', 'unknown']) {
    assert.throws(() => parseUsdcBaseUnits(value), (error) => error.code === 'INVALID_PROVIDER_RESPONSE')
  }
  assert.equal(parseUsdcBaseUnits('1'), '1000000')
  assert.equal(parseUsdcBaseUnits('0.000001'), '1')
})

test('success response contains public state but no Circle wallet or internal IDs', async () => {
  const serialized = JSON.stringify(await fixture({ usdc: '2', allowance: '3', available: '4', pending: '5' }).run())
  assert.doesNotMatch(serialized, /arc-wallet-id|polygon-wallet-id|userToken|refreshToken|circleUserId|account_id|encryptionKey/)
  assert.match(serialized, new RegExp(polygon.address, 'i'))
})

test('endpoint is GET-only, identity comes from HttpOnly session, and no state-changing API is present', () => {
  const endpoint = readFileSync(new URL('../server/circle/gateway-readiness-handler.ts', import.meta.url), 'utf8')
  const session = readFileSync(new URL('../api/auth/session.ts', import.meta.url), 'utf8')
  assert.match(endpoint, /req\.method !== 'GET'/)
  assert.match(endpoint, /getGatewayReadOnlyContext\(req\.headers\.cookie\)/)
  assert.match(endpoint, /Cache-Control', 'no-store'/)
  assert.doesNotMatch(endpoint, /req\.body|req\.query/)
  assert.doesNotMatch(endpoint, /refreshCircleUserToken|challenge|provision|\bapprove\b|\bdeposit\s*\(|estimateSpend|\.spend\(|\/v1\/transfer|contractExecution/)
  assert.match(session, /export async function getGatewayReadOnlyContext/)
  assert.match(session, /revoked_at/)
  assert.match(session, /new Date\(session\.expires_at\)\.getTime\(\) <= Date\.now\(\)/)
  const helper = session.slice(session.indexOf('export async function getGatewayReadOnlyContext'), session.indexOf('async function updateCurrentSessionCircleTokens'))
  assert.doesNotMatch(helper, /refreshCircleUserToken|\.update\(|\.insert\(|\.upsert\(/)
})

test('endpoint maps operational and correlation failures to UNKNOWN without raw errors', () => {
  const endpoint = readFileSync(new URL('../server/circle/gateway-readiness-handler.ts', import.meta.url), 'utf8')
  assert.match(endpoint, /readinessStatus: 'UNKNOWN'/)
  assert.match(endpoint, /ACCOUNT_CIRCLE_MISMATCH/)
  assert.match(endpoint, /ARC_WALLET_MISMATCH/)
  assert.doesNotMatch(endpoint, /error\.message|error\.stack/)
  assert.match(endpoint, /includePending: true/)
  assert.match(endpoint, /networkType: 'testnet'/)
  assert.match(endpoint, /pageAfter/)
  assert.match(endpoint, /pageSize: '50'/)
})
