export const GATEWAY_MOVE_SOURCE_CHAIN = 'Polygon_Amoy_Testnet' as const
export const GATEWAY_MOVE_DESTINATION_CHAIN = 'Arc_Testnet' as const
export const GATEWAY_MOVE_TOKEN = 'USDC' as const

export const gatewayMoveStatuses = [
  'ESTIMATING', 'AWAITING_CONFIRMATION', 'SUBMITTING', 'CHALLENGE_REQUIRED',
  'PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED', 'UNKNOWN', 'EXPIRED',
] as const
export type GatewayMoveStatus = typeof gatewayMoveStatuses[number]

const allowedTransitions: Record<GatewayMoveStatus, readonly GatewayMoveStatus[]> = {
  ESTIMATING: ['AWAITING_CONFIRMATION', 'FAILED', 'EXPIRED'],
  AWAITING_CONFIRMATION: ['SUBMITTING', 'REJECTED', 'FAILED', 'EXPIRED'],
  SUBMITTING: ['CHALLENGE_REQUIRED', 'PROCESSING', 'FAILED', 'UNKNOWN'],
  CHALLENGE_REQUIRED: ['PROCESSING', 'REJECTED', 'FAILED', 'UNKNOWN'],
  PROCESSING: ['CHALLENGE_REQUIRED', 'COMPLETED', 'FAILED', 'UNKNOWN'],
  UNKNOWN: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  REJECTED: [],
  FAILED: [],
  EXPIRED: [],
}

export function gatewayMoveTransitionAllowed(from: GatewayMoveStatus, to: GatewayMoveStatus) {
  return from === to || allowedTransitions[from].includes(to)
}

type GatewayMoveRow = {
  id: string
  account_id: string
  preparation_key: string
  status: GatewayMoveStatus
  amount_base_units: string | number
  token: typeof GATEWAY_MOVE_TOKEN
  source_chain: typeof GATEWAY_MOVE_SOURCE_CHAIN
  source_wallet_id: string
  source_address: string
  destination_chain: typeof GATEWAY_MOVE_DESTINATION_CHAIN
  destination_wallet_id: string
  destination_address: string
  use_forwarder: false
  estimated_fees_json: unknown
  required_base_units: string | number | null
  gateway_before_base_units: string | number | null
  arc_before_base_units: string | number | null
  estimate_created_at: string | null
  confirmed_at: string | null
  started_at: string | null
  last_progress_at: string | null
  challenge_count: number
  transfer_id: string | null
  destination_tx_hash: string | null
  gateway_after_base_units: string | number | null
  arc_after_base_units: string | number | null
  receipt_status: 'SUCCESS' | 'FAILED' | null
  sanitized_result_json: unknown
  error_code: string | null
  error_stage: string | null
  retryable: boolean
  created_at: string
  updated_at: string
}

type QueryResult<T> = PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>
type GatewayMoveDatabase = {
  from(table: 'gateway_move_operations'): {
    insert(value: Record<string, unknown>): {
      select(fields: string): { single(): QueryResult<GatewayMoveRow> }
    }
    select(fields: string): {
      eq(field: string, value: string): {
        eq(field: string, value: string): { maybeSingle(): QueryResult<GatewayMoveRow> }
      }
    }
  }
  rpc(name: 'confirm_and_enqueue_gateway_move_operation', args: { p_operation_id: string; p_account_id: string; p_session_id: string }): QueryResult<Record<string, unknown>>
}

export type CreateGatewayMoveOperationInput = {
  accountId: string
  preparationKey: string
  status?: 'ESTIMATING' | 'AWAITING_CONFIRMATION'
  amountBaseUnits: string
  sourceWalletId: string
  sourceAddress: string
  destinationWalletId: string
  destinationAddress: string
  estimatedFees?: unknown
  requiredBaseUnits?: string
  gatewayBeforeBaseUnits?: string
  arcBeforeBaseUnits?: string
  estimateCreatedAt?: string
}

const addressPattern = /^0x[0-9a-f]{40}$/
const integerPattern = /^(0|[1-9]\d*)$/
const operationFields = '*'
const sensitiveKeyPattern = /^(userToken|refreshToken|encryptionKey|apiKey|signature|typedData|authorization|sessionCookie|rawProvider)/i

