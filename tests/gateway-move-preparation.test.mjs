import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GATEWAY_MOVE_ESTIMATE_TTL_MS,
  estimateOnlyGatewayAdapter,
  parseGatewayMoveAmount,
  prepareGatewayMoveEstimate,
  sanitizeGatewayMoveFees,
} from '../server/circle/gateway-move-preparation.ts'

const arc = { id: 'arc-wallet', address: `0x${'a'.repeat(40)}`, blockchain: 'ARC-TESTNET', accountType: 'SCA' }
const polygon = { id: 'polygon-wallet', address: `0x${'b'.repeat(40)}`, blockchain: 'MATIC-AMOY', accountType: 'SCA' }
const accountId = '11111111-1111-4111-8111-111111111111'
const preparationKey = '22222222-2222-4222-8222-222222222222'

function fixture(overrides = {}) {
  const calls = []
  const dependencies = {
    accountId, preparationKey, amount: '1', apiKey: 'test-api-key', userToken: 'test-user-token',
    arcWallet: arc, wallets: [arc, polygon],
    readiness: {
      readinessStatus: 'GATEWAY_READY',
      polygon: { walletFound: true, address: polygon.address, bytecodeDetected: true },
      gateway: { availableBalanceBaseUnits: '2000000', pendingBalanceBaseUnits: '0' },
    },
    rpcUrls: { 5042002: 'https://arc.invalid', 80002: 'https://polygon.invalid' },
    createAdapter: async (options) => { calls.push({ type: 'adapter', options }); return {} },
    createKit: () => ({ unifiedBalance: {
      estimateSpend: async (params) => {
        calls.push({ type: 'estimate', params })
        return { fees: [
          { type: 'provider', token: 'USDC', amount: '0.00005', allocations: [{ chain: 'Polygon_Amoy_Testnet', amount: '0.00005' }] },
          { type: 'gasFee', token: 'USDC', amount: '0.0016', allocations: [{ chain: 'Polygon_Amoy_Testnet', amount: '0.0016' }] },
        ] }
      },
      spend: () => assert.fail('spend is forbidden'),
    } }),
    readArcBalance: async () => '243626785',
    now: () => new Date('2026-09-20T00:00:00.000Z'),
    ...overrides,
  }
  return { calls, dependencies }
}

test('prepares the exact server-owned route and trusted estimate snapshot', async () => {
  const { calls, dependencies } = fixture()
  const result = await prepareGatewayMoveEstimate(dependencies)
  assert.equal(result.createInput.status, 'AWAITING_CONFIRMATION')
  assert.equal(result.createInput.amountBaseUnits, '1000000')
  assert.equal(result.createInput.requiredBaseUnits, '1001650')
  assert.equal(result.createInput.gatewayBeforeBaseUnits, '2000000')
  assert.equal(result.createInput.arcBeforeBaseUnits, '243626785')
  assert.equal(result.createInput.sourceWalletId, polygon.id)
  assert.equal(result.createInput.destinationWalletId, arc.id)
  assert.equal(result.estimateExpiresAt, '2026-09-20T00:01:00.000Z')
  assert.equal(GATEWAY_MOVE_ESTIMATE_TTL_MS, 60_000)
  const adapter = calls.find((call) => call.type === 'adapter').options
  assert.deepEqual(adapter.wallets, [polygon, arc])
  assert.throws(() => adapter.onChallenge({ challengeId: 'forbidden' }), /SIGNING_NOT_ALLOWED/)
  const params = calls.find((call) => call.type === 'estimate').params
  assert.equal(params.amount, '1')
  assert.deepEqual(params.from.allocations, [{ amount: '1', chain: 'Polygon_Amoy_Testnet' }])
  assert.equal(params.to.chain, 'Arc_Testnet')
  assert.equal(params.to.recipientAddress, arc.address)
  assert.equal(params.to.useForwarder, false)
  assert.equal(params.token, 'USDC')
})

test('amount validation is canonical and base-unit exact', () => {
  assert.deepEqual(parseGatewayMoveAmount('1.230000'), { amount: '1.23', amountBaseUnits: '1230000' })
  assert.deepEqual(parseGatewayMoveAmount('0.000001'), { amount: '0.000001', amountBaseUnits: '1' })
  for (const invalid of [undefined, 1, '', '0', '-1', '1,0', ' 1', '1 ', '1e2', '01', '1.0000001']) {
    assert.throws(() => parseGatewayMoveAmount(invalid), /INVALID_AMOUNT/)
  }
})

test('estimate-only adapter blocks signing and mutating execution', async () => {
  let prepared = 0
  const adapter = estimateOnlyGatewayAdapter({
    prepareAction: async () => { prepared++; return { estimate: async () => 'ok', execute: () => assert.fail('execute') } },
    readAction: () => assert.fail('unsupported read'),
  })
  await assert.rejects(adapter.prepareAction('gateway.v1.signBurnIntents'), /SIGNING_NOT_ALLOWED/)
  assert.throws(() => adapter.readAction('gateway.v1.signBurnIntents'), /SIGNING_NOT_ALLOWED/)
  assert.equal(prepared, 0)
  const mint = await adapter.prepareAction('gateway.v1.mint')
  assert.equal(await mint.estimate(), 'ok')
  assert.throws(() => mint.execute(), /SIGNING_NOT_ALLOWED/)
})

test('unsupported fees, forwarder fees and inconsistent allocations fail closed', () => {
  for (const fees of [
    null,
    [{ type: 'forwarder', token: 'USDC', amount: '0.1' }],
    [{ type: 'gasFee', token: 'ETH', amount: '0.1' }],
    [{ type: 'gasFee', token: 'USDC', amount: 'bad' }],
    [{ type: 'gasFee', token: 'USDC', amount: '0.1', allocations: [{ chain: 'Ethereum', amount: '0.1' }] }],
    [{ type: 'gasFee', token: 'USDC', amount: '0.1', allocations: [{ chain: 'Polygon_Amoy_Testnet', amount: '0.01' }] }],
  ]) assert.throws(() => sanitizeGatewayMoveFees(fees), /INVALID_PROVIDER_RESPONSE/)
})

test('wallet, readiness, balance and provider guards stop before persistence', async () => {
  for (const overrides of [
    { wallets: [arc] },
    { readiness: { readinessStatus: 'POLYGON_SCA_UNDEPLOYED', polygon: { walletFound: true, address: polygon.address, bytecodeDetected: false }, gateway: null } },
    { readiness: { readinessStatus: 'GATEWAY_PENDING', polygon: { walletFound: true, address: polygon.address, bytecodeDetected: true }, gateway: { availableBalanceBaseUnits: '0', pendingBalanceBaseUnits: '1' } } },
    { readiness: { readinessStatus: 'GATEWAY_READY', polygon: { walletFound: true, address: polygon.address, bytecodeDetected: true }, gateway: { availableBalanceBaseUnits: '1000000', pendingBalanceBaseUnits: '0' } } },
  ]) {
    const { dependencies } = fixture(overrides)
    await assert.rejects(prepareGatewayMoveEstimate(dependencies))
  }
})
