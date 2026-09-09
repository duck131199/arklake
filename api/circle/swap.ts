import { createHmac, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { SwapKit, getChainByEnum } from '@circle-fin/swap-kit'
import { createCircleUserWalletAdapter } from '@circle-fin/adapter-circle-wallets/ucw/server'
import { ViemAdapter } from '@circle-fin/adapter-viem-v2'
import { createPublicClient, createWalletClient, http, type PublicClient } from 'viem'

export const config = { maxDuration: 300 }
const assets = ['USDC', 'EURC', 'cirBTC'] as const
type Asset = typeof assets[number]
type Quote = { walletId: string; address: string; tokenIn: Asset; tokenOut: Asset; amount: string; minimum: string; expiresAt: number }
const chain = 'Arc_Testnet'
const rpc = 'https://rpc.testnet.arc.network'
const isAmount = (value: unknown): value is string => typeof value === 'string' && /^(0|[1-9]\d{0,20})(\.\d{1,18})?$/.test(value) && Number(value) > 0
const isAsset = (value: unknown): value is Asset => assets.includes(value as Asset)
const sign = (body: string, key: string) => createHmac('sha256', key).update(`arklake-swap:${body}`).digest('base64url')

function readQuote(token: unknown, key: string): Quote {
  if (typeof token !== 'string' || token.length > 4096) throw new Error('Invalid quote. Get a new quote.')
  const [body, signature = ''] = token.split('.')
  const expected = Buffer.from(sign(body, key))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error('Invalid quote. Get a new quote.')
  const quote = JSON.parse(Buffer.from(body, 'base64url').toString()) as Quote
  if (quote.expiresAt <= Date.now()) throw new Error('Quote expired. Get a new quote.')
  return quote
}

async function receipt(txHash: string) {
  const response = await fetch(rpc, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [txHash] }),
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error('Unable to check on-chain confirmation.')
  const data = await response.json()
  if (data.error) throw new Error('Unable to check on-chain confirmation.')
  return data.result as { status: string; blockNumber: string } | null
}

