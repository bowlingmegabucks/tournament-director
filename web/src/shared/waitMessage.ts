const SECONDS_PER_MINUTE = 60

/** What to tell someone a rate limit turned away, from the `Retry-After` header (seconds). */
export function waitMessage(retryAfter: string | null): string {
  const seconds = Number(retryAfter)
  if (!retryAfter || !Number.isFinite(seconds) || seconds <= 0) {
    return 'Too many attempts. Try again later.'
  }
  const minutes = Math.ceil(seconds / SECONDS_PER_MINUTE)
  return `Too many attempts. Wait ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} and try again.`
}
