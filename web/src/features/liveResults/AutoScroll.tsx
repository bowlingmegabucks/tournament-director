import { useEffect, useRef, type ReactNode } from 'react'
import styles from './LiveResultsPage.module.css'

/** How fast the list moves, in pixels a second (RES-50). Slow enough to read a row from across a room. */
export const SCROLL_PX_PER_SECOND = 40

/** How long the list stays put after a viewer last touched it, in milliseconds. */
export const IDLE_RESUME_MS = 10_000

// Only the keys that scroll a list; Tab and the rest move focus and leave the scroll alone.
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

/**
 * Listens for a viewer taking over (touch, wheel, scroll key). `takeTouch` says whether one came
 * since the last call, so the frame can note its time on the frame clock. A touch that never ends
 * (the browser lost it) runs out like any other input, so the page cannot stay stopped for good.
 */
function watchViewerInput(element: HTMLElement | null) {
  let touched = false
  const touch = () => {
    touched = true
  }
  const key = (event: Event) => {
    if (event instanceof KeyboardEvent && SCROLL_KEYS.has(event.key)) touched = true
  }
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
  return {
    takeTouch() {
      const was = touched
      touched = false
      return was
    },
    stop() {
      for (const [type, handler] of listeners) element?.removeEventListener(type, handler)
    },
  }
}

/** The next scroll position after `elapsedMs`; past the end of the first copy it starts over. */
function nextOffset(offset: number, elapsedMs: number, speed: number, listHeight: number) {
  const next = offset + (elapsedMs / 1000) * speed
  return next >= listHeight ? next - listHeight : next
}

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
    const input = watchViewerInput(view.current)
    let frame = 0
    let last: number | undefined
    let offset = 0
    let touchedAt: number | undefined

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      if (input.takeTouch()) touchedAt = now
      const element = view.current
      const viewHeight = element?.clientHeight ?? 0
      const listHeight = first.current?.offsetHeight ?? 0
      const fits = listHeight <= viewHeight
      const paused = touchedAt !== undefined && now - touchedAt < IDLE_RESUME_MS
      const moving = !fits && !document.hidden && !paused
      if (copy.current) copy.current.hidden = fits
      if (fits) offset = 0
      else if (paused)
        offset = element?.scrollTop ?? offset // follow the viewer, write nothing
      else if (moving)
        offset = nextOffset(offset, last === undefined ? 0 : now - last, speed, listHeight)
      // Write only when we drive the view: a fit list sits at the top, a moving one follows `offset`.
      if (element && (fits || moving)) element.scrollTop = offset
      // A hidden tab ends the span, so the first frame back does not jump.
      last = moving ? now : undefined
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      input.stop()
    }
  }, [speed])

  return (
    // Focusable so the arrow keys scroll it (WCAG 2.1.1); a key press then pauses the scroll.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must take focus
    <section ref={view} className={styles.view} aria-label="Live results" tabIndex={0}>
      <div ref={first}>{children}</div>
      <div ref={copy} aria-hidden="true" hidden>
        {children}
      </div>
    </section>
  )
}
