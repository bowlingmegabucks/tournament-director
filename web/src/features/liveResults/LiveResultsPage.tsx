import { useParams } from 'react-router'
import { Loading } from '../../shared/Loading'
import { AutoScroll, SCROLL_PX_PER_SECOND } from './AutoScroll'
import { GameAnnouncement } from './GameAnnouncement'
import { formatClock, screenHeading, screensOf, type LiveScreen } from './liveLogic'
import styles from './LiveResultsPage.module.css'
import { PageFlip } from './PageFlip'
import { ScreenSection } from './ScreenSection'
import { useLiveResults } from './useLiveResults'
import { useReducedMotion } from './useReducedMotion'
import { MAX_SPEED, MIN_SPEED, SPEED_STEP, useScrollSpeed } from './useScrollSpeed'
import { useWakeLock } from './useWakeLock'

/**
 * The TV page (RES-50 to RES-54, D-242 to D-246): every squad division, each sweeper, and the super
 * sweeper, scrolling on their own and updating as games fill. Its one control is the scroll speed in the
 * bar (RES-63), and it needs no sign-in. An overlay announces each game that fills (D-255); the bar says when the board last
 * updated, and a corner line says when it went out of date. The screen is kept awake. With "reduce
 * motion" on it flips one screen at a time instead of scrolling.
 */
export function LiveResultsPage() {
  // Stryker disable next-line StringLiteral: the route always has an :id; this only satisfies the type.
  const { id = '' } = useParams()
  const feed = useLiveResults(id)
  const reduced = useReducedMotion()
  useWakeLock()
  const [speed, setSpeed] = useScrollSpeed()

  const { data } = feed
  const screens = data ? screensOf(data) : []
  const atLargeOf = (screen: LiveScreen) =>
    screen.kind === 'squad'
      ? data?.atLarge.find((figure) => figure.divisionId === screen.division.id)
      : undefined
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
        <span>No scores entered yet.</span>
        <small>This page fills in as scores come in. It updates on its own.</small>
      </div>
    )
  } else if (reduced) {
    body = (
      <PageFlip
        screens={screens.map((screen) => ({
          key: screen.key,
          label: screenHeading(screen),
          node: (
            <ScreenSection
              screen={screen}
              highlighted={feed.highlighted === screen.key}
              atLarge={atLargeOf(screen)}
            />
          ),
        }))}
      />
    )
  } else {
    body = (
      <AutoScroll speed={speed * SCROLL_PX_PER_SECOND}>
        {screens.map((screen) => (
          <ScreenSection
            key={screen.key}
            screen={screen}
            highlighted={feed.highlighted === screen.key}
            atLarge={atLargeOf(screen)}
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
        {!reduced && screens.length > 0 && (
          <label className={styles.speed}>
            <span>Scroll speed</span>
            <input
              type="range"
              min={MIN_SPEED}
              max={MAX_SPEED}
              step={SPEED_STEP}
              value={speed}
              aria-valuetext={`${speed}x`}
              onChange={(event) => {
                setSpeed(Number(event.target.value))
              }}
            />
            <span className={styles.speedValue} aria-hidden="true">
              {speed}x
            </span>
          </label>
        )}
        <output className={styles.updated}>{idle}</output>
      </header>
      {/* The overlay is for the eye; this says the same for a screen reader, with nothing on screen. */}
      <output className={styles.hidden}>{feed.notice}</output>
      <main className={styles.body}>{body}</main>
      {feed.announcement && (
        <GameAnnouncement
          announcement={feed.announcement}
          id={feed.announcementId}
          waiting={feed.waiting}
        />
      )}
      {feed.stale && (
        <output className={styles.offline}>
          <strong>Out of date</strong> since {formatClock(new Date(feed.loadedAt).toISOString())}
        </output>
      )}
    </div>
  )
}
