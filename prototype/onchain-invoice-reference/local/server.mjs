import { createServer as createViteServer, loadEnv } from 'vite'
import { createPublicClient, encodeFunctionData, http } from 'viem'
import { defineChain } from 'viem/utils'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { join } from 'node:path'
import { ARC_MEMO_FIXTURE, arcMemoOperation, transferCallData, transferCallDataHash } from './arc-memo-operation.mjs'

const repoRoot = new URL('../../../', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1))
const localRoot = new URL('./', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1))
const fileEnv = loadEnv('development', repoRoot, '')
const env = { ...fileEnv, ...process.env }

const PORT = 3000
const CIRCLE_API_BASE = 'https://api.circle.com/v1/w3s'
const RPC_URL = env.ARC_TESTNET_RPC_URL || 'https://rpc.testnet.arc.network'
const APP_ID = env.VITE_CIRCLE_APP_ID || env.CIRCLE_APP_ID
const API_KEY = env.CIRCLE_API_KEY

const EXPECTED = Object.freeze({
  blockchain: 'ARC-TESTNET',
  chainId: 5042002,
  walletId: '71fff6e2-72b7-5deb-be54-fa204b6a4df3',
  payer: '0xd94074edb1da4c98959d455172beb58e4400324f',
  recipient: '0xfe7b60284682c530f4f03b0954aa459ab193bac8',
  usdc: '0x3600000000000000000000000000000000000000',
  prototype: '0x7ef8d661e800ec959daaae67a8bd4faaae3a43d7',
  amount: '10000',
  paymentReference: 'ARK-PROTOTYPE-V2-001',
  referenceHash: '0x747ff9c6482affdb30ada4d6903d41e15fe5a82d8fcbb5605329f3f91ddd24f6',
  memo: 'Thanks Miley',
})

const arcTestnet = defineChain({
  id: EXPECTED.chainId,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
})
const publicClient = createPublicClient({ chain: arcTestnet, transport: http(RPC_URL) })
const allowanceAbi = [{
  type: 'function', name: 'allowance', stateMutability: 'view',
  inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }],
}]
const approveAbi = [{
  type: 'function', name: 'approve', stateMutability: 'nonpayable',
  inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ name: '', type: 'bool' }],
}]
const payAbi = [{
  type: 'function', name: 'pay', stateMutability: 'nonpayable',
  inputs: [
    { name: 'recipient', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'paymentReference', type: 'string' },
    { name: 'memo', type: 'string' },
  ],
  outputs: [],
}]

const approveCallData = encodeFunctionData({
  abi: approveAbi,
  functionName: 'approve',
  args: [EXPECTED.prototype, BigInt(EXPECTED.amount)],
})
const payCallData = encodeFunctionData({
  abi: payAbi,
  functionName: 'pay',
  args: [EXPECTED.recipient, BigInt(EXPECTED.amount), EXPECTED.paymentReference, EXPECTED.memo],
})

const operations = Object.freeze({
  approve: {
    contractAddress: EXPECTED.usdc,
    abiFunctionSignature: 'approve(address,uint256)',
    abiParameters: [EXPECTED.prototype, EXPECTED.amount],
  },
  pay: {
    contractAddress: EXPECTED.prototype,
    abiFunctionSignature: 'pay(address,uint256,string,string)',
    abiParameters: [EXPECTED.recipient, EXPECTED.amount, EXPECTED.paymentReference, EXPECTED.memo],
  },
  batch: {
    contractAddress: EXPECTED.payer,
    abiFunctionSignature: 'executeBatch((address,uint256,bytes)[])',
    abiParameters: [[
      [EXPECTED.usdc, '0', approveCallData],
      [EXPECTED.prototype, '0', payCallData],
    ]],
  },
  memo: arcMemoOperation,
})

const challengeCache = new Map()

function json(res, status, value) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(value))
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > 16_384) throw new Error('Request body too large.')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

function userToken(body) {
  const value = typeof body?.userToken === 'string' ? body.userToken : ''
  if (!value) {
    const error = new Error('Circle user authentication is required.')
    error.status = 401
    throw error
  }
  return value
}

