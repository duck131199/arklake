import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { A4SpendOperation, a4SpendParams, executeA4Spend, sanitizeSpendResult } from './unified-balance-spend.mjs'
import { EXPECTED_ARC_SCA, POLYGON_GATEWAY_WALLET, POLYGON_GATEWAY_WALLET_ID } from './gateway-burn-intent.mjs'

const wallets = [
  { id: POLYGON_GATEWAY_WALLET_ID, address: POLYGON_GATEWAY_WALLET, blockchain: 'MATIC-AMOY', accountType: 'SCA' },
  { id: 'arc', address: EXPECTED_ARC_SCA, blockchain: 'ARC-TESTNET', accountType: 'SCA' },
]
function estimateDependencies() {
  return {
    listWallets: async () => wallets, readPolygonBytecode: async () => '0x6000', readGatewayBalance: async () => '2.000000', readArcBalance: async () => '1000000',
    createAdapter: async () => ({}), apiKey: 'mock', userToken: 'mock', rpcUrls: {},
    createKit: () => ({ unifiedBalance: { estimateSpend: async () => ({ fees: [{ type: 'provider', token: 'USDC', amount: '0.00005' }, { type: 'gasFee', token: 'USDC', amount: '0.0016' }] }) } }),
  }
}

test('A4.2b calls Kit spend once with exact route and verifies receipt plus deltas', async () => {
  let spends = 0
  const operation = new A4SpendOperation('owner', 'operation')
  operation.start()
  await executeA4Spend({
    operation, estimateDependencies: estimateDependencies(),
    createAdapter: async () => ({ exact: true }),
    createKit: () => ({ unifiedBalance: { spend: async (params) => {
      spends++
      assert.deepEqual(a4SpendParams(params.from.adapter), params)
      return { destinationChain: 'Arc_Testnet', recipientAddress: EXPECTED_ARC_SCA, txHash: `0x${'1'.repeat(64)}`, allocations: params.from.allocations, fees: [], steps: [{ name: 'mint', state: 'success', data: { signature: 'secret' } }] }
    } } }),
    adapterOptions: {}, readGatewayBalance: async () => '0.998350', readArcBalance: async () => '2000000', readReceipt: async () => ({ status: 'success' }),
  })
  assert.equal(spends, 1)
  assert.equal(operation.state, 'COMPLETED')
  assert.equal(operation.result.arcDeltaBaseUnits, '1000000')
  assert.equal(operation.result.gatewayDeltaBaseUnits, '-1001650')
  assert.doesNotMatch(JSON.stringify(operation.public()), /secret/)
})

test('operation lock forbids a second application spend and challenge signatures are correlated', async () => {
  const operation = new A4SpendOperation('owner', 'id')
  operation.start()
  assert.throws(() => operation.start(), /already locked/)
  operation.addChallenge({ challengeId: 'typed', intent: { step: 'burn' } })
  const waiting = operation.waitForSignature({ challengeId: 'typed' })
  const signature = `0x${'ab'.repeat(65)}`
  operation.resolve('typed', signature)
  assert.equal(await waiting, signature)
  assert.throws(() => operation.resolve('wrong', signature), /No matching/)
})

test('signature relay buffers a browser result that arrives before the adapter waiter', async () => {
  const operation = new A4SpendOperation('owner', 'id')
  const signature = `0x${'cd'.repeat(65)}`
  operation.addChallenge({ challengeId: 'fast', intent: { step: 'burn' } })
  operation.resolve('fast', signature)
  assert.equal(await operation.waitForSignature({ challengeId: 'fast' }), signature)
})

test('sanitized result drops step data, signatures and unknown fields', () => {
  const clean = sanitizeSpendResult({ destinationChain: 'Arc_Testnet', recipientAddress: EXPECTED_ARC_SCA, txHash: `0x${'2'.repeat(64)}`, steps: [{ name: 'signBurnIntents', state: 'success', data: { signature: 'private' }, unknown: 'no' }], signature: 'private' })
  assert.doesNotMatch(JSON.stringify(clean), /private|unknown/)
})

test('A4.2b route uses Kit only, retains provider defaults and has no application retry', () => {
  const server = readFileSync(new URL('./server.mjs', import.meta.url), 'utf8')
  const route = server.split("req.url === '/gateway-a1-api/a4-spend'")[1].split("req.url === '/gateway-a1-api/a4-status'")[0]
  assert.match(route, /executeA4Spend/)
  assert.doesNotMatch(route, /gatewayTransferRequest|GATEWAY_TRANSFER_ENDPOINT|requestConfig|maxRetries|polygonEoa/)
  const module = readFileSync(new URL('./unified-balance-spend.mjs', import.meta.url), 'utf8')
  assert.equal((module.match(/\.unifiedBalance\.spend\(/g) || []).length, 1)
  assert.doesNotMatch(module, /\/v1\/transfer|addDelegate|requestConfig|maxRetries/)
})
