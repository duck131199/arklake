import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import * as crypto from 'node:crypto'
import { stripTypeScriptTypes } from 'node:module'

const source = stripTypeScriptTypes(readFileSync(new URL('../api/circle/swap.ts', import.meta.url), 'utf8'))
const address = `0x${'1'.repeat(40)}`
const txHash = `0x${'2'.repeat(64)}`

async function fixture() {
  const state = { adapterOptions: null, swapCalls: 0, unavailable: false, receipt: null, progress: 'DONE', walletId: 'wallet-1', now: Date.now() }
  const context = vm.createContext({
    Buffer, AbortSignal, setInterval, clearInterval,
    Date: class extends Date { static now() { return state.now } },
    process: { env: { CIRCLE_API_KEY: 'test-secret-not-a-real-key' } },
    fetch: async (url) => ({ ok: true, json: async () => url.includes('/wallets')
      ? { data: { wallets: [{ id: state.walletId, address, blockchain: 'ARC-TESTNET', accountType: 'SCA' }] } }
      : { result: state.receipt } }),
  })
  class SwapKit {
    async estimate(params) {
      assert.equal(params.config.allowanceStrategy, 'approve')
      assert.equal(params.config.slippageBps, 50)
      if (state.unavailable) throw new Error('no liquidity; Authorization: secret must not be exposed')
      return { estimatedOutput: { amount: '0.99' }, stopLimit: { amount: '0.98' }, fees: [] }
    }
    async swap(params) {
      state.swapCalls++
      assert.equal(params.config.stopLimit, '0.98')
      state.adapterOptions.onChallenge({ challengeId: 'challenge-1' })
      state.adapterOptions.onProgress({ stage: 'challenge', status: 'COMPLETE' })
      return { txHash, progress: { status: state.progress }, amountOut: '0.99' }
    }
    async getSwapStatus() { return { progress: { status: state.progress } } }
  }
  const modules = {
    'node:crypto': { createHmac: crypto.createHmac, timingSafeEqual: crypto.timingSafeEqual },
    '@circle-fin/swap-kit': { SwapKit, getChainByEnum: () => ({ type: 'evm', chain: 'Arc_Testnet' }) },
    '@circle-fin/adapter-circle-wallets/ucw/server': { createCircleUserWalletAdapter: async (options) => { state.adapterOptions = options; return {} } },
    '@circle-fin/adapter-viem-v2': { ViemAdapter: class {} },
    viem: { createPublicClient: () => ({}), createWalletClient: () => ({}), http: () => ({}) },
  }
  const module = new vm.SourceTextModule(source, { context })
  await module.link((name) => {
    const exports = modules[name]
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
    }, { context })
  })
  await module.evaluate()
  const call = async (body) => {
    let output = ''
    const res = { statusCode: 200, destroyed: false, writableEnded: false, setHeader() {}, flushHeaders() {}, write(chunk) { output += chunk }, end(chunk = '') { output += chunk; this.writableEnded = true } }
    await module.namespace.default({ method: 'POST', body: { userToken: 'user-token', walletId: state.walletId, walletAddress: address, ...body } }, res)
    return { status: res.statusCode, events: output.trim().split('\n').map((line) => JSON.parse(line)) }
  }
  const quote = async (tokenIn = 'USDC', tokenOut = 'EURC') => (await call({ action: 'quote', tokenIn, tokenOut, amount: '1' })).events[0]
  return { state, call, quote }
}

test('all six directions, including cirBTC, use live estimates without signing auth', async () => {
  const f = await fixture()
  for (const from of ['USDC', 'EURC', 'cirBTC']) for (const to of ['USDC', 'EURC', 'cirBTC']) {
    if (from === to) continue
    const result = await f.call({ action: 'quote', tokenIn: from, tokenOut: to, amount: '1', userToken: undefined })
    assert.ok(result.events[0].quoteToken)
  }
  assert.equal(f.state.adapterOptions, null)
  assert.equal(f.state.swapCalls, 0)
})

test('unavailable quotes are truthful, do not execute, and do not leak upstream secrets', async () => {
  const f = await fixture()
  f.state.unavailable = true
  const result = await f.quote()
  assert.match(result.error, /Live quote unavailable/)
  assert.doesNotMatch(result.error, /Authorization|secret/)
  assert.equal(f.state.swapCalls, 0)
})

test('reject tampered, expired, and different-wallet quotes before executing', async () => {
  const f = await fixture()
  const q = await f.quote()
  assert.match((await f.call({ action: 'execute', quoteToken: `${q.quoteToken}x` })).events[0].error, /Invalid quote/)
  f.state.now += 61000
  assert.match((await f.call({ action: 'execute', quoteToken: q.quoteToken })).events[0].error, /Quote expired/)
  f.state.now -= 61000
  f.state.walletId = 'wallet-2'
  assert.equal((await f.call({ action: 'execute', quoteToken: q.quoteToken })).status, 403)
  assert.equal(f.state.swapCalls, 0)
})

test('challenge COMPLETE and service DONE without a receipt are not confirmation', async () => {
  const f = await fixture()
  const q = await f.quote()
  const { events } = await f.call({ action: 'execute', quoteToken: q.quoteToken })
  assert.ok(events.some((event) => event.status === 'COMPLETE'))
  assert.ok(events.some((event) => event.type === 'pending'))
  assert.ok(!events.some((event) => event.type === 'confirmed'))
})

test('confirm only successful on-chain receipt plus completed swap', async () => {
  const f = await fixture()
  f.state.receipt = { status: '0x1', blockNumber: '0x123' }
  const q = await f.quote()
  assert.ok((await f.call({ action: 'execute', quoteToken: q.quoteToken })).events.some((event) => event.type === 'confirmed'))
  f.state.progress = 'PENDING'
  assert.equal((await f.call({ action: 'status', txHash })).events[0].confirmed, false)
  f.state.receipt.status = '0x0'
  assert.equal((await f.call({ action: 'status', txHash })).events[0].failed, true)
})
