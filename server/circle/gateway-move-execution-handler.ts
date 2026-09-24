import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getGatewayReadOnlyContext } from '../../api/auth/session.js'
import {
  decryptGatewayChallengeResponse,
  encryptGatewayChallengeResponse,
  sameGatewayChallengeResponse,
  type GatewayChallengeResponseMaterial,
} from './gateway-challenge-crypto.js'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const circleSignaturePattern = /^0x[0-9a-fA-F]{130}$/
const allowedBodyKeys = new Set(['operationId', 'challengeId', 'sequence', 'status', 'signature'])

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

const failure = (res: VercelResponse, status: number, code: string, stage: string, retryable = false) => json(res, status, {
  ok: false,
  error: { code, stage, retryable },
})

type OperationRow = { id: string; status: string }
type JobRow = {
  id: string
  operation_id: string
  execution_mode: 'MOCK' | 'REAL'
  execution_attempt_id: string | null
  auth_session_id: string | null
}
type ChallengeRow = {
  id: string
  job_id: string
  operation_id: string
  sequence: number
  challenge_type: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  execution_attempt_id: string | null
  circle_challenge_id: string | null
  encrypted_response_material: string | null
  superseded_at: string | null
}

async function loadScope(db: ReturnType<typeof database>, accountId: string, sessionId: string, operationId: string) {
  const { data: operation, error: operationError } = await db.from('gateway_move_operations')
    .select('id,status').eq('id', operationId).eq('account_id', accountId).maybeSingle<OperationRow>()
  if (operationError) throw new Error('operation_store')
  if (!operation) return null

  const { data: job, error: jobError } = await db.from('gateway_move_execution_jobs')
    .select('id,operation_id,execution_mode,execution_attempt_id,auth_session_id')
    .eq('operation_id', operation.id).maybeSingle<JobRow>()
  if (jobError) throw new Error('operation_store')
  if (!job || job.execution_mode !== 'REAL' || !job.execution_attempt_id || job.auth_session_id !== sessionId) return null
  return { operation, job }
}

const challengeFields = 'id,job_id,operation_id,sequence,challenge_type,status,execution_attempt_id,circle_challenge_id,encrypted_response_material,superseded_at'

async function loadChallenge(db: ReturnType<typeof database>, scope: NonNullable<Awaited<ReturnType<typeof loadScope>>>, challengeId?: string) {
  let query = db.from('gateway_move_challenges').select(challengeFields)
    .eq('operation_id', scope.operation.id)
    .eq('job_id', scope.job.id)
    .eq('execution_attempt_id', scope.job.execution_attempt_id as string)
    .eq('challenge_type', 'CIRCLE_TYPED_DATA')
  if (challengeId) query = query.eq('id', challengeId)
  const { data, error } = await query.order('sequence', { ascending: false }).limit(1).maybeSingle<ChallengeRow>()
  if (error) throw new Error('operation_store')
  return data
}

function publicChallenge(challenge: ChallengeRow) {
  return {
    challengeId: challenge.id,
    sequence: challenge.sequence,
    type: 'CIRCLE_TYPED_DATA' as const,
    circleChallengeId: challenge.circle_challenge_id,
  }
}

function requestedMaterial(body: Record<string, unknown>): GatewayChallengeResponseMaterial | null {
  if (body.status === 'REJECTED' && body.signature === undefined) return { status: 'REJECTED' }
  if (body.status === 'APPROVED' && typeof body.signature === 'string' && circleSignaturePattern.test(body.signature)) {
    return { status: 'APPROVED', signature: body.signature.toLowerCase() }
  }
  return null
}

async function authenticatedContext(req: VercelRequest, res: VercelResponse) {
  const context = await getGatewayReadOnlyContext(req.headers.cookie)
  if (context.ok) return context
  if (context.reason === 'AUTHENTICATION_REQUIRED') failure(res, 401, 'AUTHENTICATION_REQUIRED', 'session')
  else failure(res, 503, 'OPERATION_STORE_UNAVAILABLE', 'account_correlation', context.reason === 'SESSION_STORE_UNAVAILABLE')
  return null
}

