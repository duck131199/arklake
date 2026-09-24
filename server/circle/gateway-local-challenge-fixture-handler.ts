import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getGatewayReadOnlyContext } from '../../api/auth/session.js'

const circleApiBaseUrl = 'https://api.circle.com/v1/w3s'
const activeStatuses = ['SUBMITTING', 'CHALLENGE_REQUIRED', 'PROCESSING', 'UNKNOWN']

const required = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

const database = () => createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})

const json = (res: VercelResponse, status: number, body: object) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  return res.end(JSON.stringify(body))
}

const unavailable = (req: VercelRequest) => {
  const host = String(req.headers.host || '').split(':')[0].toLowerCase()
  const localHost = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  const deployedVercel = process.env.VERCEL_ENV === 'preview' || process.env.VERCEL_ENV === 'production'
  return process.env.GATEWAY_LOCAL_CHALLENGE_FIXTURE_ENABLED !== 'true'
    || process.env.NODE_ENV === 'production'
    || deployedVercel
    || !localHost
}

type CircleWallet = { id: string; address: string; blockchain: string; accountType: string }

async function circleRequest(path: string, userToken: string, init?: RequestInit) {
  const response = await fetch(`${circleApiBaseUrl}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${required('CIRCLE_API_KEY')}`,
      'X-User-Token': userToken,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`circle_${response.status}`)
  return payload
}

function walletsFrom(payload: unknown): CircleWallet[] {
  const value = payload as { data?: { wallets?: unknown }; wallets?: unknown } | null
  const wallets = value?.data?.wallets ?? value?.wallets
  return Array.isArray(wallets) ? wallets as CircleWallet[] : []
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (unavailable(req)) return json(res, 404, { ok: false, error: { code: 'NOT_FOUND' } })
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return json(res, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED' } })
  }
  if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
    return json(res, 400, { ok: false, error: { code: 'INVALID_REQUEST' } })
  }

  const context = await getGatewayReadOnlyContext(req.headers.cookie)
  if (!context.ok) {
    return json(res, context.reason === 'AUTHENTICATION_REQUIRED' ? 401 : 503, {
      ok: false,
      error: { code: context.reason, stage: 'session', retryable: context.reason === 'SESSION_STORE_UNAVAILABLE' },
    })
  }

  const db = database()
  const { count, error: activeError } = await db.from('gateway_move_operations')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', context.accountId)
    .in('status', activeStatuses)
  if (activeError) return json(res, 503, { ok: false, error: { code: 'OPERATION_STORE_UNAVAILABLE' } })
  if (count) return json(res, 409, { ok: false, error: { code: 'ACTIVE_OPERATION_EXISTS' } })

  const walletPayload = await circleRequest('/wallets?pageSize=50', context.userToken)
  const polygonWallet = walletsFrom(walletPayload).find((wallet) => wallet.blockchain === 'MATIC-AMOY' && wallet.accountType === 'SCA')
  if (!polygonWallet) return json(res, 409, { ok: false, error: { code: 'POLYGON_SCA_UNAVAILABLE' } })

  const operationId = crypto.randomUUID()
  const preparationKey = crypto.randomUUID()
  const jobId = crypto.randomUUID()
  const executionAttemptId = crypto.randomUUID()
  const challengeId = crypto.randomUUID()
  const marker = `challenge-bridge-local-positive-${operationId}`
  const typedData = {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      ArklakeReview: [
        { name: 'operationId', type: 'string' },
        { name: 'purpose', type: 'string' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'ArklakeReview',
    domain: {
      name: 'Arklake Challenge Bridge Review', version: '1', chainId: 80002,
      verifyingContract: '0x0000000000000000000000000000000000000001',
    },
    message: {
      operationId,
      purpose: 'Non-financial localhost challenge bridge review',
      nonce: `0x${crypto.randomBytes(32).toString('hex')}`,
    },
  }
  const challengePayload = await circleRequest('/user/sign/typedData', context.userToken, {
    method: 'POST',
    body: JSON.stringify({ walletId: polygonWallet.id, data: JSON.stringify(typedData) }),
  }) as { data?: { challengeId?: string; challenge?: { id?: string } }; challengeId?: string }
  const circleChallengeId = challengePayload?.data?.challengeId
    ?? challengePayload?.data?.challenge?.id
    ?? challengePayload?.challengeId
  if (!circleChallengeId) return json(res, 502, { ok: false, error: { code: 'CIRCLE_CHALLENGE_UNAVAILABLE' } })

  const now = new Date().toISOString()
  const { error: operationError } = await db.from('gateway_move_operations').insert({
    id: operationId,
    account_id: context.accountId,
    preparation_key: preparationKey,
    status: 'SUBMITTING',
    amount_base_units: '1',
    token: 'USDC',
    source_chain: 'Polygon_Amoy_Testnet',
    source_wallet_id: polygonWallet.id,
    source_address: polygonWallet.address.toLowerCase(),
    destination_chain: 'Arc_Testnet',
    destination_wallet_id: context.arcWallet.circle_wallet_id,
    destination_address: context.arcWallet.address.toLowerCase(),
    use_forwarder: false,
    estimated_fees_json: { mode: 'non-financial-signature-review', marker },
    required_base_units: '1',
    estimate_created_at: now,
    confirmed_at: now,
    started_at: now,
    last_progress_at: now,
  })
  if (operationError) return json(res, 503, { ok: false, error: { code: 'OPERATION_STORE_UNAVAILABLE' } })

  const { error: jobError } = await db.from('gateway_move_execution_jobs').insert({
    id: jobId,
    operation_id: operationId,
    status: 'WAITING',
    execution_mode: 'REAL',
    execution_phase: 'WAITING_CHALLENGE',
    execution_attempt_id: executionAttemptId,
    auth_session_id: context.sessionId,
    recovery_metadata: { mode: 'challenge-bridge-local-positive', marker, movedFunds: false },
    last_progress_at: now,
  })
  if (jobError) return json(res, 503, { ok: false, error: { code: 'OPERATION_STORE_UNAVAILABLE' } })

  const { error: challengeError } = await db.from('gateway_move_challenges').insert({
    id: challengeId,
    job_id: jobId,
    operation_id: operationId,
    sequence: 1,
    challenge_type: 'CIRCLE_TYPED_DATA',
    status: 'PENDING',
    execution_attempt_id: executionAttemptId,
    circle_challenge_id: circleChallengeId,
  })
  if (challengeError) return json(res, 503, { ok: false, error: { code: 'OPERATION_STORE_UNAVAILABLE' } })

  const { error: transitionError } = await db.from('gateway_move_operations').update({
    status: 'CHALLENGE_REQUIRED', challenge_count: 1, last_progress_at: new Date().toISOString(),
  }).eq('id', operationId).eq('account_id', context.accountId).eq('status', 'SUBMITTING')
  if (transitionError) return json(res, 503, { ok: false, error: { code: 'OPERATION_STORE_UNAVAILABLE' } })

  return json(res, 201, {
    ok: true,
    operationId,
    challenge: { type: 'CIRCLE_TYPED_DATA', status: 'PENDING' },
    url: `/app/gateway/move/${operationId}`,
  })
}
