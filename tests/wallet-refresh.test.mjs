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

test('Wallet renders saved Activity first, then reads Arc every five seconds and runs provider persistence in the background', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /fetch\('\/api\/circle\/activity-sync', \{ credentials: 'include', cache: 'no-store' \}\)/)
  assert.match(app, /fetch\('\/api\/circle\/activity-sync\?mode=arc', \{ method: 'POST', credentials: 'include', cache: 'no-store' \}\)/)
  assert.match(app, /manualRefresh[\s\S]*readSavedActivities\(\)[\s\S]*refreshSavedActivitiesAfterArc\(\)[\s\S]*syncActivities\(\)/)
  assert.match(app, /newConfirmedReceive[\s\S]*pollBalanceAfterReceive/)
  assert.match(app, /document\.visibilityState !== 'visible'[\s\S]*refreshSavedActivitiesAfterArc\(\)/)
  assert.match(app, /initialRead[\s\S]*\.finally\(startActivityPolling\)/)
  assert.match(app, /startActivityPolling[\s\S]*window\.setInterval\(pollRealtimeActivity, 5000\)/)
  assert.match(app, /activityInterval !== undefined[\s\S]*window\.clearInterval\(activityInterval\)/)
  assert.match(app, /activityReadPromiseRef\.current/)
  assert.match(app, /activityRefreshQueuedRef\.current = true/)
  assert.match(app, /if \(!activityRefreshQueuedRef\.current\) return null/)
  assert.match(app, /activityRequestGenerationRef\.current/)
  assert.match(app, /generation !== activityRequestGenerationRef\.current/)
  assert.match(app, /check: async \(\) => Boolean\(\(await refreshSavedActivitiesAfterArc\(\)\)/)

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

test('manual Activity refresh preserves existing rows through refresh and failure', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /const retainExistingActivities = activitiesRef\.current\.length > 0/)
  assert.match(app, /retainExistingActivities[\s\S]*setActivityRefreshStatus\('refreshing'\)[\s\S]*setActivityStatus\('loading'\)/)
  assert.match(app, /activitiesRef\.current\.length > 0[\s\S]*setActivityStatus\('ready'\)[\s\S]*setActivityRefreshStatus\('error'\)/)
  assert.match(app, /activityStatus === 'error' && activities\.length === 0/)
  assert.match(app, /Activity refresh failed\. Showing your last loaded activity\./)
  assert.match(app, /activityRefreshStatus === 'refreshing' \? 'Refreshing…' : 'Refresh'/)
})

test('manual Activity refresh queues once behind an in-flight read and stale responses cannot apply', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /if \(activityReadPromiseRef\.current\)[\s\S]*if \(!queueIfBusy\) return activityReadPromiseRef\.current/)
  assert.match(app, /activityRefreshQueuedRef\.current = true[\s\S]*await activityReadPromiseRef\.current\.catch/)
  assert.match(app, /activityRefreshQueuedRef\.current = false/)
  assert.match(app, /const generation = \+\+activityRequestGenerationRef\.current/)
  assert.match(app, /generation !== undefined && generation !== activityRequestGenerationRef\.current/)
})

test('Arc sync failure still re-reads saved Activity and lets the saved result decide the UI', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const walletPage = app.slice(app.indexOf('function AppWalletPage'), app.indexOf('function AppSwapPage'))
  assert.match(walletPage, /const refreshSavedActivitiesAfterArc[\s\S]*await loadSavedActivities\(\)\.catch\(\(\) => null\)[\s\S]*return readSavedActivities\(generation\)/)
  assert.match(walletPage, /const initialRead = manualRefresh[\s\S]*refreshSavedActivitiesAfterArc\(\{ queueIfBusy: true \}\)/)
  assert.match(walletPage, /pollRealtimeActivity[\s\S]*refreshSavedActivitiesAfterArc\(\)\.then/)
})

test('Activity lists are applied only from the DB-only saved read after background synchronization', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const walletPage = app.slice(app.indexOf('function AppWalletPage'), app.indexOf('function AppSwapPage'))
  assert.match(walletPage, /const readSavedActivities[\s\S]*return applyActivities\(data\.activities, generation\)/)
  assert.doesNotMatch(walletPage, /fetch\('\/api\/circle\/activity-sync\?mode=arc'[\s\S]{0,500}applyActivities/)
  assert.match(walletPage, /const syncActivities[\s\S]*return activityReadPromiseRef\.current \|\| readSavedActivities\(\)/)
})

