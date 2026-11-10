import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLaneRange } from './useLaneRange'

beforeEach(() => {
  localStorage.clear()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('useLaneRange (D-230)', () => {
  it('starts with every lane', () => {
    const { result } = renderHook(() => useLaneRange('s1'))
    expect(result.current[0]).toEqual({ from: '', to: '' })
  })

  it('keeps the range on this device under the session id', () => {
    const { result } = renderHook(() => useLaneRange('s1'))

    act(() => {
      result.current[1]({ from: '5', to: '8' })
    })

    expect(result.current[0]).toEqual({ from: '5', to: '8' })
    expect(localStorage.getItem('scoreEntryLanes:s1')).toBe('{"from":"5","to":"8"}')
    expect(localStorage.getItem('scoreEntryLanes:s2')).toBeNull()
  })

  it('starts the next visit where the last one stopped', () => {
    localStorage.setItem('scoreEntryLanes:s1', '{"from":"3","to":"6"}')
    const { result } = renderHook(() => useLaneRange('s1'))
    expect(result.current[0]).toEqual({ from: '3', to: '6' })
  })

  it.each(['not json', 'null', '7', '{"from":3,"to":"6"}', '{"from":"3"}', '{"to":"6"}', '[]'])(
    'starts with every lane when storage holds %s',
    (stored) => {
      localStorage.setItem('scoreEntryLanes:s1', stored)
      const { result } = renderHook(() => useLaneRange('s1'))
      expect(result.current[0]).toEqual({ from: '', to: '' })
    },
  )

  it('uses the saved range of another session when the page moves to it', () => {
    localStorage.setItem('scoreEntryLanes:s1', '{"from":"1","to":"2"}')
    localStorage.setItem('scoreEntryLanes:s2', '{"from":"7","to":"8"}')
    const { result, rerender } = renderHook(({ id }) => useLaneRange(id), {
      initialProps: { id: 's1' },
    })
    expect(result.current[0]).toEqual({ from: '1', to: '2' })

    rerender({ id: 's2' })

    expect(result.current[0]).toEqual({ from: '7', to: '8' })
  })

  it('still works when storage is off', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('off')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('off')
    })
    const { result } = renderHook(() => useLaneRange('s1'))
    expect(result.current[0]).toEqual({ from: '', to: '' })

    act(() => {
      result.current[1]({ from: '1', to: '4' })
    })

    expect(result.current[0]).toEqual({ from: '1', to: '4' })
  })
})
