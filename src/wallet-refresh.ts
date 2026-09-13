export type BoundedPollResult = 'found' | 'timeout' | 'hidden' | 'cancelled'

type RefreshActivity = {
  id: string
  type: string
  status: string
}

export function hasNewConfirmedReceive(previous: RefreshActivity[], next: RefreshActivity[]) {
  const previouslyConfirmedReceiveIds = new Set(
    previous
      .filter((activity) => activity.type === 'receive' && activity.status === 'confirmed')
      .map((activity) => activity.id),
  )

  return next.some((activity) => (
    activity.type === 'receive'
    && activity.status === 'confirmed'
    && !previouslyConfirmedReceiveIds.has(activity.id)
  ))
}

export async function runBoundedVisiblePoll(options: {
  check: () => Promise<boolean>
  isVisible: () => boolean
  intervalMs: number
  timeoutMs: number
  signal?: AbortSignal
  wait?: (delayMs: number) => Promise<void>
}): Promise<BoundedPollResult> {
  const startedAt = Date.now()
  const wait = options.wait || ((delayMs: number) => new Promise<void>((resolve) => window.setTimeout(resolve, delayMs)))

  while (Date.now() - startedAt < options.timeoutMs) {
    if (options.signal?.aborted) return 'cancelled'
    if (!options.isVisible()) return 'hidden'
    if (await options.check()) return 'found'
    if (options.signal?.aborted) return 'cancelled'
    await wait(options.intervalMs)
  }

  return 'timeout'
}
