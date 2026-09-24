import { useEffect, useRef, useState } from 'react'
import type { W3SSdk as CircleW3SSdk } from '@circle-fin/w3s-pw-web-sdk'

type CircleAuth = { userToken: string; encryptionKey: string }

type PendingChallenge = {
  challengeId: string
  sequence: number
  type: 'CIRCLE_TYPED_DATA'
  circleChallengeId: string
}

type ExecutionResponse = {
  ok?: boolean
  operation?: { operationId: string; status: string }
  challenge?: PendingChallenge | null
  error?: { code?: string }
}

type Props = {
  operationId: string
  circleAuth: CircleAuth | null
  appId: string
  signingPanel: React.ReactNode
}

const endpoint = '/api/circle/gateway-move-execution'
const signaturePattern = /^0x[0-9a-fA-F]{130}$/
// Circle's SDK has its own handshake timeout, but its singleton can retain the
// handshake flag across authentication flows. Keep an independent upper bound
// for the user confirmation without retrying or recording a durable response.
const CIRCLE_EXECUTION_TIMEOUT_MS = 120_000

type CircleSdkConstructor = {
  new (configs?: { appSettings: { appId: string } }): CircleW3SSdk
  instance: CircleW3SSdk | null
}

function resetCircleSdk(W3SSdk: CircleSdkConstructor) {
  document.getElementById('sdkIframe')?.remove()
  W3SSdk.instance = null
}

