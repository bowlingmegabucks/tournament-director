import type { ReactNode } from 'react'
import { useOutletContext, useParams } from 'react-router'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import type { Tournament } from '../tournaments/types'
import { DivisionChooser } from './DivisionChooser'
import { PrintButtons } from './PrintButtons'
import styles from './ResultsPage.module.css'
import { useChosenDivision } from './useChosenDivision'
import { useResultsPrint } from './useResultsPrint'

interface Query<Data> {
  data: Data | undefined
  error: Error | null
  refetch: () => unknown
}

interface Props<Division extends { id: string; name: string; entries: number }, Data> {
  /** The heading and the start of the tab title, such as "At-large". */
  title: string
  loadingLabel: string
  useData: (tournamentId: string) => Query<Data>
  divisionsOf: (data: Data) => readonly Division[]
  /** The "Unofficial results" notice, or nothing once the data is final. */
  notice: (data: Data) => ReactNode
  renderBody: (division: Division, data: Data) => ReactNode
  renderPrint: (data: Data, only: string | undefined) => ReactNode
}

/**
 * The shape the at-large and seeding pages share: one division at a time, a chooser in
 * `?division=`, print this or all, and "Unofficial results" until the data is final (D-87, D-88,
 * D-89).
 */
export function FinalsDivisionPage<
  Division extends { id: string; name: string; entries: number },
  Data,
>({
  title,
  loadingLabel,
  useData,
  divisionsOf,
  notice,
  renderBody,
  renderPrint,
}: Readonly<Props<Division, Data>>) {
  // Stryker disable next-line StringLiteral: the route always has an :id; this only satisfies the type.
  const { id = '' } = useParams()
  const tournament = useOutletContext<Tournament>()
  const { data, error, refetch } = useData(id)
  const { printing, only, print } = useResultsPrint()
  const chosen = useChosenDivision(data ? divisionsOf(data) : [])

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
    return <Loading label={loadingLabel} rows={4} />
  }

  return (
    <>
      <title>{`${title} · ${tournament.name} · Tournament Director`}</title>
      <h1>{title}</h1>
      {chosen ? (
        <>
          <div className={styles.toolbar}>
            <DivisionChooser divisions={divisionsOf(data)} chosenId={chosen.id} />
            <PrintButtons
              onPrintThis={() => {
                void print(chosen.id)
              }}
              onPrintAll={() => {
                void print()
              }}
            />
          </div>
          {notice(data)}
          <h2>{chosen.name}</h2>
          {renderBody(chosen, data)}
          {printing && renderPrint(data, only)}
        </>
      ) : (
        <p>No scores entered yet.</p>
      )}
    </>
  )
}
