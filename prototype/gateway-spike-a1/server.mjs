import { createServer as createViteServer, loadEnv } from 'vite'
import { createHash } from 'node:crypto'
import { createPublicClient, http } from 'viem'
import { defineChain } from 'viem/utils'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { createCircleUserWalletAdapter } from '@circle-fin/adapter-circle-wallets/ucw/server'
import { AppKit } from '@circle-fin/app-kit'
import { prepareUnifiedBalanceEstimate } from './unified-balance-estimate.mjs'
import { A4SpendOperation, classifySpendError, executeA4Spend } from './unified-balance-spend.mjs'
import { ARC_TESTNET, EXPECTED_ARC_SCA, GATEWAY_ESTIMATE_ENDPOINT, GATEWAY_TRANSFER_ENDPOINT, POLYGON_AMOY, SignatureRequestRegistry, buildGatewayBurnIntent, createGatewayDepositChallenge, discoverA2Wallets, gatewayEstimateNetworkDiagnostic, parseUsdcDecimalToBaseUnits, preparePolygonToArcTransfer, provisionPolygonEoa, provisionPolygonWallet, requireGatewayPolygonWallet, sanitizeGatewayTransferResponse, sanitizeGatewayTransferStatus, submitPreparedGatewayTransfer } from './gateway-burn-intent.mjs'

const repoRoot = new URL('../../', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1))
const localRoot = new URL('./', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1))
const env = { ...loadEnv('development', repoRoot, ''), ...process.env }
const PORT = 3001
const CIRCLE_API_BASE = 'https://api.circle.com/v1/w3s'
const APP_ID = env.VITE_CIRCLE_APP_ID || env.CIRCLE_APP_ID
const API_KEY = env.CIRCLE_API_KEY
const RPC_URL = env.ARC_TESTNET_RPC_URL || 'https://rpc.testnet.arc.network'
const chain = defineChain({
  id: ARC_TESTNET.chainId,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
})
const publicClient = createPublicClient({ chain, transport: http(RPC_URL) })
const signatures = new SignatureRequestRegistry()
const gatewayChallenges = new Map()
const preparedTransfers = new Map()
const a4Operations = new Map()
const tokenOwner = (userToken) => createHash('sha256').update(userToken).digest('hex')

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
    if (size > 20_000) throw new Error('Request body too large.')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

async function circle(path, userToken, init = {}) {
  const response = await fetch(`${CIRCLE_API_BASE}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${API_KEY}`,
      ...(userToken ? { 'X-User-Token': userToken } : {}),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw Object.assign(new Error(payload?.message || `Circle request failed (${response.status}).`), { status: response.status })
  return payload
}

function requireUserToken(body) {
  if (typeof body?.userToken !== 'string' || !body.userToken) throw Object.assign(new Error('Circle authentication is required.'), { status: 401 })
  return body.userToken
}

async function findArcSca(userToken) {
  const payload = await circle('/wallets', userToken)
  const wallet = payload?.data?.wallets?.find((item) => item?.blockchain === ARC_TESTNET.blockchain && item?.accountType === 'SCA')
  if (!wallet?.id || !/^0x[0-9a-fA-F]{40}$/.test(wallet.address)) throw Object.assign(new Error('Authenticated user has no Arc Testnet SCA.'), { status: 404 })
  return wallet
}

async function polygonRpc(method, params) {
  const response = await fetch(POLYGON_AMOY.rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || payload?.error || !Object.hasOwn(payload || {}, 'result')) throw new Error(`Polygon Amoy RPC ${method} failed.`)
  return payload.result
}

async function inspectPolygonWallet(wallet) {
  const owner = wallet.address.toLowerCase().replace(/^0x/, '').padStart(64, '0')
  const spender = POLYGON_AMOY.gatewayWallet.replace(/^0x/, '').padStart(64, '0')
  const [bytecode, nativeBalance, usdcBalance, allowance] = await Promise.all([
    polygonRpc('eth_getCode', [wallet.address, 'latest']),
    polygonRpc('eth_getBalance', [wallet.address, 'latest']),
    polygonRpc('eth_call', [{ to: POLYGON_AMOY.usdc, data: `0x70a08231${owner}` }, 'latest']),
    polygonRpc('eth_call', [{ to: POLYGON_AMOY.usdc, data: `0xdd62ed3e${owner}${spender}` }, 'latest']),
  ])
  const gatewayResponse = await fetch('https://gateway-api-testnet.circle.com/v1/balances', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'USDC', sources: [{ domain: POLYGON_AMOY.domain, depositor: wallet.address }] }),
    signal: AbortSignal.timeout(15_000),
  })
  const gatewayPayload = await gatewayResponse.json().catch(() => null)
  if (!gatewayResponse.ok) throw new Error('Circle Gateway balance lookup failed.')
  const gateway = gatewayPayload?.balances?.find((item) => item?.domain === POLYGON_AMOY.domain) || null
  return {
    bytecodeDetected: bytecode !== '0x',
    nativePolWei: BigInt(nativeBalance).toString(),
    usdcBaseUnits: BigInt(usdcBalance).toString(),
    allowanceBaseUnits: BigInt(allowance).toString(),
    gatewayBalanceBaseUnits: parseUsdcDecimalToBaseUnits(gateway?.balance || '0').toString(),
    gatewayPendingBatchBaseUnits: gateway?.pendingBatch || '0',
  }
}

