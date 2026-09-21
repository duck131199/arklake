import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  GatewayWorkerLeaseLostError,
  gatewayWorkerConfig,
  runClaimedMockJob,
  runGatewayWorker,
} from '../worker/gateway-worker-core.mjs'
import { gatewayMoveTransitionAllowed } from '../server/circle/gateway-move-operation.ts'

const migration = readFileSync(new URL('../supabase/migrations/202609210001_gateway_move_worker_foundation.sql', import.meta.url), 'utf8')
const workerEntry = readFileSync(new URL('../worker/gateway-worker.mjs', import.meta.url), 'utf8')
const workerCore = readFileSync(new URL('../worker/gateway-worker-core.mjs', import.meta.url), 'utf8')
const operationId = '11111111-1111-4111-8111-111111111111'
const workerA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const workerB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

class MemoryStore {
  constructor() {
    this.now = 0
    this.job = null
    this.challenges = []
    this.tokenCounter = 0
    this.operationStatus = 'SUBMITTING'
    this.releaseCount = 0
  }

  enqueue(operation = operationId) {
    if (!this.job) this.job = { jobId: 'job-1', operationId: operation, mockStep: 0, status: 'PENDING', leaseOwner: null, leaseToken: null, leaseUntil: 0 }
    return this.job
  }

  async claim(workerId, leaseSeconds) {
    if (!this.job || this.job.status === 'COMPLETED') return null
    if (this.job.leaseOwner && this.job.leaseUntil > this.now) return null
    this.tokenCounter += 1
    this.job.leaseOwner = workerId
    this.job.leaseToken = `token-${this.tokenCounter}`
    this.job.leaseUntil = this.now + leaseSeconds * 1_000
    if (this.job.status === 'PENDING') this.job.status = 'RUNNING'
    return { jobId: this.job.jobId, operationId: this.job.operationId, mockStep: this.job.mockStep, leaseToken: this.job.leaseToken }
  }

  owns(job, workerId) {
    return this.job?.jobId === job.jobId && this.job.leaseOwner === workerId && this.job.leaseToken === job.leaseToken && this.job.leaseUntil > this.now
  }

  async heartbeat(job, workerId, leaseSeconds) {
    if (!this.owns(job, workerId)) throw new GatewayWorkerLeaseLostError()
    this.job.leaseUntil = this.now + leaseSeconds * 1_000
  }

  async createChallenge(job, workerId, sequence) {
    if (!this.owns(job, workerId)) throw new GatewayWorkerLeaseLostError()
    if (this.job.mockStep !== sequence - 1) throw new Error('not ready')
    if (this.challenges.some((challenge) => challenge.status === 'PENDING')) throw new Error('pending challenge exists')
    let challenge = this.challenges.find((candidate) => candidate.sequence === sequence)
    if (!challenge) {
      challenge = { id: `challenge-${sequence}`, sequence, type: `MOCK_AUTHORIZATION_${sequence}`, status: 'PENDING', response: null }
      this.challenges.push(challenge)
    }
    this.job.mockStep = sequence
    this.job.status = 'WAITING'
    this.operationStatus = 'CHALLENGE_REQUIRED'
    job.mockStep = sequence
    return { result: 'waiting', challenge_id: challenge.id, sequence }
  }

  respond(sequence, approved) {
    const challenge = this.challenges.find((candidate) => candidate.sequence === sequence)
    if (!challenge) return 'not_found'
    const response = JSON.stringify({ approved })
    if (challenge.status !== 'PENDING') return challenge.response === response ? 'replayed' : 'conflict'
    challenge.status = approved ? 'APPROVED' : 'REJECTED'
    challenge.response = response
    return 'recorded'
  }

  async advance(job, workerId) {
    if (!this.owns(job, workerId)) throw new GatewayWorkerLeaseLostError()
    const challenge = this.challenges.find((candidate) => candidate.sequence === this.job.mockStep)
    if (!challenge || challenge.status === 'PENDING') return 'waiting'
    this.job.status = 'RUNNING'
    if (challenge.status === 'REJECTED') {
      this.job.status = 'COMPLETED'
      this.operationStatus = 'REJECTED'
      return 'rejected'
    }
    this.operationStatus = 'PROCESSING'
    return 'advanced'
  }

