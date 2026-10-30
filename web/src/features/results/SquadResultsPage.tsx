import { useId } from 'react'
import { useOutletContext, useParams, useSearchParams } from 'react-router'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { formatRatio, formatSessionDate } from '../../shared/sessionFormat'
import type { Tournament } from '../tournaments/types'
import { DivisionResults } from './DivisionResults'
import { PrintResults } from './PrintResults'
import styles from './ResultsPage.module.css'
import { useSquadResults } from './useResults'
import { useResultsPrint } from './useResultsPrint'

/**
 * The results of one squad, one division at a time (RES-10, RES-32, D-80). The first division shows
 * at first and the choice stays in the address (`?division=`), so a reload keeps it. It asks again
 * every 15 seconds while the squad is open (D-79), and a failed refresh leaves the last results.
 */
export function SquadResultsPage() {
  // Stryker disable next-line StringLiteral: the route always has these params; this only satisfies the type.
  const { id = '', sessionId = '' } = useParams()
  const tournament = useOutletContext<Tournament>()
  const { data, error, refetch } = useSquadResults(id, sessionId)
  const [search, setSearch] = useSearchParams()
  const selectId = useId()
  const { printing, print } = useResultsPrint()

  if (!data) {
    if (error) {
      return (
        <QueryError
          error={error}
          onRetry={() => {
            void refetch()
          }}
        />
      )
    }
    return <Loading label="Loading results…" rows={4} />
  }

  const { session, divisions } = data
  const chosen =
    divisions.find((division) => division.id === search.get('division')) ?? divisions[0]

  return (
    <>
      <title>{`Results · ${formatSessionDate(session.date)} · ${tournament.name} · Tournament Director`}</title>
      {chosen ? (
        <>
          <div className={styles.toolbar}>
            {divisions.length > 1 && (
              <div className={styles.field}>
                <label htmlFor={selectId}>Division</label>
                <select
                  id={selectId}
                  value={chosen.id}
                  onChange={(event) => {
                    setSearch(
                      (previous) => {
                        const next = new URLSearchParams(previous)
                        next.set('division', event.target.value)
                        return next
                      },
                      { replace: true },
                    )
                  }}
                >
                  {divisions.map((division) => (
                    <option key={division.id} value={division.id}>
                      {division.name} ({division.entries}{' '}
                      {division.entries === 1 ? 'entry' : 'entries'})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                void print()
              }}
            >
              Print all divisions
            </button>
          </div>
          <p className={styles.note}>
            Finals ratio {formatRatio(data.finalsRatio)} · cash ratio {formatRatio(data.cashRatio)}
          </p>
          <DivisionResults division={chosen} games={session.games} />
          {printing && <PrintResults results={data} />}
        </>
      ) : (
        <p>No scores entered yet.</p>
      )}
    </>
  )
}
