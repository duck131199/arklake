export type BoundedPollResult = 'found' | 'timeout' | 'hidden' | 'cancelled'

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
