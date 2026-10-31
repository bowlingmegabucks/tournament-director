import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useResultsPrint } from './useResultsPrint'

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
  delete document.body.dataset.resultsPrinting
})

describe('useResultsPrint (RES-33, D-78)', () => {
  it('is not printing until asked', () => {
    const { result } = renderHook(() => useResultsPrint())

    expect(result.current.printing).toBe(false)
    expect(print).not.toHaveBeenCalled()
  })

  it('puts the copy on the page, marks the page, and opens the print dialog', async () => {
    const { result } = renderHook(() => useResultsPrint())

    await act(() => result.current.print())

    expect(result.current.printing).toBe(true)
    expect(document.body).toHaveAttribute('data-results-printing', '')
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('clears the copy and the mark when the browser says printing is over', async () => {
    const { result } = renderHook(() => useResultsPrint())
    await act(() => result.current.print())

    act(() => {
      window.dispatchEvent(new Event('afterprint'))
    })

    expect(result.current.printing).toBe(false)
    expect(document.body).not.toHaveAttribute('data-results-printing')
  })

  it('ignores a second press while the first print is open', async () => {
    const { result } = renderHook(() => useResultsPrint())
    await act(() => result.current.print())

    await act(() => result.current.print())

    expect(print).toHaveBeenCalledTimes(1)
  })

  it('ignores a second press while the first is still getting its images ready', async () => {
    const { result } = renderHook(() => useResultsPrint())

    await act(async () => {
      const first = result.current.print()
      const second = result.current.print()
      await Promise.all([first, second])
    })

    expect(print).toHaveBeenCalledTimes(1)
  })

  it('can print again after the first print ends', async () => {
    const { result } = renderHook(() => useResultsPrint())
    await act(() => result.current.print())
    act(() => {
      window.dispatchEvent(new Event('afterprint'))
    })

    await act(() => result.current.print())

    expect(print).toHaveBeenCalledTimes(2)
  })

  it('does not leave the page marked for print when the user leaves it with the dialog open', async () => {
    const { result, unmount } = renderHook(() => useResultsPrint())
    await act(() => result.current.print())

    unmount()

    expect(document.body).not.toHaveAttribute('data-results-printing')
  })
})
