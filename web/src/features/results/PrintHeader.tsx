import sponsors from '../../assets/score-sheet-sponsors.png'
import { formatSheetDate, formatSheetTime } from '../../shared/sessionFormat'
import styles from './PrintResults.module.css'

/**
 * RPT-01: the title, the date if there is one (the tournament pages have none), the division if
 * there is one, and the sponsor image. RES-36, D-88: the unofficial mark.
 */
export function PrintHeader({
  title,
  date,
  division,
  unofficial,
}: Readonly<{ title: string; date?: string; division?: string; unofficial: boolean }>) {
  return (
    <header className={styles.head}>
      <div>
        <h1 className={styles.title}>{title}</h1>
        {date !== undefined && (
          <p>
            Date: {formatSheetDate(date)} - {formatSheetTime(date)}
          </p>
        )}
        {division !== undefined && <p>Division: {division}</p>}
        {unofficial && <p className={styles.unofficial}>UNOFFICIAL RESULTS</p>}
      </div>
      <img
        className={styles.sponsors}
        src={sponsors}
        alt="Northeast MegaBuck$ Tournament and sponsors"
      />
    </header>
  )
}
