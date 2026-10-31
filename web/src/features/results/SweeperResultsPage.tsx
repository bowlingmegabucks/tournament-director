import { useOutletContext, useParams } from 'react-router'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { formatRatio, formatSessionDate } from '../../shared/sessionFormat'
import type { Tournament } from '../tournaments/types'
import styles from './ResultsPage.module.css'
import { plural } from './format'
import tableStyles from './ResultsTable.module.css'
import { PrintResults } from './PrintResults'
import { SweeperTable } from './SweeperTable'
import { useSweeperResults } from './useResults'
import { UnofficialNotice } from './UnofficialNotice'
import { useResultsPrint } from './useResultsPrint'

/**
 * The results of one sweeper: one list for everyone with a score, not split by division (RES-22,
 * RES-32). It asks again every 15 seconds while the sweeper is open (D-79).
 */
export function SweeperResultsPage() {
  // Stryker disable next-line StringLiteral: the route always has these params; this only satisfies the type.
  const { id = '', sessionId = '' } = useParams()
  const tournament = useOutletContext<Tournament>()
  const { data, error, refetch } = useSweeperResults(id, sessionId)
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

  const { session } = data
  const entries = plural(data.entries, 'entry', 'entries')
  return (
    <>
      <title>{`Results · ${formatSessionDate(session.date)} · ${tournament.name} · Tournament Director`}</title>
      {data.rows.length === 0 ? (
        <p>No scores entered yet.</p>
      ) : (
        <>
          <div className={styles.toolbar}>
            <p className={styles.note}>
              Cash ratio {formatRatio(data.cashRatio)} · {session.games} games
            </p>
            <button
              type="button"
              onClick={() => {
                void print()
              }}
            >
              Print results
            </button>
          </div>
          {!session.complete && <UnofficialNotice kind="sweeper" />}
          <h2>Sweeper results</h2>
          <p className={tableStyles.sub}>
            {entries} · Cashing {data.cashers} · Cut score {data.cutScore}
          </p>
          <SweeperTable rows={data.rows} />
          {printing && <PrintResults results={data} />}
        </>
      )}
    </>
  )
}
