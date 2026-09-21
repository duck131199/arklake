import type { CircleWallet } from './gateway-readiness.js'

export const GATEWAY_MOVE_ESTIMATE_TTL_MS = 60_000
const polygonChain = 'Polygon_Amoy_Testnet'

export type GatewayMovePreparationCode =
  | 'INVALID_AMOUNT'
  | 'POLYGON_WALLET_MISSING'
  | 'POLYGON_SCA_UNDEPLOYED'
  | 'GATEWAY_NOT_READY'
  | 'INSUFFICIENT_GATEWAY_BALANCE'
  | 'ARC_RPC_UNAVAILABLE'
  | 'GATEWAY_PROVIDER_UNAVAILABLE'
  | 'INVALID_PROVIDER_RESPONSE'
  | 'SIGNING_NOT_ALLOWED'

export class GatewayMovePreparationError extends Error {
  readonly code: GatewayMovePreparationCode
  readonly stage: string
  readonly httpStatus: number
  readonly retryable: boolean

  constructor(
    code: GatewayMovePreparationCode,
    stage: string,
    httpStatus: number,
    retryable: boolean,
  ) {
    super(code)
    this.code = code
    this.stage = stage
    this.httpStatus = httpStatus
    this.retryable = retryable
  }
}

const decimalPattern = /^(0|[1-9]\d{0,19})(?:\.(\d{1,6}))?$/
const readActions = new Set([
  'token.allowance', 'token.balanceOf', 'token.name', 'native.balanceOf',
  'usdc.allowance', 'usdc.balanceOf', 'usdc.name', 'gateway.v1.isDelegate',
  'gateway.v1.withdrawingBalance', 'gateway.v1.withdrawalBlock',
])

