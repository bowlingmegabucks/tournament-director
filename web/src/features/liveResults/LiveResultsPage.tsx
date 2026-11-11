import { useParams } from 'react-router'
import { Loading } from '../../shared/Loading'
import { AutoScroll } from './AutoScroll'
import { GameAnnouncement } from './GameAnnouncement'
import { formatClock, screenHeading, screensOf } from './liveLogic'
import styles from './LiveResultsPage.module.css'
import { PageFlip } from './PageFlip'
import { ScreenSection } from './ScreenSection'
import { useLiveResults } from './useLiveResults'
import { useReducedMotion } from './useReducedMotion'
import { useWakeLock } from './useWakeLock'

/**
 * The TV page (RES-50 to RES-54, D-242 to D-246): every squad division, each sweeper, and the super
 * sweeper, scrolling on their own and updating as games fill. It has no controls and needs no
 * sign-in. An overlay announces each game that fills (D-255); the bar says when the board last
 * updated, and a corner line says when it went out of date. The screen is kept awake. With "reduce
 * motion" on it flips one screen at a time instead of scrolling.
 */
export function LiveResultsPage() {
  // Stryker disable next-line StringLiteral: the route always has an :id; this only satisfies the type.
  const { id = '' } = useParams()
  const feed = useLiveResults(id)
  const reduced = useReducedMotion()
  useWakeLock()

  const { data } = feed
  const screens = data ? screensOf(data) : []
  const idle = data ? `Updated ${formatClock(new Date(feed.loadedAt).toISOString())}` : ' '

  let body
  if (!data) {
    body = feed.error ? (
      <div className={styles.center} role="alert">
        <span className={styles.problem}>Could not load results.</span>
        <small>The page tries again every minute.</small>
      </div>
    ) : (
      <div className={styles.center}>
        <Loading label="Loading results…" rows={3} />
      </div>
    )
  } else if (screens.length === 0) {
    body = (
      <div className={styles.center}>
        No scores entered yet.
        <small>This page fills in as scores come in. It updates on its own.</small>
      </div>
    )
  } else if (reduced) {
    body = (
      <PageFlip
        screens={screens.map((screen) => ({
          key: screen.key,
          label: screenHeading(screen),
          node: <ScreenSection screen={screen} highlighted={feed.highlighted === screen.key} />,
        }))}
      />
    )
  } else {
    body = (
      <AutoScroll>
        {screens.map((screen) => (
          <ScreenSection
            key={screen.key}
            screen={screen}
            highlighted={feed.highlighted === screen.key}
          />
        ))}
      </AutoScroll>
    )
  }

  return (
    <div className={styles.page}>
      <title>{`Live results · ${data?.tournament.name ?? ''} · Tournament Director`}</title>
      <header className={styles.bar}>
        <h1>Live results{data ? ` · ${data.tournament.name}` : ''}</h1>
        <p className={styles.updated} role="status">
          {idle}
        </p>
      </header>
      {/* The overlay is for the eye; this says the same for a screen reader, with nothing on screen. */}
      <p className={styles.hidden} role="status">
        {feed.notice}
      </p>
      <main className={styles.body}>{body}</main>
      {feed.announcement && (
        <GameAnnouncement
          announcement={feed.announcement}
          id={feed.announcementId}
          waiting={feed.waiting}
        />
      )}
      {feed.stale && (
        <p className={styles.offline} role="status">
          <strong>Out of date</strong> since {formatClock(new Date(feed.loadedAt).toISOString())}
        </p>
      )}
    </div>
  )
}
