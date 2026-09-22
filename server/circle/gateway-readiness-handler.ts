import { AppKit } from '@circle-fin/app-kit'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getGatewayReadOnlyContext } from '../../api/auth/session.js'
import {
  GatewayReadinessError,
  gatewayReadinessConfig,
  inspectGatewayReadiness,
  parseRpcQuantity,
  parseUsdcBaseUnits,
  type CircleWallet,
} from './gateway-readiness.js'

const circleApiBaseUrl = 'https://api.circle.com/v1/w3s'
const polygonRpcUrl = process.env.POLYGON_AMOY_RPC_URL || 'https://polygon-amoy-bor-rpc.publicnode.com'

const required = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

const json = (res: VercelResponse, status: number, body: object) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  return res.end(JSON.stringify(body))
}

const failure = (res: VercelResponse, error: GatewayReadinessError) => json(res, error.httpStatus, {
  ok: false,
  readinessStatus: 'UNKNOWN',
  error: { code: error.code, stage: error.stage, retryable: error.retryable },
})

async function circleGet(path: string, userToken: string) {
  const stage = path === '/user' ? 'circle_user' : 'circle_wallets'
  let response: Response
  try {
    response = await fetch(`${circleApiBaseUrl}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${required('CIRCLE_API_KEY')}`, 'X-User-Token': userToken },
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new GatewayReadinessError('CIRCLE_PROVIDER_UNAVAILABLE', stage, 503, true)
  }
  if (response.status === 401 || response.status === 403) {
    throw new GatewayReadinessError('CIRCLE_AUTH_UNAVAILABLE', stage, 503, false)
  }
  if (!response.ok) throw new GatewayReadinessError('CIRCLE_PROVIDER_UNAVAILABLE', stage, 503, true)
  const payload = await response.json().catch(() => null)
  if (!payload || typeof payload !== 'object') throw new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', stage, 502, false)
  return payload as Record<string, unknown>
}

function circleUserId(payload: Record<string, unknown>) {
  const data = payload.data
  if (!data || typeof data !== 'object') throw new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', 'circle_user', 502, false)
  const record = data as Record<string, unknown>
  const id = record.userID || record.userId || record.id
  if (typeof id !== 'string' || !id) throw new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', 'circle_user', 502, false)
  return id
}

function circleWalletsPage(payload: Record<string, unknown>): { wallets: CircleWallet[]; pageAfter: string | null } {
  const data = payload.data
  const wallets = data && typeof data === 'object' ? (data as Record<string, unknown>).wallets : null
  if (!Array.isArray(wallets)) throw new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', 'circle_wallets', 502, false)
  const parsed = wallets.map((wallet) => {
    if (!wallet || typeof wallet !== 'object') throw new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', 'circle_wallets', 502, false)
    const record = wallet as Record<string, unknown>
    if (typeof record.id !== 'string' || typeof record.address !== 'string' || typeof record.blockchain !== 'string' || typeof record.accountType !== 'string') {
      throw new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', 'circle_wallets', 502, false)
    }
    return { id: record.id, address: record.address, blockchain: record.blockchain, accountType: record.accountType }
  })
  const pagination = payload.pagination
  const next = pagination && typeof pagination === 'object' ? (pagination as Record<string, unknown>).next : null
  if (next !== null && next !== undefined && typeof next !== 'string') {
    throw new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', 'circle_wallets', 502, false)
  }
  if (!next) return { wallets: parsed, pageAfter: null }
  let pageAfter: string | null
  try {
    pageAfter = new URL(next).searchParams.get('pageAfter')
  } catch {
    pageAfter = next
  }
  if (!pageAfter) throw new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', 'circle_wallets', 502, false)
  return { wallets: parsed, pageAfter }
}

async function listCircleWallets(userToken: string) {
  const wallets: CircleWallet[] = []
  const seenCursors = new Set<string>()
  let pageAfter: string | null = null
  for (let page = 0; page < 100; page += 1) {
    const query = new URLSearchParams({ pageSize: '50' })
    if (pageAfter) query.set('pageAfter', pageAfter)
    const parsed = circleWalletsPage(await circleGet(`/wallets?${query}`, userToken))
    wallets.push(...parsed.wallets)
    if (!parsed.pageAfter) return wallets
    if (seenCursors.has(parsed.pageAfter)) throw new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', 'circle_wallets', 502, false)
    seenCursors.add(parsed.pageAfter)
    pageAfter = parsed.pageAfter
  }
  throw new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', 'circle_wallets', 502, false)
}

