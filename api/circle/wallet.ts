import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { getCircleRecoverySession } from '../auth/session.js'

const CIRCLE_WALLETS_URL = 'https://api.circle.com/v1/w3s/wallets'
const CIRCLE_USER_INITIALIZE_URL = 'https://api.circle.com/v1/w3s/user/initialize'
const CIRCLE_TRANSFER_URL = 'https://api.circle.com/v1/w3s/user/transactions/transfer'
const CIRCLE_TRANSACTIONS_URL = 'https://api.circle.com/v1/w3s/transactions'
const CIRCLE_CHALLENGES_URL = 'https://api.circle.com/v1/w3s/user/challenges'
const arklakeBlockchain = 'ARC-TESTNET'
const arklakeAccountType = 'SCA'
const arklakeCanonicalUsdcAddress = '0x3600000000000000000000000000000000000000'

type VercelRequest = {
  method?: string
  body?: unknown
  headers: { cookie?: string }
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

const required = (name: string) => { const value = process.env[name]; if (!value) throw new Error(`${name} is not configured`); return value }
const supabaseClient = () => createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const getIntentCredentials = (body: unknown) => {
  if (!isRecord(body) || typeof body.intentId !== 'string' || !uuid.test(body.intentId)
    || typeof body.intentToken !== 'string' || body.intentToken.length < 32) throw new Error('Invalid payment intent')
  return { intentId: body.intentId, intentTokenHash: tokenHash(body.intentToken) }
}

const circleHeaders = (userToken: string) => ({ accept: 'application/json', Authorization: `Bearer ${getCircleApiKey()}`, 'X-User-Token': userToken })

const markAttemptFailed = async (intentId: string, intentTokenHash: string) => {
  await supabaseClient().rpc('fail_arklake_invoice_payment_intent', { p_intent_id: intentId, p_public_token_hash: intentTokenHash })
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
  const isInvoicePayment = isRecord(body) && typeof body.intentId === 'string' && typeof body.intentToken === 'string'
  const intentCredentials = isInvoicePayment ? getIntentCredentials(body) : null
  const referenceId = intentCredentials?.intentId

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

  let circleIdempotencyKey: string = crypto.randomUUID()
  if (intentCredentials) {
    const { data: startData, error: startError } = await supabaseClient().rpc('start_arklake_invoice_payment_intent', {
      p_intent_id: intentCredentials.intentId, p_public_token_hash: intentCredentials.intentTokenHash, p_wallet_id: walletId,
    })
    if (startError) throw startError
    const start = startData as { result?: string; idempotency_key?: string } | null
    if (!start || !['started', 'idempotent'].includes(start.result || '') || !start.idempotency_key) {
      return { ok: false, status: 409, payload: { error: start?.result === 'already_in_progress' ? 'Another payment is already being confirmed for this invoice.' : 'This payment attempt can no longer be submitted.' } }
    }
    circleIdempotencyKey = start.idempotency_key
  }

  const circleResponse = await fetch(CIRCLE_TRANSFER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getCircleApiKey()}`,
      'X-User-Token': userToken,
    },
    body: JSON.stringify({
      idempotencyKey: circleIdempotencyKey,
      destinationAddress,
      walletId,
      amounts: [amount],
      tokenId: canonicalUsdcBalance.token.id,
      feeLevel: 'MEDIUM',
      ...(referenceId ? { refId: referenceId } : {}),
    }),
  })

  const circlePayload: unknown = await circleResponse.json()

  if (!circleResponse.ok) {
    if (intentCredentials) await markAttemptFailed(intentCredentials.intentId, intentCredentials.intentTokenHash)
    const circleError = isRecord(circlePayload) && typeof circlePayload.message === 'string' ? circlePayload.message : 'Circle transfer request failed'
    return { ok: false, status: circleResponse.status, payload: { error: circleError, retryAllowed: true } }
  }

  if (!isRecord(circlePayload) || !isRecord(circlePayload.data) || typeof circlePayload.data.challengeId !== 'string') {
    return { ok: false, status: 502, payload: { error: 'Invalid Circle transfer response; this payment attempt remains locked for recovery.' } }
  }

  if (intentCredentials) {
    const { data: challengeData, error: challengeError } = await supabaseClient().rpc('record_arklake_invoice_payment_challenge', {
      p_intent_id: intentCredentials.intentId, p_public_token_hash: intentCredentials.intentTokenHash, p_challenge_id: circlePayload.data.challengeId,
    })
    if (challengeError || (challengeData as { result?: string } | null)?.result !== 'recorded') {
      return { ok: false, status: 502, payload: { error: 'Circle prepared the payment, but recovery state could not be recorded. This attempt remains locked.' } }
    }
  }

  return { ok: true, status: 200, payload: { challengeId: circlePayload.data.challengeId } }
}

const resolveTransferTransactionHash = async (body: unknown, cookieHeader: string | undefined) => {
  const { intentId, intentTokenHash } = getIntentCredentials(body)
  const recoverySession = await getCircleRecoverySession(cookieHeader)
  if (!recoverySession) return { ok: false, status: 401, payload: { error: 'Sign in to continue checking this payment.' } }
  const { userToken, walletId } = recoverySession
  const supabase = supabaseClient()
  const { data: attempt, error: attemptError } = await supabase.from('invoice_payment_intents')
    .select('id,payer_wallet_id,circle_challenge_id,circle_transaction_id,status')
    .eq('id', intentId).eq('public_token_hash', intentTokenHash).eq('payment_rail', 'arklake').maybeSingle<{
      id: string; payer_wallet_id: string | null; circle_challenge_id: string | null; circle_transaction_id: string | null; status: string
    }>()
  if (attemptError) throw attemptError
  if (!attempt || attempt.payer_wallet_id !== walletId) return { ok: false, status: 404, payload: { error: 'Payment attempt not found.' } }
  if (attempt.status === 'failed') return { ok: false, status: 409, payload: { error: 'Circle reported that this payment failed.', retryAllowed: true } }
  if (!attempt.circle_challenge_id) return { ok: true, status: 200, payload: { pending: true } }

  let transactionId = attempt.circle_transaction_id
  if (!transactionId) {
    const challengeResponse = await fetch(`${CIRCLE_CHALLENGES_URL}/${encodeURIComponent(attempt.circle_challenge_id)}`, { headers: circleHeaders(userToken) })
    const challengePayload: unknown = await challengeResponse.json()
    if (!challengeResponse.ok) return { ok: false, status: challengeResponse.status, payload: isRecord(challengePayload) ? challengePayload : { error: 'Circle challenge lookup failed' } }
    const challenge = isRecord(challengePayload) && isRecord(challengePayload.data) && isRecord(challengePayload.data.challenge) ? challengePayload.data.challenge : null
    if (!challenge || challenge.id !== attempt.circle_challenge_id) return { ok: false, status: 502, payload: { error: 'Invalid Circle challenge response' } }
    if (challenge.status === 'FAILED' || challenge.status === 'DENIED' || challenge.status === 'CANCELLED') {
      await markAttemptFailed(intentId, intentTokenHash)
      return { ok: false, status: 409, payload: { error: 'Circle reported that this payment failed.', retryAllowed: true } }
    }
    transactionId = Array.isArray(challenge.correlationIds) ? challenge.correlationIds.find((value): value is string => typeof value === 'string' && uuid.test(value)) || null : null
    if (!transactionId) return { ok: true, status: 200, payload: { pending: true } }
    const { error: correlationError } = await supabase.from('invoice_payment_intents')
      .update({ circle_transaction_id: transactionId, status: 'confirming', updated_at: new Date().toISOString() })
      .eq('id', intentId).eq('public_token_hash', intentTokenHash).is('circle_transaction_id', null)
    if (correlationError) throw correlationError
  }

  const circleResponse = await fetch(`${CIRCLE_TRANSACTIONS_URL}/${encodeURIComponent(transactionId)}`, { headers: circleHeaders(userToken) })
  const circlePayload: unknown = await circleResponse.json()
  if (!circleResponse.ok) return { ok: false, status: circleResponse.status, payload: isRecord(circlePayload) ? circlePayload : { error: 'Circle transaction lookup failed' } }
  const transaction = isRecord(circlePayload) && isRecord(circlePayload.data) && isRecord(circlePayload.data.transaction) ? circlePayload.data.transaction : null
  if (!transaction || transaction.id !== transactionId || transaction.walletId !== walletId) return { ok: false, status: 502, payload: { error: 'Circle returned a mismatched transaction.' } }
  if (transaction.state === 'FAILED' || transaction.state === 'DENIED' || transaction.state === 'CANCELLED') {
    await markAttemptFailed(intentId, intentTokenHash)
    return { ok: false, status: 409, payload: { error: 'Circle reported that this payment failed.', retryAllowed: true } }
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
    if (request.body.action === 'listWallets') {
      const userToken = getUserToken(request.body)
      const result = await listWallets(userToken)
      return jsonResponse(response, isRecord(result.payload) ? result.payload : { error: 'Circle wallet request failed' }, result.status)
    }

    if (request.body.action === 'listBalances') {
      const userToken = getUserToken(request.body)
      const result = await listBalances(userToken, getWalletId(request.body))
      return jsonResponse(response, isRecord(result.payload) ? result.payload : { error: 'Circle balance request failed' }, result.status)
    }

    if (request.body.action === 'initializeUser') {
      const userToken = getUserToken(request.body)
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
      const userToken = getUserToken(request.body)
      const result = await createTransferTransaction(userToken, request.body)
      return jsonResponse(response, isRecord(result.payload) ? result.payload : { error: 'Circle transfer request failed' }, result.status)
    }

    if (request.body.action === 'resolveTransferTransactionHash') {
      const result = await resolveTransferTransactionHash(request.body, request.headers.cookie)
      return jsonResponse(response, isRecord(result.payload) ? result.payload : { error: 'Circle transaction lookup failed' }, result.status)
    }

    return jsonResponse(response, { error: 'Unknown action' }, 400)
  } catch (error) {
    if (error instanceof Error && (error.message === 'Missing userToken' || error.message === 'Missing walletId' || error.message === 'Invalid destinationAddress' || error.message === 'Invalid amount' || error.message === 'Invalid referenceId' || error.message === 'Invalid payment intent')) {
      return jsonResponse(response, { error: error.message }, 400)
    }
    if (error instanceof Error && error.message === 'Circle API key is not configured') {
      return jsonResponse(response, { error: error.message }, 500)
    }

    return jsonResponse(response, { error: 'Circle wallet request failed' }, 502)
  }
}
