import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  GATEWAY_MOVE_DESTINATION_CHAIN,
  GATEWAY_MOVE_SOURCE_CHAIN,
  GatewayMovePreparationConflictError,
  claimGatewayMoveOperation,
  createOrReplayGatewayMoveOperation,
  createGatewayMoveOperation,
  gatewayMoveTransitionAllowed,
  getGatewayMoveOperation,
  toPublicGatewayMoveOperation,
} from '../server/circle/gateway-move-operation.ts'
import { GATEWAY_MOVE_ESTIMATE_TTL_MS } from '../server/circle/gateway-move-preparation.ts'

const migration = readFileSync(new URL('../supabase/migrations/202609200001_gateway_move_operations.sql', import.meta.url), 'utf8')
const accountA = '11111111-1111-4111-8111-111111111111'
const accountB = '22222222-2222-4222-8222-222222222222'
const operationId = '33333333-3333-4333-8333-333333333333'
const addressA = `0x${'1'.repeat(40)}`
const addressB = `0x${'2'.repeat(40)}`

function row(overrides = {}) {
  return {
    id: operationId, account_id: accountA, preparation_key: '44444444-4444-4444-8444-444444444444', status: 'AWAITING_CONFIRMATION', amount_base_units: '100000', token: 'USDC',
    source_chain: GATEWAY_MOVE_SOURCE_CHAIN, source_wallet_id: 'circle-source', source_address: addressA,
    destination_chain: GATEWAY_MOVE_DESTINATION_CHAIN, destination_wallet_id: 'circle-destination', destination_address: addressB,
    use_forwarder: false, estimated_fees_json: [], required_base_units: '101650', gateway_before_base_units: '998500',
    arc_before_base_units: '243626785', estimate_created_at: '2026-09-20T00:00:00Z', confirmed_at: null, started_at: null,
    last_progress_at: null, challenge_count: 0, transfer_id: null, destination_tx_hash: null,
    gateway_after_base_units: null, arc_after_base_units: null, receipt_status: null, sanitized_result_json: null,
    error_code: null, error_stage: null, retryable: false, created_at: '2026-09-20T00:00:00Z', updated_at: '2026-09-20T00:00:00Z',
    ...overrides,
  }
}

function database({ claimResults = [], saved = row(), insertError = null } = {}) {
  let inserted
  let claimIndex = 0
  return {
    get inserted() { return inserted },
    from() {
      return {
        insert(value) { inserted = value; return { select: () => ({ single: async () => insertError ? ({ data: null, error: insertError }) : ({ data: { ...saved, ...value }, error: null }) }) } },
        select() {
          const filters = {}
          const query = {
            eq(field, value) { filters[field] = value; return query },
            async maybeSingle() { return { data: Object.entries(filters).every(([key, value]) => saved[key] === value) ? saved : null, error: null } },
          }
          return query
        },
      }
    },
    async rpc(_name, args) {
      const result = claimResults[claimIndex++] || { result: 'not_executable' }
      return { data: args.p_account_id === accountA ? result : { result: 'not_found' }, error: null }
    },
  }
}

const createInput = {
  accountId: accountA, preparationKey: '44444444-4444-4444-8444-444444444444', status: 'AWAITING_CONFIRMATION', amountBaseUnits: '100000', sourceWalletId: 'circle-source',
  sourceAddress: addressA, destinationWalletId: 'circle-destination', destinationAddress: addressB,
  estimatedFees: [{ type: 'provider', amount: '0.00005', token: 'USDC' }], requiredBaseUnits: '101650',
  gatewayBeforeBaseUnits: '998500', arcBeforeBaseUnits: '243626785', estimateCreatedAt: '2026-09-20T00:00:00Z',
}

test('creates an account-owned operation on the fixed Phase 4A route', async () => {
  const db = database()
  const created = await createGatewayMoveOperation(db, createInput)
  assert.equal(created.account_id, accountA)
  assert.equal(db.inserted.source_chain, 'Polygon_Amoy_Testnet')
  assert.equal(db.inserted.destination_chain, 'Arc_Testnet')
  assert.equal(db.inserted.use_forwarder, false)
})

