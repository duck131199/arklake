import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const endpoint = readFileSync(new URL('../server/circle/gateway-move-confirm-handler.ts', import.meta.url), 'utf8')
const operation = readFileSync(new URL('../server/circle/gateway-move-operation.ts', import.meta.url), 'utf8')

test('confirm endpoint accepts only operationId and derives account ownership from the HttpOnly session', () => {
  assert.match(endpoint, /req\.method !== 'POST'/)
  assert.match(endpoint, /getGatewayReadOnlyContext\(req\.headers\.cookie\)/)
  assert.match(endpoint, /body\.operationId/)
  assert.doesNotMatch(endpoint, /body\.(accountId|status|ttl|amount|token|sourceChain|destinationChain|walletId|address)/)
  assert.match(endpoint, /Cache-Control', 'no-store'/)
})

test('confirm endpoint delegates ownership, state and freshness to the atomic claim RPC', () => {
  const handler = endpoint.slice(endpoint.indexOf('export default async function handler'))
  assert.match(handler, /claimGatewayMoveOperation\(db, context\.accountId, body\.operationId\)/)
  assert.doesNotMatch(handler, /estimateCreatedAt|estimate_created_at|GATEWAY_MOVE_ESTIMATE_TTL_MS|Date\.now/)
  assert.match(operation, /rpc\('claim_gateway_move_operation'/)
})

test('confirm endpoint maps every claim result without reporting payment completion', () => {
  assert.match(endpoint, /not_found'[\s\S]*404[\s\S]*OPERATION_NOT_FOUND/)
  assert.match(endpoint, /expired'[\s\S]*409[\s\S]*ESTIMATE_EXPIRED/)
  assert.match(endpoint, /active_operation_exists'[\s\S]*409[\s\S]*ACTIVE_OPERATION_EXISTS/)
  assert.match(endpoint, /not_executable'[\s\S]*409[\s\S]*OPERATION_NOT_CONFIRMABLE/)
  assert.match(endpoint, /operation\.status !== 'SUBMITTING'/)
  assert.doesNotMatch(endpoint, /completed|payment completed|transaction submitted/i)
})

test('confirm response uses the existing safe public projection', () => {
  assert.match(endpoint, /toPublicGatewayMoveOperation\(operation\)/)
  const projection = operation.slice(operation.indexOf('export function toPublicGatewayMoveOperation'), operation.indexOf('export class GatewayMovePreparationConflictError'))
  assert.doesNotMatch(projection, /account_id|preparation_key|source_wallet_id|destination_wallet_id|userToken|refreshToken|encryptionKey/)
  assert.doesNotMatch(endpoint, /error\.message|error\.stack/)
})

test('Phase 4A.3 stops before every Circle or execution boundary', () => {
  assert.doesNotMatch(endpoint, /AppKit|createCircleUserWalletAdapter|circleGet|challenge|signature|signTypedData|spend\s*\(|\/v1\/transfer|approve\s*\(|deposit\s*\(|sendTransaction|sendCalls/i)
  assert.doesNotMatch(endpoint, /fetch\s*\(/)
})
