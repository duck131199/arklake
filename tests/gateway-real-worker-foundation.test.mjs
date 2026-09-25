import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { encryptGatewayChallengeResponse, decryptGatewayChallengeResponse } from '../server/circle/gateway-challenge-crypto.ts'
import { runClaimedRealFoundation, reconcileClaimedRealFoundation, GatewayRealWorkerLeaseLostError, sanitizeGatewayRealProgress } from '../worker/gateway-real-worker-core.mjs'

process.env.GATEWAY_CHALLENGE_RESPONSE_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString('base64')
const migration = readFileSync(new URL('../supabase/migrations/202609250001_gateway_move_real_worker_foundation.sql', import.meta.url), 'utf8')
const fencingMigration = readFileSync(new URL('../supabase/migrations/202609250002_gateway_move_real_worker_atomic_fencing.sql', import.meta.url), 'utf8')
const mockCore = readFileSync(new URL('../worker/gateway-worker-core.mjs', import.meta.url), 'utf8')
const realCore = readFileSync(new URL('../worker/gateway-real-worker-core.mjs', import.meta.url), 'utf8')
const workerA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const workerB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

class MemoryRealStore {
  constructor() {
    this.now = 0; this.owner = null; this.token = 0; this.leaseUntil = 0
    this.marker = false; this.executorRuns = 0; this.challenge = null; this.deliveries = 0
    this.status = 'SUBMITTING'; this.phase = 'NOT_STARTED'; this.terminal = null
  }
  claim(worker) {
    if (this.marker || (this.owner && this.leaseUntil > this.now)) return null
    this.owner = worker; this.token += 1; this.leaseUntil = this.now + 10_000
    return this.job(worker)
  }
  claimReconciliation(worker) {
    if (!this.marker || (this.owner && this.leaseUntil > this.now) || this.terminal) return null
    this.owner = worker; this.token += 1; this.leaseUntil = this.now + 10_000
    return this.job(worker)
  }
  job(worker) { return { jobId: 'job', operationId: 'operation', attemptId: 'attempt', leaseToken: `token-${this.token}`, accountId: 'account', authSessionId: 'session', worker } }
  owns(job, worker) { return this.owner === worker && job.leaseToken === `token-${this.token}` && this.leaseUntil > this.now }
  async heartbeat(job, worker) { if (!this.owns(job, worker)) throw new GatewayRealWorkerLeaseLostError(); this.leaseUntil = this.now + 10_000 }
  async loadTrustedContext() { return { accountId: 'account', sessionId: 'session', circleUserId: 'circle-user', userToken: 'server-only', operation: { amount: '0.1', route: 'trusted' } } }
  async beginAttempt(job, worker) { if (!this.owns(job, worker)) return 'lease_lost'; if (this.marker) return 'already_started'; this.marker = true; this.phase = 'PROCESSING'; return 'started' }
  async persistChallenge(job, worker, circleId) {
    if (!this.owns(job, worker)) return { result: 'lease_lost' }
    if (this.challenge) return this.challenge.circleId === circleId ? { result: 'waiting', challengeId: this.challenge.id, sequence: 1, replayed: true } : { result: 'pending_challenge_exists' }
    this.challenge = { id: 'challenge', circleId, status: 'PENDING', encrypted: null, delivered: false }
    this.status = 'CHALLENGE_REQUIRED'; this.phase = 'WAITING_CHALLENGE'
    return { result: 'waiting', challengeId: this.challenge.id, sequence: 1, replayed: false }
  }
  respond(signature) { this.challenge.status = 'APPROVED'; this.challenge.encrypted = encryptGatewayChallengeResponse({ status: 'APPROVED', signature }) }
  async readChallengeResponse(job, worker) {
    if (!this.owns(job, worker)) return { result: 'lease_lost' }
    if (this.challenge.status === 'PENDING') return { result: 'waiting' }
    return { result: 'approved', encryptedMaterial: this.challenge.encrypted, alreadyDelivered: this.challenge.delivered }
  }
  async deliverSignature(job, worker) {
    if (!this.owns(job, worker)) return 'lease_lost'
    if (this.challenge.delivered) return 'replayed'
    this.challenge.delivered = true; this.deliveries += 1; this.status = 'PROCESSING'; this.phase = 'PROCESSING'; return 'delivered'
  }
  async recordProgress(job, worker) { return this.owns(job, worker) }
  async finish(job, worker, status) { if (!this.owns(job, worker)) return 'lease_lost'; this.terminal = status; this.owner = null; return 'completed' }
}

