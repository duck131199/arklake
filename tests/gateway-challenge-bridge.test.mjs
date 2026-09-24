import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import {
  decryptGatewayChallengeResponse,
  encryptGatewayChallengeResponse,
  sameGatewayChallengeResponse,
} from '../server/circle/gateway-challenge-crypto.ts'

const handler = readFileSync(new URL('../server/circle/gateway-move-execution-handler.ts', import.meta.url), 'utf8')
const browser = readFileSync(new URL('../src/GatewayChallengeBridge.tsx', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const router = readFileSync(new URL('../api/circle/[gateway].ts', import.meta.url), 'utf8')
const localFixture = readFileSync(new URL('../server/circle/gateway-local-challenge-fixture-handler.ts', import.meta.url), 'utf8')

test('response material is authenticated-encrypted and exact replay comparison is stable', () => {
  const previous = process.env.GATEWAY_CHALLENGE_RESPONSE_ENCRYPTION_KEY
  process.env.GATEWAY_CHALLENGE_RESPONSE_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
  try {
    const material = { status: 'APPROVED', signature: `0x${'ab'.repeat(65)}` }
    const encrypted = encryptGatewayChallengeResponse(material)
    assert.notEqual(encrypted.includes(material.signature), true)
    assert.deepEqual(decryptGatewayChallengeResponse(encrypted), material)
    assert.equal(sameGatewayChallengeResponse(decryptGatewayChallengeResponse(encrypted), material), true)
    assert.equal(sameGatewayChallengeResponse(decryptGatewayChallengeResponse(encrypted), { status: 'REJECTED' }), false)
  } finally {
    if (previous === undefined) delete process.env.GATEWAY_CHALLENGE_RESPONSE_ENCRYPTION_KEY
    else process.env.GATEWAY_CHALLENGE_RESPONSE_ENCRYPTION_KEY = previous
  }
})

test('authenticated GET scopes account, session, REAL job, attempt and Circle challenge', () => {
  assert.match(handler, /getGatewayReadOnlyContext\(req\.headers\.cookie\)/)
  assert.match(handler, /eq\('id', operationId\)\.eq\('account_id', accountId\)/)
  assert.match(handler, /job\.execution_mode !== 'REAL'/)
  assert.match(handler, /job\.auth_session_id !== sessionId/)
  assert.match(handler, /eq\('execution_attempt_id', scope\.job\.execution_attempt_id/)
  assert.match(handler, /eq\('challenge_type', 'CIRCLE_TYPED_DATA'\)/)
  assert.match(handler, /Cache-Control', 'no-store'/)
})

test('GET exposes only the safe operation and pending challenge projection', () => {
  const projection = handler.slice(handler.indexOf('function publicChallenge'), handler.indexOf('function requestedMaterial'))
  assert.match(projection, /challengeId/)
  assert.match(projection, /sequence/)
  assert.match(projection, /circleChallengeId/)
  assert.doesNotMatch(projection, /encrypted_response_material|auth_session_id|execution_attempt_id|response_json|signature/)
  const getResponse = handler.slice(handler.indexOf("return json(res, 200, {\n    ok: true,\n    operation"), handler.indexOf('async function postResponse'))
  assert.doesNotMatch(getResponse, /userToken|refreshToken|deviceId|encryptionKey|recovery|service_role/i)
})

test('POST validates signature and fences every durable write', () => {
  assert.match(handler, /\^0x\[0-9a-fA-F\]\{130\}\$/)
  assert.match(handler, /challenge\.sequence !== body\.sequence/)
  assert.match(handler, /challenge\.execution_attempt_id !== scope\.job\.execution_attempt_id/)
  assert.match(handler, /challenge\.superseded_at !== null/)
  assert.match(handler, /eq\('operation_id', scope\.operation\.id\)/)
  assert.match(handler, /eq\('job_id', scope\.job\.id\)/)
  assert.match(handler, /eq\('status', 'PENDING'\)/)
  assert.match(handler, /is\('superseded_at', null\)/)
  assert.match(handler, /encrypted_response_material: encrypted/)
  assert.doesNotMatch(handler, /response_json:\s*\{[^}]*signature/)
})

test('approved and rejected responses are durable, idempotent and conflicting responses fail', () => {
  assert.match(handler, /body\.status === 'REJECTED'/)
  assert.match(handler, /body\.status === 'APPROVED'/)
  assert.match(handler, /sameGatewayChallengeResponse\(stored, material\)[\s\S]*replayed: true/)
  assert.match(handler, /409, 'CHALLENGE_CONFLICT'/)
  assert.match(handler, /409, 'STALE_CHALLENGE'/)
  assert.match(handler, /404, 'OPERATION_NOT_FOUND'/)
})

test('browser polls durably, survives reload and executes only REAL Circle typed-data challenges', () => {
  assert.match(browser, /fetch\(`\$\{endpoint\}\?operationId=/)
  assert.match(browser, /window\.setInterval/)
  assert.match(browser, /credentials: 'include'/)
  assert.match(browser, /data\.challenge\.type !== 'CIRCLE_TYPED_DATA'/)
  assert.match(browser, /challenge\.type !== 'CIRCLE_TYPED_DATA'/)
  assert.match(browser, /sdk\.execute\(pending\.circleChallengeId/)
  assert.match(browser, /result\?\.status !== 'COMPLETE'/)
  assert.match(browser, /data\?\.signature/)
  assert.doesNotMatch(browser, /MOCK_AUTHORIZATION_1|MOCK_AUTHORIZATION_2/)
})

test('browser keeps one challenge in flight and does not require OTP while Circle auth is present', () => {
  assert.match(browser, /executingRef\.current/)
  assert.match(browser, /sdk\.setAuthentication\(circleAuth\)/)
  assert.match(browser, /if \(state === 'error'\)[\s\S]*if \(!circleAuth\) return <>\{signingPanel\}<\/>/)
  assert.match(browser, /useState<string \| null>\(null\)/)
  assert.doesNotMatch(browser, /useState\('SUBMITTING'\)/)
  assert.doesNotMatch(browser, /verifyOtp|requestOtp|refreshUserToken/)
})

test('browser resets stale Circle singleton, authenticates the fresh SDK and bounds execute time', () => {
  const reset = browser.indexOf("document.getElementById('sdkIframe')?.remove()")
  const singleton = browser.indexOf('W3SSdk.instance = null', reset)
  const construct = browser.indexOf('new FreshW3SSdk', singleton)
  const authenticate = browser.indexOf('sdk.setAuthentication(circleAuth)', construct)
  const execute = browser.indexOf('sdk.execute(pending.circleChallengeId', authenticate)
  assert.ok(reset >= 0 && singleton > reset && construct > singleton && authenticate > construct && execute > authenticate)
  assert.match(browser, /const CIRCLE_EXECUTION_TIMEOUT_MS = 120_000/)
  assert.match(browser, /window\.setTimeout\([\s\S]*Circle confirmation timed out\. Please reload and retry safely\.[\s\S]*CIRCLE_EXECUTION_TIMEOUT_MS/)
  assert.match(browser, /if \(settled\) return[\s\S]*window\.clearTimeout\(timeout\)/)
})

test('timeout cannot approve, reject or automatically retry the durable challenge', () => {
  const timeoutStart = browser.indexOf('const timeout = window.setTimeout')
  const executeStart = browser.indexOf('sdk.execute(pending.circleChallengeId', timeoutStart)
  const timeoutBody = browser.slice(timeoutStart, executeStart)
  assert.doesNotMatch(timeoutBody, /submitResponse|APPROVED|REJECTED|\.execute\(/)
  assert.equal((browser.match(/sdk\.execute\(pending\.circleChallengeId/g) || []).length, 1)
  assert.match(browser, /result\?\.status !== 'COMPLETE'/)
  assert.equal((browser.match(/await submitResponse\(pending, 'APPROVED', signature\)/g) || []).length, 1)
})

test('localhost fixture preparation derives identity from the HttpOnly session and fails closed outside local development', () => {
  assert.match(localFixture, /getGatewayReadOnlyContext\(req\.headers\.cookie\)/)
  assert.match(localFixture, /auth_session_id: context\.sessionId/)
  assert.match(localFixture, /account_id: context\.accountId/)
  assert.doesNotMatch(localFixture, /body\.(?:accountId|sessionId)|latest active|order\(.+sessions/i)
  assert.match(localFixture, /GATEWAY_LOCAL_CHALLENGE_FIXTURE_ENABLED/)
  assert.match(localFixture, /VERCEL_ENV === 'preview'.*VERCEL_ENV === 'production'/)
  assert.match(localFixture, /host === 'localhost'.*host === '127\.0\.0\.1'/)
  assert.match(localFixture, /sign\/typedData/)
  assert.match(localFixture, /movedFunds: false/)
  assert.match(app, /import\.meta\.env\.DEV.*window\.location\.hostname === 'localhost'.*\/app\/gateway\/local-challenge-test/)
  assert.match(app, /fetch\('\/api\/circle\/gateway-local-challenge-fixture'/)
  assert.match(app, /localGatewayChallengeFixtureRequest \?\?=/)
})

test('dynamic routing remains one Vercel function and total API count remains 12', () => {
  assert.match(router, /'gateway-move-execution': gatewayMoveExecution/)
  const files = readdirSync(new URL('../api/', import.meta.url), { recursive: true })
    .filter((file) => /\.(?:ts|js|mjs)$/.test(String(file)))
  assert.equal(files.length, 12)
})

test('challenge bridge does not cross the financial execution boundary', () => {
  const source = `${handler}\n${browser}\n${localFixture}`
  assert.doesNotMatch(source, /unifiedBalance|\.spend\s*\(|\/v1\/transfer|gatewayMint|gateway transfer|sendTransaction|sendCalls|Polygon transaction|Arc transaction/i)
})
