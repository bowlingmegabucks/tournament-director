import sponsors from '../../assets/score-sheet-sponsors.png'
import { formatHandicap, formatHandicapTotal, formatSheetDate, formatSheetTime } from './format'
import styles from './RecapSheet.module.css'
import type { RecapSession, RecapSheet as Sheet, SkipPattern } from './types'

interface RecapSheetProps {
  sheet: Sheet
  session: Pick<RecapSession, 'date' | 'games'>
  pattern: SkipPattern
}

/**
 * One recap sheet (RPT-05, RPT-05a, D-63): the sponsor image, date, time, name, division, and the
 * signature lines on the left; one row per game and a Totals row on the right. The scores are
 * written by hand, so Score and Total stay blank. The lane for each game comes from the API.
 */
export function RecapSheet({ sheet, session, pattern }: Readonly<RecapSheetProps>) {
  const handicap = formatHandicap(sheet.handicap)
  const lanes = sheet.cross[pattern]
  return (
    <article className={styles.sheet} aria-label={`Recap sheet for ${sheet.name}`}>
      <div className={styles.left}>
        <img
          className={styles.sponsors}
          src={sponsors}
          alt="Northeast Megabucks Tournament, with sponsors: Ace Mitchell Bowlers Mart, Cambridge Credit Counseling, Audacy, TechVision Livestreaming, Strike F/X, Federico's, Rock 102, Lia"
        />
        <div className={styles.when}>
          <span>{formatSheetDate(session.date)}</span>
          <span>{formatSheetTime(session.date)}</span>
        </div>
        <p className={styles.name}>{sheet.name}</p>
        <p className={styles.division}>{sheet.divisionName}</p>
        <span />
        <div className={styles.bowlerSignature}>{sheet.name}</div>
        <div className={styles.opposingSignature}>Opposing Bowler&apos;s Signature</div>
      </div>
      <div className={styles.right}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Lane</th>
              <th scope="col">Score</th>
              <th scope="col">Handicap</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {lanes.map((lane, index) => (
              // The cross repeats a label (lane 4A can come up twice), so the game number is the key.
              <tr key={`game-${index + 1}`}>
                <td>{lane}</td>
                <td />
                <td>{handicap}</td>
                <td />
              </tr>
            ))}
            <tr>
              <th scope="row">Totals</th>
              <td />
              <td>{formatHandicapTotal(sheet.handicap, session.games)}</td>
              <td />
            </tr>
          </tbody>
        </table>
        <p className={styles.office}>Office Check: __________</p>
      </div>
    </article>
  )
}
