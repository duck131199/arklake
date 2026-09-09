import { decodeFunctionResult, encodeFunctionData, formatUnits, parseUnits } from 'viem'
import { arcTestnet } from 'viem/chains'
import { usdc } from 'viem/tokens'

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
