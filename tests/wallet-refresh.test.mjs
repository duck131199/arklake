import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { stripTypeScriptTypes } from 'node:module'

const source = stripTypeScriptTypes(readFileSync(new URL('../src/wallet-refresh.ts', import.meta.url), 'utf8'))
const context = vm.createContext({ Date, Promise })
const module = new vm.SourceTextModule(source, { context })
await module.link(() => { throw new Error('Unexpected import') })
await module.evaluate()
const { runBoundedVisiblePoll } = module.namespace

test('bounded polling stops as soon as the requested state appears', async () => {
  let checks = 0
  const result = await runBoundedVisiblePoll({ check: async () => ++checks === 3, isVisible: () => true, intervalMs: 5000, timeoutMs: 60000, wait: async () => {} })
  assert.equal(result, 'found')
  assert.equal(checks, 3)
})

test('bounded polling times out', async () => {
  const realNow = Date.now
  let now = 0
  Date.now = () => now
  try {
    const result = await runBoundedVisiblePoll({ check: async () => false, isVisible: () => true, intervalMs: 5000, timeoutMs: 60000, wait: async (delay) => { now += delay } })
    assert.equal(result, 'timeout')
  } finally { Date.now = realNow }
})

test('hidden pages do not poll', async () => {
  let checks = 0
  const result = await runBoundedVisiblePoll({ check: async () => { checks += 1; return false }, isVisible: () => false, intervalMs: 5000, timeoutMs: 60000, wait: async () => {} })
  assert.equal(result, 'hidden')
  assert.equal(checks, 0)
})

test('wallet wiring coalesces focus and visibility refresh and avoids duplicate pollers', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /now - lastReturnRefreshRef\.current < 1000/)
  assert.match(app, /lastReturnRefreshRef\.current = now/)
  assert.match(app, /activityPollRef\.current\?\.abort\(\)/)
  assert.match(app, /balancePollRef\.current\?\.abort\(\)/)
  assert.match(app, /intervalMs: 5000,[\s\S]*timeoutMs: 60000/)
  assert.match(app, /newConfirmedReceive[\s\S]*pollBalanceAfterReceive/)
  assert.match(app, /intervalMs: 3000,[\s\S]*timeoutMs: 60000/)
  assert.match(app, /hasActivityBaselineRef\.current &&/)
})
