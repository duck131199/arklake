import test from 'node:test'
import assert from 'node:assert/strict'
import { arcTestnetChainIdHex, arcTestnetUsdcAddress, connectExternalWallet, externalUsdcAmount, readExternalUsdcBalance, submitExternalUsdcPayment, switchExternalWalletToArc } from '../src/external-wallet.ts'

const address = '0x1111111111111111111111111111111111111111'
const recipient = '0x2222222222222222222222222222222222222222'

test('connect reads the injected account and current chain without submitting', async () => {
  const calls = []
  const provider = { request: async (request) => {
    calls.push(request)
    return request.method === 'eth_requestAccounts' ? [address] : arcTestnetChainIdHex
  } }
  assert.deepEqual(await connectExternalWallet(provider), { address, chainId: arcTestnetChainIdHex })
  assert.deepEqual(calls.map(({ method }) => method), ['eth_requestAccounts', 'eth_chainId'])
})

test('wrong-network recovery requests Arc Testnet explicitly', async () => {
  const calls = []
  await switchExternalWalletToArc({ request: async (request) => { calls.push(request); return null } })
  assert.equal(calls[0].method, 'wallet_switchEthereumChain')
  assert.equal(calls[0].params[0].chainId, '0x4cef52')
})

test('never submits when the provider is on another chain', async () => {
  const methods = []
  const provider = { request: async ({ method }) => {
    methods.push(method)
    if (method === 'eth_chainId') return '0x1'
    if (method === 'eth_accounts') return [address]
    throw new Error('unexpected request')
  } }
  await assert.rejects(submitExternalUsdcPayment(provider, address, recipient, '1'), /Switch to Arc Testnet/)
  assert.doesNotMatch(methods.join(','), /eth_sendTransaction/)
})

test('reads canonical Arc Testnet USDC and submits an exact immutable transfer', async () => {
  const calls = []
  const provider = { request: async (request) => {
    calls.push(request)
    if (request.method === 'eth_call') return `0x${externalUsdcAmount('34.335482').toString(16).padStart(64, '0')}`
    if (request.method === 'eth_chainId') return arcTestnetChainIdHex
    if (request.method === 'eth_accounts') return [address]
    return `0x${'a'.repeat(64)}`
  } }
  assert.equal((await readExternalUsdcBalance(provider, address)).amount, '34.335482')
  const hash = await submitExternalUsdcPayment(provider, address, recipient, '1.25')
  assert.equal(hash, `0x${'a'.repeat(64)}`)
  const transaction = calls.find(({ method }) => method === 'eth_sendTransaction').params[0]
  assert.equal(transaction.from, address)
  assert.equal(transaction.to.toLowerCase(), arcTestnetUsdcAddress.toLowerCase())
  assert.match(transaction.data, /^0xa9059cbb/)
  assert.ok(transaction.data.toLowerCase().includes(recipient.slice(2).toLowerCase()))
  assert.ok(transaction.data.endsWith(externalUsdcAmount('1.25').toString(16).padStart(64, '0')))
})
