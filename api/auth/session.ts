import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const cookieName = 'arklake_session'
const sessionTtlSeconds = 60 * 60 * 24 * 7
const circleApiBaseUrl = 'https://api.circle.com/v1/w3s'

type SessionPayload = {
  sid: string
}

type CircleWalletIdentity = {
  id: string
  address: string
  blockchain: string
  accountType: string
}

type CircleTokenBalance = {
  amount: string
  token: {
    id: string
    name?: string
    symbol?: string
    blockchain: string
    tokenAddress?: string
  }
}

type ArklakeTokenBalance = {
  amount: string
  tokenId: string
  name?: string
  symbol: string
  blockchain: string
  tokenAddress?: string
}

type StoredSession = {
  sid: string
  account_id: string
  circle_user_token: string
  circle_refresh_token: string
  circle_device_id: string
  expires_at: string
  revoked_at: string | null
  arklake_accounts: {
    email: string
  } | null
}

type StoredWallet = {
  circle_wallet_id: string
  address: string
  blockchain: string
  account_type: string
}

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString('base64url')
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function getSessionSecret() {
  const secret = process.env.ARKLAKE_SESSION_SECRET
  if (!secret) throw new Error('ARKLAKE_SESSION_SECRET is not configured')
  return secret
}

function getCircleApiKey() {
  const apiKey = process.env.CIRCLE_API_KEY
  if (!apiKey) throw new Error('CIRCLE_API_KEY is not configured')
  return apiKey
}

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase is not configured')

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function sign(value: string) {
  return crypto.createHmac('sha256', getSessionSecret()).update(value).digest('base64url')
}

function serializeSession(payload: SessionPayload) {
  const body = base64UrlEncode(JSON.stringify(payload))
  return `${body}.${sign(body)}`
}

function parseCookies(cookieHeader: string | undefined) {
  return Object.fromEntries((cookieHeader || '').split(';').map((entry) => {
    const [key, ...value] = entry.trim().split('=')
    return [key, value.join('=')]
  }).filter(([key]) => key))
}

function verifySessionCookie(cookieValue: string | undefined) {
  if (!cookieValue) return null

  const [body, signature] = cookieValue.split('.')
  if (!body || !signature) return null

  try {
    const expectedSignature = sign(body)
    const expectedBuffer = Buffer.from(expectedSignature)
    const signatureBuffer = Buffer.from(signature)
    if (expectedBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) return null

    const payload = JSON.parse(base64UrlDecode(body)) as Partial<SessionPayload>
    if (!payload.sid) return null
    return payload
  } catch {
    return null
  }
}

function setSessionCookie(res: VercelResponse, value: string) {
  res.setHeader('Set-Cookie', `${cookieName}=${value}; Path=/; Max-Age=${sessionTtlSeconds}; HttpOnly; SameSite=Lax`)
}

function clearSessionCookie(res: VercelResponse) {
  res.setHeader('Set-Cookie', `${cookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`)
}

function logSafeSessionDiagnostic(step: string, details?: Record<string, unknown>) {
  console.error('ARKLAKE_SESSION_DIAGNOSTIC', { step, ...details })
}

function getSafeSupabaseError(error: { code?: string; message?: string; details?: string; hint?: string } | null) {
  if (!error) return null

  return {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  }
}

function normalizeCircleTokenBalance(balance: CircleTokenBalance): ArklakeTokenBalance {
  if (!balance.amount || !balance.token?.id || !balance.token.blockchain) {
    throw new Error('Invalid Circle balance response')
  }

  return {
    amount: balance.amount,
    tokenId: balance.token.id,
    name: balance.token.name,
    symbol: balance.token.symbol || balance.token.name || 'TOKEN',
    blockchain: balance.token.blockchain,
    tokenAddress: balance.token.tokenAddress,
  }
}