function assertSanitizedJson(value: unknown, path = 'value') {
  if (value === null || value === undefined || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSanitizedJson(item, `${path}[${index}]`))
    return
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (sensitiveKeyPattern.test(key)) throw new Error(`${path} contains sensitive material.`)
    assertSanitizedJson(item, `${path}.${key}`)
  }
}

function requirePositiveBaseUnits(value: string, field: string) {
  if (!integerPattern.test(value) || BigInt(value) <= 0n) throw new Error(`${field} must be a positive base-unit string.`)
}

function requireNonNegativeBaseUnits(value: string | undefined, field: string) {
  if (value !== undefined && !integerPattern.test(value)) throw new Error(`${field} must be a non-negative base-unit string.`)
}

function requireAddress(value: string, field: string) {
  if (!addressPattern.test(value)) throw new Error(`${field} must be a lowercase EVM address.`)
}

export function toPublicGatewayMoveOperation(row: GatewayMoveRow) {
  return {
    operationId: row.id,
    status: row.status,
    amountBaseUnits: String(row.amount_base_units),
    token: row.token,
    sourceChain: row.source_chain,
    sourceAddress: row.source_address,
    destinationChain: row.destination_chain,
    destinationAddress: row.destination_address,
    useForwarder: row.use_forwarder,
    estimatedFees: row.estimated_fees_json,
    requiredBaseUnits: row.required_base_units === null ? null : String(row.required_base_units),
    gatewayBeforeBaseUnits: row.gateway_before_base_units === null ? null : String(row.gateway_before_base_units),
    arcBeforeBaseUnits: row.arc_before_base_units === null ? null : String(row.arc_before_base_units),
    estimateCreatedAt: row.estimate_created_at,
    startedAt: row.started_at,
    lastProgressAt: row.last_progress_at,
    challengeCount: row.challenge_count,
    transferId: row.transfer_id,
    destinationTxHash: row.destination_tx_hash,
    gatewayAfterBaseUnits: row.gateway_after_base_units === null ? null : String(row.gateway_after_base_units),
    arcAfterBaseUnits: row.arc_after_base_units === null ? null : String(row.arc_after_base_units),
    receiptStatus: row.receipt_status,
    result: row.sanitized_result_json,
    errorCode: row.error_code,
    errorStage: row.error_stage,
    retryable: row.retryable,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class GatewayMovePreparationConflictError extends Error {
  constructor() {
    super('The preparation key is already bound to a different Gateway Move operation.')
  }
}

function validateCreateInput(input: CreateGatewayMoveOperationInput) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.preparationKey)) {
    throw new Error('preparationKey must be a UUID.')
  }
  requirePositiveBaseUnits(input.amountBaseUnits, 'amountBaseUnits')
  requireNonNegativeBaseUnits(input.requiredBaseUnits, 'requiredBaseUnits')
  requireNonNegativeBaseUnits(input.gatewayBeforeBaseUnits, 'gatewayBeforeBaseUnits')
  requireNonNegativeBaseUnits(input.arcBeforeBaseUnits, 'arcBeforeBaseUnits')
  requireAddress(input.sourceAddress, 'sourceAddress')
  requireAddress(input.destinationAddress, 'destinationAddress')
  assertSanitizedJson(input.estimatedFees, 'estimatedFees')
  if (input.requiredBaseUnits !== undefined && BigInt(input.requiredBaseUnits) < BigInt(input.amountBaseUnits)) {
    throw new Error('requiredBaseUnits cannot be less than amountBaseUnits.')
  }
  const status = input.status || 'ESTIMATING'
  if (status === 'AWAITING_CONFIRMATION' && (!input.requiredBaseUnits || !input.estimateCreatedAt)) {
    throw new Error('An executable operation requires a completed estimate snapshot.')
  }
  return status
}

