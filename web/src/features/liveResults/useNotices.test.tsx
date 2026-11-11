import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NOTICE_MS, useNotices } from './useNotices'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useNotices (RES-51, D-245)', () => {
  it('shows nothing until a message is pushed, and runs no timer meanwhile', () => {
    const { result } = renderHook(() => useNotices())
    expect(result.current.current).toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('shows one message at a time, each for its time, in order', () => {
    const { result } = renderHook(() => useNotices())

    act(() => {
      result.current.push('Open Division – Game 3 complete')
      result.current.push('Sweeper – Game 2 complete')
    })
    expect(result.current.current).toBe('Open Division – Game 3 complete')

    act(() => {
      vi.advanceTimersByTime(NOTICE_MS - 1)
    })
    expect(result.current.current).toBe('Open Division – Game 3 complete')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current.current).toBe('Sweeper – Game 2 complete')

    act(() => {
      vi.advanceTimersByTime(NOTICE_MS)
    })
    expect(result.current.current).toBeUndefined()
  })

  it('lasts about 5 seconds by default', () => {
    expect(NOTICE_MS).toBe(5000)
  })

  it('does not restart the message showing when another arrives', () => {
    const { result } = renderHook(() => useNotices())
    act(() => {
      result.current.push('first')
    })
    act(() => {
      vi.advanceTimersByTime(3000)
    })

    act(() => {
      result.current.push('second')
    })
    act(() => {
      vi.advanceTimersByTime(NOTICE_MS - 3000)
    })

    // The first message had its full time from its own start, so the second now shows.
    expect(result.current.current).toBe('second')
  })

  it('carries the announcement of the message showing, and counts the ones waiting', () => {
    const { result } = renderHook(() => useNotices())
    const lower = {
      variant: 'game',
      kicker: 'Game 1 complete',
      title: 'Open Division',
      game: 1,
    } as const
    const last = {
      variant: 'last',
      kicker: 'Final game complete',
      title: 'Sweeper',
      game: 3,
    } as const

    act(() => {
      result.current.push('one', lower)
      result.current.push('two', last)
      result.current.push('three')
    })

    expect(result.current.announcement).toEqual(lower)
    expect(result.current.waiting).toBe(2)
    const firstId = result.current.id

    act(() => {
      vi.advanceTimersByTime(NOTICE_MS)
    })
    expect(result.current.announcement).toEqual(last)
    expect(result.current.waiting).toBe(1)
    expect(result.current.id).not.toBe(firstId)

    act(() => {
      vi.advanceTimersByTime(NOTICE_MS)
    })
    expect(result.current.current).toBe('three')
    expect(result.current.announcement).toBeUndefined()
    expect(result.current.waiting).toBe(0)
  })

  it('gives two equal messages in a row each their time', () => {
    const { result } = renderHook(() => useNotices(1000))
    act(() => {
      result.current.push('same')
      result.current.push('same')
    })

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.current).toBe('same')

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.current).toBeUndefined()
  })

  it('drops the oldest waiting messages past a dozen, so the strip never runs far behind', () => {
    const { result } = renderHook(() => useNotices(1000))
    act(() => {
      for (let n = 1; n <= 15; n += 1) result.current.push(`message ${n}`)
    })
    const seen: (string | undefined)[] = []
    for (let n = 0; n < 12; n += 1) {
      seen.push(result.current.current)
      act(() => {
        vi.advanceTimersByTime(1000)
      })
    }

    expect(seen[0]).toBe('message 4')
    expect(seen.at(-1)).toBe('message 15')
    expect(result.current.current).toBeUndefined()
  })

  it('leaves no timer behind when the page goes', () => {
    const { result, unmount } = renderHook(() => useNotices())
    act(() => {
      result.current.push('x')
    })

    unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})