function activityCycleHarness({ sync, read }) {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const cycleSource = app.slice(app.indexOf('  const refreshSavedActivitiesAfterArc ='), app.indexOf('  const syncActivities ='))
  const refs = {
    activityReadPromiseRef: { current: null },
    activityRefreshQueuedRef: { current: false },
    activityRequestGenerationRef: { current: 0 },
    activityMountedRef: { current: true },
  }
  const createCycle = new Function(...Object.keys(refs), 'loadSavedActivities', 'readSavedActivities', `${cycleSource}; return refreshSavedActivitiesAfterArc`)
  return { ...refs, cycle: createCycle(...Object.values(refs), sync, read) }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('poll ticks coalesce the whole cycle without invalidating the saved GET', async () => {
  const post = deferred()
  const get = deferred()
  let posts = 0
  let gets = 0
  let applied = false
  const h = activityCycleHarness({
    sync: () => { posts += 1; return post.promise },
    read: async (generation) => {
      gets += 1
      await get.promise
      assert.equal(generation, h.activityRequestGenerationRef.current)
      assert.ok(h.activityReadPromiseRef.current, 'lock remains held until saved data applies')
      applied = true
      return { activities: [{ id: 'new-receive' }], newConfirmedReceive: true }
    },
  })
  const first = h.cycle()
  const tickDuringPost = h.cycle()
  post.resolve()
  await Promise.resolve()
  await Promise.resolve()
  const tickDuringGet = h.cycle()
  assert.equal(h.activityRequestGenerationRef.current, 1)
  get.resolve()
  const results = await Promise.all([first, tickDuringPost, tickDuringGet])
  assert.equal(posts, 1)
  assert.equal(gets, 1)
  assert.equal(applied, true)
  assert.ok(results.every((result) => result.activities[0].id === 'new-receive'))
  assert.equal(h.activityReadPromiseRef.current, null)
})

test('manual refresh queues one whole cycle and a failed POST still applies saved data', async () => {
  const post = deferred()
  let posts = 0
  let gets = 0
  const h = activityCycleHarness({
    sync: () => { posts += 1; return posts === 1 ? post.promise : Promise.reject(new Error('sync failed')) },
    read: async () => { gets += 1; return { activities: [{ id: `saved-${gets}` }], newConfirmedReceive: false } },
  })
  const first = h.cycle()
  const manual = h.cycle({ queueIfBusy: true })
  const anotherManual = h.cycle({ queueIfBusy: true })
  assert.equal(h.activityRequestGenerationRef.current, 1)
  post.resolve()
  await Promise.all([first, manual, anotherManual])
  assert.equal(posts, 2)
  assert.equal(gets, 2)
  assert.equal(h.activityRequestGenerationRef.current, 2)
})

test('unmount prevents an in-flight cycle from starting its queued successor', async () => {
  const post = deferred()
  let posts = 0
  const h = activityCycleHarness({ sync: () => { posts += 1; return post.promise }, read: async () => null })
  const first = h.cycle()
  const manual = h.cycle({ queueIfBusy: true })
  h.activityMountedRef.current = false
  post.resolve()
  await Promise.all([first, manual])
  assert.equal(posts, 1)
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /const applyActivities[\s\S]*if \(!activityMountedRef\.current\) return null/)
})

test('initial Activity failure still renders the large retry state without a baseline', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /if \(activitiesRef\.current\.length > 0\)[\s\S]*else \{\s*setActivityStatus\('error'\)/)
  assert.match(app, /activityStatus === 'error' && activities\.length === 0[\s\S]*Wallet activity could not be loaded\./)
  assert.match(app, /onClick=\{\(\) => setActivityRefresh\(\(value\) => value \+ 1\)\}>Try again<\/button>/)
})

test('saved Activity is applied before background Arc sync and background failure is non-destructive', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const walletPage = app.slice(app.indexOf('function AppWalletPage'), app.indexOf('function AppSwapPage'))
  const savedRead = app.indexOf("fetch('/api/circle/activity-sync', { credentials: 'include', cache: 'no-store' })")
  const arcSync = app.indexOf("fetch('/api/circle/activity-sync?mode=arc'")
  assert.ok(savedRead >= 0)
  assert.ok(arcSync > savedRead)
  assert.match(walletPage, /const arcSync = manualRefresh \? Promise\.resolve\(result\) : refreshSavedActivitiesAfterArc\(\)/)
  assert.match(walletPage, /void arcSync\.then\([\s\S]*\)\.catch\(\(\) => \{\}\)/)
  assert.match(walletPage, /return applyActivities\(data\.activities, generation\)\s*}/)
  assert.match(walletPage, /generation !== undefined && generation !== activityRequestGenerationRef\.current/)
  assert.match(walletPage, /!hasActivityBaselineRef\.current \|\| document\.visibilityState !== 'visible'/)
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
