import { useOutletContext, useParams } from 'react-router'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import type { Tournament } from '../tournaments/types'
import { AtLargeBody } from './AtLargeTable'
import { DivisionChooser } from './DivisionChooser'
import { PrintAtLarge } from './PrintFinals'
import { PrintButtons } from './PrintButtons'
import styles from './ResultsPage.module.css'
import { UnofficialNotice } from './UnofficialNotice'
import { useChosenDivision } from './useChosenDivision'
import { useAtLarge } from './useResults'
import { useResultsPrint } from './useResultsPrint'

/**
 * The at-large advancers of the tournament, one division at a time (RES-12 to RES-17, D-87, D-89).
 * It says "Unofficial results" until every squad is complete and asks again every 15 seconds until
 * then (D-88). The choice of division stays in `?division=`.
 */
export function AtLargePage() {
  // Stryker disable next-line StringLiteral: the route always has an :id; this only satisfies the type.
  const { id = '' } = useParams()
  const tournament = useOutletContext<Tournament>()
  const { data, error, refetch } = useAtLarge(id)
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
    return <Loading label="Loading at-large results…" rows={4} />
  }

  return (
    <>
      <title>{`At-large · ${tournament.name} · Tournament Director`}</title>
      <h1>At-large</h1>
      {chosen ? (
        <>
          <div className={styles.toolbar}>
            <DivisionChooser divisions={data.divisions} chosenId={chosen.id} />
            <PrintButtons
              onPrintThis={() => {
                void print(chosen.id)
              }}
              onPrintAll={() => {
                void print()
              }}
            />
          </div>
          {!data.complete && <UnofficialNotice kind="squads" />}
          <h2>{chosen.name}</h2>
          <AtLargeBody division={chosen} finalsRatio={data.finalsRatio} />
          {printing && <PrintAtLarge results={data} only={only} />}
        </>
      ) : (
        <p>No scores entered yet.</p>
      )}
    </>
  )
}
