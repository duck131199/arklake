import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { normalizeCircleTransactions, type CircleTransaction, type OnchainLeg, type TokenDetails } from '../../server/circle/activity-core.js'
import { activityEmail, activityEmailMaySend, notificationBelongsToAccount, notificationIdempotencyKey, transactionEmailActivationTime, transactionEmailEnabled, type EmailActivity } from '../../server/circle/activity-email.js'
import { shouldSuppressGenericActivityEmail } from '../../server/circle/activity-email-suppression.js'
import { arcTestnetChainIdHex, counterpartyActivityType, internalCounterpartyAddress, internalTransferUsdcAddress, reconciledDedupKey, reconciledLegKey, verifyInternalUsdcTransfer, type ArcReceipt } from '../../server/circle/internal-transfer.js'
import { processInvoiceEmailOutbox } from '../../server/invoice-email.js'

type VercelRequest = { method?: string; headers: { cookie?: string } }
type VercelResponse = { status: (code: number) => VercelResponse; json: (body: object) => unknown }

const circleBaseUrl = 'https://api.circle.com/v1/w3s'
const cookieName = 'arklake_session'
const arcRpcUrl = 'https://rpc.testnet.arc.network'
const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

type StoredSession = {
  sid: string
  account_id: string
  circle_user_token: string
  circle_refresh_token: string
  circle_device_id: string
  expires_at: string
  revoked_at: string | null
}

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function supabaseClient() {
  return createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function retryAt(attempts: number) {
  return new Date(Date.now() + Math.min(60, 2 ** Math.min(attempts, 5)) * 60_000).toISOString()
}

async function deliverActivityEmails(supabase: ReturnType<typeof supabaseClient>, accountId: string, enabledAt: number) {
  const { data: account } = await supabase.from('arklake_accounts').select('email').eq('id', accountId).maybeSingle<{ email: string }>()
  if (!account?.email) return { sent: 0, failed: 0 }
  const now = new Date().toISOString()
  const stale = new Date(Date.now() - 5 * 60_000).toISOString()
  const { data: queued } = await supabase.from('wallet_activity_notification_outbox')
    .select('id,account_id,activity_id,status,attempts').eq('account_id', accountId)
    .or(`and(status.eq.pending,attempts.eq.0),and(status.eq.failed,next_attempt_at.lte.${now}),and(status.eq.sending,updated_at.lte.${stale})`)
    .order('created_at', { ascending: true }).limit(10)
  let sent = 0
  let failed = 0
  for (const item of queued || []) {
    if (!notificationBelongsToAccount(item.account_id, accountId)) continue
    const { data: claimed } = await supabase.from('wallet_activity_notification_outbox')
      .update({ status: 'sending', attempts: item.attempts + 1, updated_at: now })
      .eq('id', item.id).eq('account_id', accountId).eq('status', item.status).select('id').maybeSingle()
    if (!claimed) continue
    try {
      const { data: activity } = await supabase.from('wallet_activities')
        .select('id,activity_type,status,occurred_at,confirmed_at,blockchain,tx_hash,source_address,destination_address,raw_circle')
        .eq('id', item.activity_id).eq('account_id', accountId).eq('status', 'confirmed').maybeSingle()
      if (!activity) throw new Error('Confirmed wallet activity was not found')
      if (!activityEmailMaySend(activity.confirmed_at, enabledAt)) {
        await supabase.from('wallet_activity_notification_outbox').update({
          status: 'suppressed', last_error: 'Activity predates transaction email activation', updated_at: new Date().toISOString(),
        }).eq('id', item.id).eq('account_id', accountId).eq('status', 'sending')
        continue
      }
      if ((activity.activity_type === 'send' || activity.activity_type === 'receive') && activity.tx_hash) {
        const { data: invoiceIntent, error: intentError } = await supabase.from('invoice_payment_intents')
          .select('id').eq('tx_hash', activity.tx_hash.toLowerCase()).limit(1).maybeSingle<{ id: string }>()
        if (intentError) throw new Error('Invoice payment correlation could not be checked')
        if (invoiceIntent && shouldSuppressGenericActivityEmail(activity.activity_type, activity.tx_hash, new Set([activity.tx_hash.toLowerCase()]))) {
          await supabase.from('wallet_activity_notification_outbox').update({
            status: 'suppressed', last_error: 'Invoice payment notification is sent by the invoice email flow', updated_at: new Date().toISOString(),
          }).eq('id', item.id).eq('account_id', accountId).eq('status', 'sending')
          continue
        }
      }
      const { data: legs, error: legsError } = await supabase.from('wallet_activity_legs')
        .select('direction,amount,token_symbol,source_address,destination_address').eq('activity_id', activity.id).order('log_index', { ascending: true })
      if (legsError || !legs) throw new Error('Wallet activity legs could not be loaded')
      const message = activityEmail({
        id: activity.id, type: activity.activity_type, status: 'confirmed', occurredAt: activity.occurred_at,
        confirmedAt: activity.confirmed_at, blockchain: activity.blockchain, txHash: activity.tx_hash,
        sourceAddress: activity.source_address, destinationAddress: activity.destination_address,
        networkFee: Array.isArray(activity.raw_circle) ? activity.raw_circle.find((transaction: CircleTransaction) => typeof transaction.networkFee === 'string')?.networkFee || null : null,
        legs: legs.map((leg) => ({ direction: leg.direction, amount: String(leg.amount), symbol: leg.token_symbol, sourceAddress: leg.source_address, destinationAddress: leg.destination_address })),
      } as EmailActivity)
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${required('RESEND_API_KEY')}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': notificationIdempotencyKey(activity.id),
        },
        body: JSON.stringify({ from: required('RESEND_FROM_EMAIL'), to: [account.email], ...message }),
      })
      const payload = await response.json().catch(() => null) as { id?: string; message?: string } | null
      if (!response.ok || !payload?.id) throw new Error(payload?.message || `Resend returned HTTP ${response.status}`)
      await supabase.from('wallet_activity_notification_outbox').update({
        status: 'sent', provider_message_id: payload.id, sent_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
      }).eq('id', item.id).eq('account_id', accountId)
      sent += 1
    } catch (error) {
      await supabase.from('wallet_activity_notification_outbox').update({
        status: 'failed', last_error: error instanceof Error ? error.message.slice(0, 500) : 'Email delivery failed',
        next_attempt_at: retryAt(item.attempts + 1), updated_at: new Date().toISOString(),
      }).eq('id', item.id).eq('account_id', accountId)
      failed += 1
    }
  }
  return { sent, failed }
}

