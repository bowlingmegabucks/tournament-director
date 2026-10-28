import styles from './Loading.module.css'

interface LoadingProps {
  /** The words, such as "Loading squads…". They stay on screen and are what a screen reader hears. */
  label: string
  /** Gray placeholder bars below the dots, for a list page. None by default. Up to 12 (D-53). */
  rows?: number
}

// The bars are fixed decoration, so they get fixed ids rather than a loop index.
// Stryker disable next-line StringLiteral: the ids only have to differ from each other, and no id is read.
const barIds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l']

/**
 * The inline loading state: three pulsing dots beside the words, and optional placeholder bars
 * (D-53). The dots and bars are decoration, hidden from screen readers. They stand still when
 * the user asks for less motion.
 */
export function Loading({ label, rows = 0 }: Readonly<LoadingProps>) {
  return (
    <>
      <output className={styles.loading}>
        <span className={styles.dots} aria-hidden="true">
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.dot} />
        </span>
        {label}
      </output>
      {rows > 0 && (
        <div className={styles.rows} aria-hidden="true">
          {barIds.slice(0, rows).map((id) => (
            <span key={id} className={styles.bar} />
          ))}
        </div>
      )}
    </>
  )
}
