import { ARC_TESTNET, EXPECTED_ARC_SCA, POLYGON_AMOY, parseUsdcDecimalToBaseUnits } from './gateway-burn-intent.mjs'
import { prepareUnifiedBalanceEstimate } from './unified-balance-estimate.mjs'

export const TERMINAL_A4_STATES = new Set(['COMPLETED', 'FAILED', 'UNKNOWN'])

export function a4SpendParams(adapter) {
  return {
    from: { adapter, allocations: [{ amount: '1', chain: POLYGON_AMOY.chain }] },
    to: { adapter, chain: ARC_TESTNET.chain, recipientAddress: EXPECTED_ARC_SCA, useForwarder: false },
    amount: '1', token: 'USDC',
  }
}

export function sanitizeSpendResult(result) {
  const cleanFees = Array.isArray(result?.fees) ? result.fees.map((fee) => ({
    type: fee?.type, token: fee?.token, amount: fee?.amount,
    ...(Array.isArray(fee?.allocations) ? { allocations: fee.allocations.map(({ chain, amount }) => ({ chain, amount })) } : {}),
  })) : []
  const cleanSteps = Array.isArray(result?.steps) ? result.steps.map((step) => ({
    name: step?.name, state: step?.state,
    ...(typeof step?.txHash === 'string' ? { txHash: step.txHash } : {}),
    ...(typeof step?.explorerUrl === 'string' ? { explorerUrl: step.explorerUrl } : {}),
    ...(typeof step?.errorMessage === 'string' ? { errorMessage: step.errorMessage.slice(0, 300) } : {}),
  })) : []
  return {
    destinationChain: result?.destinationChain,
    recipientAddress: result?.recipientAddress,
    allocations: Array.isArray(result?.allocations) ? result.allocations.map(({ chain, amount, sourceAccount }) => ({ chain, amount, sourceAccount })) : [],
    fees: cleanFees, steps: cleanSteps,
    txHash: typeof result?.txHash === 'string' ? result.txHash : null,
    explorerUrl: typeof result?.explorerUrl === 'string' ? result.explorerUrl : null,
    transferId: typeof result?.transferId === 'string' ? result.transferId : null,
  }
}

export function classifySpendError(error) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown spend failure.')
  const failed = /reject|denied|cancel|validation|insufficient|revert|unsupported|4\d\d/i.test(message)
  return { state: failed ? 'FAILED' : 'UNKNOWN', error: message.slice(0, 500) }
}

export async function executeA4Spend({ operation, estimateDependencies, createAdapter, createKit, adapterOptions, readGatewayBalance, readArcBalance, readReceipt }) {
  operation.state = 'PREPARING'
  const fresh = await prepareUnifiedBalanceEstimate(estimateDependencies)
  if (!fresh.success) throw new Error(fresh.error || 'Fresh spend preflight failed.')
  operation.preflight = fresh
  const adapter = await createAdapter({
    ...adapterOptions,
    onChallenge: (challenge) => operation.addChallenge(challenge),
    onProgress: (progress) => operation.addProgress(progress),
    resolveTypedDataSignature: (challenge) => operation.waitForSignature(challenge),
  })
  operation.state = 'SIGNING'
  const result = await createKit().unifiedBalance.spend(a4SpendParams(adapter))
  operation.state = 'SUBMITTING'
  const sanitized = sanitizeSpendResult(result)
  const [gatewayAfter, arcAfter] = await Promise.all([readGatewayBalance(), readArcBalance()])
  const beforeGateway = parseUsdcDecimalToBaseUnits(fresh.gatewayBalanceBefore)
  const afterGateway = parseUsdcDecimalToBaseUnits(gatewayAfter)
  const beforeArc = BigInt(fresh.arcUsdcBalanceBeforeBaseUnits)
  const afterArc = BigInt(arcAfter)
  let receipt = null
  if (sanitized.txHash) receipt = await readReceipt(sanitized.txHash)
  const receiptSuccess = receipt?.status === 'success' || receipt?.status === 1 || receipt?.status === '0x1'
  const evidenceComplete = Boolean(sanitized.txHash && receiptSuccess && afterArc - beforeArc >= 1_000_000n)
  operation.result = {
    ...sanitized,
    gatewayBalanceAfter: gatewayAfter,
    gatewayDeltaBaseUnits: (afterGateway - beforeGateway).toString(),
    arcUsdcBalanceAfterBaseUnits: arcAfter,
    arcDeltaBaseUnits: (afterArc - beforeArc).toString(),
    receiptStatus: receiptSuccess ? 'SUCCESS' : receipt ? 'FAILED' : null,
  }
  operation.state = evidenceComplete ? 'COMPLETED' : 'UNKNOWN'
  if (!evidenceComplete) operation.error = 'Kit returned, but destination receipt and balance evidence were not both conclusive.'
  return operation
}

export class A4SpendOperation {
  constructor(owner, id) { this.owner = owner; this.id = id; this.state = 'READY'; this.challenges = []; this.progress = []; this.waiters = new Map(); this.started = false }
  start() { if (this.started || this.state !== 'READY') throw new Error('This A4.2b operation is already locked.'); this.started = true; this.state = 'PREPARING' }
  addChallenge({ challengeId, intent }) {
    if (this.challenges.some((item) => item.challengeId === challengeId)) return
    this.state = 'SIGNING'
    this.challenges.push({ challengeId, kind: intent?.step || intent?.action || 'circle-approval' })
    this.waiters.set(challengeId, {})
  }
  addProgress(progress) {
    this.progress.push({ sequence: progress?.sequence, stage: progress?.stage, status: progress?.status, challengeId: progress?.challengeId, transactionId: progress?.transactionId, txHash: progress?.txHash })
    if (this.progress.length > 20) this.progress.shift()
  }
  waitForSignature({ challengeId }) {
    const existing = this.waiters.get(challengeId)
    if (existing?.signature) return existing.signature
    return new Promise((resolve, reject) => this.waiters.set(challengeId, { resolve, reject }))
  }
  resolve(challengeId, signature) {
    const waiter = this.waiters.get(challengeId)
    if (!waiter || !/^0x[0-9a-fA-F]{130}$/.test(signature || '')) throw new Error('No matching typed-data signature request.')
    this.state = 'SUBMITTING'
    if (waiter.resolve) { this.waiters.delete(challengeId); waiter.resolve(signature) }
    else this.waiters.set(challengeId, { signature })
  }
  reject(challengeId) { const waiter = this.waiters.get(challengeId); if (waiter) { this.waiters.delete(challengeId); waiter.reject(new Error('Circle approval was rejected.')) } }
  public() { return { operationId: this.id, state: this.state, challenges: this.challenges, progress: this.progress, preflight: this.preflight || null, result: this.result || null, error: this.error || null, locked: this.started || TERMINAL_A4_STATES.has(this.state) } }
}
