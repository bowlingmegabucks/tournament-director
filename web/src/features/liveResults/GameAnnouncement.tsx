import { NOTICE_MS } from './useNotices'
import type { Announcement } from './liveLogic'
import styles from './GameAnnouncement.module.css'

/**
 * The overlay for a game that filled (D-255). A lower third slides in from the left for a game; for
 * the last game of a squad or sweeper the screen flashes with the game number, then settles into a
 * strip at the top. Drawn for the eye only (`aria-hidden`): the notice strip carries the same words
 * for a screen reader. `id` changes with each message, so the animation plays again when two follow
 * each other. `waiting` shows "+2 more" while others queue. It never takes a click.
 */
export function GameAnnouncement({
  announcement,
  id,
  waiting,
}: Readonly<{ announcement: Announcement; id: number | undefined; waiting: number }>) {
  const more = waiting > 0 ? `+${waiting} more waiting` : ''
  const style = { '--duration': `${NOTICE_MS}ms` } as React.CSSProperties
  return announcement.variant === 'last' ? (
    <div key={id} className={`${styles.root} ${styles.last}`} style={style} aria-hidden="true">
      <div className={styles.flash}>
        <span className={styles.game}>{announcement.game}</span>
        <span className={styles.title}>{announcement.title}</span>
        <span className={styles.kicker}>{announcement.kicker}</span>
        {more && <span className={styles.more}>{more}</span>}
      </div>
    </div>
  ) : (
    <div key={id} className={`${styles.root} ${styles.third}`} style={style} aria-hidden="true">
      <div className={styles.card}>
        <span className={styles.game}>{announcement.game}</span>
        <span className={styles.text}>
          <span className={styles.kicker}>{announcement.kicker}</span>
          <span className={styles.title}>{announcement.title}</span>
          {more && <span className={styles.more}>{more}</span>}
        </span>
      </div>
    </div>
  )
}
