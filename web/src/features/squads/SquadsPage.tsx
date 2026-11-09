import { Link, useLocation, useNavigate, useOutletContext, useParams } from 'react-router'
import { field } from '../../shared/field'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { DeleteSessionButton } from '../../shared/DeleteSessionButton'
import { EditSessionLink, Fact, SessionCard, SessionList } from '../../shared/SessionCard'
import { formatFee, formatRatio, formatSessionDate, withOverride } from '../../shared/sessionFormat'
import { Toast } from '../../shared/Toast'
import { Can } from '../auth/Can'
import type { Tournament } from '../tournaments/types'
import { useTournamentOpen } from '../tournaments/useTournamentOpen'
import styles from './SquadsPage.module.css'
import type { Squad } from './types'
import { useSquads } from './useSquads'

const TOAST_MS = 5000

/** What the toast says after an add, an edit, or a delete (D-172, SQD-27, D-188). */
function toastText(created: boolean, deleted: boolean): string {
  if (created) return 'Squad created'
  return deleted ? 'Squad deleted' : 'Squad saved'
}

/**
 * The "New squad" link. It sits inside `<Can>`, so a visitor without the permission never reads
 * the settings. A complete tournament has no link (D-171, D-19).
 */
function NewSquadLink({ id }: Readonly<{ id: string }>) {
  if (!useTournamentOpen(id)) return null
  return (
    <Link className={styles.newButton} to={`/tournaments/${id}/squads/new`}>
      New squad
    </Link>
  )
}

/**
 * The "Edit" link of one card. It sits inside `<Can>`, so a visitor without the permission never
 * reads the settings. A complete squad or tournament has no link (D-181, D-19).
 */
function EditSquadLink({ id, squad }: Readonly<{ id: string; squad: Squad }>) {
  if (!useTournamentOpen(id) || squad.complete) return null
  return (
    <EditSessionLink
      to={`/tournaments/${id}/squads/${squad.id}/edit`}
      label={`Edit squad ${formatSessionDate(squad.date)}`}
    />
  )
}

/**
 * The "Delete" button of one card. It sits inside `<Can>`, so a visitor without the permission
 * never reads the settings. A complete squad or tournament has no button (D-186, D-188); the API
 * decides all the same.
 */
function DeleteSquadButton({ id, squad }: Readonly<{ id: string; squad: Squad }>) {
  if (!useTournamentOpen(id) || squad.complete) return null
  return <DeleteSessionButton kind="squads" tournamentId={id} session={squad} />
}

/** The squads of the tournament in the URL, as plain cards (SQD-21, SQD-20, D-44), with a link to add one (D-167). */
export function SquadsPage() {
  // Stryker disable next-line StringLiteral: the route always has an :id; this only satisfies the type.
  const { id = '' } = useParams()
  const tournament = useOutletContext<Tournament>()
  const { data, isPending, error, refetch } = useSquads(id)
  const location = useLocation()
  const navigate = useNavigate()
  // The add form sets this state as it moves here (D-172). Clearing it keeps a reload quiet.
  const justCreated = field(location.state, 'created') === true
  // The edit form sets this one the same way (SQD-27).
  const justSaved = field(location.state, 'saved') === true
  // The delete button sets this one without leaving the page (D-188).
  const justDeleted = field(location.state, 'deleted') === true

  return (
    <>
      <title>{`Squads · ${tournament.name} · Tournament Director`}</title>
      <div className={styles.titlebar}>
        <h1>Squads</h1>
        <Can permission="squads.write">
          <NewSquadLink id={id} />
        </Can>
      </div>
      {isPending && <Loading label="Loading squads…" rows={6} />}
      {error && (
        <QueryError
          error={error}
          onRetry={() => {
            void refetch()
          }}
        />
      )}
      {data?.length === 0 && <p>No squads yet.</p>}
      {data && data.length > 0 && (
        <SessionList>
          {data.map((squad) => (
            <SessionCard
              key={squad.id}
              session={squad}
              href={squad.id}
              action={
                <Can permission="squads.write">
                  <EditSquadLink id={id} squad={squad} />
                </Can>
              }
              danger={
                <Can permission="squads.write">
                  <DeleteSquadButton id={id} squad={squad} />
                </Can>
              }
              facts={
                <>
                  <Fact label="Entry fee">
                    {withOverride(formatFee(squad.entryFee), squad.entryFeeOverridden)}
                  </Fact>
                  <Fact label="Finals ratio">
                    {withOverride(formatRatio(squad.finalsRatio), squad.finalsRatioOverridden)}
                  </Fact>
                  <Fact label="Cash ratio">
                    {withOverride(formatRatio(squad.cashRatio), squad.cashRatioOverridden)}
                  </Fact>
                </>
              }
            />
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