const config = (workerId = workerA) => ({ workerId, leaseSeconds: 10, pollMs: 1 })

test('migration adds REAL-only claims without changing the MOCK claim', () => {
  assert.match(migration, /claim_gateway_move_real_execution_job/)
  assert.match(migration, /execution_mode = 'REAL'[\s\S]*execution_phase = 'NOT_STARTED'[\s\S]*financial_ambiguity_started_at is null/)
  assert.match(migration, /claim_gateway_move_real_reconciliation_job/)
  assert.match(migration, /financial_ambiguity_started_at is not null/)
  assert.match(mockCore, /claim_gateway_move_execution_job/)
  assert.doesNotMatch(mockCore, /claim_gateway_move_real/)
})

test('concurrent REAL claim has exactly one owner and stale fencing fails', async () => {
  const store = new MemoryRealStore()
  const [a, b] = [store.claim(workerA), store.claim(workerB)]
  assert.equal([a, b].filter(Boolean).length, 1)
  store.now = 10_000
  const replacement = store.claim(workerB)
  await assert.rejects(store.heartbeat(a, workerA), GatewayRealWorkerLeaseLostError)
  assert.ok(replacement)
})

test('trusted session/account binding fails closed before the financial marker', async () => {
  const store = new MemoryRealStore(); const job = store.claim(workerA)
  store.loadTrustedContext = async () => ({ accountId: 'wrong', sessionId: 'session' })
  await assert.rejects(runClaimedRealFoundation({ store, job, executor: { run: assert.fail }, config: config(), decryptResponse: decryptGatewayChallengeResponse }), /trusted session/)
  assert.equal(store.marker, false)
})

test('fake executor persists a durable challenge and receives one decrypted signature', async () => {
  const store = new MemoryRealStore(); const job = store.claim(workerA)
  const signature = `0x${'ab'.repeat(65)}`
  const executor = { run: async ({ onChallenge, resolveTypedDataSignature }) => {
    store.executorRuns += 1
    const request = { challengeId: 'circle-challenge' }
    onChallenge(request)
    await Promise.resolve()
    store.respond(signature)
    const [first, replay] = await Promise.all([resolveTypedDataSignature(request), resolveTypedDataSignature(request)])
    assert.equal(first, signature); assert.equal(replay, signature)
    return { mock: true, movedFunds: false }
  } }
  const result = await runClaimedRealFoundation({ store, job, executor, config: config(), decryptResponse: decryptGatewayChallengeResponse, delay: async () => {} })
  assert.equal(result.result, 'executed')
  assert.equal(store.challenge.status, 'APPROVED')
  assert.equal(store.deliveries, 1)
  assert.equal(store.status, 'PROCESSING')
  assert.equal(store.executorRuns, 1)
})

test('conflicting or invalid encrypted response fails closed without signature delivery', async () => {
  const store = new MemoryRealStore(); const job = store.claim(workerA)
  const executor = { run: async ({ resolveTypedDataSignature }) => {
    const request = { challengeId: 'circle-challenge' }
    await store.persistChallenge(job, workerA, request.challengeId)
    store.challenge.status = 'APPROVED'
    store.challenge.encrypted = encryptGatewayChallengeResponse({ status: 'APPROVED', signature: 'invalid' })
    return resolveTypedDataSignature(request)
  } }
  await assert.rejects(runClaimedRealFoundation({ store, job, executor, config: config(), decryptResponse: decryptGatewayChallengeResponse, delay: async () => {} }), /65-byte/)
  assert.equal(store.deliveries, 0)
})