function samePreparationIdentity(row: GatewayMoveRow, input: CreateGatewayMoveOperationInput) {
  return row.account_id === input.accountId
    && row.preparation_key === input.preparationKey
    && String(row.amount_base_units) === input.amountBaseUnits
    && row.token === GATEWAY_MOVE_TOKEN
    && row.source_chain === GATEWAY_MOVE_SOURCE_CHAIN
    && row.source_wallet_id === input.sourceWalletId
    && row.source_address === input.sourceAddress
    && row.destination_chain === GATEWAY_MOVE_DESTINATION_CHAIN
    && row.destination_wallet_id === input.destinationWalletId
    && row.destination_address === input.destinationAddress
    && row.use_forwarder === false
}

function insertValue(input: CreateGatewayMoveOperationInput, status: 'ESTIMATING' | 'AWAITING_CONFIRMATION') {
  return {
    account_id: input.accountId,
    preparation_key: input.preparationKey,
    status,
    amount_base_units: input.amountBaseUnits,
    token: GATEWAY_MOVE_TOKEN,
    source_chain: GATEWAY_MOVE_SOURCE_CHAIN,
    source_wallet_id: input.sourceWalletId,
    source_address: input.sourceAddress,
    destination_chain: GATEWAY_MOVE_DESTINATION_CHAIN,
    destination_wallet_id: input.destinationWalletId,
    destination_address: input.destinationAddress,
    use_forwarder: false,
    estimated_fees_json: input.estimatedFees ?? null,
    required_base_units: input.requiredBaseUnits ?? null,
    gateway_before_base_units: input.gatewayBeforeBaseUnits ?? null,
    arc_before_base_units: input.arcBeforeBaseUnits ?? null,
    estimate_created_at: input.estimateCreatedAt ?? null,
  }
}

export async function createGatewayMoveOperation(database: GatewayMoveDatabase, input: CreateGatewayMoveOperationInput) {
  const status = validateCreateInput(input)
  const { data, error } = await database.from('gateway_move_operations').insert(insertValue(input, status)).select(operationFields).single()
  if (error || !data) throw new Error('Gateway Move operation could not be created.')
  return data
}

export async function getGatewayMoveOperationByPreparationKey(database: GatewayMoveDatabase, accountId: string, preparationKey: string) {
  const { data, error } = await database.from('gateway_move_operations').select(operationFields)
    .eq('account_id', accountId).eq('preparation_key', preparationKey).maybeSingle()
  if (error) throw new Error('Gateway Move preparation could not be loaded.')
  return data
}

export async function createOrReplayGatewayMoveOperation(database: GatewayMoveDatabase, input: CreateGatewayMoveOperationInput) {
  const status = validateCreateInput(input)
  const { data, error } = await database.from('gateway_move_operations').insert(insertValue(input, status)).select(operationFields).single()
  if (!error && data) return { operation: data, replayed: false }
  if (error?.code !== '23505') throw new Error('Gateway Move operation could not be created.')
  const existing = await getGatewayMoveOperationByPreparationKey(database, input.accountId, input.preparationKey)
  if (!existing || !samePreparationIdentity(existing, input)) throw new GatewayMovePreparationConflictError()
  return { operation: existing, replayed: true }
}

export async function getGatewayMoveOperation(database: GatewayMoveDatabase, accountId: string, operationId: string) {
  const { data, error } = await database.from('gateway_move_operations').select(operationFields)
    .eq('id', operationId).eq('account_id', accountId).maybeSingle()
  if (error) throw new Error('Gateway Move operation could not be loaded.')
  return data
}

export async function confirmAndEnqueueGatewayMoveOperation(database: GatewayMoveDatabase, accountId: string, operationId: string, sessionId: string) {
  const { data, error } = await database.rpc('confirm_and_enqueue_gateway_move_operation', {
    p_operation_id: operationId,
    p_account_id: accountId,
    p_session_id: sessionId,
  })
  if (error || !data || typeof data.result !== 'string') throw new Error('Gateway Move operation confirmation failed.')
  return {
    claimed: data.result === 'created' || data.result === 'replayed',
    replayed: data.result === 'replayed',
    result: data.result as 'created' | 'replayed' | 'not_found' | 'not_executable' | 'active_operation_exists' | 'expired' | 'auth_context_unavailable',
    status: typeof data.status === 'string' ? data.status : null,
  }
}
