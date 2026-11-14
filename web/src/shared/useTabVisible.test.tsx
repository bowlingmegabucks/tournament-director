import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTabVisible } from './useTabVisible'

function showTab(state: 'visible' | 'hidden') {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state)
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useTabVisible', () => {
  it('is true while the tab is in front', () => {
    expect(renderHook(() => useTabVisible()).result.current).toBe(true)
  })

  it('turns false when the tab is hidden and true again on return', () => {
    const { result } = renderHook(() => useTabVisible())

    showTab('hidden')
    expect(result.current).toBe(false)

    showTab('visible')
    expect(result.current).toBe(true)
  })

  it('stops listening after it unmounts', () => {
    const remove = vi.spyOn(document, 'removeEventListener')
    renderHook(() => useTabVisible()).unmount()

    expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
  })
})
