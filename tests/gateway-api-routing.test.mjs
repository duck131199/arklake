import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const router = readFileSync(new URL('../api/circle/[gateway].ts', import.meta.url), 'utf8')

test('one dynamic function preserves the Gateway route segments including the challenge bridge', () => {
  assert.match(router, /'gateway-readiness': gatewayReadiness/)
  assert.match(router, /'gateway-move-prepare': gatewayMovePrepare/)
  assert.match(router, /'gateway-move-confirm': gatewayMoveConfirm/)
  assert.match(router, /'gateway-move-execution': gatewayMoveExecution/)
  assert.match(router, /'gateway-local-challenge-fixture': gatewayLocalChallengeFixture/)
  assert.match(router, /req\.query\.gateway/)
})

test('Gateway routing is allowlisted, no-store, and rejects unknown routes', () => {
  assert.match(router, /Cache-Control', 'no-store'/)
  assert.match(router, /gatewayHandlers\[route as keyof typeof gatewayHandlers\]/)
  assert.match(router, /status\(404\)/)
  assert.doesNotMatch(router, /import\s*\(|require\s*\(.*route/)
})

test('Vercel API routing stays within the 12-function Hobby limit', () => {
  const files = readdirSync(new URL('../api/', import.meta.url), { recursive: true })
    .filter((file) => /\.(?:ts|js|mjs)$/.test(String(file)))
  assert.equal(files.length, 12)
})
