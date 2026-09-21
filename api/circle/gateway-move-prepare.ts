import { AppKit } from '@circle-fin/app-kit'
import { createCircleUserWalletAdapter } from '@circle-fin/adapter-circle-wallets/ucw/server'
import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getGatewayReadOnlyContext } from '../auth/session.js'
import {
  GatewayReadinessError,
  correlateGatewayWallets,
  gatewayReadinessConfig,
  inspectGatewayReadiness,
  parseRpcQuantity,
  parseUsdcBaseUnits,
  type CircleWallet,
} from '../../server/circle/gateway-readiness.js'
import {
  GATEWAY_MOVE_ESTIMATE_TTL_MS,
  GatewayMovePreparationError,
  parseGatewayMoveAmount,
  prepareGatewayMoveEstimate,
} from '../../server/circle/gateway-move-preparation.js'
import {
  GatewayMovePreparationConflictError,
  createOrReplayGatewayMoveOperation,
  getGatewayMoveOperationByPreparationKey,
  toPublicGatewayMoveOperation,
} from '../../server/circle/gateway-move-operation.js'

const circleApiBaseUrl = 'https://api.circle.com/v1/w3s'
const polygonRpcUrl = process.env.POLYGON_AMOY_RPC_URL || 'https://polygon-amoy-bor-rpc.publicnode.com'
const arcRpcUrl = process.env.ARC_TESTNET_RPC_URL || 'https://rpc.testnet.arc.network'
const arcUsdcAddress = '0x3600000000000000000000000000000000000000'
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const required = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

const database = () => createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

const json = (res: VercelResponse, status: number, body: object) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  return res.end(JSON.stringify(body))
}

const failure = (res: VercelResponse, status: number, code: string, stage: string, retryable = false) => json(res, status, {
  ok: false,
  error: { code, stage, retryable },
})

async function circleGet(path: string, userToken: string) {
  let response: Response
  try {
    response = await fetch(`${circleApiBaseUrl}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${required('CIRCLE_API_KEY')}`, 'X-User-Token': userToken },
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new GatewayReadinessError('CIRCLE_PROVIDER_UNAVAILABLE', path === '/user' ? 'circle_user' : 'circle_wallets', 503, true)
  }
  if (response.status === 401 || response.status === 403) {
    throw new GatewayReadinessError('CIRCLE_AUTH_UNAVAILABLE', path === '/user' ? 'circle_user' : 'circle_wallets', 503, false)
  }
  if (!response.ok) throw new GatewayReadinessError('CIRCLE_PROVIDER_UNAVAILABLE', path === '/user' ? 'circle_user' : 'circle_wallets', 503, true)
  const payload = await response.json().catch(() => null)
  if (!payload || typeof payload !== 'object') throw new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', 'circle_wallets', 502, false)
  return payload as Record<string, unknown>
}

function readCircleUserId(payload: Record<string, unknown>) {
  const data = payload.data
  const value = data && typeof data === 'object' ? data as Record<string, unknown> : null
  const id = value?.userID || value?.userId || value?.id
  if (typeof id !== 'string' || !id) throw new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', 'circle_user', 502, false)
  return id
}

function readWalletPage(payload: Record<string, unknown>) {
  const data = payload.data
  const rawWallets = data && typeof data === 'object' ? (data as Record<string, unknown>).wallets : null
  if (!Array.isArray(rawWallets)) throw new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', 'circle_wallets', 502, false)
  const wallets = rawWallets.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', 'circle_wallets', 502, false)
    const wallet = raw as Record<string, unknown>
    if (typeof wallet.id !== 'string' || typeof wallet.address !== 'string' || typeof wallet.blockchain !== 'string' || typeof wallet.accountType !== 'string') {
      throw new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', 'circle_wallets', 502, false)
    }
    return { id: wallet.id, address: wallet.address, blockchain: wallet.blockchain, accountType: wallet.accountType } satisfies CircleWallet
  })
  const pagination = payload.pagination
  const nextValue = pagination && typeof pagination === 'object' ? (pagination as Record<string, unknown>).next : null
  if (nextValue !== null && nextValue !== undefined && typeof nextValue !== 'string') throw new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', 'circle_wallets', 502, false)
  const next = nextValue as string | null | undefined
  if (!next) return { wallets, pageAfter: null as string | null }
  try {
    return { wallets, pageAfter: new URL(next).searchParams.get('pageAfter') || next }
  } catch {
    return { wallets, pageAfter: next }
  }
}

