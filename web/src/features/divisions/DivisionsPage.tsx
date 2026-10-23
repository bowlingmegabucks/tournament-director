import { useParams, useOutletContext } from 'react-router'
import { QueryError } from '../../shared/QueryError'
import type { Tournament } from '../tournaments/types'
import styles from './DivisionsPage.module.css'
import { formatGender, formatHandicap, formatRange } from './format'
import { useDivisions } from './useDivisions'

/** The divisions of the tournament in the URL, as a table (DIV-12, DIV-13, D-40). Read only. */
export function DivisionsPage() {
  // Stryker disable next-line StringLiteral: the route always has an :id; this only satisfies the type.
  const { id = '' } = useParams()
  const tournament = useOutletContext<Tournament>()
  const { data, isPending, error, refetch } = useDivisions(id)

  return (
    <>
      <title>{`Divisions · ${tournament.name} · Tournament Director`}</title>
      <h1>Divisions</h1>
      {isPending && <output>Loading divisions…</output>}
      {error && (
        <QueryError
          error={error}
          onRetry={() => {
            void refetch()
          }}
        />
      )}
      {data?.length === 0 && <p>No divisions yet.</p>}
      {data && data.length > 0 && (
        <table className={styles.table}>
          <caption className={styles.hidden}>Divisions in {tournament.name}</caption>
          <thead>
            <tr>
              <th scope="col" className={styles.number}>
                #
              </th>
              <th scope="col">Name</th>
              <th scope="col">Gender</th>
              <th scope="col">Ages</th>
              <th scope="col">Averages</th>
              <th scope="col">Handicap</th>
            </tr>
          </thead>
          <tbody>
            {data.map((division) => (
              <tr key={division.id}>
                <td data-label="Number">{division.number}</td>
                <th scope="row">{division.name}</th>
                <td data-label="Gender">{formatGender(division.gender)}</td>
                <td data-label="Ages">{formatRange(division.minimumAge, division.maximumAge)}</td>
                <td data-label="Averages">
                  {formatRange(division.minimumAverage, division.maximumAverage)}
                </td>
                <td data-label="Handicap">{formatHandicap(division)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
