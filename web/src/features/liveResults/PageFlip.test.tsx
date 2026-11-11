import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLIP_MS, PageFlip } from './PageFlip'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

const screens = ['Open', 'Senior', 'Sweeper'].map((name) => ({
  key: name,
  label: `Squad · ${name}`,
  node: <p>{name} table</p>,
}))

describe('PageFlip (RES-53)', () => {
  it('shows the first screen, with its place for a screen reader', () => {
    render(<PageFlip screens={screens} />)

    expect(screen.getByText('Open table')).toBeVisible()
    expect(screen.queryByText('Senior table')).not.toBeInTheDocument()
    expect(screen.getByText('Screen 1 of 3: Squad · Open')).toBeInTheDocument()
  })

  it('moves to the next screen every 20 seconds and starts over after the last', () => {
    render(<PageFlip screens={screens} />)

    act(() => {
      vi.advanceTimersByTime(FLIP_MS)
    })
    expect(screen.getByText('Senior table')).toBeVisible()
    act(() => {
      vi.advanceTimersByTime(FLIP_MS)
    })
    expect(screen.getByText('Sweeper table')).toBeVisible()
    act(() => {
      vi.advanceTimersByTime(FLIP_MS)
    })
    expect(screen.getByText('Open table')).toBeVisible()
    expect(FLIP_MS).toBe(20_000)
  })

  it('keeps one screen and no bar or dots when there is only one', () => {
    render(<PageFlip screens={screens.slice(0, 1)} />)

    act(() => {
      vi.advanceTimersByTime(FLIP_MS * 3)
    })

    expect(screen.getByText('Open table')).toBeVisible()
    expect(screen.queryByText(/Screen 1 of/)).not.toBeInTheDocument()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('draws nothing for no screens', () => {
    const { container } = render(<PageFlip screens={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('keeps its place inside the list when the list gets shorter', () => {
    const { rerender } = render(<PageFlip screens={screens} />)
    act(() => {
      vi.advanceTimersByTime(FLIP_MS * 2)
    })
    expect(screen.getByText('Sweeper table')).toBeVisible()

    rerender(<PageFlip screens={screens.slice(0, 2)} />)

    // Place 2 of the old list is place 0 of a list of two: the first screen.
    expect(screen.getByText('Open table')).toBeVisible()
  })

  it('marks the screen it is on with a filled dot and the others with an empty one', () => {
    const { container } = render(<PageFlip screens={screens} />)
    const dots = () => Array.from(container.querySelectorAll('b')).map((dot) => dot.textContent)

    expect(dots()).toEqual(['\u25CF', '\u25CB', '\u25CB'])
    act(() => {
      vi.advanceTimersByTime(FLIP_MS)
    })
    expect(dots()).toEqual(['\u25CB', '\u25CF', '\u25CB'])
    expect(container.querySelectorAll('b')[1]?.className).not.toBe(
      container.querySelectorAll('b')[0]?.className,
    )
  })

  it('flips between two screens, not only three or more', () => {
    render(<PageFlip screens={screens.slice(0, 2)} />)

    act(() => {
      vi.advanceTimersByTime(FLIP_MS)
    })

    expect(screen.getByText('Senior table')).toBeVisible()
  })

  it('starts flipping when a list of one grows to three', () => {
    const { rerender } = render(<PageFlip screens={screens.slice(0, 1)} />)
    rerender(<PageFlip screens={screens} />)

    act(() => {
      vi.advanceTimersByTime(FLIP_MS)
    })

    expect(screen.getByText('Senior table')).toBeVisible()
  })

  it('starts the bar over for each screen, over the time the screen shows', () => {
    const { container } = render(<PageFlip screens={screens} intervalMs={5000} />)
    const bar = () => container.querySelector('i')

    expect(bar()?.style.animationDuration).toBe('5000ms')
    const first = bar()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(bar()).not.toBe(first)
  })

  it('uses the interval it is given', () => {
    render(<PageFlip screens={screens} intervalMs={1000} />)

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(screen.getByText('Senior table')).toBeVisible()
  })

  it('leaves no timer behind when the page goes', () => {
    const { unmount } = render(<PageFlip screens={screens} />)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