async function circle(path, token, init = {}) {
  const headers = {
    accept: 'application/json',
    Authorization: `Bearer ${API_KEY}`,
    ...(token ? { 'X-User-Token': token } : {}),
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(init.headers || {}),
  }
  const response = await fetch(`${CIRCLE_API_BASE}${path}`, {
    ...init,
    headers,
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = payload?.message || payload?.error || `Circle request failed (${response.status}).`
    const error = new Error(message)
    error.status = response.status
    throw error
  }
  return payload
}

async function assertExpectedWallet(token) {
  const payload = await circle('/wallets', token)
  const wallet = payload?.data?.wallets?.find((candidate) => candidate?.id === EXPECTED.walletId)
  if (!wallet || wallet.blockchain !== EXPECTED.blockchain || wallet.accountType !== 'SCA'
    || String(wallet.address).toLowerCase() !== EXPECTED.payer) {
    throw new Error('Authenticated Circle user does not own the fixed prototype payer wallet.')
  }
}

async function currentAllowance() {
  return publicClient.readContract({
    address: EXPECTED.usdc,
    abi: allowanceAbi,
    functionName: 'allowance',
    args: [EXPECTED.payer, EXPECTED.prototype.toLowerCase()],
  })
}

async function apiMiddleware(req, res, next) {
  if (!req.url?.startsWith('/prototype-api/')) return next()
  if (!APP_ID || !API_KEY) return json(res, 500, { error: 'Runner is missing Circle configuration.' })

  try {
    if (req.method === 'GET' && req.url === '/prototype-api/config') {
      const allowance = await currentAllowance()
      return json(res, 200, {
        appId: APP_ID,
        expected: EXPECTED,
        arcMemo: { ...ARC_MEMO_FIXTURE, transferCallData, transferCallDataHash },
        allowance: allowance.toString(),
      })
    }

    if (req.method === 'POST' && req.url === '/prototype-api/otp') {
      const body = await readJson(req)
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : ''
      if (!deviceId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: 'Valid email and deviceId are required.' })
      const payload = await circle('/users/email/token', '', {
        method: 'POST',
        headers: { 'X-Request-Id': crypto.randomUUID() },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), deviceId, email }),
      })
      const { deviceToken, deviceEncryptionKey, otpToken } = payload?.data || {}
      if (![deviceToken, deviceEncryptionKey, otpToken].every((value) => typeof value === 'string' && value)) throw new Error('Circle OTP response was incomplete.')
      return json(res, 200, { deviceToken, deviceEncryptionKey, otpToken })
    }

    if (req.method === 'POST' && req.url === '/prototype-api/challenge') {
      const body = await readJson(req)
      const operation = typeof body.operation === 'string' ? body.operation : ''
      if (!(operation in operations)) return json(res, 400, { error: 'Only fixed prototype operations are allowed.' })
      const token = userToken(body)
      await assertExpectedWallet(token)

      const allowance = await currentAllowance()
      if (operation === 'pay' && allowance < BigInt(EXPECTED.amount)) {
        return json(res, 409, { error: 'Exact USDC allowance is not available yet.', allowance: allowance.toString() })
      }
      const cached = challengeCache.get(operation)
      if (cached) return json(res, 200, cached)

      const call = operations[operation]
      const payload = await circle('/user/transactions/contractExecution', token, {
        method: 'POST',
        headers: { 'X-Request-Id': crypto.randomUUID() },
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          walletId: EXPECTED.walletId,
          contractAddress: call.contractAddress,
          abiFunctionSignature: call.abiFunctionSignature,
          abiParameters: call.abiParameters,
          feeLevel: 'MEDIUM',
        }),
      })
      const challengeId = payload?.data?.challengeId
      if (typeof challengeId !== 'string' || !challengeId) throw new Error('Circle did not return a challengeId.')
      const result = { operation, challengeId, status: 'challenge created' }
      challengeCache.set(operation, result)
      return json(res, 201, result)
    }

    if (req.method === 'POST' && req.url === '/prototype-api/recovery') {
      const body = await readJson(req)
      const token = userToken(body)
      const challengeId = typeof body.challengeId === 'string' ? body.challengeId : ''
      if (!challengeId || ![...challengeCache.values()].some((item) => item.challengeId === challengeId)) {
        return json(res, 400, { error: 'Unknown prototype challenge.' })
      }
      await assertExpectedWallet(token)
      const challengePayload = await circle(`/user/challenges/${encodeURIComponent(challengeId)}`, token)
      const challenge = challengePayload?.data?.challenge
      const correlationIds = Array.isArray(challenge?.correlationIds) ? challenge.correlationIds : []
      const transactionId = correlationIds.find((value) => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)) || null
      if (!transactionId) return json(res, 200, { challengeId, challengeStatus: challenge?.status || 'PENDING', transactionId: null, txHash: null, state: 'PENDING' })
      const transactionPayload = await circle(`/transactions/${encodeURIComponent(transactionId)}`, token)
      const transaction = transactionPayload?.data?.transaction
      if (!transaction || transaction.id !== transactionId || transaction.walletId !== EXPECTED.walletId) throw new Error('Circle returned a mismatched prototype transaction.')
      return json(res, 200, {
        challengeId,
        challengeStatus: challenge?.status || null,
        transactionId,
        txHash: transaction.txHash || null,
        state: transaction.state || null,
        errorReason: transaction.errorReason || null,
      })
    }

    return json(res, 404, { error: 'Prototype endpoint not found.' })
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500
    return json(res, status, { error: error instanceof Error ? error.message : 'Prototype runner failed.' })
  }
}

const vite = await createViteServer({
  root: localRoot,
  cacheDir: join(repoRoot, 'node_modules', '.vite-prototype-runner'),
  optimizeDeps: { force: true },
  server: { host: '127.0.0.1', port: PORT, strictPort: true },
  plugins: [
    nodePolyfills({ globals: { process: true } }),
    { name: 'prototype-circle-api', configureServer(server) { server.middlewares.use(apiMiddleware) } },
  ],
})

await vite.listen()
console.log(`Prototype runner ready at http://localhost:${PORT}`)
