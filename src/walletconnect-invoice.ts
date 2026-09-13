import EthereumProvider from '@walletconnect/ethereum-provider'
import { createPublicClient, formatUnits, http } from 'viem'
import { arcTestnet } from 'viem/chains'
import { arcTestnetChainIdHex, arcTestnetUsdcAddress, connectExternalWallet, externalUsdcAmount, submitExternalUsdcPayment, type ExternalWalletProvider } from './external-wallet'

export type InvoicePaymentIntent = {
  id: string
  token: string
  invoiceId: string
  invoiceNumber: string
  memo: string
  recipientAddress: string
  amount: string
  asset: string
  chainId: number
  expiresAt: string
}

export async function createInvoicePaymentIntent(invoiceId: string, fetcher: typeof fetch = fetch, paymentRail: 'generic' | 'arklake' | 'wallet' = 'generic') {
  const response = await fetcher('/api/invoice-payment-intent', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', invoiceId, paymentRail }),
  })
  const payload = await response.json().catch(() => null) as { intent?: InvoicePaymentIntent; error?: string } | null
  if (!response.ok || !payload?.intent) throw new Error(payload?.error || 'Payment intent could not be created.')
  return payload.intent
}

export async function bindInvoicePaymentIntent(intent: InvoicePaymentIntent, txHash: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher('/api/invoice-payment-intent', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'bind', intentId: intent.id, token: intent.token, txHash }),
  })
  const payload = await response.json().catch(() => null) as { bound?: boolean; error?: string } | null
  if (!response.ok || !payload?.bound) throw new Error(payload?.error || 'Submitted transaction could not be bound to this invoice.')
}

export async function getArklakePaymentIntentStatus(intent: InvoicePaymentIntent, fetcher: typeof fetch = fetch) {
  const response = await fetcher('/api/invoice-payment-intent', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'status', intentId: intent.id, token: intent.token }),
  })
  const payload = await response.json().catch(() => null) as { status?: string; recoverable?: boolean; error?: string } | null
  if (!response.ok || !payload?.status) throw new Error(payload?.error || 'Payment attempt status could not be loaded.')
  return { status: payload.status, recoverable: payload.recoverable === true }
}

export async function connectInvoiceWalletConnect(projectId: string) {
  if (!projectId) throw new Error('Reown Project ID is not configured.')
  const provider = await EthereumProvider.init({
    projectId,
    chains: [arcTestnet.id],
    showQrModal: true,
    rpcMap: { [arcTestnet.id]: arcTestnet.rpcUrls.default.http[0] },
    methods: ['eth_sendTransaction', 'eth_accounts', 'eth_requestAccounts', 'eth_call', 'wallet_switchEthereumChain', 'wallet_addEthereumChain'],
    events: ['accountsChanged', 'chainChanged'],
    metadata: { name: 'Arklake', description: 'Pay an Arklake invoice', url: window.location.origin, icons: [`${window.location.origin}/brand/arklake-mark-trimmed.png`] },
  })
  if (!provider.connected) await provider.connect()
  return provider as ExternalWalletProvider
}

function walletErrorCode(error: unknown): number | undefined {
  const candidate = error as { code?: number; data?: { code?: number; originalError?: { code?: number } }; cause?: { code?: number } } | null
  return candidate?.code ?? candidate?.data?.code ?? candidate?.data?.originalError?.code ?? candidate?.cause?.code
}

export function walletConnectErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  const candidate = error as { message?: unknown; data?: { message?: unknown; originalError?: { message?: unknown } }; cause?: { message?: unknown } } | null
  const message = candidate?.message ?? candidate?.data?.message ?? candidate?.data?.originalError?.message ?? candidate?.cause?.message
  return typeof message === 'string' && message ? message : 'WalletConnect returned an unknown error.'
}

type WalletConnectProviderState = ExternalWalletProvider & {
  chainId?: string | number
  session?: { namespaces?: Record<string, { chains?: string[] }> }
  on?: (event: string, listener: (value: unknown) => void) => void
  removeListener?: (event: string, listener: (value: unknown) => void) => void
}

export function normalizeWalletConnectChainId(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  const chain = normalized.startsWith('eip155:') ? normalized.slice(7) : normalized
  if (/^0x[0-9a-f]+$/.test(chain)) return Number.parseInt(chain.slice(2), 16)
  if (/^[0-9]+$/.test(chain)) return Number.parseInt(chain, 10)
  return undefined
}

