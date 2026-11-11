import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWakeLock } from './useWakeLock'

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'wakeLock')
})

function install(request: () => Promise<{ release: () => Promise<void> }>) {
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
}

describe('useWakeLock (RES-52, D-246)', () => {
  it('asks the browser to keep the screen awake, and lets go when the page goes', async () => {
    const release = vi.fn(() => Promise.resolve())
    const request = vi.fn(() => Promise.resolve({ release }))
    install(request)

    const { unmount } = renderHook(() => useWakeLock())
    await vi.waitFor(() => {
      expect(request).toHaveBeenCalledWith('screen')
    })
    unmount()

    await vi.waitFor(() => {
      expect(release).toHaveBeenCalled()
    })
  })

  it('asks again when the tab becomes visible, since the browser lets go of a hidden tab', async () => {
    const request = vi.fn(() => Promise.resolve({ release: () => Promise.resolve() }))
    install(request)
    renderHook(() => useWakeLock())
    await vi.waitFor(() => {
      expect(request).toHaveBeenCalledTimes(1)
    })

    document.dispatchEvent(new Event('visibilitychange'))

    await vi.waitFor(() => {
      expect(request).toHaveBeenCalledTimes(2)
    })
  })

  it('does not ask while the tab is hidden', async () => {
    const request = vi.fn(() => Promise.resolve({ release: () => Promise.resolve() }))
    install(request)
    renderHook(() => useWakeLock())
    await vi.waitFor(() => {
      expect(request).toHaveBeenCalledTimes(1)
    })
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')

    document.dispatchEvent(new Event('visibilitychange'))

    expect(request).toHaveBeenCalledTimes(1)
    vi.restoreAllMocks()
  })

  it('does nothing in a browser without the feature', () => {
    expect(() => renderHook(() => useWakeLock())).not.toThrow()
  })

  it('carries on when the browser refuses', async () => {
    const request = vi.fn(() => Promise.reject(new Error('NotAllowedError')))
    install(request)

    const { unmount } = renderHook(() => useWakeLock())
    await vi.waitFor(() => {
      expect(request).toHaveBeenCalled()
    })

    expect(() => {
      unmount()
    }).not.toThrow()
  })

  it('lets go of a lock that arrives after the page has gone', async () => {
    const release = vi.fn(() => Promise.resolve())
    let arrive: (lock: { release: typeof release }) => void = () => undefined
    install(
      () =>
        new Promise((resolve) => {
          arrive = resolve
        }),
    )
    const { unmount } = renderHook(() => useWakeLock())
    unmount()

    arrive({ release })

    await vi.waitFor(() => {
      expect(release).toHaveBeenCalled()
    })
  })
})
