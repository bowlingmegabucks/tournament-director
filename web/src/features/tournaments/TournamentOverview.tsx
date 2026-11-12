import { useState } from 'react'
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router'
import { Can } from '../auth/Can'
import { useCan } from '../auth/useCan'
import { field } from '../../shared/field'
import { DangerItem, DangerZone } from '../../shared/DangerZone'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { Toast } from '../../shared/Toast'
import { completedMessage } from './completeApi'
import { CompleteTournamentButton } from './CompleteTournamentButton'
import { DeleteTournamentButton } from './DeleteTournamentButton'
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
  const canComplete = useCan('tournaments.write')
  const canDelete = useCan('tournaments.delete')
  // The result of a complete (D-260). The Danger zone goes away once the tournament is complete, so
  // the toast lives here and not in the button.
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; lines: string[] } | undefined>()

  return (
    <>
      <title>{`${tournament.name} · Tournament Director`}</title>
      <h1 className={styles.heading}>
        {tournament.name}
        {completed && <span className={styles.badge}>Completed</span>}
      </h1>
      {settings.data && !completed && (
        <div className={styles.actions}>
          <Can permission="tournaments.write">
            <Link className={styles.edit} to="edit">
              Edit tournament
            </Link>
          </Can>
        </div>
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
      {settings.data && !completed && (canComplete || canDelete) && (
        <DangerZone>
          {canComplete && (
            <DangerItem description="Complete this tournament. This closes every open squad and sweeper, then locks everything. It cannot be undone.">
              <CompleteTournamentButton
                tournament={tournament}
                onCompleted={(result) => {
                  setNotice({ kind: 'success', lines: [completedMessage(result)] })
                }}
                onRefused={(reasons) => {
                  setNotice({ kind: 'error', lines: reasons })
                }}
              />
            </DangerItem>
          )}
          {canDelete && (
            <DangerItem description="Delete this tournament and everything under it. This cannot be undone.">
              <DeleteTournamentButton tournament={tournament} />
            </DangerItem>
          )}
        </DangerZone>
      )}
      {notice && (
        <Toast
          kind={notice.kind}
          autoDismissMs={notice.kind === 'success' ? TOAST_MS : undefined}
          onDismiss={() => {
            setNotice(undefined)
          }}
        >
          {notice.lines.length === 1 ? (
            notice.lines[0]
          ) : (
            <ul className={styles.reasons}>
              {notice.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </Toast>
      )}
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
