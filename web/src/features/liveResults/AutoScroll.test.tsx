import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AutoScroll, IDLE_RESUME_MS, SCROLL_PX_PER_SECOND } from './AutoScroll'

/** A frame clock a test steps by hand: each `at(ms)` runs the callbacks asked for since the last. */
let pending: FrameRequestCallback[] = []
const frames = {
  at(now: number) {
    const run = pending
    pending = []
    act(() => {
      for (const callback of run) callback(now)
    })
  },
}

/** What the view was last told to scroll to. The sticky headings need a real scroll, not a transform (D-254). */
const scrolled: number[] = []
const position = () => scrolled.at(-1)

function size(list: number, view: number) {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(list)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(view)
}

beforeEach(() => {
  pending = []
  scrolled.length = 0
  vi.spyOn(Element.prototype, 'scrollTop', 'set').mockImplementation((value: number) => {
    scrolled.push(value)
  })
  // A real view keeps the position it was given; the pause reads it back to carry on from there.
  vi.spyOn(Element.prototype, 'scrollTop', 'get').mockImplementation(() => scrolled.at(-1) ?? 0)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pending.push(callback)
    return pending.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {
    pending = []
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const content = (
  <>
    <p>Open table</p>
  </>
)

describe('AutoScroll (RES-50, D-242)', () => {
  it('moves up at 40 pixels a second, from the first frame on', () => {
    size(1000, 400)
    render(<AutoScroll>{content}</AutoScroll>)

    frames.at(0)
    frames.at(1000)

    expect(position()).toBe(SCROLL_PX_PER_SECOND)
    expect(SCROLL_PX_PER_SECOND).toBe(40)
  })

  it('goes by the time between frames, not the number of frames', () => {
    size(1000, 400)
    render(<AutoScroll>{content}</AutoScroll>)

    frames.at(0)
    frames.at(250)
    frames.at(2500)

    expect(position()).toBe(100)
  })

  it('starts over when it has moved one list height, with no jump (the copy is in the same place)', () => {
    size(1000, 400)
    render(<AutoScroll>{content}</AutoScroll>)

    frames.at(0)
    frames.at(25_000) // 1000 px: the whole first copy
    expect(position()).toBe(0)
    frames.at(26_000)
    expect(position()).toBe(40)
  })

  it('draws the content twice, the second copy hidden from screen readers', () => {
    size(1000, 400)
    render(<AutoScroll>{content}</AutoScroll>)
    frames.at(0)

    expect(screen.getAllByText('Open table')).toHaveLength(2)
    const second = screen.getAllByText('Open table')[1]
    expect(second?.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(second?.closest('[aria-hidden="true"]')).toBeVisible()
  })

  it('does not move, and shows no copy, when the list fits the screen', () => {
    size(300, 400)
    render(<AutoScroll>{content}</AutoScroll>)

    frames.at(0)
    frames.at(5000)

    expect(position()).toBe(0)
    expect(screen.getAllByText('Open table')[1]?.closest('[aria-hidden="true"]')).not.toBeVisible()
  })

  it('shows the copy once the list outgrows the screen, and sits at the top when it shrinks again', () => {
    size(300, 400)
    const { rerender } = render(<AutoScroll>{content}</AutoScroll>)
    frames.at(0)

    size(1000, 400)
    rerender(<AutoScroll>{content}</AutoScroll>)
    frames.at(1000)
    frames.at(2000)
    expect(position()).toBe(40)

    size(300, 400)
    frames.at(3000)
    expect(position()).toBe(0)
  })

  it('keeps its place when the content is swapped for new content (D-244)', () => {
    size(1000, 400)
    const { rerender } = render(<AutoScroll>{content}</AutoScroll>)
    frames.at(0)
    frames.at(5000)
    expect(position()).toBe(200)

    rerender(
      <AutoScroll>
        <p>Open table</p>
        <p>New row</p>
      </AutoScroll>,
    )
    frames.at(6000)

    expect(position()).toBe(240)
  })

  it('stops while the tab is hidden, and the first frame back does not jump', () => {
    size(1000, 400)
    render(<AutoScroll>{content}</AutoScroll>)
    frames.at(0)
    frames.at(1000)
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)

    frames.at(60_000)
    expect(position()).toBe(40)

    hidden.mockReturnValue(false)
    frames.at(61_000)
    frames.at(62_000)
    expect(position()).toBe(80)
  })

  it('goes at the speed it is given', () => {
    size(1000, 400)
    render(<AutoScroll speed={100}>{content}</AutoScroll>)

    frames.at(0)
    frames.at(1000)

    expect(position()).toBe(100)
  })

  it('asks for no more frames once the page goes', () => {
    size(1000, 400)
    const { unmount } = render(<AutoScroll>{content}</AutoScroll>)
    frames.at(0)

    unmount()

    expect(pending).toEqual([])
  })

  describe('a viewer takes over (touch, wheel, scroll keys)', () => {
    // The first div inside Testing Library's container is the scrolling view.
    const viewOf = () => document.body.querySelector<HTMLElement>('div > div') as HTMLElement

    function start() {
      size(1000, 400)
      render(<AutoScroll>{content}</AutoScroll>)
      frames.at(0)
      frames.at(1000)
      expect(position()).toBe(40)
    }

    it('stays paused while the finger keeps moving, however long the drag', () => {
      start()

      for (let at = 2000; at <= 60_000; at += 5000) {
        fireEvent.touchMove(viewOf())
        frames.at(at)
      }

      expect(position()).toBe(40)
    })

    it('waits for the idle time after the last touch, then goes on from the same place', () => {
      start()
      fireEvent.touchStart(viewOf())
      frames.at(2000)
      fireEvent.touchEnd(viewOf())
      frames.at(3000) // the idle time starts here

      frames.at(3000 + IDLE_RESUME_MS - 1)
      expect(position()).toBe(40)

      frames.at(3000 + IDLE_RESUME_MS)
      frames.at(3000 + IDLE_RESUME_MS + 1000)
      expect(position()).toBe(80)
    })

    it('goes on by itself when a touch never ends (the browser lost it)', () => {
      start()
      fireEvent.touchStart(viewOf())
      frames.at(2000)

      frames.at(2000 + IDLE_RESUME_MS)
      frames.at(2000 + IDLE_RESUME_MS + 1000)

      expect(position()).toBe(80)
    })

    it('writes nothing to the view while the viewer has it, so a fling is not cut short', () => {
      start()
      fireEvent.touchMove(viewOf())
      const writes = scrolled.length

      frames.at(2000)
      frames.at(3000)

      expect(scrolled).toHaveLength(writes)
    })

    it('wraps a position the viewer left past the first copy once the pause ends', () => {
      start()
      fireEvent.touchEnd(viewOf())
      frames.at(2000)
      scrolled.push(1100) // the viewer scrolled into the second copy

      frames.at(2000 + IDLE_RESUME_MS)
      frames.at(2000 + IDLE_RESUME_MS + 1000)

      expect(position()).toBeLessThan(1000)
    })

    it('pauses for the idle time after a wheel turn or a scroll key', () => {
      for (const interact of [
        () => fireEvent.wheel(viewOf()),
        () => fireEvent.keyDown(viewOf(), { key: 'ArrowDown' }),
        () => fireEvent.keyDown(viewOf(), { key: ' ' }),
        () => fireEvent.keyDown(viewOf(), { key: 'PageDown' }),
      ]) {
        pending = []
        scrolled.length = 0
        const { unmount } = render(<AutoScroll>{content}</AutoScroll>)
        size(1000, 400)
        frames.at(0)
        frames.at(1000)
        interact()
        frames.at(2000)
        frames.at(2000 + IDLE_RESUME_MS - 1)

        expect(position()).toBe(40)
        unmount()
      }
    })

    it('does not pause for Tab or other keys that only move focus', () => {
      start()

      fireEvent.keyDown(viewOf(), { key: 'Tab' })
      frames.at(2000)
      frames.at(3000)

      expect(position()).toBe(120)
    })

    it('stops listening when the page goes', () => {
      size(1000, 400)
      const { unmount } = render(<AutoScroll>{content}</AutoScroll>)
      const view = viewOf()
      unmount()

      act(() => {
        fireEvent.touchStart(view)
      })

      expect(pending).toEqual([])
    })
  })
})