async function polygonRpc(method: string, params: unknown[], stage: string) {
  let response: Response
  try {
    response = await fetch(polygonRpcUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new GatewayReadinessError('POLYGON_RPC_UNAVAILABLE', stage, 503, true)
  }
  const payload = await response.json().catch(() => null) as { result?: unknown; error?: unknown } | null
  if (!response.ok || payload?.error) throw new GatewayReadinessError('POLYGON_RPC_UNAVAILABLE', stage, 503, true)
  if (typeof payload?.result !== 'string') throw new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', stage, 502, false)
  return payload.result
}

const encodedAddress = (address: string) => address.toLowerCase().replace(/^0x/, '').padStart(64, '0')

async function gatewayBalances(address: string) {
  try {
    const kit = new AppKit()
    const result = await kit.unifiedBalance.getBalances({
      token: 'USDC',
      sources: { address, chains: [gatewayReadinessConfig.polygonChain] },
      includePending: true,
      networkType: 'testnet',
    })
    if (result.totalPendingBalance === undefined) {
      throw new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', 'gateway_balances', 502, false)
    }
    return { available: parseUsdcBaseUnits(result.totalConfirmedBalance), pending: parseUsdcBaseUnits(result.totalPendingBalance) }
  } catch (error) {
    if (error instanceof GatewayReadinessError) throw error
    throw new GatewayReadinessError('GATEWAY_PROVIDER_UNAVAILABLE', 'gateway_balances', 503, true)
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return json(res, 405, { ok: false, readinessStatus: 'UNKNOWN', error: { code: 'METHOD_NOT_ALLOWED', stage: 'request', retryable: false } })
  }

  try {
    const context = await getGatewayReadOnlyContext(req.headers.cookie)
    if (!context.ok) {
      if (context.reason === 'AUTHENTICATION_REQUIRED') {
        return json(res, 401, { ok: false, readinessStatus: 'UNKNOWN', error: { code: 'AUTHENTICATION_REQUIRED', stage: 'session', retryable: false } })
      }
      const reason = context.reason
      const code = reason === 'SESSION_STORE_UNAVAILABLE' ? 'SESSION_STORE_UNAVAILABLE'
        : reason === 'ARC_WALLET_UNAVAILABLE' ? 'ARC_WALLET_MISMATCH' : 'ACCOUNT_CIRCLE_MISMATCH'
      const status = reason === 'SESSION_STORE_UNAVAILABLE' ? 503 : 409
      return json(res, status, { ok: false, readinessStatus: 'UNKNOWN', error: { code, stage: 'account_correlation', retryable: status === 503 } })
    }

    const userPayload = await circleGet('/user', context.userToken)
    if (circleUserId(userPayload) !== context.circleUserId) {
      return failure(res, new GatewayReadinessError('ACCOUNT_CIRCLE_MISMATCH', 'circle_user', 409, false))
    }
    const wallets = await listCircleWallets(context.userToken)
    const result = await inspectGatewayReadiness({
      id: context.arcWallet.circle_wallet_id,
      address: context.arcWallet.address,
      blockchain: context.arcWallet.blockchain,
      accountType: context.arcWallet.account_type,
    }, {
      listWallets: async () => wallets,
      readBytecode: (address) => polygonRpc('eth_getCode', [address, 'latest'], 'polygon_bytecode'),
      readUsdcBalance: async (address) => parseRpcQuantity(await polygonRpc('eth_call', [{
        to: gatewayReadinessConfig.polygonUsdc, data: `0x70a08231${encodedAddress(address)}`,
      }, 'latest'], 'polygon_usdc'), 'polygon_usdc'),
      readAllowance: async (address) => parseRpcQuantity(await polygonRpc('eth_call', [{
        to: gatewayReadinessConfig.polygonUsdc,
        data: `0xdd62ed3e${encodedAddress(address)}${encodedAddress(gatewayReadinessConfig.gatewayWallet)}`,
      }, 'latest'], 'gateway_allowance'), 'gateway_allowance'),
      readGatewayBalances: gatewayBalances,
    })
    return json(res, 200, result)
  } catch (error) {
    if (error instanceof GatewayReadinessError) return failure(res, error)
    return failure(res, new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', 'internal', 502, false))
  }
}