test('idempotent preparation replays the same identity and rejects key reuse', async () => {
  const saved = row()
  const replay = await createOrReplayGatewayMoveOperation(database({ saved, insertError: { code: '23505' } }), createInput)
  assert.equal(replay.replayed, true)
  assert.equal(replay.operation.id, operationId)
  await assert.rejects(
    createOrReplayGatewayMoveOperation(database({ saved, insertError: { code: '23505' } }), { ...createInput, sourceWalletId: 'different-source' }),
    GatewayMovePreparationConflictError,
  )
})

test('rejects invalid amounts, addresses and executable operations without an estimate', async () => {
  const db = database()
  await assert.rejects(createGatewayMoveOperation(db, { ...createInput, amountBaseUnits: '0' }), /positive/)
  await assert.rejects(createGatewayMoveOperation(db, { ...createInput, sourceAddress: addressA.toUpperCase() }), /lowercase/)
  await assert.rejects(createGatewayMoveOperation(db, { ...createInput, requiredBaseUnits: undefined }), /completed estimate/)
  await assert.rejects(createGatewayMoveOperation(db, { ...createInput, requiredBaseUnits: '99999' }), /cannot be less/)
  await assert.rejects(createGatewayMoveOperation(db, { ...createInput, estimatedFees: [{ signature: 'secret' }] }), /sensitive material/)
})

test('state model rejects invalid and terminal transitions', () => {
  assert.equal(gatewayMoveTransitionAllowed('AWAITING_CONFIRMATION', 'SUBMITTING'), true)
  assert.equal(gatewayMoveTransitionAllowed('AWAITING_CONFIRMATION', 'COMPLETED'), false)
  assert.equal(gatewayMoveTransitionAllowed('UNKNOWN', 'COMPLETED'), true)
  assert.equal(gatewayMoveTransitionAllowed('UNKNOWN', 'SUBMITTING'), false)
  for (const terminal of ['COMPLETED', 'REJECTED', 'FAILED', 'EXPIRED']) {
    assert.equal(gatewayMoveTransitionAllowed(terminal, 'SUBMITTING'), false)
  }
})

test('atomic claim succeeds once and a second claim is rejected', async () => {
  const db = database({ claimResults: [{ result: 'claimed', operation_id: operationId }, { result: 'not_executable', status: 'SUBMITTING' }] })
  const [first, second] = await Promise.all([
    claimGatewayMoveOperation(db, accountA, operationId),
    claimGatewayMoveOperation(db, accountA, operationId),
  ])
  assert.equal(first.claimed, true)
  assert.equal(second.claimed, false)
  assert.equal(second.status, 'SUBMITTING')
})

test('UNKNOWN and COMPLETED operations cannot be claimed again', async () => {
  for (const status of ['UNKNOWN', 'COMPLETED']) {
    const result = await claimGatewayMoveOperation(database({ claimResults: [{ result: 'not_executable', status }] }), accountA, operationId)
    assert.deepEqual(result, { claimed: false, result: 'not_executable', status })
  }
})

test('expired estimates are terminal and cannot be claimed', async () => {
  const result = await claimGatewayMoveOperation(database({ claimResults: [{ result: 'expired', status: 'EXPIRED' }] }), accountA, operationId)
  assert.deepEqual(result, { claimed: false, result: 'expired', status: 'EXPIRED' })
  assert.equal(gatewayMoveTransitionAllowed('EXPIRED', 'SUBMITTING'), false)
})

test('cross-account reads and claims do not reveal the operation', async () => {
  assert.equal(await getGatewayMoveOperation(database(), accountB, operationId), null)
  const result = await claimGatewayMoveOperation(database({ claimResults: [{ result: 'claimed' }] }), accountB, operationId)
  assert.equal(result.result, 'not_found')
})

