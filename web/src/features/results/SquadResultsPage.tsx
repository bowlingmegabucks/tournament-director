import { useOutletContext, useParams } from 'react-router'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { formatRatio, formatSessionDate } from '../../shared/sessionFormat'
import type { Tournament } from '../tournaments/types'
import { DivisionChooser } from './DivisionChooser'
import { DivisionResults } from './DivisionResults'
import { PrintButtons } from './PrintButtons'
import { PrintResults } from './PrintResults'
import styles from './ResultsPage.module.css'
import { useChosenDivision } from './useChosenDivision'
import { useSquadResults } from './useResults'
import { UnofficialNotice } from './UnofficialNotice'
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
  const { printing, only, print } = useResultsPrint()
  const chosen = useChosenDivision(data?.divisions ?? [])

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

  return (
    <>
      <title>{`Results · ${formatSessionDate(session.date)} · ${tournament.name} · Tournament Director`}</title>
      {chosen ? (
        <>
          <div className={styles.toolbar}>
            <DivisionChooser divisions={divisions} chosenId={chosen.id} />
            <PrintButtons
              onPrintThis={() => {
                void print(chosen.id)
              }}
              onPrintAll={() => {
                void print()
              }}
            />
          </div>
          {!session.complete && <UnofficialNotice kind="squad" />}
          <p className={styles.note}>
            Finals ratio {formatRatio(data.finalsRatio)} · cash ratio {formatRatio(data.cashRatio)}
          </p>
          <DivisionResults division={chosen} games={session.games} />
          {printing && <PrintResults results={data} only={only} />}
        </>
      ) : (
        <p>No scores entered yet.</p>
      )}
    </>
  )
}