async function inspectPolygonEoa(wallet) {
  const bytecode = await polygonRpc('eth_getCode', [wallet.address, 'latest'])
  return { bytecode, bytecodeEmpty: bytecode === '0x' }
}

async function correlatedGatewayState(userToken) {
  const wallets = (await circle('/wallets', userToken))?.data?.wallets
  const wallet = requireGatewayPolygonWallet(wallets)
  return { wallet, walletState: await inspectPolygonWallet(wallet) }
}

async function gatewayEstimate(body) {
  let response
  try {
    response = await fetch(GATEWAY_ESTIMATE_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    throw Object.assign(new Error('Gateway estimate network request failed.'), { diagnostic: gatewayEstimateNetworkDiagnostic(error) })
  }
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw Object.assign(new Error(payload?.message || `Gateway estimate failed (${response.status}).`), { status: response.status })
  return payload
}

async function readArcRecipientUsdcBalance() {
  const owner = EXPECTED_ARC_SCA.slice(2).padStart(64, '0')
  const result = await publicClient.call({ to: ARC_TESTNET.usdc, data: `0x70a08231${owner}` })
  if (!result.data) throw new Error('Arc USDC balance lookup returned no data.')
  return BigInt(result.data).toString()
}

async function readGatewayAvailableBalance(address) {
  const response = await fetch('https://gateway-api-testnet.circle.com/v1/balances', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'USDC', sources: [{ domain: POLYGON_AMOY.domain, depositor: address }] }),
    signal: AbortSignal.timeout(15_000),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`Gateway balance lookup failed (${response.status}).`)
  const balance = payload?.balances?.find((item) => item?.domain === POLYGON_AMOY.domain)
  if (!balance || typeof balance.balance !== 'string') throw new Error('Gateway returned no live Polygon balance.')
  return balance.balance
}

function a4EstimateDependencies(userToken) {
  return {
    apiKey: API_KEY, userToken,
    rpcUrls: { [ARC_TESTNET.chainId]: RPC_URL, [POLYGON_AMOY.chainId]: POLYGON_AMOY.rpc },
    listWallets: async () => (await circle('/wallets', userToken))?.data?.wallets,
    readPolygonBytecode: (address) => polygonRpc('eth_getCode', [address, 'latest']),
    readGatewayBalance: readGatewayAvailableBalance,
    readArcBalance: readArcRecipientUsdcBalance,
    createAdapter: createCircleUserWalletAdapter,
    createKit: () => new AppKit(),
  }
}

