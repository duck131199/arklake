import test from 'node:test'
import assert from 'node:assert/strict'
import { arklakeInvoicePaymentV2Address } from '../server/invoice-payment-contract.ts'
import { buildServerModules } from './server-module-fixture.mjs'

const built = buildServerModules(['src/external-wallet.ts', 'server/invoice-payment-contract.ts'])
const { arcTestnetChainIdHex, arcTestnetUsdcAddress, connectExternalWallet, externalUsdcAmount, readExternalUsdcBalance, submitExternalInvoicePayment, submitExternalUsdcPayment, switchExternalWalletToArc } = await built.import('src/external-wallet.js')

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

test('Connect Wallet prefers one atomic V2 approve and pay batch', async () => {
  const calls = []
  const txHash = `0x${'b'.repeat(64)}`
  const provider = { request: async (request) => {
    calls.push(request)
    if (request.method === 'eth_chainId') return arcTestnetChainIdHex
    if (request.method === 'eth_accounts') return [address]
    if (request.method === 'wallet_getCapabilities') return { [arcTestnetChainIdHex]: { atomic: { status: 'supported' } } }
    if (request.method === 'wallet_sendCalls') return txHash
    throw new Error(`unexpected ${request.method}`)
  } }
  const result = await submitExternalInvoicePayment({ provider, payer: address, recipient, amount: '1.25', invoiceNumber: 'ARK-20260913-TEST0001', memo: 'Thanks Miley' })
  assert.deepEqual(result, { txHash, mode: 'atomic' })
  const batch = calls.find(({ method }) => method === 'wallet_sendCalls').params[0]
  assert.equal(batch.calls.length, 2)
  assert.equal(batch.calls[0].to.toLowerCase(), arcTestnetUsdcAddress.toLowerCase())
  assert.match(batch.calls[0].data, /^0x095ea7b3/)
  assert.equal(batch.calls[1].to.toLowerCase(), arklakeInvoicePaymentV2Address)
  assert.match(batch.calls[1].data, /^0x/)
})

test('Connect Wallet falls back only from unsupported atomic calls to sequential approve then V2 pay', async () => {
  const calls = []
  const approveHash = `0x${'c'.repeat(64)}`
  const payHash = `0x${'d'.repeat(64)}`
  const provider = { request: async (request) => {
    calls.push(request)
    if (request.method === 'eth_chainId') return arcTestnetChainIdHex
    if (request.method === 'eth_accounts') return [address]
    if (request.method === 'wallet_getCapabilities') return {}
    if (request.method === 'eth_getTransactionReceipt') return { status: '0x1' }
    if (request.method === 'eth_sendTransaction') return calls.filter(({ method }) => method === 'eth_sendTransaction').length === 1 ? approveHash : payHash
    throw new Error(`unexpected ${request.method}`)
  } }
  const result = await submitExternalInvoicePayment({ provider, payer: address, recipient, amount: '0.01', invoiceNumber: 'ARK-20260913-TEST0002', memo: '', pollMs: 0, attempts: 1 })
  assert.deepEqual(result, { txHash: payHash, mode: 'sequential', approveTxHash: approveHash })
  const transactions = calls.filter(({ method }) => method === 'eth_sendTransaction').map(({ params }) => params[0])
  assert.equal(transactions.length, 2)
  assert.equal(transactions[0].to.toLowerCase(), arcTestnetUsdcAddress.toLowerCase())
  assert.equal(transactions[1].to.toLowerCase(), arklakeInvoicePaymentV2Address)
})

test('Connect Wallet does not fall back after rejection and rejects Memo above 64 UTF-8 bytes before submission', async () => {
  const methods = []
  const rejectedProvider = { request: async ({ method }) => {
    methods.push(method)
    if (method === 'eth_chainId') return arcTestnetChainIdHex
    if (method === 'eth_accounts') return [address]
    if (method === 'wallet_getCapabilities') return { [arcTestnetChainIdHex]: { atomic: { status: 'supported' } } }
    throw Object.assign(new Error('User rejected'), { code: 4001 })
  } }
  await assert.rejects(submitExternalInvoicePayment({ provider: rejectedProvider, payer: address, recipient, amount: '1', invoiceNumber: 'ARK-TEST', memo: '' }), /User rejected/)
  assert.equal(methods.filter((method) => method === 'eth_sendTransaction').length, 0)

  const longMemoMethods = []
  const longMemoProvider = { request: async ({ method }) => {
    longMemoMethods.push(method)
    if (method === 'eth_chainId') return arcTestnetChainIdHex
    if (method === 'eth_accounts') return [address]
    throw new Error('unexpected')
  } }
  await assert.rejects(submitExternalInvoicePayment({ provider: longMemoProvider, payer: address, recipient, amount: '1', invoiceNumber: 'ARK-TEST', memo: 'é'.repeat(33) }), /64-byte/)
  assert.equal(longMemoMethods.includes('wallet_sendCalls'), false)
  assert.equal(longMemoMethods.includes('eth_sendTransaction'), false)
})
