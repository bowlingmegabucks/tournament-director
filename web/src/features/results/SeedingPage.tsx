import { useOutletContext, useParams } from 'react-router'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import type { Tournament } from '../tournaments/types'
import { DivisionChooser } from './DivisionChooser'
import { PrintButtons } from './PrintButtons'
import { PrintSeeding } from './PrintFinals'
import styles from './ResultsPage.module.css'
import { SeedingBody } from './SeedingTable'
import { UnofficialNotice } from './UnofficialNotice'
import { useChosenDivision } from './useChosenDivision'
import { useSeeding } from './useResults'
import { useResultsPrint } from './useResultsPrint'

/**
 * The finals seeding of the tournament, one division at a time (RES-18 to RES-21a, D-87, D-89,
 * D-92). It says "Unofficial results" until every squad is complete and asks again every 15
 * seconds until then (D-88). The choice of division stays in `?division=`.
 */
export function SeedingPage() {
  // Stryker disable next-line StringLiteral: the route always has an :id; this only satisfies the type.
  const { id = '' } = useParams()
  const tournament = useOutletContext<Tournament>()
  const { data, error, refetch } = useSeeding(id)
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
    return <Loading label="Loading seeding…" rows={4} />
  }

  return (
    <>
      <title>{`Finals seeding · ${tournament.name} · Tournament Director`}</title>
      <h1>Finals seeding</h1>
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
          {!data.complete && <UnofficialNotice kind="squads" outcome="seeds" />}
          <h2>{chosen.name}</h2>
          <SeedingBody division={chosen} />
          {printing && <PrintSeeding results={data} only={only} />}
        </>
      ) : (
        <p>No scores entered yet.</p>
      )}
    </>
  )
}