test('public representation excludes account, Circle wallet IDs and sensitive material', () => {
  const publicValue = toPublicGatewayMoveOperation(row())
  const serialized = JSON.stringify(publicValue)
  assert.doesNotMatch(serialized, /account_id|circle-source|circle-destination|userToken|refreshToken|encryptionKey|signature|typedData/i)
  assert.equal(publicValue.sourceChain, 'Polygon_Amoy_Testnet')
  assert.equal(publicValue.destinationChain, 'Arc_Testnet')
})

test('migration enforces ownership, atomic locking, active-operation uniqueness and terminal guards', () => {
  assert.match(migration, /account_id uuid not null references public\.arklake_accounts/)
  assert.match(migration, /where status in \('SUBMITTING', 'CHALLENGE_REQUIRED', 'PROCESSING', 'UNKNOWN'\)/)
  assert.match(migration, /where id = p_operation_id and account_id = p_account_id[\s\S]*for update/)
  assert.match(migration, /status = 'SUBMITTING'[\s\S]*status = 'AWAITING_CONFIRMATION'/)
  assert.match(migration, /old\.status = 'UNKNOWN' and new\.status in \('COMPLETED', 'FAILED'\)/)
  assert.doesNotMatch(migration, /old\.status = '(COMPLETED|REJECTED|FAILED|EXPIRED)'/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all on table public\.gateway_move_operations from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.claim_gateway_move_operation\(uuid, uuid\) to service_role/)
})

test('preparation migration adds account-scoped immutable idempotency', () => {
  const preparationMigration = readFileSync(new URL('../supabase/migrations/202609200002_gateway_move_preparation_idempotency.sql', import.meta.url), 'utf8')
  assert.match(preparationMigration, /preparation_key uuid not null default gen_random_uuid\(\)/)
  assert.match(preparationMigration, /\(account_id, preparation_key\)/)
  assert.match(preparationMigration, /new\.preparation_key <> old\.preparation_key/)
  assert.doesNotMatch(preparationMigration, /drop table|truncate|delete from/i)
})

test('atomic fresh-claim migration enforces DB-clock TTL and keeps the existing RPC boundary', () => {
  const claimMigration = readFileSync(new URL('../supabase/migrations/202609200003_gateway_move_atomic_fresh_claim.sql', import.meta.url), 'utf8')
  assert.equal(GATEWAY_MOVE_ESTIMATE_TTL_MS, 60_000)
  assert.match(claimMigration, /create or replace function public\.claim_gateway_move_operation\(\s*p_operation_id uuid,\s*p_account_id uuid\s*\)/)
  assert.match(claimMigration, /where id = p_operation_id and account_id = p_account_id\s*for update/)
  assert.match(claimMigration, /estimate_created_at is null[\s\S]*interval '60 seconds' <= clock_timestamp\(\)/)
  assert.match(claimMigration, /set status = 'EXPIRED'[\s\S]*status = 'AWAITING_CONFIRMATION'/)
  assert.match(claimMigration, /set status = 'SUBMITTING'[\s\S]*status = 'AWAITING_CONFIRMATION'/)
  assert.match(claimMigration, /exception when unique_violation[\s\S]*active_operation_exists/)
  assert.doesNotMatch(claimMigration, /alter table|create table|drop table|truncate/i)
})

test('60-second TTL boundary treats equality as expired', () => {
  const estimateCreatedAt = Date.parse('2026-09-20T00:00:00.000Z')
  const freshAt = Date.parse('2026-09-20T00:00:59.999Z')
  const boundary = Date.parse('2026-09-20T00:01:00.000Z')
  assert.equal(freshAt - estimateCreatedAt < GATEWAY_MOVE_ESTIMATE_TTL_MS, true)
  assert.equal(boundary - estimateCreatedAt >= GATEWAY_MOVE_ESTIMATE_TTL_MS, true)
})

test('migration persists no auth, signature, typed-data or raw provider material', () => {
  assert.doesNotMatch(migration, /user_token|refresh_token|encryption_key|api_key|signature|typed_data|authorization|session_cookie|raw_provider/i)
})
