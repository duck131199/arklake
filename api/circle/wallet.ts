const CIRCLE_WALLETS_URL = 'https://api.circle.com/v1/w3s/wallets'
const CIRCLE_USER_INITIALIZE_URL = 'https://api.circle.com/v1/w3s/user/initialize'
const CIRCLE_TRANSFER_URL = 'https://api.circle.com/v1/w3s/user/transactions/transfer'
const CIRCLE_TRANSACTIONS_URL = 'https://api.circle.com/v1/w3s/transactions'
const arklakeBlockchain = 'ARC-TESTNET'
const arklakeAccountType = 'SCA'
const arklakeCanonicalUsdcAddress = '0x3600000000000000000000000000000000000000'

type VercelRequest = {
  method?: string
  body?: unknown
}

type VercelResponse = {
  statusCode: number
  setHeader: (name: string, value: string) => void
  end: (body: string) => void
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const jsonResponse = (response: VercelResponse, body: Record<string, unknown>, status: number) => {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  return response.end(JSON.stringify(body))
}

const getCircleApiKey = () => {
  const circleApiKey = process.env.CIRCLE_API_KEY
  if (!circleApiKey) throw new Error('Circle API key is not configured')
  return circleApiKey
}

const getUserToken = (body: unknown) => {
  if (!isRecord(body) || typeof body.userToken !== 'string' || !body.userToken) {
    throw new Error('Missing userToken')
  }

  return body.userToken
}

const getWalletId = (body: unknown) => {
  if (!isRecord(body) || typeof body.walletId !== 'string' || !body.walletId) {
    throw new Error('Missing walletId')
  }

  return body.walletId
}

const getDestinationAddress = (body: unknown) => {
  if (!isRecord(body) || typeof body.destinationAddress !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(body.destinationAddress)) {
    throw new Error('Invalid destinationAddress')
  }

  return body.destinationAddress
}

const getTransferAmount = (body: unknown) => {
  if (!isRecord(body) || typeof body.amount !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(body.amount)) {
    throw new Error('Invalid amount')
  }

  if (toUsdcUnits(body.amount) <= 0n) throw new Error('Invalid amount')

  return body.amount
}

const getReferenceId = (body: unknown) => {
  if (!isRecord(body) || typeof body.referenceId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.referenceId)) {
    throw new Error('Invalid referenceId')
  }
  return body.referenceId
}

const toUsdcUnits = (amount: string) => {
  const [whole, fraction = ''] = amount.split('.')
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))
}

const isArklakeWallet = (wallet: unknown, walletId: string) => {
  return isRecord(wallet)
    && wallet.id === walletId
    && wallet.blockchain === arklakeBlockchain
    && wallet.accountType === arklakeAccountType
}

const getCanonicalUsdcBalance = (tokenBalances: unknown[]) => {
  return tokenBalances.find((balance) => {
    if (!isRecord(balance) || !isRecord(balance.token)) return false

    return typeof balance.amount === 'string'
      && typeof balance.token.id === 'string'
      && balance.token.blockchain === arklakeBlockchain
      && typeof balance.token.symbol === 'string'
      && balance.token.symbol.toUpperCase() === 'USDC'
      && typeof balance.token.tokenAddress === 'string'
      && balance.token.tokenAddress.toLowerCase() === arklakeCanonicalUsdcAddress
  })
}

const listWallets = async (userToken: string) => {
  const circleResponse = await fetch(CIRCLE_WALLETS_URL, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${getCircleApiKey()}`,
      'X-User-Token': userToken,
    },
  })

  const circlePayload: unknown = await circleResponse.json()

  if (!circleResponse.ok) {
    return { ok: false, status: circleResponse.status, payload: circlePayload }
  }

  if (!isRecord(circlePayload) || !isRecord(circlePayload.data) || !Array.isArray(circlePayload.data.wallets)) {
    return { ok: false, status: 502, payload: { error: 'Invalid Circle wallet response' } }
  }

  return { ok: true, status: 200, payload: { wallets: circlePayload.data.wallets } }
}

const listBalances = async (userToken: string, walletId: string) => {
  const circleResponse = await fetch(`${CIRCLE_WALLETS_URL}/${encodeURIComponent(walletId)}/balances`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${getCircleApiKey()}`,
      'X-User-Token': userToken,
    },
  })

  const circlePayload: unknown = await circleResponse.json()

  if (!circleResponse.ok) {
    return { ok: false, status: circleResponse.status, payload: circlePayload }
  }

  if (!isRecord(circlePayload) || !isRecord(circlePayload.data) || !Array.isArray(circlePayload.data.tokenBalances)) {
    return { ok: false, status: 502, payload: { error: 'Invalid Circle balance response' } }
  }

  return { ok: true, status: 200, payload: { tokenBalances: circlePayload.data.tokenBalances } }
}

