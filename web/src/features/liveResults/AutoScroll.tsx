import { useEffect, useRef, type ReactNode } from 'react'
import styles from './LiveResultsPage.module.css'

/** How fast the list moves, in pixels a second (RES-50). Slow enough to read a row from across a room. */
export const SCROLL_PX_PER_SECOND = 40

/**
 * The scrolling list of the TV page (RES-50, D-242). The content is drawn twice, the second copy
 * hidden from screen readers, and the view scrolls down one content height and starts over, so the
 * loop has no jump. A list that fits the screen does not move and shows no copy. New content swaps
 * in where it is: the position is kept, and only wraps when it passes the end (D-244). The frame
 * stops while the tab is hidden.
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

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      const viewHeight = view.current?.clientHeight ?? 0
      const listHeight = first.current?.offsetHeight ?? 0
      const moving = listHeight > viewHeight && !document.hidden
      if (copy.current) copy.current.hidden = listHeight <= viewHeight
      if (listHeight <= viewHeight) {
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
    }
  }, [speed])

  return (
    <div ref={view} className={styles.view}>
      <div ref={first}>{children}</div>
      <div ref={copy} aria-hidden="true" hidden>
        {children}
      </div>
    </div>
  )
}
