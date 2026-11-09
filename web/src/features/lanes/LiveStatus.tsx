import styles from './LiveStatus.module.css'
import type { LiveState } from './useSessionEvents'

interface LiveStatusProps {
  state: LiveState
  /** "Updated: lanes 5-6" after another desk's change; replaces "Live" for a few seconds. */
  updated: string | undefined
}

/**
 * The line over the lane page that says whether it keeps itself fresh (LAN-19, D-217). It is a
 * polite status, so a screen reader hears a change of state and nothing more. The dot is a second
 * cue; the words carry the meaning.
 */
export function LiveStatus({ state, updated }: Readonly<LiveStatusProps>) {
  if (state === 'off') {
    return (
      <p className={styles.status} role="status">
        <span className={`${styles.dot} ${styles.off}`} aria-hidden="true" />
        Live updates are off. Reload the page to see changes by others.
      </p>
    )
  }
  if (state === 'reconnecting') {
    return (
      <p className={styles.status} role="status">
        <span className={`${styles.dot} ${styles.wait}`} aria-hidden="true" />
        Reconnecting… The page refreshes when it is back.
      </p>
    )
  }
  return (
    <p className={styles.status} role="status">
      <span className={styles.dot} aria-hidden="true" />
      {updated ?? 'Live: changes by others show here as they happen.'}
    </p>
  )
}
