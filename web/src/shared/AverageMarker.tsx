import styles from './AverageMarker.module.css'

interface AverageMarkerProps {
  /** The words on the chip. The long form beside a name; a table of averages says "Not verified". */
  label?: string
}

/**
 * The chip that says a handicap bowler is bowling on an average no director checked (AVG-12,
 * AVG-13, D-293). Callers show it only for that bowler: a scratch division, a verified average,
 * and an adjusted one show nothing.
 */
export function AverageMarker({ label = 'Avg not verified' }: Readonly<AverageMarkerProps>) {
  return <span className={styles.marker}>{label}</span>
}
