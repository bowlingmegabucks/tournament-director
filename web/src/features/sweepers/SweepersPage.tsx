import { Link, useLocation, useNavigate, useOutletContext, useParams } from 'react-router'
import { field } from '../../shared/field'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { DeleteSessionButton } from '../../shared/DeleteSessionButton'
import { EditSessionLink, Fact, SessionCard, SessionList } from '../../shared/SessionCard'
import { formatFee, formatRatio, formatSessionDate } from '../../shared/sessionFormat'
import { Toast } from '../../shared/Toast'
import { Can } from '../auth/Can'
import type { Tournament } from '../tournaments/types'
import { useTournamentOpen } from '../tournaments/useTournamentOpen'
import { BonusPinsList } from './BonusPinsList'
import styles from './SweepersPage.module.css'
import type { Sweeper } from './types'
import { useSweepers } from './useSweepers'

const TOAST_MS = 5000

/** What the toast says after an add, an edit, or a delete (D-172, SQD-27, D-188). */
function toastText(created: boolean, deleted: boolean): string {
  if (created) return 'Sweeper created'
  return deleted ? 'Sweeper deleted' : 'Sweeper saved'
}

/**
 * The "New sweeper" link. It sits inside `<Can>`, so a visitor without the permission never reads
 * the settings. A complete tournament has no link (D-171, D-174).
 */
function NewSweeperLink({ id }: Readonly<{ id: string }>) {
  if (!useTournamentOpen(id)) return null
  return (
    <Link className={styles.newButton} to={`/tournaments/${id}/sweepers/new`}>
      New sweeper
    </Link>
  )
}

/**
 * The "Edit" link of one card. It sits inside `<Can>`, so a visitor without the permission never
 * reads the settings. A complete sweeper or tournament has no link (D-181, D-19).
 */
function EditSweeperLink({ id, sweeper }: Readonly<{ id: string; sweeper: Sweeper }>) {
  if (!useTournamentOpen(id) || sweeper.complete) return null
  return (
    <EditSessionLink
      to={`/tournaments/${id}/sweepers/${sweeper.id}/edit`}
      label={`Edit sweeper ${formatSessionDate(sweeper.date)}`}
    />
  )
}

/**
 * The "Delete" button of one card. It sits inside `<Can>`, so a visitor without the permission
 * never reads the settings. A complete sweeper or tournament has no button (D-186, D-188); the API
 * decides all the same.
 */
function DeleteSweeperButton({ id, sweeper }: Readonly<{ id: string; sweeper: Sweeper }>) {
  if (!useTournamentOpen(id) || sweeper.complete) return null
  return <DeleteSessionButton kind="sweepers" tournamentId={id} session={sweeper} />
}

/**
 * The sweepers of the tournament in the URL, as plain cards (SQD-22, SQD-20, D-44), with a link to
 * add one (D-174). A division with no bonus pins is not listed, so a missing name means 0 (D-45).
 */
export function SweepersPage() {
  // Stryker disable next-line StringLiteral: the route always has an :id; this only satisfies the type.
  const { id = '' } = useParams()
  const tournament = useOutletContext<Tournament>()
  const { data, isPending, error, refetch } = useSweepers(id)
  const location = useLocation()
  const navigate = useNavigate()
  // The add form sets this state as it moves here (D-178). Clearing it keeps a reload quiet.
  const justCreated = field(location.state, 'created') === true
  // The edit form sets this one the same way (SQD-27).
  const justSaved = field(location.state, 'saved') === true
  // The delete button sets this one without leaving the page (D-188).
  const justDeleted = field(location.state, 'deleted') === true

  return (
    <>
      <title>{`Sweepers · ${tournament.name} · Tournament Director`}</title>
      <div className={styles.titlebar}>
        <h1>Sweepers</h1>
        <Can permission="squads.write">
          <NewSweeperLink id={id} />
        </Can>
      </div>
      {isPending && <Loading label="Loading sweepers…" rows={6} />}
      {error && (
        <QueryError
          error={error}
          onRetry={() => {
            void refetch()
          }}
        />
      )}
      {data?.length === 0 && <p>No sweepers yet.</p>}
      {data && data.length > 0 && (
        <p>
          <Link to={`/tournaments/${id}/super-sweeper`} className={styles.link}>
            Super sweeper results
          </Link>
        </p>
      )}
      {data && data.length > 0 && (
        <SessionList>
          {data.map((sweeper) => (
            <SessionCard
              key={sweeper.id}
              session={sweeper}
              href={sweeper.id}
              action={
                <Can permission="squads.write">
                  <EditSweeperLink id={id} sweeper={sweeper} />
                </Can>
              }
              danger={
                <Can permission="squads.write">
                  <DeleteSweeperButton id={id} sweeper={sweeper} />
                </Can>
              }
              facts={
                <>
                  <Fact label="Entry fee">{formatFee(sweeper.entryFee)}</Fact>
                  <Fact label="Games">{sweeper.games}</Fact>
                  <Fact label="Cash ratio">{formatRatio(sweeper.cashRatio)}</Fact>
                </>
              }
            >
              <BonusPinsList bonusPins={sweeper.bonusPins} />
            </SessionCard>
          ))}
        </SessionList>
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
