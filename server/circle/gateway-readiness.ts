export const gatewayReadinessConfig = Object.freeze({
  polygonBlockchain: 'MATIC-AMOY',
  polygonChain: 'Polygon_Amoy_Testnet',
  polygonDomain: 7,
  polygonUsdc: '0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582',
  gatewayWallet: '0x0077777d7eba4688bdef3e311b846f25870a19b9',
  arcBlockchain: 'ARC-TESTNET',
})

export type CircleWallet = {
  id: string
  address: string
  blockchain: string
  accountType: string
}

export type ReadinessStatus =
  | 'POLYGON_WALLET_MISSING'
  | 'POLYGON_SCA_UNDEPLOYED'
  | 'GATEWAY_READY'
  | 'GATEWAY_PENDING'
  | 'USDC_READY_NOT_DEPOSITED'
  | 'POLYGON_READY_NO_USDC'

export type GatewayReadinessFailureCode =
  | 'ACCOUNT_CIRCLE_MISMATCH'
  | 'ARC_WALLET_MISMATCH'
  | 'AMBIGUOUS_POLYGON_WALLETS'
  | 'CIRCLE_AUTH_UNAVAILABLE'
  | 'CIRCLE_PROVIDER_UNAVAILABLE'
  | 'POLYGON_RPC_UNAVAILABLE'
  | 'GATEWAY_PROVIDER_UNAVAILABLE'
  | 'INVALID_PROVIDER_RESPONSE'

export class GatewayReadinessError extends Error {
  readonly code: GatewayReadinessFailureCode
  readonly stage: string
  readonly httpStatus: number
  readonly retryable: boolean

  constructor(
    code: GatewayReadinessFailureCode,
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

const addressPattern = /^0x[0-9a-fA-F]{40}$/

export function parseUsdcBaseUnits(value: unknown) {
  if (typeof value !== 'string') throw new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', 'gateway_balances', 502, false)
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,6}))?$/.exec(value)
  if (!match) throw new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', 'gateway_balances', 502, false)
  return (BigInt(match[1]) * 1_000_000n + BigInt((match[2] || '').padEnd(6, '0') || '0')).toString()
}

export function parseRpcQuantity(value: unknown, stage: string) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', stage, 502, false)
  }
  return BigInt(value).toString()
}

export function correlateGatewayWallets(wallets: CircleWallet[], arcWallet: CircleWallet) {
  const exactArc = wallets.filter((wallet) => wallet.id === arcWallet.id
    && wallet.address.toLowerCase() === arcWallet.address.toLowerCase()
    && wallet.blockchain === gatewayReadinessConfig.arcBlockchain
    && wallet.accountType === 'SCA')
  if (exactArc.length !== 1) throw new GatewayReadinessError('ARC_WALLET_MISMATCH', 'wallet_correlation', 409, false)

  const polygonScas = wallets.filter((wallet) => wallet.blockchain === gatewayReadinessConfig.polygonBlockchain && wallet.accountType === 'SCA')
  if (polygonScas.length > 1) throw new GatewayReadinessError('AMBIGUOUS_POLYGON_WALLETS', 'wallet_correlation', 409, false)
  const polygonWallet = polygonScas[0] || null
  if (polygonWallet && !addressPattern.test(polygonWallet.address)) {
    throw new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', 'circle_wallets', 502, false)
  }
  return polygonWallet
}

export function readinessStatus(input: { usdc: string; allowance: string; available: string; pending: string }): ReadinessStatus {
  const available = BigInt(input.available)
  const pending = BigInt(input.pending)
  const usdc = BigInt(input.usdc)
  BigInt(input.allowance)
  if (available > 0n) return 'GATEWAY_READY'
  if (pending > 0n) return 'GATEWAY_PENDING'
  if (usdc > 0n) return 'USDC_READY_NOT_DEPOSITED'
  return 'POLYGON_READY_NO_USDC'
}

type ReadinessDependencies = {
  listWallets: () => Promise<CircleWallet[]>
  readBytecode: (address: string) => Promise<string>
  readUsdcBalance: (address: string) => Promise<string>
  readAllowance: (address: string) => Promise<string>
  readGatewayBalances: (address: string) => Promise<{ available: string; pending: string }>
  now?: () => string
}

