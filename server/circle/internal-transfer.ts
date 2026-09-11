import { arcTestnet } from 'viem/chains'
import { usdc } from 'viem/tokens'

const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const addressPattern = /^0x[0-9a-fA-F]{40}$/

export const arcTestnetChainIdHex = '0x4cef52'
export const internalTransferUsdcAddress = usdc.addresses[arcTestnet.id].toLowerCase()

export type InternalTransferCandidate = {
  blockchain: string
  txHash: string | null
  activityType: 'receive' | 'send' | 'swap'
  status: string
  confirmedAt: string | null
  sourceAddress: string | null
  destinationAddress: string | null
  legs: Array<{ amount: string; tokenAddress: string | null; tokenSymbol: string | null }>
}

export type ArcReceipt = {
  status?: string
  transactionHash?: string
  logs?: Array<{ address?: string; data?: string; logIndex?: string; topics?: string[] }>
}

function topicAddress(topic?: string) {
  if (!topic || !/^0x[0-9a-fA-F]{64}$/.test(topic)) return null
  return `0x${topic.slice(-40)}`.toLowerCase()
}

function decimalUnits(amount: string, decimals: number) {
  if (!/^\d+(?:\.\d+)?$/.test(amount)) return null
  const [whole, fraction = ''] = amount.split('.')
  if (fraction.length > decimals) return null
  return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(fraction.padEnd(decimals, '0') || '0')
}

export function verifyInternalUsdcTransfer(candidate: InternalTransferCandidate, receipt: ArcReceipt | null) {
  if (candidate.blockchain !== 'ARC-TESTNET' || candidate.status !== 'confirmed' || !candidate.confirmedAt
    || (candidate.activityType !== 'send' && candidate.activityType !== 'receive') || !candidate.txHash
    || !addressPattern.test(candidate.sourceAddress || '') || !addressPattern.test(candidate.destinationAddress || '')
    || candidate.legs.length !== 1 || !receipt || receipt.status !== '0x1'
    || receipt.transactionHash?.toLowerCase() !== candidate.txHash.toLowerCase()) return null
  const expectedAmount = decimalUnits(candidate.legs[0].amount, 6)
  if (expectedAmount === null) return null
  const sourceAddress = candidate.sourceAddress!.toLowerCase()
  const destinationAddress = candidate.destinationAddress!.toLowerCase()
  const matches = (receipt.logs || []).flatMap((log) => {
    if (log.address?.toLowerCase() !== internalTransferUsdcAddress || log.topics?.[0]?.toLowerCase() !== transferTopic
      || !/^0x[0-9a-fA-F]+$/.test(log.data || '') || !/^0x[0-9a-fA-F]+$/.test(log.logIndex || '')) return []
    const source = topicAddress(log.topics?.[1])
    const destination = topicAddress(log.topics?.[2])
    if (source !== sourceAddress || destination !== destinationAddress || BigInt(log.data!) !== expectedAmount) return []
    return [{ sourceAddress, destinationAddress, amount: candidate.legs[0].amount, logIndex: Number.parseInt(log.logIndex!, 16) }]
  })
  return matches.length === 1 ? matches[0] : null
}

export function internalCounterpartyAddress(candidate: InternalTransferCandidate) {
  return candidate.activityType === 'send' ? candidate.destinationAddress?.toLowerCase() || null
    : candidate.activityType === 'receive' ? candidate.sourceAddress?.toLowerCase() || null : null
}

export function counterpartyActivityType(candidate: InternalTransferCandidate, counterpartyAddress: string) {
  const address = counterpartyAddress.toLowerCase()
  if (address === candidate.sourceAddress?.toLowerCase()) return 'send' as const
  if (address === candidate.destinationAddress?.toLowerCase()) return 'receive' as const
  return null
}

export function reconciledDedupKey(walletId: string, blockchain: string, txHash: string) {
  return `${walletId}:${blockchain}:${txHash.toLowerCase()}`
}

export function reconciledLegKey(walletId: string, blockchain: string, txHash: string, logIndex: number) {
  return `reconciled:${walletId}:${blockchain}:${txHash.toLowerCase()}:${logIndex}`
}