function sessionId(cookieHeader?: string) {
  const value = (cookieHeader || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1)
  if (!value) return null
  const [body, signature] = value.split('.')
  if (!body || !signature) return null
  const expected = Buffer.from(crypto.createHmac('sha256', required('ARKLAKE_SESSION_SECRET')).update(body).digest('base64url'))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as { sid?: string }
    return payload.sid || null
  } catch {
    return null
  }
}

async function refreshUserToken(session: StoredSession) {
  const response = await fetch(`${circleBaseUrl}/users/token/refresh`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${required('CIRCLE_API_KEY')}`, 'X-User-Token': session.circle_user_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), refreshToken: session.circle_refresh_token, deviceId: session.circle_device_id }),
  })
  const body = await response.json().catch(() => null) as { data?: { userToken?: string; refreshToken?: string } } | null
  if (!response.ok || !body?.data?.userToken) return null
  return { userToken: body.data.userToken, refreshToken: body.data.refreshToken || session.circle_refresh_token }
}

async function circleGet(path: string, userToken: string) {
  return fetch(`${circleBaseUrl}${path}`, {
    headers: { Authorization: `Bearer ${required('CIRCLE_API_KEY')}`, 'X-User-Token': userToken, accept: 'application/json' },
  })
}

async function listTransactions(walletId: string, userToken: string) {
  const transactions: CircleTransaction[] = []
  let pageAfter: string | null = null
  for (let page = 0; page < 100; page += 1) {
    const query = new URLSearchParams({ walletIds: walletId, includeAll: 'true', pageSize: '50', order: 'DESC' })
    if (pageAfter) query.set('pageAfter', pageAfter)
    const response = await circleGet(`/transactions?${query}`, userToken)
    const payload = await response.json().catch(() => null) as { data?: { transactions?: CircleTransaction[] }; pagination?: { next?: string } } | null
    if (!response.ok) return { response, transactions: null }
    const batch = payload?.data?.transactions
    if (!Array.isArray(batch)) throw new Error('Invalid Circle transaction response')
    transactions.push(...batch)
    const next = payload?.pagination?.next
    if (!next || batch.length === 0) break
    try { pageAfter = new URL(next).searchParams.get('pageAfter') } catch { pageAfter = next }
    if (!pageAfter) break
  }
  return { response: null, transactions }
}

async function tokenDetails(tokenIds: string[], userToken: string) {
  const entries = await Promise.all(tokenIds.map(async (id) => {
    const response = await circleGet(`/tokens/${encodeURIComponent(id)}`, userToken)
    const payload = await response.json().catch(() => null) as { data?: { token?: TokenDetails } } | null
    return [id, response.ok && payload?.data?.token ? payload.data.token : { id }] as const
  }))
  return new Map(entries)
}

async function walletTokenDetails(walletId: string, userToken: string) {
  const response = await circleGet(`/wallets/${encodeURIComponent(walletId)}/balances`, userToken)
  const payload = await response.json().catch(() => null) as { data?: { tokenBalances?: Array<{ token?: TokenDetails }> } } | null
  if (!response.ok || !Array.isArray(payload?.data?.tokenBalances)) throw new Error('Unable to load Circle wallet token registry')
  return payload.data.tokenBalances.flatMap((balance) => balance.token?.id ? [balance.token] : [])
}

function formatTokenAmount(value: bigint, decimals: number) {
  if (decimals === 0) return value.toString()
  const scale = 10n ** BigInt(decimals)
  const fraction = (value % scale).toString().padStart(decimals, '0').replace(/0+$/, '')
  return fraction ? `${value / scale}.${fraction}` : (value / scale).toString()
}

async function swapReceiptLegs(transactions: CircleTransaction[], walletAddress: string, tokens: Map<string, TokenDetails>) {
  const groups = new Map<string, CircleTransaction[]>()
  for (const transaction of transactions) {
    if (!transaction.txHash) continue
    const hash = transaction.txHash.toLowerCase()
    groups.set(hash, [...(groups.get(hash) || []), transaction])
  }
  const candidates = [...groups.entries()].filter(([, group]) => group.some((transaction) => transaction.transactionType === 'INBOUND' && (transaction.amounts?.length || 0) > 0)
    && group.some((transaction) => transaction.transactionType === 'OUTBOUND' && transaction.operation === 'CONTRACT_EXECUTION' && (transaction.amounts?.length || 0) === 0))
  const byAddress = new Map([...tokens.values()].flatMap((token) => token.tokenAddress && Number.isInteger(token.decimals)
    ? [[token.tokenAddress.toLowerCase(), token] as const] : []))
  const wallet = walletAddress.toLowerCase()
  const entries = await Promise.all(candidates.map(async ([hash]) => {
    const response = await fetch(arcRpcUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [hash] }),
      signal: AbortSignal.timeout(15000),
    })
    const payload = await response.json().catch(() => null) as { result?: { status?: string; logs?: Array<{ address: string; data: string; logIndex: string; topics: string[] }> } } | null
    if (!response.ok || payload?.result?.status !== '0x1' || !Array.isArray(payload.result.logs)) return [hash, [] as OnchainLeg[]] as const
    const legs = payload.result.logs.flatMap((log): OnchainLeg[] => {
      if (log.topics?.[0]?.toLowerCase() !== transferTopic || log.topics.length < 3 || !/^0x[0-9a-fA-F]+$/.test(log.data)) return []
      const sourceAddress = `0x${log.topics[1].slice(-40)}`.toLowerCase()
      const destinationAddress = `0x${log.topics[2].slice(-40)}`.toLowerCase()
      const token = byAddress.get(log.address.toLowerCase())
      if (!token?.tokenAddress || !Number.isInteger(token.decimals) || (sourceAddress !== wallet && destinationAddress !== wallet)) return []
      return [{
        txHash: hash, logIndex: Number.parseInt(log.logIndex, 16), direction: sourceAddress === wallet ? 'out' : 'in',
        amount: formatTokenAmount(BigInt(log.data), token.decimals!), tokenId: token.id,
        tokenAddress: token.tokenAddress, tokenSymbol: token.symbol, tokenDecimals: token.decimals!,
        sourceAddress, destinationAddress,
      }]
    })
    return [hash, legs] as const
  }))
  return new Map(entries)
}

async function arcReceipt(txHash: string) {
  const [chainResponse, receiptResponse] = await Promise.all([
    fetch(arcRpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }), signal: AbortSignal.timeout(15000) }),
    fetch(arcRpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_getTransactionReceipt', params: [txHash] }), signal: AbortSignal.timeout(15000) }),
  ])
  const chain = await chainResponse.json().catch(() => null) as { result?: string } | null
  const receipt = await receiptResponse.json().catch(() => null) as { result?: ArcReceipt | null } | null
  if (!chainResponse.ok || chain?.result?.toLowerCase() !== arcTestnetChainIdHex || !receiptResponse.ok) return null
  return receipt?.result || null
}

async function notificationStatus(supabase: ReturnType<typeof supabaseClient>, activity: { activityType: string; txHash: string | null; confirmedAt: string | null }, enabledAt: number) {
  const historical = !activityEmailMaySend(activity.confirmedAt, enabledAt)
  if (historical) return { status: 'suppressed', last_error: 'Activity predates transaction email activation' }
  if ((activity.activityType === 'send' || activity.activityType === 'receive') && activity.txHash) {
    const { data, error } = await supabase.from('invoice_payment_intents').select('id').eq('tx_hash', activity.txHash.toLowerCase()).limit(1).maybeSingle<{ id: string }>()
    if (error) throw new Error('Invoice payment correlation could not be checked')
    if (data) return { status: 'suppressed', last_error: 'Invoice payment notification is sent by the invoice email flow' }
  }
  return { status: 'pending' }
}

async function reconcileInternalTransfers(supabase: ReturnType<typeof supabaseClient>, currentAccountId: string, activities: ReturnType<typeof normalizeCircleTransactions>, enabledAt: number) {
  const affectedAccounts = new Set([currentAccountId])
  for (const activity of activities) {
    const address = internalCounterpartyAddress(activity)
    if (!address || activity.status !== 'confirmed' || !activity.txHash) continue
    const { data: counterpartMatches, error: walletError } = await supabase.from('arklake_wallets')
      .select('account_id,circle_wallet_id,address').ilike('address', address).eq('blockchain', 'ARC-TESTNET').eq('account_type', 'SCA')
      .neq('account_id', currentAccountId).limit(2).returns<Array<{ account_id: string; circle_wallet_id: string; address: string }>>()
    if (walletError) throw new Error('Internal counterparty lookup failed')
    const counterpart = counterpartMatches?.length === 1 ? counterpartMatches[0] : null
    if (!counterpart || counterpart.address.toLowerCase() !== address) continue
    const receipt = await arcReceipt(activity.txHash)
    const transfer = verifyInternalUsdcTransfer(activity, receipt)
    const activityType = counterpartyActivityType(activity, counterpart.address)
    if (!transfer || !activityType) continue
    const dedupKey = reconciledDedupKey(counterpart.circle_wallet_id, activity.blockchain, activity.txHash)
    const { data: inserted, error: insertError } = await supabase.from('wallet_activities').upsert({
      account_id: counterpart.account_id, circle_wallet_id: counterpart.circle_wallet_id, dedup_key: dedupKey,
      circle_transaction_id: null, circle_transaction_ids: [], blockchain: activity.blockchain, tx_hash: activity.txHash.toLowerCase(),
      activity_type: activityType, status: 'confirmed', circle_state: 'CONFIRMED', operation: 'TRANSFER',
      source_address: transfer.sourceAddress, destination_address: transfer.destinationAddress,
      occurred_at: activity.occurredAt, confirmed_at: activity.confirmedAt, raw_circle: [], updated_at: new Date().toISOString(),
    }, { onConflict: 'dedup_key', ignoreDuplicates: true }).select('id')
    if (insertError) throw new Error('Internal counterparty activity could not be saved')
    let activityId = inserted?.[0]?.id as string | undefined
    if (activityId) {
      const { error: legError } = await supabase.from('wallet_activity_legs').upsert({
        activity_id: activityId, leg_key: reconciledLegKey(counterpart.circle_wallet_id, activity.blockchain, activity.txHash, transfer.logIndex),
        direction: activityType === 'send' ? 'out' : 'in', amount: transfer.amount, token_id: null,
        token_address: internalTransferUsdcAddress, token_symbol: 'USDC', token_decimals: 6,
        source_address: transfer.sourceAddress, destination_address: transfer.destinationAddress, log_index: transfer.logIndex, updated_at: new Date().toISOString(),
      }, { onConflict: 'leg_key' })
      if (legError) throw new Error('Internal counterparty activity leg could not be saved')
    } else {
      const { data: existing, error: existingError } = await supabase.from('wallet_activities').select('id').eq('dedup_key', dedupKey).maybeSingle<{ id: string }>()
      if (existingError || !existing) throw new Error('Internal counterparty activity could not be loaded')
      activityId = existing.id
      const { error: confirmError } = await supabase.from('wallet_activities').update({
        status: 'confirmed', circle_state: 'CONFIRMED', tx_hash: activity.txHash.toLowerCase(),
        source_address: transfer.sourceAddress, destination_address: transfer.destinationAddress,
        confirmed_at: activity.confirmedAt, updated_at: new Date().toISOString(),
      }).eq('id', activityId).eq('account_id', counterpart.account_id).eq('circle_wallet_id', counterpart.circle_wallet_id)
      if (confirmError) throw new Error('Internal counterparty activity could not be confirmed')
    }
    const state = await notificationStatus(supabase, { activityType, txHash: activity.txHash, confirmedAt: activity.confirmedAt }, enabledAt)
    const { error: outboxError } = await supabase.from('wallet_activity_notification_outbox').upsert({
      account_id: counterpart.account_id, activity_id: activityId, channel: 'email', ...state,
    }, { onConflict: 'activity_id,channel', ignoreDuplicates: true })
    if (outboxError) throw new Error('Internal counterparty notification could not be enqueued')
    affectedAccounts.add(counterpart.account_id)
  }
  return affectedAccounts
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const sid = sessionId(req.headers.cookie)
    if (!sid) return res.status(401).json({ error: 'Arklake session is not active.' })
    const supabase = supabaseClient()
    const { data: session } = await supabase.from('arklake_sessions')
      .select('sid, account_id, circle_user_token, circle_refresh_token, circle_device_id, expires_at, revoked_at')
      .eq('sid', sid).maybeSingle<StoredSession>()
    if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) return res.status(401).json({ error: 'Arklake session is not active.' })
    const { data: wallet } = await supabase.from('arklake_wallets').select('circle_wallet_id,address')
      .eq('account_id', session.account_id).eq('blockchain', 'ARC-TESTNET').eq('account_type', 'SCA').maybeSingle<{ circle_wallet_id: string; address: string }>()
    if (!wallet) return res.status(404).json({ error: 'Arklake wallet was not found.' })

    let userToken = session.circle_user_token
    let listed = await listTransactions(wallet.circle_wallet_id, userToken)
    if (listed.response?.status === 401) {
      const refreshed = await refreshUserToken(session)
      if (!refreshed) return res.status(401).json({ error: 'Circle session could not be refreshed.' })
      userToken = refreshed.userToken
      await supabase.from('arklake_sessions').update({ circle_user_token: refreshed.userToken, circle_refresh_token: refreshed.refreshToken }).eq('sid', sid)
      listed = await listTransactions(wallet.circle_wallet_id, userToken)
    }
    if (listed.response || !listed.transactions) return res.status(502).json({ error: 'Circle transaction history could not be loaded.' })

    const tokenIds = new Set<string>()
    for (const transaction of listed.transactions) {
      const tokenId = transaction.tokenId || transaction.token?.id
      if (typeof tokenId === 'string' && tokenId.length > 0) tokenIds.add(tokenId)
    }
    const ids = [...tokenIds]
    const [lookedUpTokens, balanceTokens] = await Promise.all([tokenDetails(ids, userToken), walletTokenDetails(wallet.circle_wallet_id, userToken)])
    const tokens = new Map(lookedUpTokens)
    for (const token of balanceTokens) tokens.set(token.id, { ...tokens.get(token.id), ...token })
    const receiptLegs = await swapReceiptLegs(listed.transactions, wallet.address, tokens)
    const activities = normalizeCircleTransactions(listed.transactions, tokens, wallet.circle_wallet_id, receiptLegs)
    const emailEnabled = transactionEmailEnabled(process.env.ARKLAKE_TRANSACTION_EMAIL_ENABLED)
    const emailEnabledAt = transactionEmailActivationTime(process.env.ARKLAKE_TRANSACTION_EMAIL_ENABLED_AT)
    const emailDeliveryEnabled = emailEnabled && emailEnabledAt !== null
    if (activities.length) {
      const rows = activities.map((activity) => ({
        account_id: session.account_id, circle_wallet_id: wallet.circle_wallet_id, dedup_key: activity.dedupKey,
        circle_transaction_id: activity.circleTransactionId, circle_transaction_ids: activity.circleTransactionIds,
        blockchain: activity.blockchain, tx_hash: activity.txHash, activity_type: activity.activityType,
        status: activity.status, circle_state: activity.circleState, operation: activity.operation,
        source_address: activity.sourceAddress, destination_address: activity.destinationAddress,
        occurred_at: activity.occurredAt, confirmed_at: activity.confirmedAt, raw_circle: activity.rawCircle, updated_at: new Date().toISOString(),
      }))
      const { data: saved, error } = await supabase.from('wallet_activities').upsert(rows, { onConflict: 'dedup_key' }).select('id,dedup_key')
      if (error || !saved) throw new Error('Unable to save wallet activities')
      const activityIds = new Map(saved.map((row: { id: string; dedup_key: string }) => [row.dedup_key, row.id]))
      const legs = activities.flatMap((activity) => activity.legs.map((leg) => ({
        activity_id: activityIds.get(activity.dedupKey), leg_key: leg.legKey, direction: leg.direction, amount: leg.amount,
        token_id: leg.tokenId, token_address: leg.tokenAddress, token_symbol: leg.tokenSymbol, token_decimals: leg.tokenDecimals,
        source_address: leg.sourceAddress, destination_address: leg.destinationAddress, updated_at: new Date().toISOString(),
      })))
      const { error: legsError } = await supabase.from('wallet_activity_legs').upsert(legs, { onConflict: 'leg_key' })
      if (legsError) throw new Error('Unable to save wallet activity legs')
      const nativeActivityIds = [...activityIds.values()]
      if (nativeActivityIds.length) {
        const { error: cleanupError } = await supabase.from('wallet_activity_legs').delete().in('activity_id', nativeActivityIds).like('leg_key', 'reconciled:%')
        if (cleanupError) throw new Error('Unable to replace reconciled activity legs')
      }
      const invoicePaymentHashes = new Set<string>()
      if (emailDeliveryEnabled) {
        const hashes = activities.flatMap((activity) => activity.status === 'confirmed' && (activity.activityType === 'send' || activity.activityType === 'receive') && activity.txHash ? [activity.txHash.toLowerCase()] : [])
        if (hashes.length) {
          const { data: intents, error: intentsError } = await supabase.from('invoice_payment_intents').select('tx_hash').in('tx_hash', [...new Set(hashes)])
          if (intentsError) throw new Error('Invoice payment correlation could not be checked')
          for (const intent of intents || []) if (typeof intent.tx_hash === 'string') invoicePaymentHashes.add(intent.tx_hash.toLowerCase())
        }
      }
      const confirmedIds = emailDeliveryEnabled ? saved.flatMap((row: { id: string; dedup_key: string }) => {
        const activity = activities.find((candidate) => candidate.dedupKey === row.dedup_key)
        if (activity?.status !== 'confirmed') return []
        const historical = !activityEmailMaySend(activity.confirmedAt, emailEnabledAt)
        const invoicePayment = shouldSuppressGenericActivityEmail(activity.activityType, activity.txHash, invoicePaymentHashes)
        const suppressed = historical || invoicePayment
        return [{ account_id: session.account_id, activity_id: row.id, channel: 'email', status: suppressed ? 'suppressed' : 'pending',
          ...(suppressed ? { last_error: historical ? 'Activity predates transaction email activation' : 'Invoice payment notification is sent by the invoice email flow' } : {}) }]
      }) : []
      if (confirmedIds.length) {
        const { error: outboxError } = await supabase.from('wallet_activity_notification_outbox')
          .upsert(confirmedIds, { onConflict: 'activity_id,channel', ignoreDuplicates: true })
        if (outboxError) console.error('ARKLAKE_ACTIVITY_EMAIL_ENQUEUE_FAILED', outboxError.message)
      }
    }
    const affectedAccounts = emailDeliveryEnabled ? await reconcileInternalTransfers(supabase, session.account_id, activities, emailEnabledAt) : new Set([session.account_id])
    const notifications = emailDeliveryEnabled ? await Promise.all([...affectedAccounts].map((accountId) => deliverActivityEmails(supabase, accountId, emailEnabledAt))).then((results) => ({
      enabled: true, sent: results.reduce((sum, result) => sum + result.sent, 0), failed: results.reduce((sum, result) => sum + result.failed, 0),
    })).catch((error) => {
      console.error('ARKLAKE_ACTIVITY_EMAIL_DELIVERY_FAILED', error instanceof Error ? error.message : 'Unknown error')
      return { enabled: true, sent: 0, failed: 1 }
    }) : { enabled: false, sent: 0, failed: 0 }
    await processInvoiceEmailOutbox(supabase, session.account_id, {
      enabled: process.env.ARKLAKE_INVOICE_EMAIL_ENABLED,
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.RESEND_FROM_EMAIL,
      publicUrl: process.env.ARKLAKE_PUBLIC_URL,
    }).catch((error) => console.error('ARKLAKE_INVOICE_EMAIL_DELIVERY_FAILED', error instanceof Error ? error.message : 'Unknown error'))
    const { data: activityRows, error: activityError } = await supabase.from('wallet_activities')
      .select('id,activity_type,status,blockchain,tx_hash,source_address,destination_address,occurred_at,confirmed_at,raw_circle')
      .eq('account_id', session.account_id).order('occurred_at', { ascending: false }).limit(50)
    if (activityError || !activityRows) throw new Error('Unable to load saved wallet activities')
    const activityIds = activityRows.map((activity: { id: string }) => activity.id)
    const { data: legRows, error: legError } = activityIds.length
      ? await supabase.from('wallet_activity_legs')
        .select('activity_id,direction,amount,token_id,token_address,token_symbol,source_address,destination_address,log_index')
        .in('activity_id', activityIds).order('log_index', { ascending: true })
      : { data: [], error: null }
    if (legError || !legRows) throw new Error('Unable to load saved wallet activity legs')
    const publicActivities = activityRows.map((activity: {
      id: string; activity_type: string; status: string; blockchain: string; tx_hash: string | null
      source_address: string | null; destination_address: string | null; occurred_at: string; confirmed_at: string | null
      raw_circle: CircleTransaction[]
    }) => {
      const fee = Array.isArray(activity.raw_circle)
        ? activity.raw_circle.find((transaction) => typeof transaction.networkFee === 'string')?.networkFee || null
        : null
      return {
        id: activity.id, type: activity.activity_type, status: activity.status, blockchain: activity.blockchain,
        txHash: activity.tx_hash, sourceAddress: activity.source_address, destinationAddress: activity.destination_address,
        occurredAt: activity.occurred_at, confirmedAt: activity.confirmed_at, networkFee: fee,
        legs: legRows.filter((leg: { activity_id: string }) => leg.activity_id === activity.id).map((leg: {
          direction: string; amount: string; token_id: string | null; token_address: string | null; token_symbol: string | null
          source_address: string | null; destination_address: string | null
        }) => ({
          direction: leg.direction, amount: leg.amount, tokenId: leg.token_id, tokenAddress: leg.token_address,
          symbol: leg.token_symbol, sourceAddress: leg.source_address, destinationAddress: leg.destination_address,
        })),
      }
    })
    return res.status(200).json({ synced: activities.length, transactionsRead: listed.transactions.length, notifications, activities: publicActivities })
  } catch (error) {
    console.error('ARKLAKE_ACTIVITY_SYNC_FAILED', error instanceof Error ? error.message : 'Unknown error')
    return res.status(500).json({ error: 'Unable to sync wallet activity.' })
  }
}
