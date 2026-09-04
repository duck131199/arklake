const CIRCLE_WALLETS_URL = 'https://api.circle.com/v1/w3s/wallets'
const CIRCLE_USER_INITIALIZE_URL = 'https://api.circle.com/v1/w3s/user/initialize'
const arklakeBlockchain = 'ARC-TESTNET'
const arklakeAccountType = 'SCA'

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

    return jsonResponse(response, { error: 'Unknown action' }, 400)
  } catch (error) {
    if (error instanceof Error && (error.message === 'Missing userToken' || error.message === 'Missing walletId')) {
      return jsonResponse(response, { error: error.message }, 400)
    }
    if (error instanceof Error && error.message === 'Circle API key is not configured') {
      return jsonResponse(response, { error: error.message }, 500)
    }

    return jsonResponse(response, { error: 'Circle wallet request failed' }, 502)
  }
}