  async complete(job, workerId) {
    if (!this.owns(job, workerId)) throw new GatewayWorkerLeaseLostError()
    if (this.job.mockStep !== 2 || this.operationStatus !== 'PROCESSING') throw new Error('not ready')
    this.job.status = 'COMPLETED'
    this.job.leaseOwner = null
    this.job.leaseToken = null
    this.operationStatus = 'COMPLETED'
  }

  async release(job, workerId) {
    if (!this.owns(job, workerId)) return false
    this.releaseCount += 1
    this.job.leaseOwner = null
    this.job.leaseToken = null
    this.job.leaseUntil = 0
    return true
  }
}

const config = (workerId = workerA) => ({ workerId, pollMs: 100, heartbeatMs: 1_000, leaseMs: 10_000, leaseSeconds: 10 })

test('migration adds one durable job per operation and account-safe challenge persistence', () => {
  assert.match(migration, /operation_id uuid not null unique references public\.gateway_move_operations/)
  assert.match(migration, /unique \(operation_id, sequence\)/)
  assert.match(migration, /foreign key \(job_id, operation_id\)[\s\S]*references public\.gateway_move_execution_jobs\(id, operation_id\)/)
  assert.match(migration, /gateway_move_challenges_one_pending_per_operation[\s\S]*where status = 'PENDING'/)
  assert.match(migration, /recovery_metadata jsonb not null default '\{\}'::jsonb/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all on table public\.gateway_move_execution_jobs from public, anon, authenticated/)
})

test('explicit service-role mock enqueue is idempotent and cannot duplicate a job', () => {
  assert.match(migration, /function public\.enqueue_gateway_move_mock_execution_job/)
  assert.match(migration, /target\.status <> 'SUBMITTING'/)
  assert.match(migration, /insert into public\.gateway_move_execution_jobs \(operation_id\)[\s\S]*on conflict \(operation_id\)/)
  assert.match(migration, /revoke all on function public\.enqueue_gateway_move_mock_execution_job\(uuid, uuid\) from public, anon, authenticated/)
  const store = new MemoryStore()
  assert.equal(store.enqueue(), store.enqueue())
})

test('concurrent workers have exactly one lease winner', async () => {
  const store = new MemoryStore()
  store.enqueue()
  const [first, second] = await Promise.all([store.claim(workerA, 10), store.claim(workerB, 10)])
  assert.equal([first, second].filter(Boolean).length, 1)
})

test('heartbeat extends the active lease and expired leases can be reclaimed', async () => {
  const store = new MemoryStore()
  store.enqueue()
  const first = await store.claim(workerA, 10)
  store.now = 5_000
  await store.heartbeat(first, workerA, 10)
  assert.equal(store.job.leaseUntil, 15_000)
  store.now = 15_000
  const recovered = await store.claim(workerB, 10)
  assert.equal(recovered.operationId, operationId)
  assert.notEqual(recovered.leaseToken, first.leaseToken)
})

test('a stale worker cannot heartbeat, create a challenge, advance or complete after reclaim', async () => {
  const store = new MemoryStore()
  store.enqueue()
  const stale = await store.claim(workerA, 5)
  store.now = 5_000
  await store.claim(workerB, 10)
  await assert.rejects(store.heartbeat(stale, workerA, 5), GatewayWorkerLeaseLostError)
  await assert.rejects(store.createChallenge(stale, workerA, 1), GatewayWorkerLeaseLostError)
  await assert.rejects(store.advance(stale, workerA), GatewayWorkerLeaseLostError)
  await assert.rejects(store.complete(stale, workerA), GatewayWorkerLeaseLostError)
})

test('challenge responses are ordered, idempotent for the same result and reject conflicts', async () => {
  const store = new MemoryStore()
  store.enqueue()
  const job = await store.claim(workerA, 10)
  await store.createChallenge(job, workerA, 1)
  await assert.rejects(store.createChallenge(job, workerA, 2), /not ready|pending challenge/)
  assert.equal(store.respond(1, true), 'recorded')
  assert.equal(store.respond(1, true), 'replayed')
  assert.equal(store.respond(1, false), 'conflict')
})

