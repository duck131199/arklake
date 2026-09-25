const signaturePattern = /^0x[0-9a-fA-F]{130}$/

export class GatewayRealWorkerLeaseLostError extends Error {
  constructor() { super('Gateway REAL worker lease was lost.') }
}

export class GatewayRealChallengeRejectedError extends Error {
  constructor() { super('Gateway REAL challenge was rejected.') }
}

function requireRpc(data, error, action) {
  if (error || !data || typeof data.result !== 'string') throw new Error(`Gateway REAL worker ${action} failed.`)
  return data
}

function rpcFence(job, workerId) {
  return {
    p_job_id: job.jobId, p_operation_id: job.operationId, p_execution_attempt_id: job.attemptId,
    p_worker_id: workerId, p_lease_token: job.leaseToken,
  }
}

export function sanitizeGatewayRealProgress(progress) {
  if (!progress || typeof progress !== 'object') return {}
  const value = progress
  return Object.fromEntries(['stage', 'status', 'sequence', 'challengeId', 'transactionId', 'txHash']
    .filter((key) => ['string', 'number'].includes(typeof value[key])).map((key) => [key, value[key]]))
}

export class SupabaseGatewayRealWorkerStore {
  constructor(client) { this.client = client }

  async claim(workerId, leaseSeconds) {
    const { data, error } = await this.client.rpc('claim_gateway_move_real_execution_job', { p_worker_id: workerId, p_lease_seconds: leaseSeconds })
    const result = requireRpc(data, error, 'claim')
    if (result.result === 'empty') return null
    if (result.result !== 'claimed') throw new Error(`Gateway REAL worker claim stopped: ${result.result}.`)
    return { jobId: result.job_id, operationId: result.operation_id, attemptId: result.execution_attempt_id,
      leaseToken: result.lease_token, authSessionId: result.auth_session_id, accountId: result.account_id }
  }

  async claimReconciliation(workerId, leaseSeconds) {
    const { data, error } = await this.client.rpc('claim_gateway_move_real_reconciliation_job', { p_worker_id: workerId, p_lease_seconds: leaseSeconds })
    const result = requireRpc(data, error, 'reconciliation claim')
    if (result.result === 'empty') return null
    if (result.result !== 'reconcile') throw new Error(`Gateway REAL reconciliation claim stopped: ${result.result}.`)
    return { jobId: result.job_id, operationId: result.operation_id, attemptId: result.execution_attempt_id, leaseToken: result.lease_token }
  }

  async heartbeat(job, workerId, leaseSeconds) {
    const { data, error } = await this.client.rpc('heartbeat_gateway_move_real_execution_job', { ...rpcFence(job, workerId), p_lease_seconds: leaseSeconds })
    if (error || data !== true) throw new GatewayRealWorkerLeaseLostError()
  }

  async loadTrustedContext(job) {
    const { data: operation, error: operationError } = await this.client.from('gateway_move_operations').select('*').eq('id', job.operationId).eq('account_id', job.accountId).maybeSingle()
    if (operationError || !operation) return null
    const { data: session, error: sessionError } = await this.client.from('arklake_sessions')
      .select('sid,account_id,circle_user_token,expires_at,revoked_at,arklake_accounts(circle_user_id)')
      .eq('sid', job.authSessionId).eq('account_id', job.accountId).maybeSingle()
    if (sessionError || !session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) return null
    const circleUserId = session.arklake_accounts?.circle_user_id
    if (!circleUserId) return null
    const { data: wallets, error: walletError } = await this.client.from('arklake_wallets')
      .select('circle_wallet_id,address,blockchain,account_type,account_id').eq('account_id', job.accountId)
      .in('circle_wallet_id', [operation.source_wallet_id, operation.destination_wallet_id])
    if (walletError || !Array.isArray(wallets)) return null
    const source = wallets.find((wallet) => wallet.circle_wallet_id === operation.source_wallet_id && wallet.address === operation.source_address)
    const destination = wallets.find((wallet) => wallet.circle_wallet_id === operation.destination_wallet_id && wallet.address === operation.destination_address)
    if (!source || !destination) return null
    return { accountId: session.account_id, sessionId: session.sid, circleUserId, userToken: session.circle_user_token,
      operation, sourceWallet: source, destinationWallet: destination }
  }

  async beginAttempt(job, workerId) {
    const { data, error } = await this.client.rpc('begin_gateway_move_real_financial_attempt', rpcFence(job, workerId))
    return requireRpc(data, error, 'begin attempt').result
  }

  async persistChallenge(job, workerId, circleChallengeId) {
    const { data, error } = await this.client.rpc('persist_gateway_move_real_challenge', { ...rpcFence(job, workerId), p_circle_challenge_id: circleChallengeId })
    const result = requireRpc(data, error, 'challenge persistence')
    return { result: result.result, challengeId: result.challenge_id, sequence: Number(result.sequence), replayed: result.replayed === true }
  }

