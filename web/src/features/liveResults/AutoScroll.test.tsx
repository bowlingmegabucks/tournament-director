import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AutoScroll, SCROLL_PX_PER_SECOND } from './AutoScroll'

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

function size(list: number, view: number) {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(list)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(view)
}

beforeEach(() => {
  pending = []
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

/** The element that moves: the parent of the list. */
const track = () =>
  screen.getAllByText('Open table')[0]?.closest('div')?.parentElement as HTMLElement
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

    expect(track().style.transform).toBe(`translateY(${-SCROLL_PX_PER_SECOND}px)`)
    expect(SCROLL_PX_PER_SECOND).toBe(40)
  })

  it('goes by the time between frames, not the number of frames', () => {
    size(1000, 400)
    render(<AutoScroll>{content}</AutoScroll>)

    frames.at(0)
    frames.at(250)
    frames.at(2500)

    expect(track().style.transform).toBe('translateY(-100px)')
  })

  it('starts over when it has moved one list height, with no jump (the copy is in the same place)', () => {
    size(1000, 400)
    render(<AutoScroll>{content}</AutoScroll>)

    frames.at(0)
    frames.at(25_000) // 1000 px: the whole first copy
    expect(track().style.transform).toBe('translateY(0px)')
    frames.at(26_000)
    expect(track().style.transform).toBe('translateY(-40px)')
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

    expect(track().style.transform).toBe('')
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
    expect(track().style.transform).toBe('translateY(-40px)')

    size(300, 400)
    frames.at(3000)
    expect(track().style.transform).toBe('')
  })

  it('keeps its place when the content is swapped for new content (D-244)', () => {
    size(1000, 400)
    const { rerender } = render(<AutoScroll>{content}</AutoScroll>)
    frames.at(0)
    frames.at(5000)
    expect(track().style.transform).toBe('translateY(-200px)')

    rerender(
      <AutoScroll>
        <p>Open table</p>
        <p>New row</p>
      </AutoScroll>,
    )
    frames.at(6000)

    expect(track().style.transform).toBe('translateY(-240px)')
  })

  it('stops while the tab is hidden, and the first frame back does not jump', () => {
    size(1000, 400)
    render(<AutoScroll>{content}</AutoScroll>)
    frames.at(0)
    frames.at(1000)
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)

    frames.at(60_000)
    expect(track().style.transform).toBe('translateY(-40px)')

    hidden.mockReturnValue(false)
    frames.at(61_000)
    frames.at(62_000)
    expect(track().style.transform).toBe('translateY(-80px)')
  })

  it('goes at the speed it is given', () => {
    size(1000, 400)
    render(<AutoScroll speed={100}>{content}</AutoScroll>)

    frames.at(0)
    frames.at(1000)

    expect(track().style.transform).toBe('translateY(-100px)')
  })

  it('asks for no more frames once the page goes', () => {
    size(1000, 400)
    const { unmount } = render(<AutoScroll>{content}</AutoScroll>)
    frames.at(0)

    unmount()

    expect(pending).toEqual([])
  })
})
