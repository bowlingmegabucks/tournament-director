import { useId, type ReactNode } from 'react'
import styles from './DangerZone.module.css'

interface DangerZoneProps {
  /** What goes, in a sentence or two, so the director reads it before the button. */
  description: ReactNode
  /** The delete trigger. */
  children: ReactNode
}

/**
 * The "Danger zone" of a page (D-215): a red-bordered section at the bottom, apart from the
 * routine actions, holding one destructive trigger and a sentence about what it does. Callers
 * wrap it in `<Can>` so a visitor without the permission sees no empty box.
 */
export function DangerZone({ description, children }: Readonly<DangerZoneProps>) {
  const titleId = useId()
  return (
    <section className={styles.zone} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        Danger zone
      </h2>
      <p className={styles.text}>{description}</p>
      <div className={styles.action}>{children}</div>
    </section>
  )
}