export function parseGatewayMoveAmount(value: unknown) {
  if (typeof value !== 'string') throw new GatewayMovePreparationError('INVALID_AMOUNT', 'request', 400, false)
  const match = decimalPattern.exec(value)
  if (!match) throw new GatewayMovePreparationError('INVALID_AMOUNT', 'request', 400, false)
  const baseUnits = BigInt(match[1]) * 1_000_000n + BigInt((match[2] || '').padEnd(6, '0') || '0')
  if (baseUnits <= 0n) throw new GatewayMovePreparationError('INVALID_AMOUNT', 'request', 400, false)
  const fraction = (baseUnits % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
  return {
    amount: fraction ? `${baseUnits / 1_000_000n}.${fraction}` : (baseUnits / 1_000_000n).toString(),
    amountBaseUnits: baseUnits.toString(),
  }
}

const signingForbidden = () => {
  throw new GatewayMovePreparationError('SIGNING_NOT_ALLOWED', 'estimate', 502, false)
}

export function estimateOnlyGatewayAdapter<T extends object>(adapter: T): T {
  return new Proxy(adapter, {
    get(target, key) {
      if (key === 'prepareAction') return async (action: string, ...args: unknown[]) => {
        if (action === 'gateway.v1.signBurnIntents') return signingForbidden()
        const prepare = Reflect.get(target, key, target) as (...values: unknown[]) => Promise<object>
        const prepared = await prepare.call(target, action, ...args)
        return new Proxy(prepared, {
          get(request, property) {
            if (property === 'execute' && !readActions.has(action)) return signingForbidden
            const result = Reflect.get(request, property, request)
            return typeof result === 'function' ? result.bind(request) : result
          },
        })
      }
      if (key === 'readAction') return (action: string, ...args: unknown[]) => {
        if (!readActions.has(action)) return signingForbidden()
        const read = Reflect.get(target, key, target) as (...values: unknown[]) => unknown
        return read.call(target, action, ...args)
      }
      if (['executeAction', 'signTypedData', 'sendTransaction', 'sendCalls'].includes(String(key))) return signingForbidden
      const result = Reflect.get(target, key, target)
      return typeof result === 'function' ? result.bind(target) : result
    },
  })
}

type FeeAllocation = { chain: string; amount: string; amountBaseUnits: string }
export type SanitizedGatewayMoveFee = {
  type: 'provider' | 'gasFee' | 'kit'
  token: 'USDC'
  amount: string
  amountBaseUnits: string
  allocations?: FeeAllocation[]
}

export function sanitizeGatewayMoveFees(value: unknown): SanitizedGatewayMoveFee[] {
  if (!Array.isArray(value)) throw new GatewayMovePreparationError('INVALID_PROVIDER_RESPONSE', 'estimate', 502, false)
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== 'object') throw new GatewayMovePreparationError('INVALID_PROVIDER_RESPONSE', 'estimate', 502, false)
    const fee = candidate as Record<string, unknown>
    if (fee.type === 'forwarder') throw new GatewayMovePreparationError('INVALID_PROVIDER_RESPONSE', 'estimate', 502, false)
    if (!['provider', 'gasFee', 'kit'].includes(String(fee.type)) || fee.token !== 'USDC') {
      throw new GatewayMovePreparationError('INVALID_PROVIDER_RESPONSE', 'estimate', 502, false)
    }
    let parsed
    try {
      parsed = parseGatewayMoveAmount(fee.amount)
    } catch {
      throw new GatewayMovePreparationError('INVALID_PROVIDER_RESPONSE', 'estimate', 502, false)
    }
    let allocations: FeeAllocation[] | undefined
    if (fee.allocations !== undefined) {
      if (!Array.isArray(fee.allocations)) throw new GatewayMovePreparationError('INVALID_PROVIDER_RESPONSE', 'estimate', 502, false)
      allocations = fee.allocations.map((entry) => {
        if (!entry || typeof entry !== 'object') throw new GatewayMovePreparationError('INVALID_PROVIDER_RESPONSE', 'estimate', 502, false)
        const allocation = entry as Record<string, unknown>
        if (allocation.chain !== polygonChain) {
          throw new GatewayMovePreparationError('INVALID_PROVIDER_RESPONSE', 'estimate', 502, false)
        }
        let amount
        try {
          amount = parseGatewayMoveAmount(allocation.amount)
        } catch {
          throw new GatewayMovePreparationError('INVALID_PROVIDER_RESPONSE', 'estimate', 502, false)
        }
        return { chain: allocation.chain, amount: amount.amount, amountBaseUnits: amount.amountBaseUnits }
      })
      const allocationTotal = allocations.reduce((total, allocation) => total + BigInt(allocation.amountBaseUnits), 0n)
      if (allocationTotal !== BigInt(parsed.amountBaseUnits)) {
        throw new GatewayMovePreparationError('INVALID_PROVIDER_RESPONSE', 'estimate', 502, false)
      }
    }
    return {
      type: fee.type as SanitizedGatewayMoveFee['type'], token: 'USDC', amount: parsed.amount,
      amountBaseUnits: parsed.amountBaseUnits, ...(allocations ? { allocations } : {}),
    }
  })
}

type ReadinessSnapshot = {
  readinessStatus: string
  polygon: { walletFound: boolean; address?: string; bytecodeDetected?: boolean }
  gateway: { availableBalanceBaseUnits: string; pendingBalanceBaseUnits: string } | null
}

type PreparationDependencies = {
  accountId: string
  preparationKey: string
  amount: unknown
  apiKey: string
  userToken: string
  arcWallet: CircleWallet
  wallets: CircleWallet[]
  readiness: ReadinessSnapshot
  rpcUrls: Record<number, string>
  createAdapter: (options: Record<string, unknown>) => Promise<object>
  createKit: () => { unifiedBalance: { estimateSpend: (params: Record<string, unknown>) => Promise<unknown> } }
  readArcBalance: (address: string) => Promise<string>
  now?: () => Date
}

