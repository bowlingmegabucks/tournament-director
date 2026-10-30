import { useOutletContext, useParams } from 'react-router'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { formatSessionDate } from '../../shared/sessionFormat'
import type { Tournament } from '../tournaments/types'
import { formatRatio } from './format'
import styles from './ResultsPage.module.css'
import tableStyles from './ResultsTable.module.css'
import { SweeperTable } from './SweeperTable'
import { useSweeperResults } from './useResults'

/**
 * The results of one sweeper: one list for everyone with a score, not split by division (RES-22,
 * RES-32). It asks again every 15 seconds while the sweeper is open (D-79).
 */
export function SweeperResultsPage() {
  // Stryker disable next-line StringLiteral: the route always has these params; this only satisfies the type.
  const { id = '', sessionId = '' } = useParams()
  const tournament = useOutletContext<Tournament>()
  const { data, error, refetch } = useSweeperResults(id, sessionId)

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

  const { session } = data
  const entries = data.entries === 1 ? '1 entry' : `${data.entries} entries`
  return (
    <>
      <title>{`Results · ${formatSessionDate(session.date)} · ${tournament.name} · Tournament Director`}</title>
      {data.rows.length === 0 ? (
        <p>No scores entered yet.</p>
      ) : (
        <>
          <p className={styles.note}>
            Cash ratio {formatRatio(data.cashRatio)} · {session.games} games
          </p>
          <h2>Sweeper results</h2>
          <p className={tableStyles.sub}>
            {entries} · Cashing {data.cashers} · Cut score {data.cutScore}
          </p>
          <SweeperTable rows={data.rows} />
        </>
      )}
    </>
  )
}