export default async function handler(req: IncomingMessage & { body?: Record<string, unknown> }, res: ServerResponse) {
  const json = (status: number, body: object) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify(body))
  }
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })
  const body = req.body || {}
  if (!['quote', 'execute', 'status'].includes(String(body.action))) return json(400, { error: 'Invalid action' })
  const apiKey = process.env.CIRCLE_API_KEY
  if (!apiKey) return json(503, { error: 'Swap is not configured.' })

  let streaming = false
  let challenged = false
  let heartbeat: ReturnType<typeof setInterval> | undefined
  const emit = (event: object) => {
    if (!res.destroyed && !res.writableEnded) res.write(`${JSON.stringify(event)}\n`)
  }
  try {
    const kit = new SwapKit()
    if (body.action === 'quote') {
      if (typeof body.walletId !== 'string' || typeof body.walletAddress !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(body.walletAddress)) return json(400, { error: 'A valid wallet is required.' })
      if (!isAsset(body.tokenIn) || !isAsset(body.tokenOut) || body.tokenIn === body.tokenOut || !isAmount(body.amount)) return json(400, { error: 'Choose different assets and enter a valid positive amount.' })
      const address = body.walletAddress as `0x${string}`
      const arc = getChainByEnum(chain)
      const adapter = new ViemAdapter({
        getPublicClient: ({ chain: viemChain }) => createPublicClient({ chain: viemChain, transport: http(rpc) }) as unknown as PublicClient,
        getWalletClient: ({ chain: viemChain }) => createWalletClient({ account: address, chain: viemChain, transport: http(rpc) }),
      }, { addressContext: 'developer-controlled', supportedChains: [arc] })
      const estimate = await kit.estimate({
        from: { adapter, chain: 'Arc_Testnet', address }, tokenIn: body.tokenIn, tokenOut: body.tokenOut, amountIn: body.amount,
        config: { apiKey, allowanceStrategy: 'approve', slippageBps: 50 },
      })
      if (!isAmount(estimate.estimatedOutput.amount) || !isAmount(estimate.stopLimit.amount)) return json(422, { error: 'No executable quote is available for this pair and amount.' })
      const expiresAt = Date.now() + 60000
      const payload: Quote = { walletId: body.walletId, address, tokenIn: body.tokenIn, tokenOut: body.tokenOut, amount: body.amount, minimum: estimate.stopLimit.amount, expiresAt }
      const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
      return json(200, { output: estimate.estimatedOutput.amount, minimum: estimate.stopLimit.amount, fees: estimate.fees || [], expiresAt, quoteToken: `${encoded}.${sign(encoded, apiKey)}` })
    }

    if (typeof body.userToken !== 'string' || !body.userToken || typeof body.walletId !== 'string') return json(401, { error: 'Refresh signing access to approve this swap.' })
    // Bind every operation to an existing wallet owned by this Circle user. Never provision a wallet.
    const walletsResponse = await fetch('https://api.circle.com/v1/w3s/wallets', {
      headers: { Authorization: `Bearer ${apiKey}`, 'X-User-Token': body.userToken },
      signal: AbortSignal.timeout(15000),
    })
    if (!walletsResponse.ok) return json(walletsResponse.status === 401 ? 401 : 502, { error: 'Circle wallet lookup failed. Refresh signing access and retry.' })
    const wallets = await walletsResponse.json()
    const wallet = wallets.data?.wallets?.find((item: { id: string; blockchain: string; accountType: string }) => item.id === body.walletId && item.blockchain === 'ARC-TESTNET' && item.accountType === 'SCA')
    if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet.address)) return json(403, { error: 'Existing Arc Testnet SCA wallet was not found.' })

    if (body.action === 'status') {
      if (typeof body.txHash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(body.txHash)) return json(400, { error: 'Invalid transaction hash' })
      const [onchain, status] = await Promise.all([
        receipt(body.txHash),
        kit.getSwapStatus({ txHash: body.txHash, chainIn: chain, apiKey }),
      ])
      return json(200, {
        confirmed: onchain?.status === '0x1' && Boolean(onchain.blockNumber) && status.progress.status === 'DONE',
        failed: onchain?.status === '0x0' || status.progress.status === 'FAILED',
        amountOut: status.destination?.amount,
      })
    }

    const quote = readQuote(body.quoteToken, apiKey)
    if (quote && (quote.walletId !== wallet.id || quote.address.toLowerCase() !== wallet.address.toLowerCase())) return json(403, { error: 'Quote belongs to another wallet.' })
    const tokenIn = quote?.tokenIn ?? body.tokenIn
    const tokenOut = quote?.tokenOut ?? body.tokenOut
    const amount = quote?.amount ?? body.amount
    if (!isAsset(tokenIn) || !isAsset(tokenOut) || tokenIn === tokenOut || !isAmount(amount)) return json(400, { error: 'Choose different assets and enter a valid positive amount.' })

    streaming = true
    res.setHeader('Content-Type', 'application/x-ndjson')
    res.setHeader('Cache-Control', 'no-store, no-transform')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()
    heartbeat = setInterval(() => emit({ type: 'heartbeat' }), 10000)
    const adapter = await createCircleUserWalletAdapter({
      apiKey, userToken: body.userToken, walletId: wallet.id,
      walletAddress: wallet.address, accountType: 'SCA', chain,
      timeoutMs: 120000,
      onChallenge: ({ challengeId }) => {
        if (!quote || res.destroyed || Date.now() >= quote.expiresAt) throw new Error('Quote expired or connection closed. No further approval will be requested.')
        challenged = true
        emit({ type: 'challenge', challengeId })
      },
      onProgress: ({ stage, status }) => emit({ type: 'progress', stage, status }),
    })
    const params = {
      from: { adapter, chain: 'Arc_Testnet' as const }, tokenIn, tokenOut, amountIn: amount,
      config: { apiKey, allowanceStrategy: 'approve' as const, slippageBps: 50, stopLimit: quote.minimum },
    }
    // Swap Kit re-quotes and enforces the reviewed minimum. SDK approval is not confirmation.
    const result = await kit.swap(params)
    emit({ type: 'submitted', txHash: result.txHash })
    const onchain = await receipt(result.txHash)
    if (onchain?.status === '0x0' || result.progress.status === 'FAILED') {
      emit({ type: 'failed', message: 'Swap transaction failed. Check the transaction before retrying.' })
    } else if (onchain?.status === '0x1' && onchain.blockNumber && result.progress.status === 'DONE') {
      emit({ type: 'confirmed', txHash: result.txHash, amountOut: result.amountOut })
    } else {
      emit({ type: 'pending', txHash: result.txHash, message: 'Submitted. On-chain swap confirmation is still pending.' })
    }
  } catch (error) {
    // Never expose upstream error objects: they can contain authorization headers.
    const message = error instanceof Error && /^(Invalid quote|Quote expired)/.test(error.message)
      ? error.message
      : body.action === 'quote'
        ? 'Live quote unavailable for this pair and amount. The route, liquidity, balance, gas, or quote service may be unavailable. Try a smaller amount or retry later.'
        : challenged
          ? 'Swap outcome is not confirmed. Check wallet activity before starting another swap.'
          : 'Unable to prepare swap. Refresh signing access or get a new quote.'
    if (streaming) emit({ type: 'error', message, uncertain: challenged })
    else json(body.action === 'quote' ? 422 : 400, { error: message })
  } finally {
    if (heartbeat) clearInterval(heartbeat)
    if (streaming && !res.writableEnded) res.end()
  }
}
