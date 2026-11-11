import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useReducedMotion } from './useReducedMotion'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** A `matchMedia` whose answer a test can change and announce. */
function stubMedia(initial: boolean) {
  let matches = initial
  const listeners = new Set<() => void>()
  const queries: string[] = []
  vi.stubGlobal('matchMedia', (query: string) => {
    queries.push(query)
    return {
      get matches() {
        return matches
      },
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    }
  })
  return {
    queries,
    listeners,
    set(next: boolean) {
      matches = next
      listeners.forEach((listener) => {
        listener()
      })
    },
  }
}

describe('useReducedMotion (RES-53)', () => {
  it('asks for the reduced-motion setting and answers true when it is on', () => {
    const media = stubMedia(true)

    const { result } = renderHook(() => useReducedMotion())

    expect(result.current).toBe(true)
    expect(media.queries).toContain('(prefers-reduced-motion: reduce)')
  })

  it('answers false when the setting is off', () => {
    stubMedia(false)

    const { result } = renderHook(() => useReducedMotion())

    expect(result.current).toBe(false)
  })

  it('follows a change of the setting while the page is open', () => {
    const media = stubMedia(false)
    const { result } = renderHook(() => useReducedMotion())

    act(() => {
      media.set(true)
    })

    expect(result.current).toBe(true)
  })

  it('stops listening when the page goes', () => {
    const media = stubMedia(false)
    const { unmount } = renderHook(() => useReducedMotion())
    expect(media.listeners.size).toBe(1)

    unmount()

    expect(media.listeners.size).toBe(0)
  })

  it('answers false when the browser has no matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined)

    const { result } = renderHook(() => useReducedMotion())

    expect(result.current).toBe(false)
  })
})
