import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTheme } from './useTheme'

const storageKey = 'tournament-director-theme'

/** A fake media query list the test can flip between light and dark. */
function fakeSystemQuery(isDark: boolean) {
  const target = new EventTarget()
  const query = Object.assign(target, { matches: isDark })
  function setDark(next: boolean) {
    query.matches = next
    const change = new Event('change') as Event & { matches: boolean }
    Object.defineProperty(change, 'matches', { value: next })
    target.dispatchEvent(change)
  }
  return { query, setDark }
}

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.removeItem(storageKey)
    document.documentElement.dataset.theme = 'system'
  })

  afterEach(() => {
    localStorage.removeItem(storageKey)
    document.documentElement.dataset.theme = 'system'
    vi.unstubAllGlobals()
  })

  it('follows the system theme and updates when it changes', () => {
    const system = fakeSystemQuery(false)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => system.query),
    )

    const { result } = renderHook(() => useTheme())
    expect(result.current.isDark).toBe(false)

    act(() => system.setDark(true))
    expect(result.current.isDark).toBe(true)
  })

  it('toggles from the system theme and saves the choice', () => {
    const system = fakeSystemQuery(true)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => system.query),
    )

    const { result } = renderHook(() => useTheme())
    act(() => result.current.toggleTheme())

    expect(result.current.isDark).toBe(false)
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem(storageKey)).toBe('light')
  })

  it('ignores system changes once the user has picked a theme', () => {
    const system = fakeSystemQuery(false)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => system.query),
    )

    const { result } = renderHook(() => useTheme())
    act(() => result.current.toggleTheme())
    expect(result.current.isDark).toBe(true)

    act(() => system.setDark(false))
    expect(result.current.isDark).toBe(true)
  })

  it('stays usable when matchMedia is not available', () => {
    vi.stubGlobal('matchMedia', undefined)

    const { result } = renderHook(() => useTheme())
    expect(result.current.isDark).toBe(false)

    act(() => result.current.toggleTheme())
    expect(result.current.isDark).toBe(true)
  })

  it('asks the browser for the dark-mode query', () => {
    const system = fakeSystemQuery(false)
    const matchMedia = vi.fn(() => system.query)
    vi.stubGlobal('matchMedia', matchMedia)

    renderHook(() => useTheme())

    expect(matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)')
  })

  it('stops listening for system changes when it unmounts', () => {
    const system = fakeSystemQuery(false)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => system.query),
    )
    const removeListener = vi.spyOn(system.query, 'removeEventListener')

    const { unmount } = renderHook(() => useTheme())
    unmount()

    expect(removeListener).toHaveBeenCalledWith('change', expect.any(Function))
  })
})