async function verifyCircleUserToken(userToken: string) {
  const response = await fetch(`${circleApiBaseUrl}/user`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${getCircleApiKey()}`,
      'X-User-Token': userToken,
    },
  })

  if (!response.ok) return null

  const data = await response.json().catch(() => null) as { data?: { userID?: string; userId?: string; id?: string } } | null
  if (!data?.data) return null
  return data.data.userID || data.data.userId || data.data.id || null
}

async function refreshCircleUserToken(session: StoredSession) {
  const response = await fetch(`${circleApiBaseUrl}/users/token/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getCircleApiKey()}`,
      'X-User-Token': session.circle_user_token,
    },
    body: JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      refreshToken: session.circle_refresh_token,
      deviceId: session.circle_device_id,
    }),
  })

  if (!response.ok) return null

  const data = await response.json().catch(() => null) as { data?: { userToken?: string; refreshToken?: string } } | null
  if (!data?.data?.userToken) return null

  return {
    userToken: data.data.userToken,
    refreshToken: data.data.refreshToken || session.circle_refresh_token,
  }
}

async function listCircleBalances(userToken: string, walletId: string) {
  const response = await fetch(`${circleApiBaseUrl}/wallets/${encodeURIComponent(walletId)}/balances`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${getCircleApiKey()}`,
      'X-User-Token': userToken,
    },
  })

  const payload = await response.json().catch(() => null) as { data?: { tokenBalances?: CircleTokenBalance[] } } | null
  return { response, payload }
}

