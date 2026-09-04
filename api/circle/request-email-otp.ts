const CIRCLE_EMAIL_TOKEN_URL = 'https://api.circle.com/v1/w3s/users/email/token'

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

const isValidEmail = (value: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

const jsonResponse = (response: VercelResponse, body: Record<string, unknown>, status: number) => {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  return response.end(JSON.stringify(body))
}

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'POST') {
    return jsonResponse(response, { error: 'Method not allowed' }, 405)
  }

  const circleApiKey = process.env.CIRCLE_API_KEY

  if (!circleApiKey) {
    return jsonResponse(response, { error: 'Circle Email OTP is not configured' }, 500)
  }

  const body = request.body

  if (!isRecord(body)) {
    return jsonResponse(response, { error: 'Invalid request body' }, 400)
  }

  const deviceId = typeof body.deviceId === 'string' ? body.deviceId.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim() : ''

  if (!deviceId) {
    return jsonResponse(response, { error: 'Missing deviceId' }, 400)
  }

  if (!email || !isValidEmail(email)) {
    return jsonResponse(response, { error: 'Invalid email' }, 400)
  }

  try {
    const circleResponse = await fetch(CIRCLE_EMAIL_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${circleApiKey}`,
        'X-Request-Id': crypto.randomUUID(),
      },
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        deviceId,
        email,
      }),
    })

    const circlePayload: unknown = await circleResponse.json()

    if (!circleResponse.ok) {
      const message = isRecord(circlePayload) && typeof circlePayload.message === 'string'
        ? circlePayload.message
        : 'Circle Email OTP request failed'

      return jsonResponse(response, { error: message }, circleResponse.status)
    }

    if (!isRecord(circlePayload) || !isRecord(circlePayload.data)) {
      return jsonResponse(response, { error: 'Invalid Circle response' }, 502)
    }

    const { deviceToken, deviceEncryptionKey, otpToken } = circlePayload.data

    if (typeof deviceToken !== 'string' || typeof deviceEncryptionKey !== 'string' || typeof otpToken !== 'string') {
      return jsonResponse(response, { error: 'Incomplete Circle response' }, 502)
    }

    return jsonResponse(response, { deviceToken, deviceEncryptionKey, otpToken }, 200)
  } catch {
    return jsonResponse(response, { error: 'Circle Email OTP request failed' }, 502)
  }
}
