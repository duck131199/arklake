export type CircleTransaction = {
  id: string
  walletId?: string
  blockchain?: string
  state?: string
  transactionType?: string
  operation?: string
  amounts?: string[]
  tokenId?: string
  token?: { id?: string; symbol?: string; tokenAddress?: string; decimals?: number }
  sourceAddress?: string
  destinationAddress?: string
  txHash?: string
  networkFee?: string
  createDate?: string
  updateDate?: string
}

export type TokenDetails = { id: string; symbol?: string; tokenAddress?: string; decimals?: number }

export type OnchainLeg = {
  txHash: string
  logIndex: number
  direction: 'in' | 'out'
  amount: string
  tokenId: string
  tokenAddress: string
  tokenSymbol?: string
  tokenDecimals: number
  sourceAddress: string
  destinationAddress: string
}

export type NormalizedActivity = {
  dedupKey: string
  circleTransactionId: string
  circleTransactionIds: string[]
  blockchain: string
  txHash: string | null
  activityType: 'receive' | 'send' | 'swap'
  status: 'processing' | 'confirmed' | 'failed' | 'attention'
  circleState: string | null
  operation: string | null
  sourceAddress: string | null
  destinationAddress: string | null
  occurredAt: string
  confirmedAt: string | null
  rawCircle: CircleTransaction[]
  legs: Array<{
    legKey: string
    direction: 'in' | 'out'
    amount: string
    tokenId: string | null
    tokenAddress: string | null
    tokenSymbol: string | null
    tokenDecimals: number | null
    sourceAddress: string | null
    destinationAddress: string | null
  }>
}

const terminalSuccess = new Set(['CONFIRMED', 'COMPLETE'])
const terminalFailure = new Set(['FAILED', 'DENIED', 'CANCELLED'])

function normalizedStatus(states: string[]): NormalizedActivity['status'] {
  if (states.some((state) => terminalFailure.has(state))) return 'failed'
  if (states.some((state) => state === 'STUCK')) return 'attention'
  if (states.length > 0 && states.every((state) => terminalSuccess.has(state))) return 'confirmed'
  return 'processing'
}

function groupKey(transaction: CircleTransaction) {
  return transaction.txHash
    ? `${transaction.blockchain || 'UNKNOWN'}:${transaction.txHash.toLowerCase()}`
    : `${transaction.blockchain || 'UNKNOWN'}:circle:${transaction.id}`
}

function validAmounts(transaction: CircleTransaction) {
  return (transaction.amounts || []).filter((amount) => typeof amount === 'string' && /^\d+(?:\.\d+)?$/.test(amount))
}

function decimalKey(amount: string) {
  const [whole, fraction = ''] = amount.split('.')
  return `${whole.replace(/^0+(?=\d)/, '')}.${fraction.replace(/0+$/, '')}`
}

function sameAsset(circleLeg: { tokenId: string | null; tokenAddress: string | null }, receiptLeg: OnchainLeg) {
  if (circleLeg.tokenAddress && receiptLeg.tokenAddress) return circleLeg.tokenAddress.toLowerCase() === receiptLeg.tokenAddress.toLowerCase()
  return Boolean(circleLeg.tokenId && circleLeg.tokenId === receiptLeg.tokenId)
}