async function getBootstrapSession(sid: string) {
  const supabase = getSupabaseClient()
  const { data: session, error: sessionError } = await supabase
    .from('arklake_sessions')
    .select('sid, account_id, circle_user_token, circle_refresh_token, circle_device_id, expires_at, revoked_at, arklake_accounts(email)')
    .eq('sid', sid)
    .maybeSingle<StoredSession>()

  if (sessionError || !session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) return null

  const { data: wallet, error: walletError } = await supabase
    .from('arklake_wallets')
    .select('circle_wallet_id, address, blockchain, account_type')
    .eq('account_id', session.account_id)
    .eq('blockchain', 'ARC-TESTNET')
    .eq('account_type', 'SCA')
    .maybeSingle<StoredWallet>()

  if (walletError || !wallet || !session.arklake_accounts) return null

  let userToken = session.circle_user_token
  let balancesResult = await listCircleBalances(userToken, wallet.circle_wallet_id)

  if (balancesResult.response.status === 401) {
    const refreshed = await refreshCircleUserToken(session)
    if (!refreshed) return null

    userToken = refreshed.userToken
    await supabase
      .from('arklake_sessions')
      .update({
        circle_user_token: refreshed.userToken,
        circle_refresh_token: refreshed.refreshToken,
      })
      .eq('sid', sid)

    balancesResult = await listCircleBalances(userToken, wallet.circle_wallet_id)
  }

  if (!balancesResult.response.ok || !Array.isArray(balancesResult.payload?.data?.tokenBalances)) return null

  return {
    authenticated: true,
    email: session.arklake_accounts.email,
    wallet: {
      id: wallet.circle_wallet_id,
      address: wallet.address,
      blockchain: wallet.blockchain,
      accountType: wallet.account_type,
    },
    balances: balancesResult.payload.data.tokenBalances.map(normalizeCircleTokenBalance),
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    try {
      const session = verifySessionCookie(parseCookies(req.headers.cookie)[cookieName])
      if (!session) return res.status(200).json({ authenticated: false })

      const bootstrap = await getBootstrapSession(session.sid)
      return res.status(200).json(bootstrap || { authenticated: false })
    } catch (error) {
      if (error instanceof Error && error.message === 'ARKLAKE_SESSION_SECRET is not configured') {
        return res.status(500).json({ error: 'Session secret is not configured.' })
      }
      if (error instanceof Error && error.message === 'Supabase is not configured') {
        return res.status(500).json({ error: 'Supabase is not configured.' })
      }
      if (error instanceof Error && error.message === 'CIRCLE_API_KEY is not configured') {
        return res.status(500).json({ error: 'Circle API key is not configured.' })
      }
      return res.status(502).json({ error: 'Unable to bootstrap Arklake session.' })
    }
  }

  if (req.method === 'POST') {
    const { email, userToken, refreshToken, deviceId, wallet } = req.body || {}
    if (!email || !userToken || !refreshToken || !deviceId || !wallet) {
      logSafeSessionDiagnostic('post_payload_missing', {
        hasEmail: Boolean(email),
        hasUserToken: Boolean(userToken),
        hasRefreshToken: Boolean(refreshToken),
        hasDeviceId: Boolean(deviceId),
        hasWallet: Boolean(wallet),
      })
      return res.status(400).json({ error: 'Missing verified Arklake session data.' })
    }
    if (typeof email !== 'string' || typeof userToken !== 'string' || typeof refreshToken !== 'string' || typeof deviceId !== 'string') {
      logSafeSessionDiagnostic('post_payload_invalid_types', {
        emailType: typeof email,
        userTokenType: typeof userToken,
        refreshTokenType: typeof refreshToken,
        deviceIdType: typeof deviceId,
      })
      return res.status(400).json({ error: 'Invalid Arklake session data.' })
    }

    const walletIdentity = wallet as Partial<CircleWalletIdentity>
    if (!walletIdentity.id || !walletIdentity.address || !walletIdentity.blockchain || !walletIdentity.accountType) {
      logSafeSessionDiagnostic('wallet_identity_missing', {
        hasWalletId: Boolean(walletIdentity.id),
        hasAddress: Boolean(walletIdentity.address),
        blockchain: walletIdentity.blockchain,
        accountType: walletIdentity.accountType,
      })
      return res.status(400).json({ error: 'Missing Circle wallet identity.' })
    }

    try {
      const circleUserId = await verifyCircleUserToken(userToken)
      if (circleUserId === null) {
        logSafeSessionDiagnostic('circle_user_token_verify_failed')
        return res.status(401).json({ error: 'Circle authentication could not be verified.' })
      }

      const supabase = getSupabaseClient()
      const normalizedEmail = email.trim().toLowerCase()
      const { data: account, error: accountError } = await supabase
        .from('arklake_accounts')
        .upsert({
          email: normalizedEmail,
          circle_user_id: circleUserId,
        }, { onConflict: 'email' })
        .select('id')
        .single<{ id: string }>()

      if (accountError || !account) {
        logSafeSessionDiagnostic('supabase_upsert_account_failed', { error: getSafeSupabaseError(accountError) })
        throw new Error('Unable to persist Arklake account')
      }

      const { error: walletError } = await supabase
        .from('arklake_wallets')
        .upsert({
          account_id: account.id,
          circle_wallet_id: walletIdentity.id,
          address: walletIdentity.address,
          blockchain: walletIdentity.blockchain,
          account_type: walletIdentity.accountType,
        }, { onConflict: 'circle_wallet_id' })

      if (walletError) {
        logSafeSessionDiagnostic('supabase_upsert_wallet_failed', { error: getSafeSupabaseError(walletError) })
        throw new Error('Unable to persist Arklake wallet')
      }

      const now = Math.floor(Date.now() / 1000)
      const sid = crypto.randomUUID()
      const expiresAt = new Date((now + sessionTtlSeconds) * 1000).toISOString()
      const { error: sessionError } = await supabase
        .from('arklake_sessions')
        .insert({
          sid,
          account_id: account.id,
          circle_user_token: userToken,
          circle_refresh_token: refreshToken,
          circle_device_id: deviceId,
          expires_at: expiresAt,
        })

      if (sessionError) {
        logSafeSessionDiagnostic('supabase_insert_session_failed', { error: getSafeSupabaseError(sessionError) })
        throw new Error('Unable to persist Arklake session')
      }

      setSessionCookie(res, serializeSession({ sid }))
      return res.status(200).json({ authenticated: true })
    } catch (error) {
      if (error instanceof Error && error.message === 'ARKLAKE_SESSION_SECRET is not configured') {
        return res.status(500).json({ error: 'Session secret is not configured.' })
      }
      if (error instanceof Error && error.message === 'CIRCLE_API_KEY is not configured') {
        return res.status(500).json({ error: 'Circle API key is not configured.' })
      }
      if (error instanceof Error && error.message === 'Supabase is not configured') {
        return res.status(500).json({ error: 'Supabase is not configured.' })
      }
      return res.status(502).json({ error: 'Unable to create Arklake session.' })
    }
  }

  if (req.method === 'DELETE') {
    try {
      const session = verifySessionCookie(parseCookies(req.headers.cookie)[cookieName])
      if (session) {
        await getSupabaseClient()
          .from('arklake_sessions')
          .update({ revoked_at: new Date().toISOString() })
          .eq('sid', session.sid)
      }
    } catch {
      // Clear the browser cookie even if backend session revocation cannot complete.
    }

    clearSessionCookie(res)
    return res.status(200).json({ authenticated: false })
  }

  res.setHeader('Allow', 'GET, POST, DELETE')
  return res.status(405).json({ error: 'Method not allowed' })
}
