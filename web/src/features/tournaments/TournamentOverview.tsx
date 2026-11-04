import { Link, useLocation, useNavigate, useOutletContext } from 'react-router'
import { Can } from '../auth/Can'
import { field } from '../../shared/field'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { Toast } from '../../shared/Toast'
import { formatDateRange, formatFee, formatRatio } from './format'
import styles from './TournamentOverview.module.css'
import type { Tournament } from './types'
import { useTournamentSettings } from './useTournamentSettings'

const TOAST_MS = 5000

/** What the vendor detail route returns for one tournament (TRN-15, D-24), and its format (TRN-23). */
export function TournamentOverview() {
  const tournament = useOutletContext<Tournament>()
  const location = useLocation()
  const navigate = useNavigate()
  // The create form sets this state as it moves here (D-120). Clearing it keeps a reload quiet.
  const justCreated = field(location.state, 'created') === true
  // The edit page sets this one the same way (TRN-31).
  const justSaved = field(location.state, 'saved') === true
  const settings = useTournamentSettings(tournament.id)
  const completed = settings.data?.completed === true

  return (
    <>
      <title>{`${tournament.name} · Tournament Director`}</title>
      <h1 className={styles.heading}>
        {tournament.name}
        {completed && <span className={styles.badge}>Completed</span>}
      </h1>
      {settings.data && !completed && (
        <Can permission="tournaments.write">
          <p>
            <Link className={styles.edit} to="edit">
              Edit tournament
            </Link>
          </p>
        </Can>
      )}
      <dl className={styles.fields}>
        <dt>Dates</dt>
        <dd>{formatDateRange(tournament.startDate, tournament.endDate)}</dd>
        <dt>Bowling center</dt>
        <dd>{tournament.bowlingCenter}</dd>
        <dt>Entry fee</dt>
        <dd>{formatFee(tournament.entryFee)}</dd>
      </dl>
      <Format id={tournament.id} />
      {(justCreated || justSaved) && (
        <Toast
          kind="success"
          autoDismissMs={TOAST_MS}
          onDismiss={() => {
            void navigate('.', { replace: true, state: null })
          }}
        >
          {justCreated ? 'Tournament created' : 'Tournament saved'}
        </Toast>
      )}
    </>
  )
}

function Format({ id }: Readonly<{ id: string }>) {
  const { data, isPending, error, refetch } = useTournamentSettings(id)

  return (
    <>
      <h2>Format</h2>
      {isPending && <Loading label="Loading format…" />}
      {error && (
        <QueryError
          error={error}
          onRetry={() => {
            void refetch()
          }}
        />
      )}
      {data && (
        <dl className={styles.fields}>
          <dt>Games per squad</dt>
          <dd>{data.games}</dd>
          <dt>Finals ratio</dt>
          <dd>{formatRatio(data.finalsRatio)}</dd>
          <dt>Cash ratio</dt>
          <dd>{formatRatio(data.cashRatio)}</dd>
          <dt>Super sweeper cash ratio</dt>
          <dd>{formatRatio(data.superSweeperCashRatio)}</dd>
        </dl>
      )}
    </>
  )
}