export async function prepareGatewayMoveEstimate(dependencies: PreparationDependencies) {
  const parsedAmount = parseGatewayMoveAmount(dependencies.amount)
  const polygonWallets = dependencies.wallets.filter((wallet) => wallet.blockchain === 'MATIC-AMOY' && wallet.accountType === 'SCA')
  if (polygonWallets.length > 1) throw new GatewayMovePreparationError('INVALID_PROVIDER_RESPONSE', 'wallet_correlation', 409, false)
  const polygonWallet = polygonWallets[0] || null
  if (!polygonWallet) throw new GatewayMovePreparationError('POLYGON_WALLET_MISSING', 'wallet_correlation', 409, false)
  if (!dependencies.readiness.polygon.bytecodeDetected) {
    throw new GatewayMovePreparationError('POLYGON_SCA_UNDEPLOYED', 'polygon_bytecode', 409, false)
  }
  if (dependencies.readiness.readinessStatus !== 'GATEWAY_READY' || !dependencies.readiness.gateway) {
    throw new GatewayMovePreparationError('GATEWAY_NOT_READY', 'gateway_balances', 409, false)
  }
  if (dependencies.readiness.polygon.address?.toLowerCase() !== polygonWallet.address.toLowerCase()) {
    throw new GatewayMovePreparationError('INVALID_PROVIDER_RESPONSE', 'wallet_correlation', 502, false)
  }
  const gatewayBefore = dependencies.readiness.gateway.availableBalanceBaseUnits
  if (!/^\d+$/.test(gatewayBefore)) throw new GatewayMovePreparationError('INVALID_PROVIDER_RESPONSE', 'gateway_balances', 502, false)
  let arcBefore: string
  try {
    arcBefore = await dependencies.readArcBalance(dependencies.arcWallet.address)
  } catch (error) {
    if (error instanceof GatewayMovePreparationError) throw error
    throw new GatewayMovePreparationError('ARC_RPC_UNAVAILABLE', 'arc_balance', 503, true)
  }
  if (!/^\d+$/.test(arcBefore)) throw new GatewayMovePreparationError('INVALID_PROVIDER_RESPONSE', 'arc_balance', 502, false)

  let adapter: object
  try {
    adapter = estimateOnlyGatewayAdapter(await dependencies.createAdapter({
      apiKey: dependencies.apiKey,
      userToken: dependencies.userToken,
      wallets: [polygonWallet, dependencies.arcWallet],
      rpcUrls: dependencies.rpcUrls,
      onChallenge: signingForbidden,
      resolveTypedDataSignature: signingForbidden,
    }))
  } catch (error) {
    if (error instanceof GatewayMovePreparationError) throw error
    throw new GatewayMovePreparationError('GATEWAY_PROVIDER_UNAVAILABLE', 'adapter', 503, true)
  }
  const params = {
    from: { adapter, allocations: [{ amount: parsedAmount.amount, chain: polygonChain }] },
    to: { adapter, chain: 'Arc_Testnet', recipientAddress: dependencies.arcWallet.address, useForwarder: false },
    amount: parsedAmount.amount,
    token: 'USDC',
  }
  let rawEstimate: { fees?: unknown }
  try {
    rawEstimate = await dependencies.createKit().unifiedBalance.estimateSpend(params) as { fees?: unknown }
  } catch (error) {
    if (error instanceof GatewayMovePreparationError) throw error
    throw new GatewayMovePreparationError('GATEWAY_PROVIDER_UNAVAILABLE', 'estimate', 503, true)
  }
  const fees = sanitizeGatewayMoveFees(rawEstimate?.fees)
  const required = BigInt(parsedAmount.amountBaseUnits) + fees.reduce((total, fee) => total + BigInt(fee.amountBaseUnits), 0n)
  if (BigInt(gatewayBefore) < required) {
    throw new GatewayMovePreparationError('INSUFFICIENT_GATEWAY_BALANCE', 'estimate', 409, false)
  }
  const estimateCreatedAt = (dependencies.now || (() => new Date()))()
  return {
    createInput: {
      accountId: dependencies.accountId,
      preparationKey: dependencies.preparationKey,
      status: 'AWAITING_CONFIRMATION' as const,
      amountBaseUnits: parsedAmount.amountBaseUnits,
      sourceWalletId: polygonWallet.id,
      sourceAddress: polygonWallet.address.toLowerCase(),
      destinationWalletId: dependencies.arcWallet.id,
      destinationAddress: dependencies.arcWallet.address.toLowerCase(),
      estimatedFees: fees,
      requiredBaseUnits: required.toString(),
      gatewayBeforeBaseUnits: gatewayBefore,
      arcBeforeBaseUnits: arcBefore,
      estimateCreatedAt: estimateCreatedAt.toISOString(),
    },
    amount: parsedAmount.amount,
    fees,
    allocation: { amount: parsedAmount.amount, chain: polygonChain },
    estimateExpiresAt: new Date(estimateCreatedAt.getTime() + GATEWAY_MOVE_ESTIMATE_TTL_MS).toISOString(),
    params,
  }
}
