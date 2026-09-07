import { useEffect, useRef, useState, type ReactNode } from 'react'

const assets = ['USDC', 'EURC', 'cirBTC'] as const
type Asset = typeof assets[number]
type Balance = { symbol: string; amount: string }
type Quote = { output: string; minimum: string; fees: { type: string; amount: string; token: string }[]; expiresAt: number; quoteToken: string }
type Pending = { txHash?: string }
type Props = {
  wallet: { id: string; address: string } | null
  balances: Balance[]
  circleAuth: { userToken: string; encryptionKey: string } | null
  appId: string
  signingPanel: ReactNode
  refreshBalances: () => Promise<Balance[]>
}

const units = (amount: string) => {
  const [whole, fraction = ''] = amount.split('.')
  return BigInt(whole || '0') * 10n ** 18n + BigInt(fraction.padEnd(18, '0').slice(0, 18))
}
const available = (balances: Balance[], asset: Asset) => balances.find((balance) => balance.symbol.toLowerCase() === asset.toLowerCase())?.amount || '0'

export default function SwapFlow({ wallet, balances, circleAuth, appId, signingPanel, refreshBalances }: Props) {
  const [tokenIn, setTokenIn] = useState<Asset>('USDC')
  const [tokenOut, setTokenOut] = useState<Asset>('EURC')
  const [amount, setAmount] = useState('')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [reauth, setReauth] = useState(false)
  const storageKey = `arklake_pending_swap_${wallet?.id || ''}`
  const [pending, setPending] = useState<Pending | null>(() => {
    try { return JSON.parse(window.sessionStorage.getItem(storageKey) || 'null') } catch { return null }
  })
  const [txHash, setTxHash] = useState(pending?.txHash || '')
  const running = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useEffect(() => { setReauth(false) }, [circleAuth])
  const remember = (value: Pending | null) => {
    setPending(value)
    if (value) window.sessionStorage.setItem(storageKey, JSON.stringify(value))
    else window.sessionStorage.removeItem(storageKey)
  }
  const request = (body: object) => fetch('/api/circle/swap', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, walletId: wallet?.id, walletAddress: wallet?.address, userToken: circleAuth?.userToken }),
  })
  const resetQuote = () => { setQuote(null); setError(''); setMessage(''); setTxHash('') }
  const getQuote = async () => {
    if (running.current || pending) return
    resetQuote()
    if (tokenIn === tokenOut || !/^(0|[1-9]\d{0,20})(\.\d{1,18})?$/.test(amount) || units(amount) <= 0n) return setError('Choose different assets and enter a valid positive amount.')
    if (units(amount) > units(available(balances, tokenIn))) return setError('Amount exceeds your available balance.')
    running.current = true
    setBusy(true)
    try {
      const response = await request({ action: 'quote', tokenIn, tokenOut, amount })
      const data = await response.json()
      if (!response.ok) throw new Error('Quote unavailable for this amount. Try a smaller amount.')
      setQuote(data)
    } catch (error) { setError(error instanceof Error ? error.message : 'Quote service is unavailable.') }
    finally { running.current = false; setBusy(false) }
  }
  useEffect(() => {
    if (!quote || pending) return
    const timer = window.setTimeout(() => { void getQuote() }, Math.max(0, quote.expiresAt - Date.now()))
    return () => window.clearTimeout(timer)
  }, [quote?.expiresAt, pending])
  const finish = async (before?: Balance[]) => {
    remember(null)
    setQuote(null)
    setAmount('')
    setError('')
    setMessage('Swap confirmed on-chain. Refreshing balances…')
    try {
      for (let attempt = 0; attempt < 10; attempt++) {
        const next = await refreshBalances()
        if (!before || (units(available(next, tokenIn)) < units(available(before, tokenIn)) && units(available(next, tokenOut)) > units(available(before, tokenOut)))) {
          setMessage('Swap confirmed on-chain. Balances refreshed.')
          return
        }
        await new Promise((resolve) => window.setTimeout(resolve, 3000))
      }
      setMessage('Swap confirmed on-chain. Balance indexing is still catching up; refresh balances shortly.')
    } catch { setMessage('Swap confirmed on-chain. Balance refresh is temporarily unavailable.') }
  }
  const checkStatus = async () => {
    if (!pending?.txHash || running.current) return
    running.current = true
    setBusy(true)
    setError('')
    try {
      const response = await request({ action: 'status', txHash: pending.txHash })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Status is unavailable.')
      if (data.confirmed) await finish()
      else if (data.failed) { remember(null); setQuote(null); setError('Swap failed on-chain. Review the transaction before getting a new quote.') }
      else setMessage('Swap confirmation is still pending. Do not submit another swap.')
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to check swap status.') }
    finally { running.current = false; setBusy(false) }
  }
  const execute = async () => {
    if (!quote || pending || running.current || !appId) return
    if (!circleAuth) {
      setError('')
      setReauth(true)
      return
    }
    if (Date.now() >= quote.expiresAt) { setQuote(null); return setError('Quote expired. Get a new quote.') }
    running.current = true
    setBusy(true)
    setError('')
    setMessage('Preparing swap. Keep this page open through approval and confirmation.')
    let terminal = false
    try {
      // Persist uncertainty before submission. Never automatically replay an interrupted execution.
      remember({})
      const response = await request({ action: 'execute', quoteToken: quote.quoteToken })
      if (!response.ok) {
        const data = await response.json()
        remember(null)
        throw new Error(data.error || 'Unable to prepare swap.')
      }
      if (!response.body) throw new Error('Swap connection interrupted. Check wallet activity before retrying.')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const { W3SSdk } = await import('@circle-fin/w3s-pw-web-sdk')
      const sdk = new W3SSdk({ appSettings: { appId } })
      sdk.setAuthentication(circleAuth)
      const seen = new Set<string>()
      while (true) {
        const { done, value } = await reader.read()
        buffer += decoder.decode(value, { stream: !done })
        let boundary: number
        while ((boundary = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 1)
          if (!line.trim()) continue
          const event = JSON.parse(line)
          if (event.type === 'challenge' && !seen.has(event.challengeId)) {
            if (!mounted.current) throw new Error('Swap page was closed. Check wallet activity before retrying.')
            seen.add(event.challengeId)
            setMessage('Approve the swap in Circle. Approval alone does not confirm the transaction.')
            await new Promise<void>((resolve) => sdk.execute(event.challengeId, (error, result) => {
              if (error || result?.status !== 'COMPLETE') setError('Circle approval did not complete. Waiting for the transaction outcome.')
              else setMessage('Approval completed. Waiting for on-chain swap confirmation…')
              resolve()
            }))
          } else if (event.type === 'submitted') {
            setTxHash(event.txHash)
            remember({ txHash: event.txHash })
            setMessage('Swap submitted. Verifying on-chain confirmation…')
          } else if (event.type === 'confirmed') {
            terminal = true
            await finish(balances)
          } else if (event.type === 'failed') {
            terminal = true
            remember(null)
            setQuote(null)
            setError(event.message)
          } else if (event.type === 'error') {
            if (!event.uncertain) remember(null)
            throw new Error(event.message)
          } else if (event.type === 'pending') {
            terminal = true
            setMessage(event.message)
            for (let attempt = 0; attempt < 10; attempt++) {
              await new Promise((resolve) => window.setTimeout(resolve, 3000))
              const response = await request({ action: 'status', txHash: event.txHash })
              if (!response.ok) break
              const status = await response.json()
              if (status.confirmed) { await finish(balances); break }
              if (status.failed) { remember(null); setError('Swap failed on-chain. Review the transaction before retrying.'); break }
            }
          }
        }
        if (done) break
      }
      if (!terminal) throw new Error('Connection ended before swap confirmation. Check wallet activity before retrying.')
    } catch (error) { setError(error instanceof Error ? error.message : 'Swap outcome is unknown. Check wallet activity.') }
    finally { running.current = false; setBusy(false); setQuote(null) }
  }
  const button = 'rounded-full bg-arklake-ink px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50'
  const field = 'mt-2 w-full rounded-2xl border border-lake-border bg-surface px-4 py-3 text-arklake-ink'
  const rate = quote && Number(amount) > 0 ? (Number(quote.output) / Number(amount)).toLocaleString(undefined, { maximumSignificantDigits: 8 }) : ''
  const feesByToken = quote?.fees.reduce<Record<string, number>>((totals, item) => {
    totals[item.token] = (totals[item.token] || 0) + Number(item.amount)
    return totals
  }, {}) || {}
  const fee = Object.entries(feesByToken).length
    ? Object.entries(feesByToken).map(([token, total]) => `${total.toLocaleString(undefined, { maximumSignificantDigits: 6 })} ${token}`).join(' + ')
    : 'None'
  return <section className="rounded-[2rem] border border-lake-border bg-surface p-6 shadow-sm">
    <h2 className="text-xl font-semibold text-arklake-ink">Swap assets</h2>
    {reauth ? signingPanel : null}
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <label>From<select className={field} value={tokenIn} disabled={busy || Boolean(pending)} onChange={(event) => { setTokenIn(event.target.value as Asset); resetQuote() }}>{assets.map((asset) => <option key={asset}>{asset}</option>)}</select></label>
      <label>To<select className={field} value={tokenOut} disabled={busy || Boolean(pending)} onChange={(event) => { setTokenOut(event.target.value as Asset); resetQuote() }}>{assets.map((asset) => <option key={asset}>{asset}</option>)}</select></label>
    </div>
    <label className="mt-4 block">Amount<input className={field} inputMode="decimal" value={amount} disabled={busy || Boolean(pending)} onChange={(event) => { setAmount(event.target.value); resetQuote() }} placeholder="0.00" /></label>
    {quote ? <div className="mt-5 rounded-2xl bg-aqua-mist/60 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate">Pay</p><p className="mt-1 text-xl font-semibold text-arklake-ink">{amount} {tokenIn}</p></div>
        <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate">Receive</p><p className="mt-1 text-xl font-semibold text-arklake-ink">{quote.output} {tokenOut}</p></div>
      </div>
      <div className="mt-4 grid gap-1.5 border-t border-lake-border/70 pt-3 text-sm text-slate">
        <p>Rate: 1 {tokenIn} = {rate} {tokenOut}</p>
        <p>Minimum: {quote.minimum} {tokenOut}</p>
        <p>Estimated fee: {fee}</p>
      </div>
    </div> : null}
    <div className="mt-5 flex flex-wrap gap-3">
      <button className={button} disabled={busy || Boolean(pending) || !wallet || reauth || Boolean(quote && !appId)} onClick={quote ? execute : getQuote}>{busy ? 'Working…' : quote ? 'Swap' : 'Review swap'}</button>
      {pending?.txHash ? <button className={button} disabled={busy || !circleAuth} onClick={checkStatus}>Check confirmation</button> : null}
    </div>
    {pending && !busy && !pending.txHash ? <div className="mt-4 text-sm text-slate"><p>Previous swap outcome is unknown. Check wallet activity and any pending Circle approval before starting another swap.</p><a className="mt-2 block text-arklake-aqua" href={`https://testnet.arcscan.app/address/${wallet?.address}`} target="_blank" rel="noreferrer">View wallet activity</a><button className={`${button} mt-3`} onClick={() => { remember(null); setMessage(''); setError('') }}>I checked wallet activity</button></div> : null}
    {txHash ? <a className="mt-4 block break-all text-sm text-arklake-aqua" href={`https://testnet.arcscan.app/tx/${txHash}`} target="_blank" rel="noreferrer">View swap transaction: {txHash}</a> : null}
    {message ? <p role="status" className="mt-4 text-sm text-arklake-ink">{message}</p> : null}
    {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
  </section>
}
