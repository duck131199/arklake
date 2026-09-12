import test from 'node:test'
import assert from 'node:assert/strict'
import { buildServerModules } from './server-module-fixture.mjs'

const built = buildServerModules(['api/invoice-payment-intent.ts'])

test('compiled invoice-payment-intent module loads and serves GET/POST without unresolved server imports', async () => {
  process.env.SUPABASE_URL ||= 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-only-key'
  const { default: handler } = await built.import('api/invoice-payment-intent.js')
  assert.equal(typeof handler, 'function')
  for (const method of ['GET', 'POST']) {
    let statusCode = 0
    const response = { status(code) { statusCode = code; return this }, json(body) { return body }, setHeader() {} }
    await handler({ method, body: {} }, response)
    assert.equal(statusCode, 405)
  }
})
