import { Link, useLocation, useNavigate, useOutletContext, useParams } from 'react-router'
import { field } from '../../shared/field'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { Toast } from '../../shared/Toast'
import { Can } from '../auth/Can'
import type { Tournament } from '../tournaments/types'
import { useTournamentSettings } from '../tournaments/useTournamentSettings'
import styles from './DivisionsPage.module.css'
import { formatGender, formatHandicap, formatRange } from './format'
import { useDivisions } from './useDivisions'

const TOAST_MS = 5000

/**
 * The "New division" link. It sits inside `<Can>`, so a visitor without the permission never reads
 * the settings. A complete tournament has no link (D-143, D-19). While the settings load the link
 * waits, so a complete tournament never shows it. If they fail it shows anyway: the API refuses a
 * complete tournament, and a slow start must not take the link away.
 */
function NewDivisionLink({ id }: Readonly<{ id: string }>) {
  const settings = useTournamentSettings(id)
  if (settings.isPending || settings.data?.completed === true) return null
  return (
    <Link className={styles.newButton} to={`/tournaments/${id}/divisions/new`}>
      New division
    </Link>
  )
}

/** The divisions of the tournament in the URL, as a table (DIV-12, DIV-13, D-40). */
export function DivisionsPage() {
  // Stryker disable next-line StringLiteral: the route always has an :id; this only satisfies the type.
  const { id = '' } = useParams()
  const tournament = useOutletContext<Tournament>()
  const { data, isPending, error, refetch } = useDivisions(id)
  const location = useLocation()
  const navigate = useNavigate()
  // The add form sets this state as it moves here (D-144). Clearing it keeps a reload quiet.
  const justCreated = field(location.state, 'created') === true

  return (
    <>
      <title>{`Divisions · ${tournament.name} · Tournament Director`}</title>
      <div className={styles.titlebar}>
        <h1>Divisions</h1>
        <Can permission="divisions.write">
          <NewDivisionLink id={id} />
        </Can>
      </div>
      {isPending && <Loading label="Loading divisions…" rows={6} />}
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
      {justCreated && (
        <Toast
          kind="success"
          autoDismissMs={TOAST_MS}
          onDismiss={() => {
            // Stryker disable next-line StringLiteral,ObjectLiteral,BooleanLiteral: any navigation without state clears the toast; only the history entry (replace) and the path spelling differ, which tests cannot see.
            void navigate('.', { replace: true, state: null })
          }}
        >
          Division created
        </Toast>
      )}
    </>
  )
}