async function listCircleWallets(userToken: string) {
  const wallets: CircleWallet[] = []
  const cursors = new Set<string>()
  let pageAfter: string | null = null
  for (let page = 0; page < 100; page += 1) {
    const query = new URLSearchParams({ pageSize: '50' })
    if (pageAfter) query.set('pageAfter', pageAfter)
    const result = readWalletPage(await circleGet(`/wallets?${query}`, userToken))
    wallets.push(...result.wallets)
    if (!result.pageAfter) return wallets
    if (cursors.has(result.pageAfter)) throw new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', 'circle_wallets', 502, false)
    cursors.add(result.pageAfter)
    pageAfter = result.pageAfter
  }
  throw new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', 'circle_wallets', 502, false)
}

async function rpc(url: string, method: string, params: unknown[], stage: string) {
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new GatewayReadinessError('POLYGON_RPC_UNAVAILABLE', stage, 503, true)
  }
  const payload = await response.json().catch(() => null) as { result?: unknown; error?: unknown } | null
  if (!response.ok || payload?.error || typeof payload?.result !== 'string') {
    throw new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', stage, response.ok ? 502 : 503, !response.ok)
  }
  return payload.result
}

const encodedAddress = (address: string) => address.toLowerCase().replace(/^0x/, '').padStart(64, '0')

async function readGatewayBalances(address: string) {
  try {
    const result = await new AppKit().unifiedBalance.getBalances({
      token: 'USDC', sources: { address, chains: [gatewayReadinessConfig.polygonChain] }, includePending: true, networkType: 'testnet',
    })
    if (result.totalPendingBalance === undefined) throw new Error('missing pending balance')
    return { available: parseUsdcBaseUnits(result.totalConfirmedBalance), pending: parseUsdcBaseUnits(result.totalPendingBalance) }
  } catch (error) {
    if (error instanceof GatewayReadinessError) throw error
    throw new GatewayReadinessError('GATEWAY_PROVIDER_UNAVAILABLE', 'gateway_balances', 503, true)
  }
}