export default function GatewayChallengeBridge({ operationId, circleAuth, appId, signingPanel }: Props) {
  const sdkRef = useRef<CircleW3SSdk | null>(null)
  const sdkConstructorRef = useRef<CircleSdkConstructor | null>(null)
  const mountedRef = useRef(true)
  const executingRef = useRef<string | null>(null)
  const [operationStatus, setOperationStatus] = useState<string | null>(null)
  const [challenge, setChallenge] = useState<PendingChallenge | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'executing' | 'recording' | 'done' | 'error'>('loading')
  const [message, setMessage] = useState('')

  const refresh = async () => {
    const response = await fetch(`${endpoint}?operationId=${encodeURIComponent(operationId)}`, {
      credentials: 'include',
      cache: 'no-store',
    })
    const data = await response.json().catch(() => null) as ExecutionResponse | null
    if (!response.ok || !data?.ok || !data.operation) throw new Error(data?.error?.code || 'Unable to load Gateway confirmation.')
    if (data.operation.operationId !== operationId) throw new Error('Gateway operation correlation failed.')
    if (data.challenge && data.challenge.type !== 'CIRCLE_TYPED_DATA') throw new Error('Unsupported Gateway challenge type.')
    if (!mountedRef.current) return
    setOperationStatus(data.operation.status)
    setChallenge(data.challenge || null)
    setState((current) => current === 'executing' || current === 'recording' ? current : data.challenge ? 'ready' : 'done')
    setMessage('')
  }

  useEffect(() => {
    mountedRef.current = true
    void refresh().catch((error) => {
      if (!mountedRef.current) return
      setState('error')
      setMessage(error instanceof Error ? error.message : 'Unable to load Gateway confirmation.')
    })
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !executingRef.current) void refresh().catch(() => undefined)
    }, 3000)
    return () => {
      mountedRef.current = false
      window.clearInterval(interval)
    }
  }, [operationId])

  useEffect(() => {
    if (!circleAuth || !appId) {
      sdkRef.current = null
      return
    }
    let cancelled = false
    void import('@circle-fin/w3s-pw-web-sdk').then(({ W3SSdk }) => {
      if (cancelled) return
      const FreshW3SSdk = W3SSdk as unknown as CircleSdkConstructor
      resetCircleSdk(FreshW3SSdk)
      const sdk = new FreshW3SSdk({ appSettings: { appId } })
      sdk.setAuthentication(circleAuth)
      sdkConstructorRef.current = FreshW3SSdk
      sdkRef.current = sdk
    }).catch(() => {
      if (!cancelled) {
        setState('error')
        setMessage('Circle confirmation could not be initialized.')
      }
    })
    return () => {
      cancelled = true
      sdkRef.current = null
      sdkConstructorRef.current = null
    }
  }, [appId, circleAuth])

  const submitResponse = async (pending: PendingChallenge, status: 'APPROVED' | 'REJECTED', signature?: string) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operationId,
        challengeId: pending.challengeId,
        sequence: pending.sequence,
        status,
        ...(signature ? { signature } : {}),
      }),
    })
    const data = await response.json().catch(() => null) as { ok?: boolean; error?: { code?: string } } | null
    if (!response.ok || !data?.ok) throw new Error(data?.error?.code || 'Gateway confirmation response was not saved.')
  }

  const execute = async () => {
    if (!challenge || challenge.type !== 'CIRCLE_TYPED_DATA' || !sdkRef.current || executingRef.current) return
    const pending = challenge
    executingRef.current = pending.challengeId
    setState('executing')
    setMessage('')
    try {
      const signature = await new Promise<string>((resolve, reject) => {
        const sdk = sdkRef.current
        if (!sdk) return reject(new Error('Circle confirmation is not ready.'))
        let settled = false
        const timeout = window.setTimeout(() => {
          if (settled) return
          settled = true
          const constructor = sdkConstructorRef.current
          if (constructor) resetCircleSdk(constructor)
          sdkRef.current = null
          reject(new Error('Circle confirmation timed out. Please reload and retry safely.'))
        }, CIRCLE_EXECUTION_TIMEOUT_MS)
        sdk.execute(pending.circleChallengeId, (error, result) => {
          if (settled) return
          settled = true
          window.clearTimeout(timeout)
          if (error) return reject(new Error(error.message || 'Circle confirmation was cancelled.'))
          if (result?.status !== 'COMPLETE') return reject(new Error('Circle confirmation did not complete.'))
          const value = (result as { data?: { signature?: unknown } }).data?.signature
          if (typeof value !== 'string' || !signaturePattern.test(value)) return reject(new Error('Circle did not return a valid signature.'))
          resolve(value)
        })
      })
      setState('recording')
      await submitResponse(pending, 'APPROVED', signature)
      setChallenge(null)
      setState('done')
    } catch (error) {
      setState('error')
      setMessage(error instanceof Error ? error.message : 'Circle confirmation failed.')
    } finally {
      executingRef.current = null
    }
  }

  const reject = async () => {
    if (!challenge || executingRef.current) return
    const pending = challenge
    executingRef.current = pending.challengeId
    setState('recording')
    setMessage('')
    try {
      await submitResponse(pending, 'REJECTED')
      setChallenge(null)
      setState('done')
    } catch (error) {
      setState('error')
      setMessage(error instanceof Error ? error.message : 'Gateway rejection could not be saved.')
    } finally {
      executingRef.current = null
    }
  }

  if (state === 'loading') {
    return <section className="rounded-[2rem] border border-lake-border bg-surface p-6 shadow-sm sm:p-8"><p className="text-sm font-semibold text-slate">Loading confirmation…</p></section>
  }

  if (state === 'error') {
    return (
      <section className="rounded-[2rem] border border-lake-border bg-surface p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">Gateway Move</p>
        <h2 className="mt-3 text-2xl font-semibold text-arklake-ink">Confirm wallet authorization</h2>
        {operationStatus ? <p className="mt-2 text-sm leading-6 text-slate">Operation status: {operationStatus}</p> : null}
        <p className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{message || 'Unable to load Gateway confirmation.'}</p>
      </section>
    )
  }

  if (!circleAuth) return <>{signingPanel}</>

  return (
    <section className="rounded-[2rem] border border-lake-border bg-surface p-6 shadow-sm sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate">Gateway Move</p>
      <h2 className="mt-3 text-2xl font-semibold text-arklake-ink">Confirm wallet authorization</h2>
      {operationStatus ? <p className="mt-2 text-sm leading-6 text-slate">Operation status: {operationStatus}</p> : null}

      {challenge && state !== 'done' ? (
        <div className="mt-6 rounded-2xl border border-lake-border bg-lake-canvas p-5">
          <p className="text-sm font-semibold text-arklake-ink">Circle authorization {challenge.sequence}</p>
          <p className="mt-2 text-sm leading-6 text-slate">Review the Circle confirmation before continuing.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" className="rounded-full bg-arklake-ink px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50" disabled={!sdkRef.current || state === 'executing' || state === 'recording'} onClick={() => void execute()}>
              {state === 'executing' ? 'Waiting for Circle…' : state === 'recording' ? 'Saving…' : 'Review and sign'}
            </button>
            <button type="button" className="rounded-full border border-lake-border bg-surface px-5 py-2.5 text-sm font-semibold text-arklake-ink disabled:opacity-50" disabled={state === 'executing' || state === 'recording'} onClick={() => void reject()}>
              Reject
            </button>
          </div>
        </div>
      ) : null}
      {state === 'done' ? <p className="mt-6 rounded-2xl border border-aqua-mist bg-aqua-mist p-4 text-sm font-semibold text-arklake-ink">No wallet authorization is waiting. This page will continue checking safely.</p> : null}
      {message ? <p className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{message}</p> : null}
    </section>
  )
}
