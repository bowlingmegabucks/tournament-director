import { afterEach, beforeEach, vi } from 'vitest'

/** Fake only `Date`, so MSW and Testing Library timers keep working. Call inside `describe`. */
export function useFixedToday(year: number, monthIndex: number, day: number) {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(year, monthIndex, day, 12))
  })
  afterEach(() => {
    vi.useRealTimers()
  })
}