test('pre-marker crash is reclaimable while post-marker crash never reruns executor', async () => {
  const before = new MemoryRealStore(); const first = before.claim(workerA)
  before.now = 10_000
  assert.ok(before.claim(workerB))
  assert.equal(before.marker, false)

  const after = new MemoryRealStore(); const claimed = after.claim(workerA)
  await after.beginAttempt(claimed, workerA)
  after.executorRuns = 1
  after.now = 10_000
  assert.equal(after.claim(workerB), null)
  const reconciliation = after.claimReconciliation(workerB)
  assert.ok(reconciliation)
  assert.equal(await reconcileClaimedRealFoundation({ store: after, job: reconciliation, config: config(workerB) }), 'unknown')
  assert.equal(after.executorRuns, 1)
  assert.equal(after.terminal, 'UNKNOWN')
})

test('migration fences every REAL mutation and contains no financial execution', () => {
  for (const token of ['p_job_id', 'p_operation_id', 'p_execution_attempt_id', 'p_worker_id', 'p_lease_token', 'lease_expires_at > clock_timestamp()']) {
    assert.match(migration, new RegExp(token.replace(/[()]/g, '\\$&')))
  }
  const source = `${migration}\n${realCore}`
  assert.doesNotMatch(source, /@circle-fin|AppKit|unifiedBalance|\.spend\s*\(|\/v1\/transfer|gatewayMint|sendTransaction|sendCalls/i)
  assert.doesNotMatch(source, /plaintext|response_json\s*=.*signature/i)
})

test('progress persistence allowlists provider observations and drops sensitive fields', () => {
  assert.deepEqual(sanitizeGatewayRealProgress({ stage: 'transaction', status: 'SENT', sequence: 2,
    challengeId: 'challenge', transactionId: 'transaction', txHash: `0x${'1'.repeat(64)}`,
    signature: 'secret', userToken: 'secret', rawProvider: { secret: true } }), {
    stage: 'transaction', status: 'SENT', sequence: 2, challengeId: 'challenge',
    transactionId: 'transaction', txHash: `0x${'1'.repeat(64)}`,
  })
})

test('atomic fencing migration locks the REAL job before signature and terminal mutations', () => {
  for (const functionName of ['deliver_gateway_move_real_signature', 'finish_gateway_move_real_execution']) {
    const start = fencingMigration.indexOf(`create or replace function public.${functionName}`)
    assert.notEqual(start, -1)
    const next = fencingMigration.indexOf('create or replace function public.', start + 1)
    const body = fencingMigration.slice(start, next === -1 ? undefined : next)
    assert.match(body, /from public\.gateway_move_execution_jobs[\s\S]*for update;/)
    assert.match(body, /execution_mode <> 'REAL'/)
    assert.match(body, /execution_attempt_id <> p_execution_attempt_id/)
    assert.match(body, /lease_owner <> p_worker_id/)
    assert.match(body, /lease_token <> p_lease_token/)
    assert.match(body, /lease_expires_at <= clock_timestamp\(\)/)
  }
  assert.match(fencingMigration, /signature_delivered_at = clock_timestamp\(\)[\s\S]*signature_delivered_at is null/)
  assert.match(fencingMigration, /REAL terminal mutation lost its fenced job/)
})

test('stale owner, expired lease and wrong token cannot deliver or finish after replacement claim', async () => {
  const store = new MemoryRealStore(); const stale = store.claim(workerA)
  await store.beginAttempt(stale, workerA)
  await store.persistChallenge(stale, workerA, 'circle-challenge')
  store.respond(`0x${'ab'.repeat(65)}`)
  store.now = 10_000
  const replacement = store.claimReconciliation(workerB)
  assert.ok(replacement)
  assert.equal(await store.deliverSignature(stale, workerA), 'lease_lost')
  assert.equal(store.challenge.delivered, false)
  assert.equal(await store.finish(stale, workerA, 'UNKNOWN'), 'lease_lost')
  assert.equal(store.terminal, null)
  assert.equal(await store.finish({ ...replacement, leaseToken: 'wrong-token' }, workerB, 'UNKNOWN'), 'lease_lost')
  assert.equal(store.terminal, null)
  assert.equal(await store.finish(replacement, workerB, 'UNKNOWN'), 'completed')
  assert.equal(store.terminal, 'UNKNOWN')
  assert.equal(await store.finish(stale, workerA, 'FAILED'), 'lease_lost')
  assert.equal(store.terminal, 'UNKNOWN')
})
