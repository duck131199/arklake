import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../supabase/migrations/202609230001_gateway_move_real_job_contract.sql', import.meta.url), 'utf8')
const workerMigration = readFileSync(new URL('../supabase/migrations/202609210001_gateway_move_worker_foundation.sql', import.meta.url), 'utf8')
const confirmHandler = readFileSync(new URL('../server/circle/gateway-move-confirm-handler.ts', import.meta.url), 'utf8')
const session = readFileSync(new URL('../api/auth/session.ts', import.meta.url), 'utf8')
const operation = readFileSync(new URL('../server/circle/gateway-move-operation.ts', import.meta.url), 'utf8')

test('atomic confirm locks ownership, checks DB-clock freshness and creates one REAL job', () => {
  assert.match(migration, /function public\.confirm_and_enqueue_gateway_move_operation\(/)
  assert.match(migration, /where id = p_operation_id and account_id = p_account_id\s*for update/)
  assert.match(migration, /estimate_created_at \+ interval '60 seconds' <= clock_timestamp\(\)/)
  assert.match(migration, /set status = 'SUBMITTING'[\s\S]*insert into public\.gateway_move_execution_jobs/)
  assert.match(migration, /'REAL',[\s\S]*'NOT_STARTED',[\s\S]*gen_random_uuid\(\),[\s\S]*p_session_id/)
  assert.match(workerMigration, /operation_id uuid not null unique references public\.gateway_move_operations/)
})

test('expired, wrong-owner and invalid session paths create no execution job', () => {
  const rpc = migration.slice(migration.indexOf('create or replace function public.confirm_and_enqueue_gateway_move_operation'), migration.indexOf('create or replace function public.enqueue_gateway_move_mock_execution_job'))
  assert.match(rpc, /if not found then[\s\S]*'not_found'/)
  assert.match(rpc, /session\.sid = p_session_id[\s\S]*session\.account_id = p_account_id[\s\S]*session\.revoked_at is null[\s\S]*session\.expires_at > clock_timestamp\(\)/)
  assert.match(rpc, /'auth_context_unavailable'/)
  assert.match(rpc, /set status = 'EXPIRED'[\s\S]*return jsonb_build_object\('result', 'expired'/)
  assert.ok(rpc.indexOf("return jsonb_build_object('result', 'expired'") < rpc.indexOf('insert into public.gateway_move_execution_jobs'))
})

test('duplicate and concurrent confirms cannot create a second job or MOCK plus REAL jobs', () => {
  assert.match(migration, /target\.status = 'SUBMITTING'[\s\S]*existing_job\.execution_mode = 'REAL'[\s\S]*'replayed'/)
  assert.match(migration, /existing_job\.id is not null[\s\S]*'not_executable'/)
  assert.match(migration, /exception when unique_violation[\s\S]*'active_operation_exists'/)
  assert.match(migration, /existing_job\.execution_mode = 'MOCK' then 'replayed' else 'mode_conflict'/)
  assert.match(migration, /where job\.execution_mode = 'MOCK'/)
})

test('exact HttpOnly session reference is passed server-side and never projected publicly', () => {
  assert.match(migration, /auth_session_id text references public\.arklake_sessions\(sid\) on delete restrict/)
  assert.match(migration, /p_session_id text/)
  assert.match(session, /sessionId: session\.sid/)
  assert.match(confirmHandler, /context\.sessionId/)
  assert.match(operation, /p_session_id: sessionId/)
  assert.doesNotMatch(confirmHandler, /body\.sessionId/)
  const response = confirmHandler.slice(confirmHandler.indexOf('return json(res, 200'))
  assert.doesNotMatch(response, /sessionId|auth_session_id|userToken|refreshToken|deviceId|encryptionKey|encrypted_recovery_blob/)
})

test('REAL challenge foundation is server-only while mock challenge invariants remain', () => {
  assert.match(migration, /'MOCK_AUTHORIZATION_1', 'MOCK_AUTHORIZATION_2', 'CIRCLE_TYPED_DATA'/)
  assert.match(migration, /execution_attempt_id uuid/)
  assert.match(migration, /circle_challenge_id text/)
  assert.match(migration, /encrypted_response_material text/)
  assert.match(migration, /response_received_at timestamptz/)
  assert.match(migration, /signature_delivered_at timestamptz/)
  assert.match(migration, /superseded_at timestamptz/)
  assert.match(workerMigration, /gateway_move_challenges_one_pending_per_operation[\s\S]*where status = 'PENDING'/)
})

test('worker internals retain least privilege and no DELETE grant is introduced', () => {
  assert.match(migration, /revoke all on function public\.confirm_and_enqueue_gateway_move_operation\(uuid, uuid, text\) from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.confirm_and_enqueue_gateway_move_operation\(uuid, uuid, text\) to service_role/)
  assert.match(migration, /revoke all on function public\.claim_gateway_move_operation\(uuid, uuid\) from public, anon, authenticated, service_role/)
  assert.match(migration, /revoke all on table public\.gateway_move_execution_jobs from public, anon, authenticated/)
  assert.match(migration, /revoke all on table public\.gateway_move_challenges from public, anon, authenticated/)
  assert.doesNotMatch(migration, /grant\s+delete|truncate|drop table|delete from/i)
})

test('4B.1a contains no financial execution boundary', () => {
  const source = `${migration}\n${confirmHandler}\n${operation}`
  assert.doesNotMatch(source, /@circle-fin|AppKit|createCircleUserWalletAdapter|sdk\.execute|unifiedBalance|\.spend\s*\(|\/v1\/transfer|signTypedData|sendTransaction|sendCalls|approve\s*\(|deposit\s*\(/i)
  assert.doesNotMatch(migration, /transfer_id\s*=|destination_tx_hash\s*=|gateway_after_base_units\s*=|arc_after_base_units\s*=/i)
})
