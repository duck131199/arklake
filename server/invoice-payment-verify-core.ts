import { arcTestnet } from 'viem/chains'
import { usdc } from 'viem/tokens'

export const invoicePaymentChainId = arcTestnet.id
export const invoicePaymentUsdcAddress = usdc.addresses[arcTestnet.id].toLowerCase()
export const invoicePaymentMinimumConfirmations = 2n
export const erc20TransferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

export type InvoicePaymentSnapshot = { amount: string; asset: string; recipientAddress: string; createdAt: string; expiresAt: string }
export type InvoicePaymentReceipt = {
  status?: string
  blockNumber?: string
  logs?: Array<{ address?: string; topics?: string[]; data?: string }>
}

export function normalizePaymentTxHash(value: unknown) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value.trim())) return null
  return value.trim().toLowerCase()
}

export function invoiceUsdcBaseUnits(amount: string) {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(amount)) return null
  const [whole, fraction = ''] = amount.split('.')
  const units = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))
  return units > 0n ? units : null
}

function topicAddress(topic: string | undefined) {
  return topic && /^0x[0-9a-fA-F]{64}$/.test(topic) ? `0x${topic.slice(-40)}`.toLowerCase() : null
}

function hexBigInt(value: string | undefined) {
  try { return value && /^0x[0-9a-fA-F]+$/.test(value) ? BigInt(value) : null } catch { return null }
}

export function verifyInvoicePaymentReceipt(input: {
  chainId: string
  latestBlock: string
  blockTimestamp: string
  receipt: InvoicePaymentReceipt | null
  invoice: InvoicePaymentSnapshot
}) {
  if (hexBigInt(input.chainId) !== BigInt(invoicePaymentChainId)) return { ok: false, reason: 'wrong-chain' } as const
  if (!input.receipt) return { ok: false, reason: 'missing-receipt' } as const
  if (input.receipt.status !== '0x1') return { ok: false, reason: input.receipt.status === '0x0' ? 'failed-receipt' : 'pending-receipt' } as const
  const receiptBlock = hexBigInt(input.receipt.blockNumber)
  const latestBlock = hexBigInt(input.latestBlock)
  if (receiptBlock === null || latestBlock === null || latestBlock < receiptBlock) return { ok: false, reason: 'pending-receipt' } as const
  if (latestBlock - receiptBlock + 1n < invoicePaymentMinimumConfirmations) return { ok: false, reason: 'insufficient-confirmations' } as const
  const blockTimestamp = hexBigInt(input.blockTimestamp)
  const createdAt = new Date(input.invoice.createdAt).getTime()
  const expiresAt = new Date(input.invoice.expiresAt).getTime()
  if (blockTimestamp === null || !Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) return { ok: false, reason: 'invalid-invoice' } as const
  const paidAt = Number(blockTimestamp) * 1000
  if (paidAt < createdAt || paidAt > expiresAt) return { ok: false, reason: 'outside-invoice-window' } as const
  if (input.invoice.asset !== 'USDC') return { ok: false, reason: 'wrong-asset' } as const
  const expectedAmount = invoiceUsdcBaseUnits(input.invoice.amount)
  const recipient = input.invoice.recipientAddress.toLowerCase()
  if (expectedAmount === null || !/^0x[0-9a-f]{40}$/.test(recipient)) return { ok: false, reason: 'invalid-invoice' } as const

  const canonicalTransfers = (input.receipt.logs || []).filter((log) => log.address?.toLowerCase() === invoicePaymentUsdcAddress
    && log.topics?.[0]?.toLowerCase() === erc20TransferTopic)
  const recipientTransfers = canonicalTransfers.filter((log) => topicAddress(log.topics?.[2]) === recipient)
  if (!recipientTransfers.length) return { ok: false, reason: canonicalTransfers.length ? 'wrong-recipient' : 'wrong-token' } as const
  const receivedAmount = recipientTransfers.reduce((total, log) => total + (hexBigInt(log.data) || 0n), 0n)
  if (receivedAmount !== expectedAmount) return { ok: false, reason: 'wrong-amount' } as const
  return { ok: true, receiptBlock: Number(receiptBlock), confirmations: Number(latestBlock - receiptBlock + 1n), paidAt: new Date(paidAt).toISOString() } as const
}
