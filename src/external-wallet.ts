import { decodeFunctionResult, encodeFunctionData, formatUnits, parseUnits } from 'viem'
import { arcTestnet } from 'viem/chains'
import { usdc } from 'viem/tokens'
import { buildArklakeInvoicePaymentCalls } from '../server/invoice-payment-contract.js'

export const arcTestnetChainIdHex = `0x${arcTestnet.id.toString(16)}`
export const arcTestnetUsdcAddress = usdc.addresses[arcTestnet.id]
export const externalUsdcAmount = (amount: string) => parseUnits(amount, 6)

const usdcAbi = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
] as const

export type ExternalWalletProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

export function externalWalletError(error: unknown, fallback: string, rejection = 'Request rejected in your wallet.') {
  const candidate = error as { code?: number; message?: string } | null
  if (candidate?.code === 4001) return rejection
  return candidate?.message || fallback
}

export async function connectExternalWallet(provider: ExternalWalletProvider) {
  const accounts = await provider.request({ method: 'eth_requestAccounts' })
  if (!Array.isArray(accounts) || typeof accounts[0] !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(accounts[0])) throw new Error('The wallet did not return a valid account.')
  const chainId = await provider.request({ method: 'eth_chainId' })
  return { address: accounts[0], chainId: typeof chainId === 'string' ? chainId.toLowerCase() : '' }
}

export async function switchExternalWalletToArc(provider: ExternalWalletProvider) {
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: arcTestnetChainIdHex }] })
  } catch (error) {
    if ((error as { code?: number } | null)?.code !== 4902) throw error
    await provider.request({ method: 'wallet_addEthereumChain', params: [{
      chainId: arcTestnetChainIdHex,
      chainName: arcTestnet.name,
      nativeCurrency: arcTestnet.nativeCurrency,
      rpcUrls: [arcTestnet.rpcUrls.default.http[0]],
      blockExplorerUrls: [arcTestnet.blockExplorers.default.url],
    }] })
  }
}

export async function readExternalUsdcBalance(provider: ExternalWalletProvider, address: string) {
  const data = encodeFunctionData({ abi: usdcAbi, functionName: 'balanceOf', args: [address as `0x${string}`] })
  const result = await provider.request({ method: 'eth_call', params: [{ to: arcTestnetUsdcAddress, data }, 'latest'] })
  if (typeof result !== 'string') throw new Error('The wallet returned an invalid USDC balance.')
  const balance = decodeFunctionResult({ abi: usdcAbi, functionName: 'balanceOf', data: result as `0x${string}` })
  return { amount: formatUnits(balance, 6), raw: balance }
}

export async function submitExternalUsdcPayment(provider: ExternalWalletProvider, payer: string, recipient: string, amount: string) {
  const [chainId, accounts] = await Promise.all([
    provider.request({ method: 'eth_chainId' }),
    provider.request({ method: 'eth_accounts' }),
  ])
  if (typeof chainId !== 'string' || chainId.toLowerCase() !== arcTestnetChainIdHex) throw new Error('Switch to Arc Testnet before submitting payment.')
  if (!Array.isArray(accounts) || typeof accounts[0] !== 'string' || accounts[0].toLowerCase() !== payer.toLowerCase()) throw new Error('The connected wallet account changed. Review the payment again.')
  const data = encodeFunctionData({ abi: usdcAbi, functionName: 'transfer', args: [recipient as `0x${string}`, externalUsdcAmount(amount)] })
  const hash = await provider.request({ method: 'eth_sendTransaction', params: [{ from: payer, to: arcTestnetUsdcAddress, data }] })
  if (typeof hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error('The wallet did not return a transaction hash.')
  return hash
}

const txHashPattern = /^0x[0-9a-fA-F]{64}$/
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function walletCallsUnsupported(error: unknown) {
  const candidate = error as { code?: number; message?: string } | null
  return candidate?.code === -32601 || candidate?.code === 4200 || /not supported|unsupported method|method not found/i.test(candidate?.message || '')
}

async function waitForTransactionReceipt(provider: ExternalWalletProvider, txHash: string, pollMs = 1000, attempts = 120) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const receipt = await provider.request({ method: 'eth_getTransactionReceipt', params: [txHash] }) as { status?: string } | null
    if (receipt) {
      if (receipt.status && receipt.status !== '0x1') throw new Error('The wallet transaction failed on-chain.')
      return
    }
    await wait(pollMs)
  }
  throw new Error('The wallet transaction is still pending.')
}

