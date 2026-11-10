import styles from './LiveStatus.module.css'
import type { LiveState } from './useSessionEvents'

interface LiveStatusProps {
  state: LiveState
  /** "Updated: lanes 5-6" after another desk's change; replaces "Live" for a few seconds. */
  updated: string | undefined
}

/**
 * The line over the lane page that says whether it keeps itself fresh (LAN-21, D-217). It is a
 * polite status, so a screen reader hears a change of state and nothing more. The dot is a second
 * cue; the words carry the meaning.
 */
export function LiveStatus({ state, updated }: Readonly<LiveStatusProps>) {
  let dot = styles.dot
  let text = updated ?? 'Live: changes by others show here as they happen.'
  if (state === 'off') {
    dot = `${styles.dot} ${styles.off}`
    text = 'Live updates are off. Reload the page to see changes by others.'
  } else if (state === 'reconnecting') {
    dot = `${styles.dot} ${styles.wait}`
    text = 'Reconnecting… The page refreshes when it is back.'
  }
  return (
    <output className={styles.status}>
      <span className={dot} aria-hidden="true" />
      <span>{text}</span>
    </output>
  )
}
