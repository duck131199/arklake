import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const endpoint = readFileSync(new URL('../server/circle/gateway-move-prepare-handler.ts', import.meta.url), 'utf8')
const session = readFileSync(new URL('../api/auth/session.ts', import.meta.url), 'utf8')
const operation = readFileSync(new URL('../server/circle/gateway-move-operation.ts', import.meta.url), 'utf8')

test('preparation endpoint accepts only requestId and amount and derives identity from HttpOnly session', () => {
  assert.match(endpoint, /req\.method !== 'POST'/)
  assert.match(endpoint, /getGatewayReadOnlyContext\(req\.headers\.cookie\)/)
  assert.match(endpoint, /body\.requestId/)
  assert.match(endpoint, /body\.amount/)
  assert.doesNotMatch(endpoint, /body\.(accountId|circleUserId|walletId|sourceAddress|destinationAddress|token|chain|fees|status|useForwarder)/)
  assert.match(session, /accountId: session\.account_id/)
  assert.match(endpoint, /Cache-Control', 'no-store'/)
})

test('endpoint performs fresh correlation and estimate before idempotent persistence', () => {
  const handler = endpoint.slice(endpoint.indexOf('export default async function handler'))
  const correlation = handler.indexOf("circleGet('/user'")
  const wallets = handler.indexOf('listCircleWallets(context.userToken)')
  const readiness = handler.indexOf('inspectGatewayReadiness')
  const estimate = handler.indexOf('prepareGatewayMoveEstimate')
  const persistence = handler.indexOf('createOrReplayGatewayMoveOperation')
  assert.ok(correlation > 0 && wallets > correlation && readiness > wallets && estimate > readiness && persistence > estimate)
  assert.match(endpoint, /new AppKit\(\)\.unifiedBalance\.getBalances/)
  assert.match(endpoint, /createCircleUserWalletAdapter/)
  assert.match(endpoint, /networkType: 'testnet'/)
  assert.match(endpoint, /includePending: true/)
})

test('preparation boundary contains no confirmation, claim, spend or transaction submission', () => {
  assert.doesNotMatch(endpoint, /claimGatewayMoveOperation|claim_gateway_move_operation|SUBMITTING/)
  assert.doesNotMatch(endpoint, /\.spend\s*\(|\/v1\/transfer|\bapprove\s*\(|\bdeposit\s*\(|sendTransaction|sendCalls/)
  assert.doesNotMatch(endpoint, /resolveTypedDataSignature\s*:\s*async|onChallenge\s*:\s*async/)
})

test('idempotency validates current server-owned identity before estimate and handles concurrent unique conflict', () => {
  const handler = endpoint.slice(endpoint.indexOf('export default async function handler'))
  assert.ok(handler.indexOf('getGatewayMoveOperationByPreparationKey') < handler.indexOf('inspectGatewayReadiness'))
  assert.match(endpoint, /existing\.source_wallet_id === polygonWallet\.id/)
  assert.match(endpoint, /existing\.destination_wallet_id === arcWallet\.id/)
  assert.match(endpoint, /IDEMPOTENCY_KEY_REUSED/)
  assert.match(operation, /error\?\.code !== '23505'/)
  assert.match(operation, /samePreparationIdentity/)
  assert.match(operation, /replayed: true/)
})

test('safe responses omit internal ownership, Circle wallet IDs and credentials', () => {
  const publicProjection = operation.slice(operation.indexOf('export function toPublicGatewayMoveOperation'), operation.indexOf('export class GatewayMovePreparationConflictError'))
  assert.doesNotMatch(publicProjection, /account_id|preparation_key|source_wallet_id|destination_wallet_id|userToken|refreshToken|encryptionKey/)
  assert.doesNotMatch(endpoint, /error\.message|error\.stack/)
  assert.match(endpoint, /OPERATION_STORE_UNAVAILABLE/)
})