function decimalFromBaseUnits(value: string) {
  const amount = BigInt(value)
  const fraction = (amount % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
  return fraction ? `${amount / 1_000_000n}.${fraction}` : (amount / 1_000_000n).toString()
}

function publicPreparation(row: Parameters<typeof toPublicGatewayMoveOperation>[0]) {
  const operation = toPublicGatewayMoveOperation(row)
  const estimateCreated = operation.estimateCreatedAt ? new Date(operation.estimateCreatedAt) : null
  return {
    ...operation,
    amount: decimalFromBaseUnits(operation.amountBaseUnits),
    allocations: [{ chain: operation.sourceChain, amount: decimalFromBaseUnits(operation.amountBaseUnits) }],
    fees: operation.estimatedFees,
    estimateExpiresAt: estimateCreated ? new Date(estimateCreated.getTime() + GATEWAY_MOVE_ESTIMATE_TTL_MS).toISOString() : null,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return failure(res, 405, 'METHOD_NOT_ALLOWED', 'request')
  }
  const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {}
  if (typeof body.requestId !== 'string' || !uuidPattern.test(body.requestId)) return failure(res, 400, 'INVALID_REQUEST', 'request')
  let amount
  try {
    amount = parseGatewayMoveAmount(body.amount)
  } catch (error) {
    if (error instanceof GatewayMovePreparationError) return failure(res, error.httpStatus, error.code, error.stage, error.retryable)
    return failure(res, 400, 'INVALID_AMOUNT', 'request')
  }

  try {
    const context = await getGatewayReadOnlyContext(req.headers.cookie)
    if (context.ok === false) {
      if (context.reason === 'AUTHENTICATION_REQUIRED') return failure(res, 401, 'AUTHENTICATION_REQUIRED', 'session')
      const code = context.reason === 'SESSION_STORE_UNAVAILABLE' ? 'SESSION_STORE_UNAVAILABLE'
        : context.reason === 'ARC_WALLET_UNAVAILABLE' ? 'ARC_WALLET_MISMATCH' : 'ACCOUNT_CIRCLE_MISMATCH'
      return failure(res, context.reason === 'SESSION_STORE_UNAVAILABLE' ? 503 : 409, code, 'account_correlation', context.reason === 'SESSION_STORE_UNAVAILABLE')
    }
    const db = database() as any
    const circleUser = await circleGet('/user', context.userToken)
    if (readCircleUserId(circleUser) !== context.circleUserId) return failure(res, 409, 'ACCOUNT_CIRCLE_MISMATCH', 'circle_user')
    const wallets = await listCircleWallets(context.userToken)
    const arcWallet: CircleWallet = {
      id: context.arcWallet.circle_wallet_id, address: context.arcWallet.address,
      blockchain: context.arcWallet.blockchain, accountType: context.arcWallet.account_type,
    }
    const polygonWallet = correlateGatewayWallets(wallets, arcWallet)
    const existing = await getGatewayMoveOperationByPreparationKey(db, context.accountId, body.requestId)
    if (existing) {
      const sameIdentity = polygonWallet
        && String(existing.amount_base_units) === amount.amountBaseUnits
        && existing.source_wallet_id === polygonWallet.id
        && existing.source_address === polygonWallet.address.toLowerCase()
        && existing.destination_wallet_id === arcWallet.id
        && existing.destination_address === arcWallet.address.toLowerCase()
      if (!sameIdentity) return failure(res, 409, 'IDEMPOTENCY_KEY_REUSED', 'persistence')
      return json(res, 200, { ok: true, replayed: true, operation: publicPreparation(existing) })
    }
    const readiness = await inspectGatewayReadiness(arcWallet, {
      listWallets: async () => wallets,
      readBytecode: (address) => rpc(polygonRpcUrl, 'eth_getCode', [address, 'latest'], 'polygon_bytecode'),
      readUsdcBalance: async (address) => parseRpcQuantity(await rpc(polygonRpcUrl, 'eth_call', [{
        to: gatewayReadinessConfig.polygonUsdc, data: `0x70a08231${encodedAddress(address)}`,
      }, 'latest'], 'polygon_usdc'), 'polygon_usdc'),
      readAllowance: async (address) => parseRpcQuantity(await rpc(polygonRpcUrl, 'eth_call', [{
        to: gatewayReadinessConfig.polygonUsdc,
        data: `0xdd62ed3e${encodedAddress(address)}${encodedAddress(gatewayReadinessConfig.gatewayWallet)}`,
      }, 'latest'], 'gateway_allowance'), 'gateway_allowance'),
      readGatewayBalances,
    })
    const prepared = await prepareGatewayMoveEstimate({
      accountId: context.accountId, preparationKey: body.requestId, amount: amount.amount,
      apiKey: required('CIRCLE_API_KEY'), userToken: context.userToken, arcWallet, wallets, readiness,
      rpcUrls: { 5042002: arcRpcUrl, 80002: polygonRpcUrl },
      createAdapter: createCircleUserWalletAdapter as unknown as (options: Record<string, unknown>) => Promise<object>,
      createKit: () => new AppKit() as any,
      readArcBalance: async (address) => parseRpcQuantity(await rpc(arcRpcUrl, 'eth_call', [{
        to: arcUsdcAddress, data: `0x70a08231${encodedAddress(address)}`,
      }, 'latest'], 'arc_balance'), 'arc_balance'),
    })
    const saved = await createOrReplayGatewayMoveOperation(db, prepared.createInput)
    return json(res, saved.replayed ? 200 : 201, { ok: true, replayed: saved.replayed, operation: publicPreparation(saved.operation) })
  } catch (error) {
    if (error instanceof GatewayMovePreparationConflictError) return failure(res, 409, 'IDEMPOTENCY_KEY_REUSED', 'persistence')
    if (error instanceof GatewayMovePreparationError) return failure(res, error.httpStatus, error.code, error.stage, error.retryable)
    if (error instanceof GatewayReadinessError) return failure(res, error.httpStatus, error.code, error.stage, error.retryable)
    return failure(res, 503, 'OPERATION_STORE_UNAVAILABLE', 'persistence', true)
  }
}
