import { createClient } from '@supabase/supabase-js'
import {
  SupabaseGatewayWorkerStore,
  gatewayWorkerConfig,
  runGatewayWorker,
} from './gateway-worker-core.mjs'

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured.`)
  return value
}

if (process.env.GATEWAY_WORKER_MOCK_ENABLED !== 'true') {
  throw new Error('GATEWAY_WORKER_MOCK_ENABLED=true is required for the 4B.0 mock worker.')
}

const config = gatewayWorkerConfig()
const client = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
})
const controller = new AbortController()
let stopping = false

function stop(signal) {
  if (stopping) return
  stopping = true
  console.log('GATEWAY_WORKER_STOPPING', { signal, workerId: config.workerId })
  controller.abort()
}

process.once('SIGTERM', () => stop('SIGTERM'))
process.once('SIGINT', () => stop('SIGINT'))

console.log('GATEWAY_WORKER_STARTED', {
  workerId: config.workerId,
  pollMs: config.pollMs,
  leaseMs: config.leaseMs,
  heartbeatMs: config.heartbeatMs,
  mode: 'mock-foundation',
})

await runGatewayWorker({
  store: new SupabaseGatewayWorkerStore(client),
  config,
  signal: controller.signal,
  onError: (error) => console.error('GATEWAY_WORKER_ERROR', {
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : 'Worker failure',
  }),
})

console.log('GATEWAY_WORKER_STOPPED', { workerId: config.workerId })