  async readChallengeResponse(job, workerId, challengeId) {
    const { data, error } = await this.client.rpc('read_gateway_move_real_challenge_response', { ...rpcFence(job, workerId), p_challenge_id: challengeId })
    const result = requireRpc(data, error, 'challenge response read')
    return { result: result.result, encryptedMaterial: result.encrypted_response_material, alreadyDelivered: result.already_delivered === true }
  }

  async deliverSignature(job, workerId, challengeId) {
    const { data, error } = await this.client.rpc('deliver_gateway_move_real_signature', { ...rpcFence(job, workerId), p_challenge_id: challengeId })
    return requireRpc(data, error, 'signature delivery').result
  }

  async recordProgress(job, workerId, progress) {
    const { data, error } = await this.client.rpc('record_gateway_move_real_progress', { ...rpcFence(job, workerId), p_progress: sanitizeGatewayRealProgress(progress) })
    if (error || data !== true) throw new GatewayRealWorkerLeaseLostError()
    return true
  }

  async finish(job, workerId, status, errorCode, result) {
    const { data, error } = await this.client.rpc('finish_gateway_move_real_execution', {
      ...rpcFence(job, workerId), p_status: status, p_error_code: errorCode, p_sanitized_result: result,
    })
    return requireRpc(data, error, 'finish').result
  }
}

export async function waitForGatewayRealSignature({
  store, job, challenge, config, decryptResponse, signal, delay,
}) {
  while (!signal?.aborted) {
    await store.heartbeat(job, config.workerId, config.leaseSeconds)
    const response = await store.readChallengeResponse(job, config.workerId, challenge.challengeId)
    if (response.result === 'waiting') {
      await delay(config.pollMs, signal)
      continue
    }
    if (response.result === 'lease_lost') throw new GatewayRealWorkerLeaseLostError()
    if (response.result === 'rejected') throw new GatewayRealChallengeRejectedError()
    if (response.result !== 'approved' || typeof response.encryptedMaterial !== 'string') {
      throw new Error(`Gateway REAL challenge response stopped: ${response.result}.`)
    }
    const material = decryptResponse(response.encryptedMaterial)
    if (material.status !== 'APPROVED' || !signaturePattern.test(material.signature)) {
      throw new Error('Gateway REAL challenge response has no valid 65-byte signature.')
    }
    const delivered = await store.deliverSignature(job, config.workerId, challenge.challengeId)
    if (!['delivered', 'replayed'].includes(delivered)) {
      if (delivered === 'lease_lost') throw new GatewayRealWorkerLeaseLostError()
      throw new Error(`Gateway REAL signature delivery stopped: ${delivered}.`)
    }
    return material.signature.toLowerCase()
  }
  throw new Error('Gateway REAL signature wait stopped.')
}

export async function runClaimedRealFoundation({
  store, job, executor, config, decryptResponse, signal = new AbortController().signal,
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const context = await store.loadTrustedContext(job)
  if (!context || context.accountId !== job.accountId || context.sessionId !== job.authSessionId) {
    throw new Error('Gateway REAL trusted session/account context is unavailable.')
  }
  const started = await store.beginAttempt(job, config.workerId)
  if (started !== 'started') {
    if (started === 'lease_lost') throw new GatewayRealWorkerLeaseLostError()
    return { result: 'not_started', reason: started }
  }

  const challenges = new Map()
  const ensureChallenge = async ({ challengeId }) => {
    if (challenges.has(challengeId)) return challenges.get(challengeId)
    const pending = store.persistChallenge(job, config.workerId, challengeId)
    challenges.set(challengeId, pending)
    const challenge = await pending
    if (challenge.result !== 'waiting') throw new Error(`Gateway REAL challenge persistence stopped: ${challenge.result}.`)
    return challenge
  }

  const result = await executor.run({
    context,
    operation: context.operation,
    onChallenge: (challenge) => { void ensureChallenge(challenge) },
    resolveTypedDataSignature: async (challenge) => waitForGatewayRealSignature({
      store, job, challenge: await ensureChallenge(challenge), config, decryptResponse, signal, delay,
    }),
    onProgress: (progress) => store.recordProgress(job, config.workerId, progress),
  })
  return { result: 'executed', value: result }
}

export async function reconcileClaimedRealFoundation({ store, job, config }) {
  const finished = await store.finish(job, config.workerId, 'UNKNOWN', 'WORKER_RESTART_AFTER_FINANCIAL_MARKER', {
    mode: 'real-worker-foundation', movedFunds: 'unknown', executorRestarted: false,
  })
  if (finished !== 'completed') {
    if (finished === 'lease_lost') throw new GatewayRealWorkerLeaseLostError()
    throw new Error(`Gateway REAL reconciliation stopped: ${finished}.`)
  }
  return 'unknown'
}
