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
const { hasNewConfirmedReceive, runBoundedVisiblePoll } = module.namespace

test('confirmed Receive transition triggers balance refresh and replaces stale UI balance', async () => {
  const activityId = 'receive-activity'
  const previous = [{ id: activityId, type: 'receive', status: 'pending' }]
  const next = [{ id: activityId, type: 'receive', status: 'confirmed' }]
  assert.equal(hasNewConfirmedReceive(previous, next), true)

  let displayedBalance = '47.637966'
  const circleBalances = ['47.637966', '67.637966']
  const result = await runBoundedVisiblePoll({
    check: async () => {
      const latestBalance = circleBalances.shift() || '67.637966'
      displayedBalance = latestBalance
      return latestBalance !== '47.637966'
    },
    isVisible: () => true,
    intervalMs: 3000,
    timeoutMs: 60000,
    wait: async () => {},
  })

  assert.equal(result, 'found')
  assert.equal(displayedBalance, '67.637966')
})

test('an already-confirmed Receive does not retrigger balance refresh', () => {
  const receive = { id: 'receive-activity', type: 'receive', status: 'confirmed' }
  assert.equal(hasNewConfirmedReceive([receive], [receive]), false)
})

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

test('Home and Wallet share a visible balance refresh that replaces stale root state', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /balanceRefreshInFlightRef\.current/)
  assert.match(app, /fetch\(arklakeSessionEndpoint, \{ credentials: 'include', cache: 'no-store' \}\)/)
  assert.match(app, /setArklakeBalances\(data\.balances\)/)
  assert.match(app, /currentPath\.startsWith\('\/app'\)[\s\S]*refreshSharedBalances\(\)/)
  assert.match(app, /window\.setInterval\(refreshOnReturn, 15000\)/)
  assert.match(app, /document\.visibilityState === 'visible'/)
  assert.match(app, /onWalletRefresh=\{refreshSharedBalances\}/)
})

test('Wallet reads Arc Activity every five seconds while visible and runs provider persistence in the background', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /fetch\('\/api\/circle\/activity-sync\?mode=arc', \{ method: 'POST', credentials: 'include', cache: 'no-store' \}\)/)
  assert.match(app, /loadSavedActivities\(\)[\s\S]*void syncActivities\(\)/)
  assert.match(app, /newConfirmedReceive[\s\S]*pollBalanceAfterReceive/)
  assert.match(app, /document\.visibilityState !== 'visible'[\s\S]*loadSavedActivities\(\)/)
  assert.match(app, /window\.setInterval\(pollRealtimeActivity, 5000\)/)
  assert.match(app, /window\.clearInterval\(activityInterval\)/)
  assert.match(app, /activityReadInFlightRef\.current/)
  assert.match(app, /check: async \(\) => Boolean\(\(await loadSavedActivities\(\)\)/)

  const endpoint = readFileSync(new URL('../api/circle/activity-sync.ts', import.meta.url), 'utf8')
  assert.match(endpoint, /req\.method !== 'GET' && req\.method !== 'POST'/)
  assert.match(endpoint, /if \(req\.query\?\.mode === 'arc'\)[\s\S]*persistArcActivities[\s\S]*loadSavedActivities/)
  assert.match(endpoint, /wallet_activity_sync_cursors/)
  assert.match(endpoint, /nativeUsdcAddress[\s\S]*fromBlock: `0x\$\{initialBlock\.toString\(16\)\}`[\s\S]*topics: \[transferTopic, null, walletTopic\]/)
  assert.match(endpoint, /advance_wallet_activity_sync_cursor/)
  assert.match(endpoint, /Promise\.allSettled\(hashes\.map/)
  assert.match(endpoint, /lastScannedBlock - 20/)
  assert.match(endpoint, /confirmedHead - 20000/)
  assert.match(endpoint, /address: tokenAddresses, fromBlock, toBlock, topics: \[transferTopic, null, walletTopic\]/)
  assert.match(endpoint, /dedup_key: `\$\{wallet\.circle_wallet_id\}:ARC-TESTNET:\$\{activity\.txHash\}`/)
  assert.match(endpoint, /ignoreDuplicates: true/)
  assert.match(endpoint, /row\.circle_transaction_id === null/)
  assert.match(endpoint, /leg_key: `reconciled:\$\{wallet\.circle_wallet_id\}:ARC-TESTNET:\$\{activity\.txHash\}:log:\$\{leg\.logIndex\}`/)
  assert.match(endpoint, /eth_getLogs/)
  assert.match(endpoint, /eth_getTransactionReceipt/)
  assert.match(endpoint, /decodeArcTransferLegs\(receipt\.logs, walletAddress, tokenMap\)/)

  const migration = readFileSync(new URL('../supabase/migrations/202609130001_wallet_activity_arc_cursor.sql', import.meta.url), 'utf8')
  assert.match(migration, /circle_wallet_id text primary key/)
  assert.match(migration, /greatest\(wallet_activity_sync_cursors\.last_scanned_block, excluded\.last_scanned_block\)/)
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated/)
})

test('shared balance refresh reads canonical USDC from Arc without waiting for Circle indexing', () => {
  const session = readFileSync(new URL('../api/auth/session.ts', import.meta.url), 'utf8')
  assert.match(session, /method: 'eth_call'/)
  assert.match(session, /0x70a08231/)
  assert.match(session, /canonicalArcUsdcAddress/)
  assert.match(session, /canonical\.amount = currentArcUsdc/)
})

test('Swap confirmation starts one bounded exact-transaction activity poll', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const swap = readFileSync(new URL('../src/SwapFlow.tsx', import.meta.url), 'utf8')
  assert.match(swap, /onSwapConfirmed\?\.\(confirmedTxHash\)/)
  assert.match(swap, /finish\(balances, event\.txHash\)/)
  assert.match(swap, /finish\(undefined, pending\.txHash\)/)
  assert.match(app, /onSwapConfirmed=\{pollActivityForSwap\}/)
  assert.match(app, /swapActivityPollRef\.current\?\.abort\(\)[\s\S]*new AbortController\(\)/)
  assert.match(app, /intervalMs: 5000,[\s\S]*timeoutMs: 60000,[\s\S]*document\.visibilityState === 'visible'/)
  assert.match(app, /activity\.txHash\?\.toLowerCase\(\) === txHash\.toLowerCase\(\)/)
  assert.match(app, /useEffect\(\(\) => \(\) => \{ swapActivityPollRef\.current\?\.abort\(\) \}, \[\]\)/)
})
