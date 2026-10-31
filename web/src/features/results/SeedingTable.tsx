import { formatSquadStamp } from '../../shared/sessionFormat'
import { formatSeedingSummary, formatTie, seedingItems } from './format'
import styles from './ResultsTable.module.css'
import type { SeedingDivision } from './types'

/**
 * The summary and table of one division's finals seeding (RES-18 to RES-21a, D-92): the seed, the
 * squad of the best entry, name, total, high game, HDCP when someone has one, and the casher mark,
 * with a "Cut Line" after the last finalist. Below 40rem each row is a block. The screen and the
 * print copy both draw it.
 */
export function SeedingBody({ division }: Readonly<{ division: SeedingDivision }>) {
  const items = seedingItems(division.rows)
  const columns = 6 + (division.showHandicap ? 1 : 0)
  return (
    <>
      <p className={styles.sub}>{formatSeedingSummary(division)}</p>
      <table className={styles.table}>
        <caption className={styles.hidden}>Finals seeding for the {division.name} division</caption>
        <thead className={styles.head}>
          <tr>
            <th scope="col">Seed</th>
            <th scope="col">Squad</th>
            <th scope="col">Name</th>
            <th scope="col" className={styles.num}>
              Total
            </th>
            <th scope="col" className={styles.num}>
              HG
            </th>
            {division.showHandicap && (
              <th scope="col" className={styles.num}>
                HDCP
              </th>
            )}
            <th scope="col">Casher</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) =>
            item.kind === 'line' ? (
              <tr key={item.label} className={styles.line}>
                <td colSpan={columns}>{item.label}</td>
              </tr>
            ) : (
              <tr key={item.row.registrationId}>
                <td className={styles.place}>#{item.row.seed}</td>
                <td className={styles.text} data-label="Squad">
                  {formatSquadStamp(item.row.squadDate)}
                </td>
                <th scope="row" className={styles.who}>
                  {item.row.name}
                  {item.row.ties.map((tie) => (
                    <span key={tie.line} className={styles.mark}>
                      {formatTie(tie)}
                    </span>
                  ))}
                </th>
                <td className={styles.totalCell} data-label="Total">
                  {item.row.total}
                </td>
                <td className={styles.num} data-label="HG">
                  {item.row.highGame}
                </td>
                {division.showHandicap && (
                  <td className={styles.num} data-label="HDCP">
                    {item.row.handicap}
                  </td>
                )}
                <td className={styles.text} data-label="Casher">
                  {item.row.previousCasher && (
                    <>
                      <span className={styles.cash} aria-hidden="true">
                        $
                      </span>{' '}
                      Cashed on a squad
                    </>
                  )}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </>
  )
}
