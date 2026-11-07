import { Link, useLocation, useNavigate, useOutletContext, useParams } from 'react-router'
import { field } from '../../shared/field'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { Toast } from '../../shared/Toast'
import { Can } from '../auth/Can'
import { DeleteDivisionButton } from './DeleteDivisionButton'
import type { Tournament } from '../tournaments/types'
import { useTournamentOpen } from '../tournaments/useTournamentOpen'
import styles from './DivisionsPage.module.css'
import { formatGender, formatHandicap, formatRange } from './format'
import type { Division } from './types'
import { useDivisions } from './useDivisions'

const TOAST_MS = 5000

/**
 * The Edit link and Delete button of one row, in a cell of their own. The cell sits inside `<Can>`,
 * so a visitor without the permission never reads the settings. A complete tournament has neither
 * (D-149, D-154, D-19); while the settings load they wait. If the read fails they show anyway: the
 * API refuses a complete tournament, and a slow start must not take them away.
 */
function ActionsCell({ id, division }: Readonly<{ id: string; division: Division }>) {
  const show = useTournamentOpen(id)
  return (
    <td className={styles.actionsCell}>
      {show && (
        <div className={styles.actions}>
          <Link
            className={styles.editLink}
            to={`/tournaments/${id}/divisions/${division.id}/edit`}
            aria-label={`Edit ${division.name}`}
          >
            Edit
          </Link>
          <DeleteDivisionButton tournamentId={id} division={division} />
        </div>
      )}
    </td>
  )
}

/**
 * The "New division" link. It sits inside `<Can>`, so a visitor without the permission never reads
 * the settings. A complete tournament has no link (D-143, D-19). While the settings load the link
 * waits, so a complete tournament never shows it. If they fail it shows anyway: the API refuses a
 * complete tournament, and a slow start must not take the link away.
 */
function NewDivisionLink({ id }: Readonly<{ id: string }>) {
  if (!useTournamentOpen(id)) return null
  return (
    <Link className={styles.newButton} to={`/tournaments/${id}/divisions/new`}>
      New division
    </Link>
  )
}

function toastText(created: boolean, deleted: boolean): string {
  if (created) return 'Division created'
  return deleted ? 'Division deleted' : 'Division saved'
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
  // The edit form sets this one the same way (DIV-12).
  const justSaved = field(location.state, 'saved') === true
  // The delete button sets this one without leaving the page (D-154).
  const justDeleted = field(location.state, 'deleted') === true

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
              <Can permission="divisions.write">
                <th scope="col">
                  <span className={styles.hidden}>Actions</span>
                </th>
              </Can>
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
                <Can permission="divisions.write">
                  <ActionsCell id={id} division={division} />
                </Can>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {(justCreated || justSaved || justDeleted) && (
        <Toast
          kind="success"
          autoDismissMs={TOAST_MS}
          onDismiss={() => {
            // Stryker disable next-line StringLiteral,ObjectLiteral,BooleanLiteral: any navigation without state clears the toast; only the history entry (replace) and the path spelling differ, which tests cannot see.
            void navigate('.', { replace: true, state: null })
          }}
        >
          {toastText(justCreated, justDeleted)}
        </Toast>
      )}
    </>
  )
}
