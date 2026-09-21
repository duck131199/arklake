import crypto from 'node:crypto'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class GatewayWorkerLeaseLostError extends Error {
  constructor() {
    super('Gateway worker lease was lost.')
  }
}

export function gatewayWorkerConfig(env = process.env) {
  const number = (name, fallback, minimum) => {
    const value = env[name] === undefined ? fallback : Number(env[name])
    if (!Number.isInteger(value) || value < minimum) throw new Error(`${name} must be an integer of at least ${minimum}.`)
    return value
  }
  const workerId = env.GATEWAY_WORKER_ID || crypto.randomUUID()
  if (!uuidPattern.test(workerId)) throw new Error('GATEWAY_WORKER_ID must be a UUID when provided.')
  const leaseMs = number('GATEWAY_WORKER_LEASE_MS', 30_000, 5_000)
  const heartbeatMs = number('GATEWAY_WORKER_HEARTBEAT_MS', 10_000, 1_000)
  if (heartbeatMs * 2 >= leaseMs) throw new Error('GATEWAY_WORKER_HEARTBEAT_MS must be less than half the lease duration.')
  return {
    workerId,
    pollMs: number('GATEWAY_WORKER_POLL_MS', 1_000, 100),
    leaseMs,
    leaseSeconds: Math.ceil(leaseMs / 1_000),
    heartbeatMs,
  }
}

export function abortableDelay(ms, signal) {
  if (signal?.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    signal?.addEventListener('abort', done, { once: true })
  })
}

function requireResult(data, error, action) {
  if (error || !data || typeof data.result !== 'string') throw new Error(`Gateway worker ${action} failed.`)
  return data
}

export class SupabaseGatewayWorkerStore {
  constructor(client) {
    this.client = client
  }

  async claim(workerId, leaseSeconds) {
    const { data, error } = await this.client.rpc('claim_gateway_move_execution_job', {
      p_worker_id: workerId,
      p_lease_seconds: leaseSeconds,
    })
    const result = requireResult(data, error, 'claim')
    if (result.result === 'empty') return null
    if (result.result !== 'claimed' || typeof result.job_id !== 'string' || typeof result.operation_id !== 'string' || typeof result.lease_token !== 'string') {
      throw new Error('Gateway worker claim returned an invalid response.')
    }
    return {
      jobId: result.job_id,
      operationId: result.operation_id,
      leaseToken: result.lease_token,
      mockStep: Number(result.mock_step),
    }
  }

  async heartbeat(job, workerId, leaseSeconds) {
    const { data, error } = await this.client.rpc('heartbeat_gateway_move_execution_job', {
      p_job_id: job.jobId,
      p_worker_id: workerId,
      p_lease_token: job.leaseToken,
      p_lease_seconds: leaseSeconds,
    })
    if (error || data !== true) throw new GatewayWorkerLeaseLostError()
  }

  async createChallenge(job, workerId, sequence) {
    const { data, error } = await this.client.rpc('create_gateway_move_mock_challenge', {
      p_job_id: job.jobId,
      p_worker_id: workerId,
      p_lease_token: job.leaseToken,
      p_sequence: sequence,
    })
    const result = requireResult(data, error, 'challenge creation')
    if (result.result === 'lease_lost') throw new GatewayWorkerLeaseLostError()
    if (result.result !== 'waiting') throw new Error(`Gateway worker challenge creation stopped: ${result.result}.`)
    job.mockStep = sequence
    return result
  }

  async advance(job, workerId) {
    const { data, error } = await this.client.rpc('advance_gateway_move_mock_job', {
      p_job_id: job.jobId,
      p_worker_id: workerId,
      p_lease_token: job.leaseToken,
    })
    const result = requireResult(data, error, 'advance')
    if (result.result === 'lease_lost') throw new GatewayWorkerLeaseLostError()
    return result.result
  }

  async complete(job, workerId) {
    const { data, error } = await this.client.rpc('complete_gateway_move_mock_job', {
      p_job_id: job.jobId,
      p_worker_id: workerId,
      p_lease_token: job.leaseToken,
    })
    const result = requireResult(data, error, 'completion')
    if (result.result === 'lease_lost') throw new GatewayWorkerLeaseLostError()
    if (result.result !== 'completed') throw new Error(`Gateway worker completion stopped: ${result.result}.`)
  }

  async release(job, workerId) {
    const { data, error } = await this.client.rpc('release_gateway_move_execution_job', {
      p_job_id: job.jobId,
      p_worker_id: workerId,
      p_lease_token: job.leaseToken,
    })
    return !error && data === true
  }
}

export async function runClaimedMockJob({ store, job, config, signal, delay = abortableDelay }) {
  let lastHeartbeat = 0
  const heartbeat = async (force = false) => {
    const now = Date.now()
    if (force || now - lastHeartbeat >= config.heartbeatMs) {
      await store.heartbeat(job, config.workerId, config.leaseSeconds)
      lastHeartbeat = now
    }
  }

  await heartbeat(true)
  while (!signal?.aborted) {
    if (job.mockStep === 0) await store.createChallenge(job, config.workerId, 1)

    const outcome = await store.advance(job, config.workerId)
    if (outcome === 'rejected') return 'rejected'
    if (outcome === 'advanced') {
      if (job.mockStep === 1) {
        await store.createChallenge(job, config.workerId, 2)
        continue
      }
      await store.complete(job, config.workerId)
      return 'completed'
    }
    if (outcome !== 'waiting') throw new Error(`Gateway worker cannot advance mock job: ${outcome}.`)

    await heartbeat()
    await delay(Math.min(config.pollMs, config.heartbeatMs), signal)
  }
  return 'stopped'
}

export async function runGatewayWorker({ store, config, signal, delay = abortableDelay, onError = console.error }) {
  while (!signal.aborted) {
    let job = null
    try {
      job = await store.claim(config.workerId, config.leaseSeconds)
      if (!job) {
        await delay(config.pollMs, signal)
        continue
      }
      await runClaimedMockJob({ store, job, config, signal, delay })
    } catch (error) {
      if (!(error instanceof GatewayWorkerLeaseLostError)) onError(error)
      if (!signal.aborted) await delay(config.pollMs, signal)
    } finally {
      if (job && signal.aborted) await store.release(job, config.workerId).catch(() => false)
    }
  }
}
