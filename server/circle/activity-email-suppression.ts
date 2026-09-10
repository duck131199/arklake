export function shouldSuppressGenericActivityEmail(activityType: string, txHash: string | null, invoicePaymentHashes: Set<string>) {
  return (activityType === 'send' || activityType === 'receive')
    && typeof txHash === 'string'
    && invoicePaymentHashes.has(txHash.toLowerCase())
}
