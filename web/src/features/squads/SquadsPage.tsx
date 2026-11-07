import { Link, useLocation, useNavigate, useOutletContext, useParams } from 'react-router'
import { field } from '../../shared/field'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { Fact, SessionCard, SessionList } from '../../shared/SessionCard'
import { formatFee, formatRatio, withOverride } from '../../shared/sessionFormat'
import { Toast } from '../../shared/Toast'
import { Can } from '../auth/Can'
import type { Tournament } from '../tournaments/types'
import { useTournamentOpen } from '../tournaments/useTournamentOpen'
import styles from './SquadsPage.module.css'
import { useSquads } from './useSquads'

const TOAST_MS = 5000

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
      {justCreated && (
        <Toast
          kind="success"
          autoDismissMs={TOAST_MS}
          onDismiss={() => {
            // Stryker disable next-line StringLiteral,ObjectLiteral,BooleanLiteral: any navigation without state clears the toast; only the history entry (replace) and the path spelling differ, which tests cannot see.
            void navigate('.', { replace: true, state: null })
          }}
        >
          Squad created
        </Toast>
      )}
    </>
  )
}
