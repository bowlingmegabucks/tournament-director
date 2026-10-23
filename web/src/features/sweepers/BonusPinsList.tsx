import { formatPins } from '../../shared/sessionFormat'
import styles from './BonusPinsList.module.css'
import type { BonusPins } from './types'

/**
 * Bonus pins per game, by division (SQD-22, DIV-14). The API lists only divisions with pins other
 * than 0, so a division that is missing here has no bonus; with none at all, say so (D-45).
 */
export function BonusPinsList({ bonusPins }: Readonly<{ bonusPins: BonusPins[] }>) {
  return (
    <>
      <h3 className={styles.subheading}>Bonus pins per game</h3>
      {bonusPins.length === 0 ? (
        <p className={styles.none}>No bonus pins</p>
      ) : (
        <ul className={styles.pins}>
          {bonusPins.map((pins) => (
            <li key={pins.divisionId} className={styles.pin}>
              {pins.divisionName}: {formatPins(pins.bonusPinsPerGame)}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