export function normalizeCircleTransactions(
  transactions: CircleTransaction[],
  tokens: Map<string, TokenDetails> = new Map(),
  walletId = 'unknown-wallet',
  onchainLegs: Map<string, OnchainLeg[]> = new Map(),
) {
  const groups = new Map<string, CircleTransaction[]>()
  for (const transaction of transactions) {
    if (!transaction?.id) continue
    const key = groupKey(transaction)
    groups.set(key, [...(groups.get(key) || []), transaction])
  }

  const activities: NormalizedActivity[] = []
  for (const [transactionKey, group] of groups) {
    const circleLegs = group.flatMap((transaction) => {
      const direction = transaction.transactionType === 'INBOUND' ? 'in' as const
        : transaction.transactionType === 'OUTBOUND' ? 'out' as const : null
      if (!direction) return []
      const tokenId = transaction.tokenId || transaction.token?.id || null
      const token = tokenId ? tokens.get(tokenId) : undefined
      return validAmounts(transaction).map((amount, index) => ({
        legKey: `${transaction.id}:${direction}:${tokenId || 'native'}:${index}`,
        direction,
        amount,
        tokenId,
        tokenAddress: token?.tokenAddress || transaction.token?.tokenAddress || null,
        tokenSymbol: token?.symbol || transaction.token?.symbol || null,
        tokenDecimals: token?.decimals ?? transaction.token?.decimals ?? null,
        sourceAddress: transaction.sourceAddress || null,
        destinationAddress: transaction.destinationAddress || null,
      }))
    })
    const receiptLegs = firstWithHash(group)?.txHash ? onchainLegs.get(firstWithHash(group)!.txHash!.toLowerCase()) || [] : []
    const receiptInbound = new Set(receiptLegs.filter((leg) => leg.direction === 'in').map((leg) => leg.tokenId))
    const receiptOutbound = new Set(receiptLegs.filter((leg) => leg.direction === 'out').map((leg) => leg.tokenId))
    const receiptProvesSwap = receiptInbound.size > 0 && receiptOutbound.size > 0
      && [...receiptInbound].some((token) => !receiptOutbound.has(token))
    const legs = receiptProvesSwap ? receiptLegs.map((leg) => {
      const amountMatches = circleLegs.filter((candidate) => candidate.direction === leg.direction
        && decimalKey(candidate.amount) === decimalKey(leg.amount))
      const matchingCircleLeg = amountMatches.find((candidate) => sameAsset(candidate, leg))
        || (amountMatches.length === 1 ? amountMatches[0] : undefined)
      const owner = group.find((transaction) => transaction.transactionType === (leg.direction === 'in' ? 'INBOUND' : 'OUTBOUND')) || group[0]
      return {
        legKey: matchingCircleLeg?.legKey || `${owner.id}:${leg.direction}:${leg.tokenId}:log:${leg.logIndex}`,
        direction: leg.direction,
        amount: leg.amount,
        tokenId: leg.tokenId,
        tokenAddress: leg.tokenAddress,
        tokenSymbol: leg.tokenSymbol || null,
        tokenDecimals: leg.tokenDecimals,
        sourceAddress: leg.sourceAddress,
        destinationAddress: leg.destinationAddress,
      }
    }) : circleLegs
    if (!legs.length) continue

    const inboundTokens = new Set(legs.filter((leg) => leg.direction === 'in').map((leg) => leg.tokenId || leg.tokenAddress || leg.tokenSymbol))
    const outboundTokens = new Set(legs.filter((leg) => leg.direction === 'out').map((leg) => leg.tokenId || leg.tokenAddress || leg.tokenSymbol))
    const isSwap = inboundTokens.size > 0 && outboundTokens.size > 0
      && [...inboundTokens].some((token) => token && !outboundTokens.has(token))
    const transfer = group.find((transaction) => transaction.operation === 'TRANSFER')
    const activityType = isSwap ? 'swap' as const
      : legs.every((leg) => leg.direction === 'in') ? 'receive' as const
        : legs.every((leg) => leg.direction === 'out') && transfer ? 'send' as const : null
    if (!activityType) continue

    const states = group.map((transaction) => transaction.state || '').filter(Boolean)
    const status = normalizedStatus(states)
    const timestamps = group.map((transaction) => transaction.createDate || transaction.updateDate).filter((value): value is string => Boolean(value))
    if (!timestamps.length) continue
    const occurredAt = timestamps.sort()[0]
    const updated = group.map((transaction) => transaction.updateDate).filter((value): value is string => Boolean(value)).sort().at(-1)
    const first = group[0]
    activities.push({
      dedupKey: `${walletId}:${transactionKey}`,
      circleTransactionId: first.id,
      circleTransactionIds: group.map((transaction) => transaction.id).sort(),
      blockchain: first.blockchain || 'UNKNOWN',
      txHash: first.txHash || null,
      activityType,
      status,
      circleState: states.length === 1 ? states[0] : states.join(','),
      operation: isSwap ? 'CONTRACT_EXECUTION' : transfer?.operation || first.operation || null,
      sourceAddress: first.sourceAddress || null,
      destinationAddress: first.destinationAddress || null,
      occurredAt,
      confirmedAt: status === 'confirmed' ? updated || occurredAt : null,
      rawCircle: group,
      legs,
    })
  }
  return activities.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
}

function firstWithHash(group: CircleTransaction[]) {
  return group.find((transaction) => transaction.txHash)
}
