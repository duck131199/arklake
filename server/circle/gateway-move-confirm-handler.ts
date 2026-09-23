import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getGatewayReadOnlyContext } from '../../api/auth/session.js'
import {
  confirmAndEnqueueGatewayMoveOperation,
  getGatewayMoveOperation,
  toPublicGatewayMoveOperation,
} from './gateway-move-operation.js'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return failure(res, 405, 'METHOD_NOT_ALLOWED', 'request')
  }
  const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {}
  if (typeof body.operationId !== 'string' || !uuidPattern.test(body.operationId)) {
    return failure(res, 400, 'INVALID_REQUEST', 'request')
  }

  try {
    const context = await getGatewayReadOnlyContext(req.headers.cookie)
    if (context.ok === false) {
      if (context.reason === 'AUTHENTICATION_REQUIRED') return failure(res, 401, 'AUTHENTICATION_REQUIRED', 'session')
      return failure(res, 503, 'OPERATION_STORE_UNAVAILABLE', 'account_correlation', context.reason === 'SESSION_STORE_UNAVAILABLE')
    }
    const db = database() as any
    const claim = await confirmAndEnqueueGatewayMoveOperation(db, context.accountId, body.operationId, context.sessionId)
    if (claim.result === 'not_found') return failure(res, 404, 'OPERATION_NOT_FOUND', 'claim')
    if (claim.result === 'expired') return failure(res, 409, 'ESTIMATE_EXPIRED', 'claim')
    if (claim.result === 'active_operation_exists') return failure(res, 409, 'ACTIVE_OPERATION_EXISTS', 'claim')
    if (claim.result === 'not_executable') return failure(res, 409, 'OPERATION_NOT_CONFIRMABLE', 'claim')
    if (claim.result === 'auth_context_unavailable') return failure(res, 401, 'AUTHENTICATION_REQUIRED', 'session')
    if (!claim.claimed) return failure(res, 503, 'OPERATION_STORE_UNAVAILABLE', 'claim', true)

    const operation = await getGatewayMoveOperation(db, context.accountId, body.operationId)
    if (!operation || operation.status !== 'SUBMITTING') {
      return failure(res, 503, 'OPERATION_STORE_UNAVAILABLE', 'claim', true)
    }
    return json(res, 200, {
      ok: true,
      claimed: true,
      replayed: claim.replayed,
      operation: toPublicGatewayMoveOperation(operation),
    })
  } catch {
    return failure(res, 503, 'OPERATION_STORE_UNAVAILABLE', 'claim', true)
  }
}
