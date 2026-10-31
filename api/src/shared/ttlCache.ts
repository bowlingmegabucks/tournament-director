interface Slot<T> {
  expires: number
  value: Promise<T>
}

/** The most keys a cache holds. Past it the cache starts over, so a long run cannot grow it without limit. */
export const MAX_CACHED = 500

/**
 * Keep the answer of `load` for `ttlMs` for each key, and share one in-flight call between callers.
 * A failed call leaves nothing behind, so the next caller tries again. A public page that polls
 * every few seconds then costs one database pass per window, not one per viewer.
 */
export function createTtlCache<T>(ttlMs: number, now: () => number = Date.now) {
  const slots = new Map<string, Slot<T>>()

  return function cached(key: string, load: () => Promise<T>): Promise<T> {
    const found = slots.get(key)
    if (found && found.expires > now()) return found.value

    if (slots.size >= MAX_CACHED) slots.clear()
    const value = load()
    slots.set(key, { expires: now() + ttlMs, value })
    value.catch(() => {
      if (slots.get(key)?.value === value) slots.delete(key)
    })
    return value
  }
}
