import { encodeFunctionData } from 'viem'

export const arklakeInvoicePaymentV2Address = '0x7ef8d661e800ec959daaae67a8bd4faaae3a43d7'
export const arklakeInvoicePaymentMemoMaxBytes = 64
export const arklakeInvoicePaymentReferenceMaxBytes = 32

export const invoicePaymentEventAbi = [{
  type: 'event', name: 'InvoicePayment', inputs: [
    { indexed: true, name: 'referenceHash', type: 'bytes32' },
    { indexed: true, name: 'payer', type: 'address' },
    { indexed: true, name: 'recipient', type: 'address' },
    { indexed: false, name: 'token', type: 'address' },
    { indexed: false, name: 'amount', type: 'uint256' },
    { indexed: false, name: 'paymentReference', type: 'string' },
    { indexed: false, name: 'memo', type: 'string' },
  ],
}] as const

export const invoicePaymentEventDataAbi = [
  { name: 'token', type: 'address' },
  { name: 'amount', type: 'uint256' },
  { name: 'paymentReference', type: 'string' },
  { name: 'memo', type: 'string' },
] as const

const approveAbi = [{
  type: 'function', name: 'approve', stateMutability: 'nonpayable',
  inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }],
}] as const

const payAbi = [{
  type: 'function', name: 'pay', stateMutability: 'nonpayable',
  inputs: [
    { name: 'recipient', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'paymentReference', type: 'string' },
    { name: 'memo', type: 'string' },
  ], outputs: [],
}] as const

export const invoicePaymentBatchSignature = 'executeBatch((address,uint256,bytes)[])'

export function utf8ByteLength(value: string) {
  return new TextEncoder().encode(value).length
}

export function buildArklakeInvoicePaymentBatch(input: {
  usdcAddress: `0x${string}`
  recipient: `0x${string}`
  amount: bigint
  paymentReference: string
  memo: string
}) {
  const referenceBytes = utf8ByteLength(input.paymentReference)
  if (referenceBytes < 1 || referenceBytes > arklakeInvoicePaymentReferenceMaxBytes) throw new Error('Invalid on-chain invoice reference.')
  if (utf8ByteLength(input.memo) > arklakeInvoicePaymentMemoMaxBytes) throw new Error('Invoice Description exceeds the 64-byte on-chain Memo limit.')
  if (input.amount <= 0n) throw new Error('Invalid on-chain invoice amount.')

  const approve = encodeFunctionData({ abi: approveAbi, functionName: 'approve', args: [arklakeInvoicePaymentV2Address, input.amount] })
  const pay = encodeFunctionData({
    abi: payAbi,
    functionName: 'pay',
    args: [input.recipient, input.amount, input.paymentReference, input.memo],
  })
  return [[
    [input.usdcAddress, '0', approve],
    [arklakeInvoicePaymentV2Address, '0', pay],
  ]]
}

export function buildArklakeInvoicePaymentCalls(input: Parameters<typeof buildArklakeInvoicePaymentBatch>[0]) {
  return buildArklakeInvoicePaymentBatch(input)[0].map(([to, value, data]) => ({
    to: to as `0x${string}`,
    value: BigInt(value),
    data: data as `0x${string}`,
  }))
}
