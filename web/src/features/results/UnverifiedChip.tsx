import { AverageMarker } from '../../shared/AverageMarker'
import styles from './ResultsTable.module.css'

/**
 * The chip after a bowler's name when a handicap bowler is on an average no director checked
 * (AVG-13, D-293). It carries no number: the feed only says yes or no.
 */
export function UnverifiedChip({ show }: Readonly<{ show: boolean }>) {
  if (!show) return null
  return (
    <span className={styles.chip}>
      <AverageMarker />
    </span>
  )
}