function safeA4Error(error, userToken) {
  let message = error instanceof Error ? error.message : 'A4.2b spend failed.'
  for (const secret of [API_KEY, userToken]) if (secret) message = message.split(secret).join('[REDACTED]')
  if (/authorization|bearer|encryption|signature|user.?token|api.?key/i.test(message)) return 'A4.2b stopped; sensitive upstream details were withheld.'
  return message.slice(0, 500)
}

async function gatewayTransferRequest(body) {
  const response = await fetch(GATEWAY_TRANSFER_ENDPOINT, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
  })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

async function gatewayTransferStatus(transferId) {
  const response = await fetch(`${GATEWAY_TRANSFER_ENDPOINT}/${encodeURIComponent(transferId)}`, { signal: AbortSignal.timeout(15_000) })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw Object.assign(new Error(payload?.message || `Gateway transfer status failed (${response.status}).`), { status: response.status })
  return payload
}

async function apiMiddleware(req, res, next) {
  if (!req.url?.startsWith('/gateway-a1-api/')) return next()
  if (!APP_ID || !API_KEY) return json(res, 500, { error: 'Spike is missing Circle development configuration.' })
  try {
    if (req.method === 'GET' && req.url === '/gateway-a1-api/config') {
      return json(res, 200, { appId: APP_ID, network: 'Arc Testnet', chainId: ARC_TESTNET.chainId })
    }
    if (req.method === 'POST' && req.url === '/gateway-a1-api/otp') {
      const body = await readJson(req)
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      const deviceId = typeof body.deviceId === 'string' ? body.deviceId : ''
      if (!deviceId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { error: 'Valid email and deviceId are required.' })
      const payload = await circle('/users/email/token', '', { method: 'POST', headers: { 'X-Request-Id': crypto.randomUUID() }, body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), deviceId, email }) })
      const { deviceToken, deviceEncryptionKey, otpToken } = payload?.data || {}
      if (![deviceToken, deviceEncryptionKey, otpToken].every((value) => typeof value === 'string' && value)) throw new Error('Circle OTP response was incomplete.')
      return json(res, 200, { deviceToken, deviceEncryptionKey, otpToken })
    }
    if (req.method === 'POST' && req.url === '/gateway-a1-api/resolve') {
      const body = await readJson(req)
      const userToken = requireUserToken(body)
      signatures.resolve(body.requestId, body.challengeId, tokenOwner(userToken), body.signature)
      return json(res, 200, { accepted: true })
    }
    if (req.method === 'POST' && req.url === '/gateway-a1-api/a2-preflight') {
      const body = await readJson(req)
      const userToken = requireUserToken(body)
      const payload = await circle('/wallets', userToken)
      const discovered = discoverA2Wallets(payload?.data?.wallets)
      const [polygon, polygonEoaState] = await Promise.all([
        discovered.polygonWallet ? inspectPolygonWallet(discovered.polygonWallet) : null,
        discovered.polygonEoa ? inspectPolygonEoa(discovered.polygonEoa) : null,
      ])
      return json(res, 200, { ...discovered, polygon, polygonEoaState })
    }
    if (req.method === 'POST' && req.url === '/gateway-a1-api/a4-estimate') {
      const userToken = requireUserToken(await readJson(req))
      try {
        const owner = tokenOwner(userToken)
        if (a4Operations.get(owner)?.started) throw new Error('A4.2b is already locked for this authenticated session.')
        const result = await prepareUnifiedBalanceEstimate(a4EstimateDependencies(userToken))
        if (!result.success) return json(res, 200, result)
        const operation = new A4SpendOperation(owner, crypto.randomUUID())
        operation.preflight = result
        a4Operations.set(owner, operation)
        return json(res, 200, { ...result, stage: 'a4_2b_preflight', operationId: operation.id, state: 'READY', spendEnabled: true })
      } catch (error) {
        let message = error instanceof Error ? error.message : 'A4.2a estimate failed.'
        for (const secret of [API_KEY, userToken]) if (secret) message = message.split(secret).join('[REDACTED]')
        if (/authorization|bearer|encryption|signature|user.?token|api.?key/i.test(message)) message = 'A4.2a estimate stopped; sensitive upstream details were withheld.'
        return json(res, 200, { stage: 'a4_2a_estimate', success: false, error: message.slice(0, 500), spendEnabled: false, gatewayTransferSubmitted: false })
      }
    }
    if (req.method === 'POST' && req.url === '/gateway-a1-api/a4-spend') {
      const body = await readJson(req)
      const userToken = requireUserToken(body)
      const owner = tokenOwner(userToken)
      const operation = a4Operations.get(owner)
      if (!operation || operation.id !== body.operationId) return json(res, 404, { error: 'Run a fresh A4.2b preflight first.' })
      operation.start()
      try {
        const wallets = (await circle('/wallets', userToken))?.data?.wallets
        const discovered = discoverA2Wallets(wallets)
        const polygonWallet = requireGatewayPolygonWallet(wallets)
        if (discovered.arcWallet?.address?.toLowerCase() !== EXPECTED_ARC_SCA || discovered.arcWallet.accountType !== 'SCA') throw new Error('WRONG USER: exact Arc SCA correlation failed.')
        void executeA4Spend({
          operation,
          estimateDependencies: a4EstimateDependencies(userToken),
          createAdapter: createCircleUserWalletAdapter,
          createKit: () => new AppKit(),
          adapterOptions: { apiKey: API_KEY, userToken, wallets: [polygonWallet, discovered.arcWallet], rpcUrls: { [ARC_TESTNET.chainId]: RPC_URL, [POLYGON_AMOY.chainId]: POLYGON_AMOY.rpc }, timeoutMs: 180_000 },
          readGatewayBalance: () => readGatewayAvailableBalance(polygonWallet.address),
          readArcBalance: readArcRecipientUsdcBalance,
          readReceipt: (hash) => publicClient.getTransactionReceipt({ hash }),
        }).catch((error) => {
          const classified = classifySpendError(error)
          operation.state = classified.state
          operation.error = safeA4Error(error, userToken)
          for (const waiter of operation.waiters.values()) waiter.reject?.(error)
          operation.waiters.clear()
        })
      } catch (error) {
        const classified = classifySpendError(error)
        operation.state = classified.state
        operation.error = safeA4Error(error, userToken)
      }
      return json(res, 202, operation.public())
    }
    if (req.method === 'POST' && req.url === '/gateway-a1-api/a4-status') {
      const body = await readJson(req)
      const userToken = requireUserToken(body)
      const operation = a4Operations.get(tokenOwner(userToken))
      if (!operation || operation.id !== body.operationId) return json(res, 404, { error: 'A4.2b operation not found.' })
      return json(res, 200, operation.public())
    }
    if (req.method === 'POST' && req.url === '/gateway-a1-api/a4-challenge-result') {
      const body = await readJson(req)
      const userToken = requireUserToken(body)
      const operation = a4Operations.get(tokenOwner(userToken))
      if (!operation || operation.id !== body.operationId || !operation.challenges.some((item) => item.challengeId === body.challengeId)) return json(res, 404, { error: 'A4.2b challenge correlation failed.' })
      if (body.rejected) operation.reject(body.challengeId)
      else if (typeof body.signature === 'string') operation.resolve(body.challengeId, body.signature)
      return json(res, 200, { accepted: true })
    }
    if (req.method === 'POST' && req.url === '/gateway-a1-api/a2-provision') {
      const body = await readJson(req)
      const userToken = requireUserToken(body)
      const created = await provisionPolygonWallet({
        listWallets: async () => (await circle('/wallets', userToken))?.data?.wallets,
        createWallet: async (request) => circle('/user/wallets', userToken, { method: 'POST', body: JSON.stringify(request) }),
        idempotencyKey: crypto.randomUUID(),
      })
      const challengeId = created?.data?.challengeId
      if (typeof challengeId !== 'string' || !challengeId) throw new Error('Circle wallet creation response did not include a challenge ID.')
      return json(res, 200, { challengeId })
    }
    if (req.method === 'POST' && req.url === '/gateway-a1-api/a3-eoa-provision') {
      const body = await readJson(req)
      const userToken = requireUserToken(body)
      const created = await provisionPolygonEoa({
        listWallets: async () => (await circle('/wallets', userToken))?.data?.wallets,
        createWallet: async (request) => circle('/user/wallets', userToken, { method: 'POST', body: JSON.stringify(request) }),
        idempotencyKey: crypto.randomUUID(),
      })
      const challengeId = created?.data?.challengeId
      if (typeof challengeId !== 'string' || !challengeId) throw new Error('Circle EOA creation response did not include a challenge ID.')
      return json(res, 200, { challengeId })
    }
    if (req.method === 'POST' && req.url === '/gateway-a1-api/a2-gateway-state') {
      const userToken = requireUserToken(await readJson(req))
      return json(res, 200, await correlatedGatewayState(userToken))
    }
    if (req.method === 'POST' && req.url === '/gateway-a1-api/a2-gateway-challenge') {
      const body = await readJson(req)
      const userToken = requireUserToken(body)
      const operation = body.operation === 'approve' || body.operation === 'deposit' ? body.operation : ''
      if (!operation) return json(res, 400, { error: 'Exact Gateway operation is required.' })
      const result = await createGatewayDepositChallenge({
        operation,
        listWallets: async () => (await circle('/wallets', userToken))?.data?.wallets,
        readAllowance: async () => BigInt((await correlatedGatewayState(userToken)).walletState.allowanceBaseUnits),
        createChallenge: async (request) => circle('/user/transactions/contractExecution', userToken, { method: 'POST', body: JSON.stringify(request) }),
        idempotencyKey: crypto.randomUUID(),
      })
      const challengeId = result?.data?.challengeId
      if (typeof challengeId !== 'string' || !challengeId) throw new Error('Circle did not return a Gateway challenge ID.')
      gatewayChallenges.set(challengeId, { operation, owner: tokenOwner(userToken) })
      return json(res, 200, { challengeId, operation })
    }
    if (req.method === 'POST' && req.url === '/gateway-a1-api/a2-gateway-recovery') {
      const body = await readJson(req)
      const userToken = requireUserToken(body)
      const record = gatewayChallenges.get(body.challengeId)
      if (!record || record.owner !== tokenOwner(userToken)) return json(res, 404, { error: 'Gateway challenge was not created by this runner session.' })
      const challenge = (await circle(`/user/challenges/${encodeURIComponent(body.challengeId)}`, userToken))?.data?.challenge
      const challengeFailed = ['FAILED', 'DENIED', 'CANCELLED'].includes(challenge?.status)
      const transactionId = challenge?.correlationIds?.find((value) => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)) || null
      if (!transactionId) return json(res, 200, { operation: record.operation, challengeId: body.challengeId, challengeStatus: challenge?.status || 'PENDING', transactionId: null, txHash: null, state: challengeFailed ? 'FAILED' : 'PENDING' })
      const transaction = (await circle(`/transactions/${encodeURIComponent(transactionId)}`, userToken))?.data?.transaction
      if (!transaction || transaction.walletId !== '2a7cb0cf-ea80-52b2-be7d-96ec0dcf1ea1') throw new Error('Circle returned a mismatched Polygon transaction.')
      let receiptStatus = null
      if (typeof transaction.txHash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(transaction.txHash)) {
        const receipt = await polygonRpc('eth_getTransactionReceipt', [transaction.txHash])
        receiptStatus = receipt ? (receipt.status === '0x1' ? 'SUCCESS' : 'FAILED') : null
      }
      const current = await correlatedGatewayState(userToken)
      const terminal = ['FAILED', 'DENIED', 'CANCELLED'].includes(transaction.state) || receiptStatus === 'FAILED'
      const confirmed = receiptStatus === 'SUCCESS'
      return json(res, 200, {
        operation: record.operation, challengeId: body.challengeId, challengeStatus: challenge?.status || 'PENDING', transactionId,
        txHash: transaction.txHash || null, circleState: transaction.state || 'PENDING', receiptStatus,
        state: terminal ? 'FAILED' : confirmed ? 'CONFIRMED' : 'PENDING', ...current,
      })
    }
    if (req.method === 'POST' && req.url === '/gateway-a1-api/a3-prepare') {
      const userToken = requireUserToken(await readJson(req))
      const requestId = crypto.randomUUID()
      const wallets = (await circle('/wallets', userToken))?.data?.wallets
      const discovered = discoverA2Wallets(wallets)
      const polygonWallet = requireGatewayPolygonWallet(wallets)
      if (discovered.arcWallet.address.toLowerCase() !== EXPECTED_ARC_SCA) throw new Error('WRONG USER: Arc destination wallet changed.')
      const gatewayState = await inspectPolygonWallet(polygonWallet)
      const arcBalanceBefore = await readArcRecipientUsdcBalance()
      const signaturePromise = signatures.create(requestId, tokenOwner(userToken))
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/x-ndjson')
      res.setHeader('Cache-Control', 'no-store, no-transform')
      res.setHeader('X-Accel-Buffering', 'no')
      res.flushHeaders()
      const emit = (value) => { if (!res.destroyed && !res.writableEnded) res.write(`${JSON.stringify(value)}\n`) }
      req.on('aborted', () => signatures.cancel(requestId))
      res.on('close', () => { if (!res.writableEnded) signatures.cancel(requestId) })
      try {
        const preview = await preparePolygonToArcTransfer({
          sourceAddress: polygonWallet.address,
          destinationAddress: discovered.arcWallet.address,
          gatewayBalanceBefore: gatewayState.gatewayBalanceBaseUnits,
          estimateTransfer: gatewayEstimate,
          onPrepared: ({ burnIntent, fees }) => emit({ type: 'prepared', requestId, burnIntent, gatewayBalanceBefore: gatewayState.gatewayBalanceBaseUnits, fees }),
          signBurnIntent: async (typedData) => {
            const adapter = await createCircleUserWalletAdapter({
              apiKey: API_KEY, userToken, walletId: polygonWallet.id, walletAddress: polygonWallet.address,
              accountType: 'SCA', chain: POLYGON_AMOY.chain, timeoutMs: 120_000,
              onChallenge: ({ challengeId }) => { signatures.bindChallenge(requestId, challengeId); emit({ type: 'challenge', requestId, challengeId }) },
              resolveTypedDataSignature: () => signaturePromise,
            })
            return adapter.readAction('gateway.v1.signBurnIntents', { typedData }, { chain: POLYGON_AMOY.chain })
          },
          onSigned: ({ burnIntent, signature, contractSigner }) => {
            if (!contractSigner) throw new Error('A3.1 did not classify the Circle wallet signature as a contract signer.')
            preparedTransfers.set(requestId, {
              owner: tokenOwner(userToken), state: 'READY', burnIntent, signature, arcBalanceBefore, transferId: null,
            })
          },
        })
        emit({ type: 'completed', requestId, preview, arcBalanceBefore })
      } catch (error) {
        emit({ type: 'failed', requestId, error: error instanceof Error ? error.message : 'A3.1 preparation failed.', diagnostic: error?.diagnostic || null })
      } finally {
        signatures.cancel(requestId)
        if (!res.writableEnded) res.end()
      }
      return
    }
    if (req.method === 'POST' && req.url === '/gateway-a1-api/a3-submit') {
      const body = await readJson(req)
      const userToken = requireUserToken(body)
      const record = preparedTransfers.get(body.requestId)
      const result = await submitPreparedGatewayTransfer({
        record,
        owner: tokenOwner(userToken),
        submitTransfer: gatewayTransferRequest,
      })
      const sanitized = sanitizeGatewayTransferResponse(result.payload)
      if (!result.response.ok) return json(res, result.response.status, { accepted: false, httpStatus: result.response.status, response: sanitized, submitted: true })
      if (result.response.status !== 201 || typeof result.payload?.transferId !== 'string') {
        return json(res, 502, { accepted: false, httpStatus: result.response.status, response: sanitized, submitted: true, error: 'Gateway response did not contain a transfer ID.' })
      }
      record.transferId = result.payload.transferId
      return json(res, 200, {
        accepted: true, httpStatus: result.response.status, transferId: record.transferId, response: sanitized,
        arcBalanceBefore: record.arcBalanceBefore, arcBalanceCurrent: await readArcRecipientUsdcBalance(), submitted: true,
      })
    }
    if (req.method === 'POST' && req.url === '/gateway-a1-api/a3-status') {
      const body = await readJson(req)
      const userToken = requireUserToken(body)
      const record = preparedTransfers.get(body.requestId)
      if (!record || record.owner !== tokenOwner(userToken) || !record.transferId) return json(res, 404, { error: 'Submitted A3.2 transfer was not found for this session.' })
      const status = sanitizeGatewayTransferStatus(await gatewayTransferStatus(record.transferId))
      return json(res, 200, {
        transferId: record.transferId, status, arcBalanceBefore: record.arcBalanceBefore,
        arcBalanceCurrent: await readArcRecipientUsdcBalance(), submitted: true,
      })
    }
    if (req.method === 'POST' && req.url === '/gateway-a1-api/sign') {
      const body = await readJson(req)
      const userToken = requireUserToken(body)
      const requestId = crypto.randomUUID()
      const wallet = await findArcSca(userToken)
      const bytecode = await publicClient.getBytecode({ address: wallet.address })
      const currentBlock = await publicClient.getBlockNumber()
      const { burnIntent, typedData } = buildGatewayBurnIntent({ walletAddress: wallet.address, currentBlock })
      const signaturePromise = signatures.create(requestId, tokenOwner(userToken))
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/x-ndjson')
      res.setHeader('Cache-Control', 'no-store, no-transform')
      res.setHeader('X-Accel-Buffering', 'no')
      res.flushHeaders()
      const emit = (value) => { if (!res.destroyed && !res.writableEnded) res.write(`${JSON.stringify(value)}\n`) }
      const controller = new AbortController()
      req.on('aborted', () => { controller.abort(); signatures.cancel(requestId) })
      res.on('close', () => {
        if (!res.writableEnded) { controller.abort(); signatures.cancel(requestId) }
      })
      emit({ type: 'prepared', requestId, walletAddress: wallet.address, bytecodeDetected: Boolean(bytecode && bytecode !== '0x'), burnIntent })
      try {
        const adapter = await createCircleUserWalletAdapter({
          apiKey: API_KEY,
          userToken,
          walletId: wallet.id,
          walletAddress: wallet.address,
          accountType: 'SCA',
          chain: ARC_TESTNET.chain,
          timeoutMs: 120_000,
          onChallenge: ({ challengeId }) => {
            signatures.bindChallenge(requestId, challengeId)
            emit({ type: 'challenge', requestId, challengeId })
          },
          resolveTypedDataSignature: () => signaturePromise,
        })
        const result = await adapter.readAction('gateway.v1.signBurnIntents', { typedData }, { chain: ARC_TESTNET.chain })
        emit({
          type: 'completed',
          requestId,
          signerAddress: wallet.address,
          bytecodeDetected: Boolean(bytecode && bytecode !== '0x'),
          contractSigner: result?.contractSigner,
          signatureObtained: typeof result?.signature === 'string' && result.signature.length > 2,
        })
      } catch (error) {
        emit({ type: 'failed', requestId, error: error instanceof Error ? error.message : 'Signing failed.' })
      } finally {
        signatures.cancel(requestId)
        if (!res.writableEnded) res.end()
      }
      return
    }
    return json(res, 404, { error: 'Spike endpoint not found.' })
  } catch (error) {
    return json(res, Number.isInteger(error?.status) ? error.status : 500, { error: error instanceof Error ? error.message : 'Spike failed.' })
  }
}

const apiPlugin = {
  name: 'gateway-a1-api',
  configureServer(server) {
    server.middlewares.use(apiMiddleware)
  },
}
const vite = await createViteServer({ root: localRoot, plugins: [apiPlugin, nodePolyfills({ globals: { process: true } })], server: { port: PORT, strictPort: true }, appType: 'spa' })
await vite.listen()
vite.printUrls()