const createTransferTransaction = async (userToken: string, body: unknown) => {
  const walletId = getWalletId(body)
  const destinationAddress = getDestinationAddress(body)
  const amount = getTransferAmount(body)
  const referenceId = getReferenceId(body)

  const walletsResult = await listWallets(userToken)
  if (!walletsResult.ok || !isRecord(walletsResult.payload) || !Array.isArray(walletsResult.payload.wallets)) {
    return { ok: false, status: walletsResult.status, payload: { error: 'Circle wallet lookup failed' } }
  }

  if (!walletsResult.payload.wallets.some((wallet) => isArklakeWallet(wallet, walletId))) {
    return { ok: false, status: 403, payload: { error: 'Wallet is not an Arklake Arc Testnet wallet' } }
  }

  const balancesResult = await listBalances(userToken, walletId)
  if (!balancesResult.ok || !isRecord(balancesResult.payload) || !Array.isArray(balancesResult.payload.tokenBalances)) {
    return { ok: false, status: balancesResult.status, payload: { error: 'Circle balance lookup failed' } }
  }

  const canonicalUsdcBalance = getCanonicalUsdcBalance(balancesResult.payload.tokenBalances)
  if (!isRecord(canonicalUsdcBalance) || typeof canonicalUsdcBalance.amount !== 'string' || !isRecord(canonicalUsdcBalance.token) || typeof canonicalUsdcBalance.token.id !== 'string') {
    return { ok: false, status: 400, payload: { error: 'Canonical Arc Testnet USDC balance was not found' } }
  }

  if (toUsdcUnits(amount) > toUsdcUnits(canonicalUsdcBalance.amount)) {
    return { ok: false, status: 400, payload: { error: 'Amount exceeds available USDC balance' } }
  }

  const circleResponse = await fetch(CIRCLE_TRANSFER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getCircleApiKey()}`,
      'X-User-Token': userToken,
    },
    body: JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      destinationAddress,
      walletId,
      amounts: [amount],
      tokenId: canonicalUsdcBalance.token.id,
      feeLevel: 'MEDIUM',
      refId: referenceId,
    }),
  })

  const circlePayload: unknown = await circleResponse.json()

  if (!circleResponse.ok) {
    return { ok: false, status: circleResponse.status, payload: isRecord(circlePayload) ? circlePayload : { error: 'Circle transfer request failed' } }
  }

  if (!isRecord(circlePayload) || !isRecord(circlePayload.data) || typeof circlePayload.data.challengeId !== 'string') {
    return { ok: false, status: 502, payload: { error: 'Invalid Circle transfer response' } }
  }

  return { ok: true, status: 200, payload: { challengeId: circlePayload.data.challengeId, referenceId } }
}

const resolveTransferTransactionHash = async (userToken: string, body: unknown) => {
  const walletId = getWalletId(body)
  const referenceId = getReferenceId(body)
  const walletsResult = await listWallets(userToken)
  if (!walletsResult.ok || !isRecord(walletsResult.payload) || !Array.isArray(walletsResult.payload.wallets)
    || !walletsResult.payload.wallets.some((wallet) => isArklakeWallet(wallet, walletId))) {
    return { ok: false, status: 403, payload: { error: 'Wallet is not an Arklake Arc Testnet wallet' } }
  }
  const query = new URLSearchParams({ walletIds: walletId, includeAll: 'true', pageSize: '50', order: 'DESC' })
  const circleResponse = await fetch(`${CIRCLE_TRANSACTIONS_URL}?${query}`, {
    headers: { accept: 'application/json', Authorization: `Bearer ${getCircleApiKey()}`, 'X-User-Token': userToken },
  })
  const circlePayload: unknown = await circleResponse.json()
  if (!circleResponse.ok) return { ok: false, status: circleResponse.status, payload: isRecord(circlePayload) ? circlePayload : { error: 'Circle transaction lookup failed' } }
  const transactions = isRecord(circlePayload) && isRecord(circlePayload.data) && Array.isArray(circlePayload.data.transactions) ? circlePayload.data.transactions : null
  if (!transactions) return { ok: false, status: 502, payload: { error: 'Invalid Circle transaction response' } }
  const transaction = transactions.find((candidate) => isRecord(candidate) && candidate.refId === referenceId && candidate.walletId === walletId)
  if (!isRecord(transaction)) return { ok: true, status: 200, payload: { pending: true } }
  if (transaction.state === 'FAILED' || transaction.state === 'DENIED' || transaction.state === 'CANCELLED') {
    return { ok: false, status: 409, payload: { error: 'Circle reported that this payment failed.' } }
  }
  return typeof transaction.txHash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(transaction.txHash)
    ? { ok: true, status: 200, payload: { txHash: transaction.txHash.toLowerCase() } }
    : { ok: true, status: 200, payload: { pending: true } }
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') {
    return jsonResponse(response, { error: 'Method not allowed' }, 405)
  }

  if (!isRecord(request.body) || typeof request.body.action !== 'string') {
    return jsonResponse(response, { error: 'Missing action' }, 400)
  }

  try {
    const userToken = getUserToken(request.body)

    if (request.body.action === 'listWallets') {
      const result = await listWallets(userToken)
      return jsonResponse(response, isRecord(result.payload) ? result.payload : { error: 'Circle wallet request failed' }, result.status)
    }

    if (request.body.action === 'listBalances') {
      const result = await listBalances(userToken, getWalletId(request.body))
      return jsonResponse(response, isRecord(result.payload) ? result.payload : { error: 'Circle balance request failed' }, result.status)
    }

    if (request.body.action === 'initializeUser') {
      const circleResponse = await fetch(CIRCLE_USER_INITIALIZE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getCircleApiKey()}`,
          'X-User-Token': userToken,
        },
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          accountType: arklakeAccountType,
          blockchains: [arklakeBlockchain],
        }),
      })

      const circlePayload: unknown = await circleResponse.json()

      if (!circleResponse.ok) {
        return jsonResponse(response, isRecord(circlePayload) ? circlePayload : { error: 'Circle initialize request failed' }, circleResponse.status)
      }

      if (!isRecord(circlePayload) || !isRecord(circlePayload.data) || typeof circlePayload.data.challengeId !== 'string') {
        return jsonResponse(response, { error: 'Invalid Circle initialize response' }, 502)
      }

      return jsonResponse(response, { challengeId: circlePayload.data.challengeId }, 200)
    }

    if (request.body.action === 'createTransferTransaction') {
      const result = await createTransferTransaction(userToken, request.body)
      return jsonResponse(response, isRecord(result.payload) ? result.payload : { error: 'Circle transfer request failed' }, result.status)
    }

    if (request.body.action === 'resolveTransferTransactionHash') {
      const result = await resolveTransferTransactionHash(userToken, request.body)
      return jsonResponse(response, isRecord(result.payload) ? result.payload : { error: 'Circle transaction lookup failed' }, result.status)
    }

    return jsonResponse(response, { error: 'Unknown action' }, 400)
  } catch (error) {
    if (error instanceof Error && (error.message === 'Missing userToken' || error.message === 'Missing walletId' || error.message === 'Invalid destinationAddress' || error.message === 'Invalid amount' || error.message === 'Invalid referenceId')) {
      return jsonResponse(response, { error: error.message }, 400)
    }
    if (error instanceof Error && error.message === 'Circle API key is not configured') {
      return jsonResponse(response, { error: error.message }, 500)
    }

    return jsonResponse(response, { error: 'Circle wallet request failed' }, 502)
  }
}
