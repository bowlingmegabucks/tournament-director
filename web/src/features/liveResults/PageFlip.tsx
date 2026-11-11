import { useEffect, useState, type ReactNode } from 'react'
import styles from './LiveResultsPage.module.css'

/** How long each screen shows when the page flips instead of scrolling (RES-53). */
export const FLIP_MS = 20_000

/**
 * One screen at a time, changing every 20 seconds, with a bar for the time left and dots for the
 * place (RES-53, layout B). The page uses it when the viewer asks for less motion: nothing slides.
 * `screens` are the screens in order, each already drawn. A feed that shrinks keeps the place
 * inside the list. An effect is right here: a timer is outside React.
 */
export function PageFlip({
  screens,
  intervalMs = FLIP_MS,
}: Readonly<{
  screens: readonly { key: string; label: string; node: ReactNode }[]
  intervalMs?: number
}>) {
  const [index, setIndex] = useState(0)
  const count = screens.length
  // Stryker disable next-line ConditionalExpression: with no screens `index % 0` is NaN and no screen is found, as with 0.
  const shown = count === 0 ? 0 : index % count

  useEffect(() => {
    if (count < 2) return
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % count)
    }, intervalMs)
    return () => {
      clearInterval(timer)
    }
  }, [count, intervalMs])

  const screen = screens[shown]
  if (!screen) return null
  return (
    <div className={styles.flip}>
      <div className={styles.flipScreen}>{screen.node}</div>
      {count > 1 && (
        <>
          {/* A new key restarts the bar for each screen. */}
          <div key={screen.key} className={styles.progress} aria-hidden="true">
            <i style={{ animationDuration: `${intervalMs}ms` }} />
          </div>
          <p className={styles.dots}>
            <span className={styles.hidden}>
              Screen {shown + 1} of {count}: {screen.label}
            </span>
            <span aria-hidden="true">
              {screens.map((each, at) => (
                <b key={each.key} className={at === shown ? styles.here : undefined}>
                  {at === shown ? '●' : '○'}
                </b>
              ))}
            </span>
          </p>
        </>
      )}
    </div>
  )
}