test('worker completes the durable two-challenge mock lifecycle without moving funds', async () => {
  const store = new MemoryStore()
  store.enqueue()
  const job = await store.claim(workerA, 10)
  const seen = new Set()
  const result = await runClaimedMockJob({
    store,
    job,
    config: config(),
    signal: new AbortController().signal,
    delay: async () => {
      const sequence = store.job.mockStep
      if (!seen.has(sequence)) {
        seen.add(sequence)
        assert.equal(store.respond(sequence, true), 'recorded')
      }
    },
  })
  assert.equal(result, 'completed')
  assert.deepEqual(store.challenges.map(({ sequence, status }) => ({ sequence, status })), [
    { sequence: 1, status: 'APPROVED' },
    { sequence: 2, status: 'APPROVED' },
  ])
  assert.equal(store.operationStatus, 'COMPLETED')
})

test('a replacement worker safely resumes the mock workflow after a crash while waiting', async () => {
  const store = new MemoryStore()
  store.enqueue()
  const crashed = await store.claim(workerA, 5)
  await store.createChallenge(crashed, workerA, 1)
  store.now = 5_000
  const recovered = await store.claim(workerB, 10)
  assert.equal(recovered.mockStep, 1)
  assert.equal(store.respond(1, true), 'recorded')
  const seen = new Set([1])
  const result = await runClaimedMockJob({
    store,
    job: recovered,
    config: config(workerB),
    signal: new AbortController().signal,
    delay: async () => {
      if (!seen.has(store.job.mockStep)) {
        seen.add(store.job.mockStep)
        store.respond(store.job.mockStep, true)
      }
    },
  })
  assert.equal(result, 'completed')
  await assert.rejects(store.heartbeat(crashed, workerA, 5), GatewayWorkerLeaseLostError)
})

test('graceful shutdown releases a claimed mock job', async () => {
  const store = new MemoryStore()
  store.enqueue()
  const controller = new AbortController()
  let delayed = false
  await runGatewayWorker({
    store,
    config: config(),
    signal: controller.signal,
    delay: async () => {
      if (!delayed) {
        delayed = true
        controller.abort()
      }
    },
    onError: () => assert.fail('graceful shutdown should not report an error'),
  })
  assert.equal(store.releaseCount, 1)
  assert.equal(store.job.leaseOwner, null)
})

test('worker defaults are Railway-safe and validate heartbeat against lease duration', () => {
  const parsed = gatewayWorkerConfig({ GATEWAY_WORKER_ID: workerA })
  assert.equal(parsed.pollMs, 1_000)
  assert.equal(parsed.leaseMs, 30_000)
  assert.equal(parsed.heartbeatMs, 10_000)
  assert.throws(() => gatewayWorkerConfig({ GATEWAY_WORKER_ID: workerA, GATEWAY_WORKER_LEASE_MS: '10000', GATEWAY_WORKER_HEARTBEAT_MS: '5000' }), /less than half/)
})

test('operation model adds only PROCESSING to CHALLENGE_REQUIRED', () => {
  assert.equal(gatewayMoveTransitionAllowed('PROCESSING', 'CHALLENGE_REQUIRED'), true)
  assert.equal(gatewayMoveTransitionAllowed('COMPLETED', 'CHALLENGE_REQUIRED'), false)
  assert.match(migration, /old\.status = 'PROCESSING' and new\.status in \('CHALLENGE_REQUIRED', 'COMPLETED', 'FAILED', 'UNKNOWN'\)/)
})

test('4B.0 worker has no financial execution imports or calls', () => {
  const source = `${workerEntry}\n${workerCore}`
  assert.doesNotMatch(source, /@circle-fin|AppKit|createCircleUserWalletAdapter|unifiedBalance|\.spend\s*\(|\/v1\/transfer|signTypedData|sendTransaction|sendCalls|approve\s*\(|deposit\s*\(/i)
  assert.doesNotMatch(migration, /transfer_id\s*=|destination_tx_hash\s*=|gateway_after_base_units\s*=|arc_after_base_units\s*=/i)
  assert.match(migration, /'movedFunds', false/)
  assert.match(workerEntry, /GATEWAY_WORKER_MOCK_ENABLED !== 'true'/)
})