export async function inspectGatewayReadiness(arcWallet: CircleWallet, dependencies: ReadinessDependencies) {
  let wallets: CircleWallet[]
  try {
    wallets = await dependencies.listWallets()
  } catch (error) {
    if (error instanceof GatewayReadinessError) throw error
    throw new GatewayReadinessError('CIRCLE_PROVIDER_UNAVAILABLE', 'circle_wallets', 503, true)
  }
  if (!Array.isArray(wallets)) throw new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', 'circle_wallets', 502, false)
  const polygonWallet = correlateGatewayWallets(wallets, arcWallet)
  const checkedAt = (dependencies.now || (() => new Date().toISOString()))()
  const arc = { blockchain: gatewayReadinessConfig.arcBlockchain, address: arcWallet.address }
  if (!polygonWallet) {
    return {
      ok: true as const, environment: 'TESTNET' as const, readinessStatus: 'POLYGON_WALLET_MISSING' as const,
      checkedAt, arc, polygon: { blockchain: gatewayReadinessConfig.polygonBlockchain, walletFound: false as const }, gateway: null,
    }
  }

  let bytecode: string
  try {
    bytecode = await dependencies.readBytecode(polygonWallet.address)
  } catch (error) {
    if (error instanceof GatewayReadinessError) throw error
    throw new GatewayReadinessError('POLYGON_RPC_UNAVAILABLE', 'polygon_bytecode', 503, true)
  }
  if (typeof bytecode !== 'string' || !/^0x(?:[0-9a-fA-F]{2})*$/.test(bytecode)) {
    throw new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', 'polygon_bytecode', 502, false)
  }
  if (bytecode === '0x') {
    return {
      ok: true as const, environment: 'TESTNET' as const, readinessStatus: 'POLYGON_SCA_UNDEPLOYED' as const,
      checkedAt, arc,
      polygon: { blockchain: gatewayReadinessConfig.polygonBlockchain, walletFound: true as const, address: polygonWallet.address, accountType: 'SCA' as const, bytecodeDetected: false },
      gateway: null,
    }
  }

  let usdc: string
  let allowance: string
  try {
    ;[usdc, allowance] = await Promise.all([
      dependencies.readUsdcBalance(polygonWallet.address),
      dependencies.readAllowance(polygonWallet.address),
    ])
  } catch (error) {
    if (error instanceof GatewayReadinessError) throw error
    throw new GatewayReadinessError('POLYGON_RPC_UNAVAILABLE', 'polygon_token_state', 503, true)
  }
  let gateway: { available: string; pending: string }
  try {
    gateway = await dependencies.readGatewayBalances(polygonWallet.address)
  } catch (error) {
    if (error instanceof GatewayReadinessError) throw error
    throw new GatewayReadinessError('GATEWAY_PROVIDER_UNAVAILABLE', 'gateway_balances', 503, true)
  }
  for (const [value, stage] of [[usdc, 'polygon_usdc'], [allowance, 'gateway_allowance'], [gateway.available, 'gateway_balances'], [gateway.pending, 'gateway_balances']] as const) {
    if (!/^\d+$/.test(value)) throw new GatewayReadinessError('INVALID_PROVIDER_RESPONSE', stage, 502, false)
  }

  return {
    ok: true as const, environment: 'TESTNET' as const,
    readinessStatus: readinessStatus({ usdc, allowance, available: gateway.available, pending: gateway.pending }), checkedAt, arc,
    polygon: {
      blockchain: gatewayReadinessConfig.polygonBlockchain, walletFound: true as const, address: polygonWallet.address,
      accountType: 'SCA' as const, bytecodeDetected: true, usdcBalanceBaseUnits: usdc, gatewayAllowanceBaseUnits: allowance,
    },
    gateway: { domain: gatewayReadinessConfig.polygonDomain, availableBalanceBaseUnits: gateway.available, pendingBalanceBaseUnits: gateway.pending },
  }
}