async function readWalletConnectChain(provider: WalletConnectProviderState, expectedChainId?: number) {
  const rpcChainId = await provider.request({ method: 'eth_chainId' }).catch(() => undefined)
  const namespaceChains = Object.values(provider.session?.namespaces || {}).flatMap((namespace) => namespace.chains || [])
  const candidates = [rpcChainId, provider.chainId, ...namespaceChains]
  const normalizedChainIds = candidates.map(normalizeWalletConnectChainId).filter((value): value is number => value !== undefined)
  const chainId = expectedChainId !== undefined && normalizedChainIds.includes(expectedChainId) ? expectedChainId : normalizedChainIds[0]
  return chainId
}

async function waitForWalletConnectChain(provider: WalletConnectProviderState, expectedChainId: number, timeoutMs = 6000) {
  if (await readWalletConnectChain(provider, expectedChainId) === expectedChainId) return true
  return await new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (result: boolean) => {
      if (settled) return
      settled = true
      clearInterval(poll)
      clearTimeout(timeout)
      provider.removeListener?.('chainChanged', onChainChanged)
      provider.removeListener?.('session_update', onSessionUpdate)
      resolve(result)
    }
    const check = () => void readWalletConnectChain(provider, expectedChainId).then((chainId) => { if (chainId === expectedChainId) finish(true) })
    const onChainChanged = (value: unknown) => {
      if (normalizeWalletConnectChainId(value) === expectedChainId) finish(true)
      else check()
    }
    const onSessionUpdate = (value: unknown) => {
      check()
    }
    provider.on?.('chainChanged', onChainChanged)
    provider.on?.('session_update', onSessionUpdate)
    const poll = setInterval(check, 300)
    const timeout = setTimeout(() => finish(false), timeoutMs)
  })
}

export async function switchWalletConnectToArc(provider: WalletConnectProviderState) {
  const switchChain = async () => {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: arcTestnetChainIdHex }] })
  }
  try {
    await switchChain()
    return
  } catch (error) {
    if (walletErrorCode(error) !== 4902) {
      if (walletErrorCode(error) === 4001) throw new Error('Arc Testnet network switch was rejected in your wallet.')
      throw new Error('Your wallet does not support switching to Arc Testnet through this WalletConnect session.')
    }
  }
  try {
    await provider.request({ method: 'wallet_addEthereumChain', params: [{
      chainId: arcTestnetChainIdHex,
      chainName: arcTestnet.name,
      nativeCurrency: arcTestnet.nativeCurrency,
      rpcUrls: [arcTestnet.rpcUrls.default.http[0]],
      blockExplorerUrls: [arcTestnet.blockExplorers.default.url],
    }] })
    if (await waitForWalletConnectChain(provider, arcTestnet.id, 1500)) return
    await switchChain()
  } catch (error) {
    if (walletErrorCode(error) === 4001) throw new Error('Adding or switching to Arc Testnet was rejected in your wallet.')
    throw new Error('Your wallet could not add or switch to Arc Testnet through this WalletConnect session.')
  }
}

export async function submitWalletConnectIntent(input: {
  provider: ExternalWalletProvider
  intent: InvoicePaymentIntent
  fetcher?: typeof fetch
  onSubmitted?: (txHash: string) => void
}) {
  const provider = input.provider as WalletConnectProviderState
  const connected = await connectExternalWallet(provider)
  const chainBeforeSwitch = await readWalletConnectChain(provider, input.intent.chainId)
  if (chainBeforeSwitch !== input.intent.chainId) {
    await switchWalletConnectToArc(provider)
  }
  const onArc = await waitForWalletConnectChain(provider, input.intent.chainId)
  if (!onArc) throw new Error('Your wallet did not confirm Arc Testnet through this WalletConnect session.')
  if (connected.address.toLowerCase() === input.intent.recipientAddress.toLowerCase()) throw new Error('This invoice cannot be paid from its receiving wallet.')
  const arcProvider: ExternalWalletProvider = { request: async (request) => {
    const result = await provider.request(request)
    return request.method === 'eth_chainId' && normalizeWalletConnectChainId(result) === arcTestnet.id ? arcTestnetChainIdHex : result
  } }
  const balanceRaw = await createPublicClient({ chain: arcTestnet, transport: http(arcTestnet.rpcUrls.default.http[0]) }).readContract({
    address: arcTestnetUsdcAddress,
    abi: [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }],
    functionName: 'balanceOf',
    args: [connected.address as `0x${string}`],
  })
  const balance = { raw: balanceRaw, amount: formatUnits(balanceRaw, 6) }
  if (balance.raw < externalUsdcAmount(input.intent.amount)) throw new Error(`Insufficient USDC balance. Available: ${balance.amount} USDC.`)
  const txHash = await submitExternalUsdcPayment(arcProvider, connected.address, input.intent.recipientAddress, input.intent.amount)
  input.onSubmitted?.(txHash)
  await bindInvoicePaymentIntent(input.intent, txHash, input.fetcher)
  return { txHash, payer: connected.address, balance: balance.amount }
}
