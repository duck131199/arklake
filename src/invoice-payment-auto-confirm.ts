export type PaymentFetch = typeof fetch

const validTxHash = (value: unknown): value is string => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value)
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

export async function resolveCirclePaymentTxHash(input: {
  endpoint: string
  userToken: string
  walletId: string
  invoiceId: string
  fetcher?: PaymentFetch
  sleep?: (milliseconds: number) => Promise<unknown>
  attempts?: number
  intervalMs?: number
}) {
  const fetcher = input.fetcher || fetch
  const sleep = input.sleep || wait
  const attempts = input.attempts || 12
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetcher(input.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resolveTransferTransactionHash', userToken: input.userToken, walletId: input.walletId, referenceId: input.invoiceId }),
    })
    const payload = await response.json().catch(() => null) as { txHash?: string; pending?: boolean; error?: string } | null
    if (response.ok && validTxHash(payload?.txHash)) return payload.txHash.toLowerCase()
    if (!response.ok || !payload?.pending) throw new Error(payload?.error || 'Circle transaction could not be resolved.')
    if (attempt + 1 < attempts) await sleep(input.intervalMs || 3000)
  }
  throw new Error('Payment was submitted, but confirmation is taking longer than expected. You can return to this invoice later.')
}

export async function autoVerifyInvoicePayment(input: {
  invoiceId: string
  txHash: string
  intentId?: string
  intentToken?: string
  fetcher?: PaymentFetch
  sleep?: (milliseconds: number) => Promise<unknown>
  attempts?: number
  intervalMs?: number
}) {
  if (!validTxHash(input.txHash)) throw new Error('Payment was submitted, but its transaction hash is not available yet.')
  const fetcher = input.fetcher || fetch
  const sleep = input.sleep || wait
  const attempts = input.attempts || 12
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetcher('/api/invoice-payment-verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId: input.invoiceId, txHash: input.txHash, intentId: input.intentId, intentToken: input.intentToken }),
    })
    const payload = await response.json().catch(() => null) as { paid?: boolean; retryable?: boolean; error?: string } | null
    if (response.ok && payload?.paid) return { txHash: input.txHash.toLowerCase() }
    if (!payload?.retryable) throw new Error(payload?.error || 'Payment could not be verified.')
    if (attempt + 1 < attempts) await sleep(input.intervalMs || 3000)
  }
  throw new Error('Payment was submitted, but confirmation is taking longer than expected. You can return to this invoice later.')
}
