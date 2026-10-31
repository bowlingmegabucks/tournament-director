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

  it('does not open the print dialog when the user leaves the page while the images load', async () => {
    let finishDecoding: () => void = () => undefined
    const decoded = new Promise<void>((resolve) => {
      finishDecoding = resolve
    })
    const copy = document.createElement('div')
    copy.setAttribute('data-results-print-copy', '')
    copy.innerHTML = '<img alt="" src="/a.png">'
    document.body.append(copy)
    const image = copy.querySelector('img') as HTMLImageElement
    vi.spyOn(image, 'complete', 'get').mockReturnValue(false)
    image.decode = () => decoded
    const { result, unmount } = renderHook(() => useResultsPrint())

    let pending: Promise<void> = Promise.resolve()
    act(() => {
      pending = result.current.print()
    })
    unmount()
    finishDecoding()
    await pending

    expect(print).not.toHaveBeenCalled()
    expect(document.body).not.toHaveAttribute('data-results-printing')
    copy.remove()
  })

  it('unlocks the button and drops the copy when the print dialog cannot open', async () => {
    print.mockImplementationOnce(() => {
      throw new Error('no print here')
    })
    const { result } = renderHook(() => useResultsPrint())

    let failure: unknown
    await act(async () => {
      await result.current.print().catch((error: unknown) => {
        failure = error
      })
    })

    expect(failure).toEqual(new Error('no print here'))

    expect(result.current.printing).toBe(false)
    expect(document.body).not.toHaveAttribute('data-results-printing')
    await act(() => result.current.print())
    expect(print).toHaveBeenCalledTimes(2)
  })
})