async function submitAtomicCalls(provider: ExternalWalletProvider, payer: string, calls: Array<{ to: `0x${string}`; value: bigint; data: `0x${string}` }>, pollMs = 1000, attempts = 120) {
  const result = await provider.request({ method: 'wallet_sendCalls', params: [{
    version: '2.0.0', chainId: arcTestnetChainIdHex, from: payer,
    calls: calls.map(({ to, value, data }) => ({ to, value: `0x${value.toString(16)}`, data })),
  }] })
  if (typeof result === 'string' && txHashPattern.test(result)) return result
  const bundleId = typeof result === 'string' ? result : (result as { id?: unknown } | null)?.id
  if (typeof bundleId !== 'string' || !bundleId) throw new Error('The wallet did not return an atomic call identifier.')
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = await provider.request({ method: 'wallet_getCallsStatus', params: [bundleId] }) as {
      status?: number | string; receipts?: Array<{ transactionHash?: string; status?: string }>
    } | null
    const code = Number(status?.status)
    const txHash = status?.receipts?.map((receipt) => receipt.transactionHash).find((hash) => typeof hash === 'string' && txHashPattern.test(hash))
    if (code === 200 && txHash) return txHash
    if (code >= 400) throw new Error('The atomic wallet payment failed on-chain.')
    await wait(pollMs)
  }
  throw new Error('The atomic wallet payment is still pending.')
}

async function supportsAtomicCalls(provider: ExternalWalletProvider, payer: string) {
  try {
    const capabilities = await provider.request({ method: 'wallet_getCapabilities', params: [payer] }) as Record<string, {
      atomic?: { status?: string }; atomicBatch?: { supported?: boolean; status?: string }
    }> | null
    const chain = capabilities?.[arcTestnetChainIdHex] || capabilities?.[arcTestnetChainIdHex.toUpperCase()]
    return chain?.atomic?.status === 'supported' || chain?.atomicBatch?.supported === true || chain?.atomicBatch?.status === 'supported'
  } catch {
    return false
  }
}

export async function submitExternalInvoicePayment(input: {
  provider: ExternalWalletProvider
  payer: string
  recipient: string
  amount: string
  invoiceNumber: string
  memo: string
  pollMs?: number
  attempts?: number
}) {
  const [chainId, accounts] = await Promise.all([
    input.provider.request({ method: 'eth_chainId' }),
    input.provider.request({ method: 'eth_accounts' }),
  ])
  if (typeof chainId !== 'string' || chainId.toLowerCase() !== arcTestnetChainIdHex) throw new Error('Switch to Arc Testnet before submitting payment.')
  if (!Array.isArray(accounts) || typeof accounts[0] !== 'string' || accounts[0].toLowerCase() !== input.payer.toLowerCase()) throw new Error('The connected wallet account changed. Review the payment again.')
  const calls = buildArklakeInvoicePaymentCalls({
    usdcAddress: arcTestnetUsdcAddress,
    recipient: input.recipient as `0x${string}`,
    amount: externalUsdcAmount(input.amount),
    paymentReference: input.invoiceNumber,
    memo: input.memo,
  })
  if (await supportsAtomicCalls(input.provider, input.payer)) {
    try {
      const txHash = await submitAtomicCalls(input.provider, input.payer, calls, input.pollMs, input.attempts)
      return { txHash, mode: 'atomic' as const }
    } catch (error) {
      if (!walletCallsUnsupported(error)) throw error
    }
  }
  const [approve, pay] = calls
  const approveHash = await input.provider.request({ method: 'eth_sendTransaction', params: [{ from: input.payer, to: approve.to, data: approve.data }] })
  if (typeof approveHash !== 'string' || !txHashPattern.test(approveHash)) throw new Error('The wallet did not return an approval transaction hash.')
  await waitForTransactionReceipt(input.provider, approveHash, input.pollMs, input.attempts)
  const payHash = await input.provider.request({ method: 'eth_sendTransaction', params: [{ from: input.payer, to: pay.to, data: pay.data }] })
  if (typeof payHash !== 'string' || !txHashPattern.test(payHash)) throw new Error('The wallet did not return a payment transaction hash.')
  return { txHash: payHash, mode: 'sequential' as const, approveTxHash: approveHash }
}
