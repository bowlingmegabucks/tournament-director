import { useId, type ReactNode } from 'react'
import styles from './DangerZone.module.css'

interface DangerZoneProps {
  /** What goes, in a sentence or two, so the director reads it before the button. Leave it out when the zone holds `DangerItem`s. */
  description?: ReactNode
  /** The trigger, or one or more `DangerItem`s. */
  children: ReactNode
}

/**
 * The "Danger zone" of a page (D-215): a red-bordered section at the bottom, apart from the
 * routine actions, holding destructive triggers each with a sentence about what it does. With one
 * trigger, pass `description`. With several (complete and delete, D-260), pass a `DangerItem` for
 * each. Callers hold back the zone when the user may use none of them, so a visitor sees no empty box.
 */
export function DangerZone({ description, children }: Readonly<DangerZoneProps>) {
  const titleId = useId()
  return (
    <section className={styles.zone} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        Danger zone
      </h2>
      {description === undefined ? (
        children
      ) : (
        <>
          <p className={styles.text}>{description}</p>
          <div className={styles.action}>{children}</div>
        </>
      )}
    </section>
  )
}

/** One action in a zone with several (D-260): its sentence, then its trigger. Items are divided. */
export function DangerItem({
  description,
  children,
}: Readonly<{ description: ReactNode; children: ReactNode }>) {
  return (
    <div className={styles.item}>
      <p className={styles.text}>{description}</p>
      <div className={styles.action}>{children}</div>
    </div>
  )
}