async function getExecution(req: VercelRequest, res: VercelResponse) {
  const operationId = typeof req.query.operationId === 'string' ? req.query.operationId : ''
  if (!uuidPattern.test(operationId)) return failure(res, 400, 'INVALID_REQUEST', 'request')
  const context = await authenticatedContext(req, res)
  if (!context) return
  const db = database()
  const scope = await loadScope(db, context.accountId, context.sessionId, operationId)
  if (!scope) return failure(res, 404, 'OPERATION_NOT_FOUND', 'operation')
  const challenge = await loadChallenge(db, scope)
  const pending = challenge?.status === 'PENDING' && challenge.superseded_at === null ? challenge : null
  return json(res, 200, {
    ok: true,
    operation: { operationId: scope.operation.id, status: scope.operation.status },
    challenge: pending ? publicChallenge(pending) : null,
  })
}

async function postResponse(req: VercelRequest, res: VercelResponse) {
  const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {}
  if (Object.keys(body).some((key) => !allowedBodyKeys.has(key))
    || typeof body.operationId !== 'string' || !uuidPattern.test(body.operationId)
    || typeof body.challengeId !== 'string' || !uuidPattern.test(body.challengeId)
    || !Number.isInteger(body.sequence) || (body.sequence as number) < 1) {
    return failure(res, 400, 'INVALID_REQUEST', 'request')
  }
  const material = requestedMaterial(body)
  if (!material) return failure(res, 400, 'INVALID_CHALLENGE_RESPONSE', 'request')
  const context = await authenticatedContext(req, res)
  if (!context) return
  const db = database()
  const scope = await loadScope(db, context.accountId, context.sessionId, body.operationId)
  if (!scope) return failure(res, 404, 'OPERATION_NOT_FOUND', 'operation')
  const challenge = await loadChallenge(db, scope, body.challengeId)
  if (!challenge) return failure(res, 404, 'CHALLENGE_NOT_FOUND', 'challenge')
  if (challenge.sequence !== body.sequence || challenge.challenge_type !== 'CIRCLE_TYPED_DATA'
    || challenge.execution_attempt_id !== scope.job.execution_attempt_id || challenge.superseded_at !== null) {
    return failure(res, 409, 'STALE_CHALLENGE', 'challenge')
  }
  if (challenge.status !== 'PENDING') {
    if (!challenge.encrypted_response_material) return failure(res, 409, 'CHALLENGE_CONFLICT', 'challenge')
    const stored = decryptGatewayChallengeResponse(challenge.encrypted_response_material)
    if (sameGatewayChallengeResponse(stored, material)) return json(res, 200, { ok: true, replayed: true, status: challenge.status })
    return failure(res, 409, 'CHALLENGE_CONFLICT', 'challenge')
  }
  if (scope.operation.status !== 'CHALLENGE_REQUIRED') return failure(res, 409, 'STALE_CHALLENGE', 'challenge')

  const now = new Date().toISOString()
  const encrypted = encryptGatewayChallengeResponse(material)
  const nextStatus = material.status
  const { data: updated, error } = await db.from('gateway_move_challenges').update({
    status: nextStatus,
    response_json: { approved: nextStatus === 'APPROVED' },
    encrypted_response_material: encrypted,
    response_received_at: now,
    responded_at: now,
  }).eq('id', challenge.id)
    .eq('operation_id', scope.operation.id)
    .eq('job_id', scope.job.id)
    .eq('execution_attempt_id', scope.job.execution_attempt_id as string)
    .eq('status', 'PENDING')
    .is('superseded_at', null)
    .select('id').maybeSingle<{ id: string }>()
  if (error) throw new Error('operation_store')
  if (updated) return json(res, 200, { ok: true, replayed: false, status: nextStatus })

  const raced = await loadChallenge(db, scope, challenge.id)
  if (raced?.encrypted_response_material) {
    const stored = decryptGatewayChallengeResponse(raced.encrypted_response_material)
    if (sameGatewayChallengeResponse(stored, material)) return json(res, 200, { ok: true, replayed: true, status: raced.status })
  }
  return failure(res, 409, 'CHALLENGE_CONFLICT', 'challenge')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method === 'GET') return await getExecution(req, res)
    if (req.method === 'POST') return await postResponse(req, res)
    res.setHeader('Allow', 'GET, POST')
    return failure(res, 405, 'METHOD_NOT_ALLOWED', 'request')
  } catch {
    return failure(res, 503, 'OPERATION_STORE_UNAVAILABLE', 'challenge', true)
  }
}
