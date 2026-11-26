import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useScrollSpeed } from './useScrollSpeed'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

const speedNow = () => renderHook(() => useScrollSpeed()).result.current[0]

describe('useScrollSpeed (RES-63)', () => {
  it('starts at normal speed', () => {
    expect(speedNow()).toBe(1)
  })

  it('keeps the chosen speed for the next visit', () => {
    const { result } = renderHook(() => useScrollSpeed())

    act(() => {
      result.current[1](1.75)
    })

    expect(result.current[0]).toBe(1.75)
    expect(speedNow()).toBe(1.75)
  })

  it.each([
    ['1', 1],
    ['2', 2],
    ['0.75', 1],
    ['2.25', 1],
    ['fast', 1],
  ])('reads a stored %s as %d', (stored, speed) => {
    localStorage.setItem('tv-scroll-speed', stored)

    expect(speedNow()).toBe(speed)
  })

  it('still changes speed when the browser refuses storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useScrollSpeed())

    act(() => {
      result.current[1](2)
    })

    expect(result.current[0]).toBe(2)
  })
})
