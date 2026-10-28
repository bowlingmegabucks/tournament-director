import styles from './Loading.module.css'

interface LoadingProps {
  /** The words, such as "Loading squads…". They stay on screen and are what a screen reader hears. */
  label: string
  /** Gray placeholder bars below the dots, for a list page. None by default (D-53). */
  rows?: number
}

/**
 * The inline loading state: three pulsing dots beside the words, and optional placeholder bars
 * (D-53). The dots and bars are decoration, hidden from screen readers. They stand still when
 * the user asks for less motion.
 */
export function Loading({ label, rows = 0 }: Readonly<LoadingProps>) {
  const bars = Array.from({ length: rows }, (_, row) => row)
  return (
    <>
      <output className={styles.loading}>
        <span className={styles.dots} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        {label}
      </output>
      {bars.length > 0 && (
        <div className={styles.rows} aria-hidden="true">
          {bars.map((row) => (
            <span key={row} />
          ))}
        </div>
      )}
    </>
  )
}
