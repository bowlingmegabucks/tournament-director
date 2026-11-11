import { useEffect, useRef, type ReactNode } from 'react'
import styles from './LiveResultsPage.module.css'

/** How fast the list moves, in pixels a second (RES-50). Slow enough to read a row from across a room. */
export const SCROLL_PX_PER_SECOND = 40

/** How long the list stays put after a viewer last touched it, in milliseconds. */
export const IDLE_RESUME_MS = 10_000

/**
 * The scrolling list of the TV page (RES-50, D-242). The content is drawn twice, the second copy
 * hidden from screen readers, and the view scrolls down one content height and starts over, so the
 * loop has no jump. A list that fits the screen does not move and shows no copy. New content swaps
 * in where it is: the position is kept, and only wraps when it passes the end (D-244). The frame
 * stops while the tab is hidden.
 *
 * A viewer can take over: a touch, a wheel turn, or a scroll key (arrows, Page Up and Down, Home,
 * End, Space) pauses the scroll for `IDLE_RESUME_MS` after the last one, then the list carries on
 * from where the viewer left it. Each touch event restarts the time, so a drag keeps it paused, and a
 * touch the browser never ends cannot hold it forever. The time counts on the frame clock.
 *
 * The view really scrolls (`scrollTop`, with no scroll bar), not a transform, so a heading with
 * `position: sticky` stays pinned at the top until the next one pushes it up (D-254).
 *
 * An effect is right here: it drives the DOM on every animation frame, which is outside React. The
 * position is written straight to the view, not held in state, so a frame costs no render.
 */
export function AutoScroll({
  children,
  speed = SCROLL_PX_PER_SECOND,
}: Readonly<{ children: ReactNode; speed?: number }>) {
  const view = useRef<HTMLDivElement>(null)
  const first = useRef<HTMLDivElement>(null)
  const copy = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let frame = 0
    let last: number | undefined
    let offset = 0
    // The viewer just acted: `stamp` asks the next frame to note its time on the frame clock. A
    // touch that never ends (the browser lost it) runs out like any other input, so the page cannot
    // stay stopped for good.
    let stamp = false
    let touchedAt: number | undefined

    const touch = () => {
      stamp = true
    }
    // Only the keys that scroll a list; Tab and the rest move focus and leave the scroll alone.
    const scrollKeys = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])
    const key = (event: Event) => {
      if (event instanceof KeyboardEvent && scrollKeys.has(event.key)) stamp = true
    }
    const element = view.current
    const listeners: [string, (event: Event) => void][] = [
      ['touchstart', touch],
      ['touchmove', touch],
      ['touchend', touch],
      ['touchcancel', touch],
      ['wheel', touch],
      ['keydown', key],
    ]
    for (const [type, handler] of listeners) {
      element?.addEventListener(type, handler, { passive: true })
    }

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (stamp) {
        touchedAt = now
        stamp = false
      }
      const viewHeight = view.current?.clientHeight ?? 0
      const listHeight = first.current?.offsetHeight ?? 0
      const paused = touchedAt !== undefined && now - touchedAt < IDLE_RESUME_MS
      const moving = listHeight > viewHeight && !document.hidden && !paused
      if (copy.current) copy.current.hidden = listHeight <= viewHeight
      if (paused && listHeight > viewHeight && view.current) {
        // The viewer moves it: follow their position and write nothing, so a drag or a fling is not
        // interrupted. Once the pause ends, the loop wraps a position past the first copy.
        offset = view.current.scrollTop
      } else if (listHeight <= viewHeight) {
        // It fits: sit at the top.
        offset = 0
        if (view.current) view.current.scrollTop = 0
      } else if (moving) {
        if (last !== undefined) offset += ((now - last) / 1000) * speed
        // Past the end of the first copy, the second is in the same place: start over.
        if (offset >= listHeight) offset -= listHeight
        if (view.current) view.current.scrollTop = offset
      }
      // A hidden tab ends the span, so the first frame back does not jump.
      last = moving ? now : undefined
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      for (const [type, handler] of listeners) element?.removeEventListener(type, handler)
    }
  }, [speed])

  return (
    // Focusable so the arrow keys scroll it (WCAG 2.1.1); a key press then pauses the scroll.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must take focus
    <div ref={view} className={styles.view} role="region" aria-label="Live results" tabIndex={0}>
      <div ref={first}>{children}</div>
      <div ref={copy} aria-hidden="true" hidden>
        {children}
      </div>
    </div>
  )
}
