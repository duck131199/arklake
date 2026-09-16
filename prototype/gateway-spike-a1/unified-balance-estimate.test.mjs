import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { prepareUnifiedBalanceEstimate, estimateOnlyAdapter } from './unified-balance-estimate.mjs'
import { EXPECTED_ARC_SCA, POLYGON_GATEWAY_WALLET, POLYGON_GATEWAY_WALLET_ID } from './gateway-burn-intent.mjs'

function fixture(overrides = {}) {
  const calls = []
  const wallets = [
    { id: '71fff6e2-72b7-5deb-be54-fa204b6a4df3', address: EXPECTED_ARC_SCA, blockchain: 'ARC-TESTNET', accountType: 'SCA' },
    { id: POLYGON_GATEWAY_WALLET_ID, address: POLYGON_GATEWAY_WALLET, blockchain: 'MATIC-AMOY', accountType: 'SCA' },
    { id: 'unused', address: '0x9fe1c42d082ef97cf127107dcec500ad2ce900d2', blockchain: 'MATIC-AMOY', accountType: 'EOA' },
  ]
  return { calls, options: {
    listWallets: async () => wallets,
    readPolygonBytecode: async () => { calls.push('bytecode'); return '0x6000' },
    readGatewayBalance: async () => { calls.push('gateway'); return '2.000000' },
    readArcBalance: async () => { calls.push('arc'); return '1234567' },
    createAdapter: async (options) => { calls.push(options); return {} },
    createKit: () => ({ unifiedBalance: {
      estimateSpend: async (params) => { calls.push(params); return { fees: [{ type: 'provider', token: 'USDC', amount: '0.00005', allocations: [{ chain: 'Polygon_Amoy_Testnet', amount: '0.00005' }] }, { type: 'gasFee', token: 'USDC', amount: '0.0015' }], signature: 'must-not-surface', userToken: 'must-not-surface' } },
      spend: () => assert.fail('Real spend is forbidden'),
    } }),
    ...overrides,
  } }
}

test('A4 reads live state and estimates exact two-SCA route without spend or secrets', async () => {
  const { calls, options } = fixture()
  const result = await prepareUnifiedBalanceEstimate(options)
  const adapterOptions = calls[3]
  assert.deepEqual(adapterOptions.wallets.map((wallet) => wallet.address), [POLYGON_GATEWAY_WALLET, EXPECTED_ARC_SCA])
  const params = calls[4]
  assert.deepEqual(params.from.allocations, [{ amount: '1', chain: 'Polygon_Amoy_Testnet' }])
  assert.equal(params.amount, '1')
  assert.equal(params.from.allocations.reduce((total, allocation) => total + Number(allocation.amount), 0), Number(params.amount))
  assert.equal(params.to.chain, 'Arc_Testnet')
  assert.equal(params.to.recipientAddress, EXPECTED_ARC_SCA)
  assert.equal(params.to.useForwarder, false)
  assert.equal(params.token, 'USDC')
  assert.equal(result.requiredGatewayBaseUnits, '1001550')
  assert.equal(result.success, true)
  assert.equal(result.spendEnabled, false)
  assert.equal(result.gatewayTransferSubmitted, false)
  assert.equal(result.expiration, null)
  assert.doesNotMatch(JSON.stringify(result), /must-not-surface/)
  assert.throws(() => adapterOptions.onChallenge({ challengeId: 'unexpected' }), /STOP/)
})

test('wrong user, wrong account type and absent/unreadable bytecode stop before Kit', async () => {
  for (const overrides of [
    { listWallets: async () => [] },
    { listWallets: async () => [{ address: EXPECTED_ARC_SCA, blockchain: 'ARC-TESTNET', accountType: 'EOA' }] },
    { readPolygonBytecode: async () => '0x' },
    { readPolygonBytecode: async () => { throw new Error('RPC unavailable') } },
  ]) {
    const { options } = fixture({ ...overrides, createAdapter: () => assert.fail('Adapter must not be created') })
    await assert.rejects(prepareUnifiedBalanceEstimate(options))
  }
})

test('fresh Gateway balance must cover amount plus actual fees', async () => {
  const { options } = fixture({ readGatewayBalance: async () => '1.000000' })
  const result = await prepareUnifiedBalanceEstimate(options)
  assert.equal(result.success, false)
  assert.match(result.error, /plus estimated fees/)
  const low = fixture({ readGatewayBalance: async () => '0.999999', createAdapter: () => assert.fail('Below amount') })
  await assert.rejects(prepareUnifiedBalanceEstimate(low.options), /below 1 USDC/)
})

test('estimate-only adapter blocks signing before Circle and mutating execution', async () => {
  let prepares = 0
  const adapter = estimateOnlyAdapter({
    prepareAction: async () => { prepares++; return { estimate: async () => 'gas', execute: () => assert.fail('Transaction execution') } },
    readAction: () => assert.fail('Signing read must not reach Circle'),
  })
  await assert.rejects(adapter.prepareAction('gateway.v1.signBurnIntents'), /STOP/)
  assert.throws(() => adapter.readAction('gateway.v1.signBurnIntents'), /STOP/)
  assert.equal(prepares, 0)
  const mint = await adapter.prepareAction('gateway.v1.mint')
  assert.equal(await mint.estimate(), 'gas')
  assert.throws(() => mint.execute(), /STOP/)
})

test('malformed fees and unexpected source/Forwarder are rejected', async () => {
  for (const fees of [null, [{ type: 'gasFee', token: 'USDC', amount: 'bad' }], [{ type: 'forwarder', token: 'USDC', amount: '1' }], [{ type: 'gasFee', token: 'USDC', amount: '0.1', allocations: [{ chain: 'Ethereum', amount: '0.1' }] }]]) {
    const { options } = fixture({ createKit: () => ({ unifiedBalance: { estimateSpend: async () => ({ fees }) } }) })
    await assert.rejects(prepareUnifiedBalanceEstimate(options))
  }
})

test('A4 preflight uses Kit estimate and spend is isolated behind explicit route', () => {
  const server = readFileSync(new URL('./server.mjs', import.meta.url), 'utf8')
  const route = server.split("req.url === '/gateway-a1-api/a4-estimate'")[1].split("req.url === '/gateway-a1-api/a2-provision'")[0]
  assert.match(route, /new AppKit\(\)/)
  assert.doesNotMatch(route, /\/v1\/transfer|signatures\.create|a3-prepare|gatewayEstimate\(/)
  const browser = readFileSync(new URL('./browser-runner.js', import.meta.url), 'utf8')
  assert.match(browser, /\$\('a4-spend'\)\.addEventListener/)
  assert.match(server, /req\.url === '\/gateway-a1-api\/a4-spend'/)
})
