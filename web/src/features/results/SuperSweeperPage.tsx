import { Link, useOutletContext, useParams } from 'react-router'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import type { Tournament } from '../tournaments/types'
import { formatRatio } from '../../shared/sessionFormat'
import { PrintSuperSweeper } from './PrintFinals'
import { plural } from './format'
import styles from './ResultsPage.module.css'
import tableStyles from './ResultsTable.module.css'
import { SuperSweeperTable } from './SuperSweeperTable'
import { UnofficialNotice } from './UnofficialNotice'
import { useSuperSweeper } from './useResults'
import { useResultsPrint } from './useResultsPrint'

/**
 * The super sweeper results: one list for the bowlers who opted in, one column for each sweeper
 * (RES-26 to RES-29a, D-87, D-90). It says "Unofficial results" until every sweeper is complete and
 * asks again every 15 seconds until then (D-88).
 */
export function SuperSweeperPage() {
  // Stryker disable next-line StringLiteral: the route always has an :id; this only satisfies the type.
  const { id = '' } = useParams()
  const tournament = useOutletContext<Tournament>()
  const { data, error, refetch } = useSuperSweeper(id)
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
    return <Loading label="Loading super sweeper results…" rows={4} />
  }

  const entries = plural(data.entries, 'entry', 'entries')
  return (
    <>
      <title>{`Super sweeper results · ${tournament.name} · Tournament Director`}</title>
      <p>
        <Link to={`/tournaments/${id}/sweepers`}>Sweepers</Link> / Super sweeper
      </p>
      <h1>Super sweeper results</h1>
      {data.rows.length === 0 ? (
        <p>No scores entered yet.</p>
      ) : (
        <>
          <div className={styles.toolbar}>
            <p className={styles.note}>
              {plural(data.sweepers.length, 'sweeper', 'sweepers')} · cash ratio{' '}
              {formatRatio(data.cashRatio)}
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
          {!data.complete && <UnofficialNotice kind="sweepers" />}
          <p className={tableStyles.sub}>
            {entries} · Cashing {data.cashers} · Cut score {data.cutScore}
          </p>
          <SuperSweeperTable results={data} />
          {printing && <PrintSuperSweeper results={data} />}
        </>
      )}
    </>
  )
}
