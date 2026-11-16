import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useCheckInPrint } from './useCheckInPrint'

let print: ReturnType<typeof vi.fn>

beforeEach(() => {
  print = vi.fn()
  vi.stubGlobal('print', print)
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete document.body.dataset.checkinPrinting
})

describe('useCheckInPrint (LAN-23)', () => {
  it('prints nothing until asked', () => {
    const { result } = renderHook(() => useCheckInPrint())

    expect(result.current.order).toBeUndefined()
    expect(print).not.toHaveBeenCalled()
  })

  it('puts the chosen order on the page, marks the page, and opens the print dialog', () => {
    const { result } = renderHook(() => useCheckInPrint())

    act(() => {
      result.current.print('name')
    })

    expect(result.current.order).toBe('name')
    expect(document.body).toHaveAttribute('data-checkin-printing', '')
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('clears the order and the mark when the browser says printing is over', () => {
    const { result } = renderHook(() => useCheckInPrint())
    act(() => {
      result.current.print('lane')
    })

    act(() => {
      window.dispatchEvent(new Event('afterprint'))
    })

    expect(result.current.order).toBeUndefined()
    expect(document.body).not.toHaveAttribute('data-checkin-printing')
  })

  it('ignores a second press while the first print is open', () => {
    const { result } = renderHook(() => useCheckInPrint())
    act(() => {
      result.current.print('lane')
    })

    act(() => {
      result.current.print('name')
    })

    expect(print).toHaveBeenCalledTimes(1)
    expect(result.current.order).toBe('lane')
  })

  it('can print again after the first print ends', () => {
    const { result } = renderHook(() => useCheckInPrint())
    act(() => {
      result.current.print('lane')
    })
    act(() => {
      window.dispatchEvent(new Event('afterprint'))
    })

    act(() => {
      result.current.print('name')
    })

    expect(print).toHaveBeenCalledTimes(2)
    expect(result.current.order).toBe('name')
  })

  it('does not leave the page marked for print when the user leaves with the dialog open', () => {
    const { result, unmount } = renderHook(() => useCheckInPrint())
    act(() => {
      result.current.print('lane')
    })

    unmount()

    expect(document.body).not.toHaveAttribute('data-checkin-printing')
  })

  it('drops the copy, unlocks, and rethrows when the print dialog cannot open', () => {
    print.mockImplementationOnce(() => {
      throw new Error('no print here')
    })
    const { result } = renderHook(() => useCheckInPrint())

    let failure: unknown
    act(() => {
      try {
        result.current.print('lane')
      } catch (error) {
        failure = error
      }
    })

    expect(failure).toEqual(new Error('no print here'))
    expect(result.current.order).toBeUndefined()
    expect(document.body).not.toHaveAttribute('data-checkin-printing')
    act(() => {
      result.current.print('lane')
    })
    expect(print).toHaveBeenCalledTimes(2)
  })
})
