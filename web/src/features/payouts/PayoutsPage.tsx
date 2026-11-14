import { useCallback, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { formatMoney } from '../../shared/formatMoney'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { formatSessionDate } from '../../shared/sessionFormat'
import { Toast } from '../../shared/Toast'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import { useCan } from '../auth/useCan'
import { PayoutDisclaimer } from './PayoutDisclaimer'
import styles from './Payouts.module.css'
import {
  asPaidFilter,
  atLeast,
  eventOptions,
  filterRows,
  readMinimum,
  type PaidFilter,
} from './listFilters'
import type { BowlerTotal, PayoutList, PayoutRow } from './types'
import { usePayoutTotals, usePayouts, useSetPaid } from './usePayouts'
import { formatCents } from './amount'

/** The Paid cell: a checkbox that saves at once for a user who may, text with a check mark for anyone else (D-274). */
function PaidCell({
  row,
  editable,
  pending,
  onToggle,
}: Readonly<{
  row: PayoutRow
  editable: boolean
  pending: boolean
  onToggle: (paid: boolean) => void
}>) {
  if (!editable) return <>{row.paid ? '✓ Paid' : 'Not paid'}</>
  return (
    <label className={styles.check}>
      <input
        type="checkbox"
        checked={row.paid}
        disabled={pending}
        onChange={(event) => {
          onToggle(event.target.checked)
        }}
      />
      <span>
        Paid<span className={styles.hidden}> for {row.name}</span>
      </span>
    </label>
  )
}

function PayoutView({
  view,
  id,
  data,
}: Readonly<{ view: string | null; id: string; data: PayoutList }>) {
  if (view === 'payout') return <ByPayout tournamentId={id} list={data} />
  return <ByBowler tournamentId={id} />
}

function ByPayout({ tournamentId, list }: Readonly<{ tournamentId: string; list: PayoutList }>) {
  const canWrite = useCan('payouts.write')
  const editable = canWrite && !list.tournamentComplete
  const [event, setEvent] = useState('')
  const [paid, setPaid] = useState<PaidFilter>('all')
  const [failure, setFailure] = useState<string>()
  const dismiss = useCallback(() => {
    setFailure(undefined)
  }, [])
  const toggle = useSetPaid(tournamentId)
  const rows = filterRows(list.payouts, event, paid)
  const options = eventOptions(list.payouts, formatSessionDate)

  return (
    <>
      {failure && (
        <Toast kind="error" onDismiss={dismiss}>
          {failure}
        </Toast>
      )}
      <div className={styles.toolbar}>
        <label className={styles.field}>
          <span>Event</span>
          <select
            className={styles.select}
            value={event}
            onChange={(change) => {
              setEvent(change.target.value)
            }}
          >
            <option value="">All events</option>
            {options.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Paid</span>
          <select
            className={styles.select}
            value={paid}
            onChange={(change) => {
              setPaid(asPaidFilter(change.target.value))
            }}
          >
            <option value="all">All</option>
            <option value="unpaid">Not paid</option>
            <option value="paid">Paid</option>
          </select>
        </label>
      </div>
      {list.tournamentComplete && (
        <output className={styles.block}>This tournament is complete. Payouts are locked.</output>
      )}
      {rows.length === 0 ? (
        <p>No payout matches.</p>
      ) : (
        <table className={`${styles.table} ${styles.stack}`}>
          <caption className={styles.hidden}>Payouts by payout</caption>
          <thead>
            <tr>
              <th scope="col">Event</th>
              <th scope="col">Bowler</th>
              <th scope="col">Division</th>
              <th scope="col" className={styles.num}>
                Amount
              </th>
              <th scope="col">Note</th>
              <th scope="col">Paid</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.eventLabel}
                  {row.eventDate && <> {formatSessionDate(row.eventDate)}</>}
                </td>
                <th scope="row">{row.name}</th>
                <td>{row.divisionName}</td>
                <td className={styles.num}>{formatMoney(row.amount)}</td>
                <td>{row.note}</td>
                <td>
                  <PaidCell
                    row={row}
                    editable={editable}
                    pending={toggle.isPending && toggle.variables.payoutId === row.id}
                    onToggle={(next) => {
                      toggle.mutate(
                        { payoutId: row.id, paid: next },
                        {
                          onError: (error) => {
                            setFailure(error.message)
                          },
                        },
                      )
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

function ByBowler({ tournamentId }: Readonly<{ tournamentId: string }>) {
  const [min, setMin] = useState('')
  const { data, isPending, error, refetch } = usePayoutTotals(tournamentId, '')
  const minimum = readMinimum(min)

  if (isPending) return <Loading label="Loading totals…" rows={3} />
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
  const shown: BowlerTotal[] = minimum.kind === 'least' ? atLeast(data, minimum.cents) : data
  const minId = 'payout-minimum'
  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.field}>
          <label htmlFor={minId}>Earned at least ($)</label>
          <input
            id={minId}
            className={styles.input}
            inputMode="decimal"
            autoComplete="off"
            value={min}
            aria-invalid={minimum.kind === 'invalid' ? true : undefined}
            aria-describedby={minimum.kind === 'invalid' ? `${minId}-error` : undefined}
            onChange={(event) => {
              setMin(event.target.value)
            }}
          />
          {minimum.kind === 'invalid' && (
            <span id={`${minId}-error`} className={styles.fieldError}>
              {minimum.message}
            </span>
          )}
        </div>
      </div>
      {shown.length === 0 ? (
        <p>
          {minimum.kind === 'least'
            ? `No bowler has earned ${formatMoney(formatCents(minimum.cents))} or more.`
            : 'No payouts are recorded yet.'}
        </p>
      ) : (
        <table className={`${styles.table} ${styles.stack}`}>
          <caption className={styles.hidden}>Payouts by bowler</caption>
          <thead>
            <tr>
              <th scope="col">Bowler</th>
              <th scope="col">Division</th>
              <th scope="col" className={styles.num}>
                Payouts
              </th>
              <th scope="col" className={styles.num}>
                Total
              </th>
              <th scope="col" className={styles.num}>
                Not paid
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((bowler) => (
              <tr key={bowler.registrationId}>
                <th scope="row">{bowler.name}</th>
                <td>{bowler.divisionName}</td>
                <td className={styles.num}>{bowler.count}</td>
                <td className={styles.num}>{formatMoney(bowler.total)}</td>
                <td className={styles.num}>{formatMoney(bowler.unpaidTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

/**
 * Every payout of the tournament (PAY-19, D-276): By payout (the lines, with filters and the Paid
 * toggle) and By bowler (the total of each bowler, with "Earned at least"). The view is in the
 * address (`?view=bowler`). Entering payouts is a different job: it starts from each event.
 */
export function PayoutsPage() {
  // Stryker disable next-line StringLiteral: the route always has an :id; this only satisfies the type.
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const view = params.get('view') === 'bowler' ? 'bowler' : 'payout'
  const { data, isPending, error, refetch } = usePayouts(id)

  if (isPending) {
    return (
      <>
        <h1>Payouts</h1>
        <Loading label="Loading payouts…" rows={4} />
      </>
    )
  }
  if (error) {
    if (error instanceof TournamentNotFoundError) return <p>This tournament does not exist.</p>
    return (
      <QueryError
        error={error}
        onRetry={() => {
          void refetch()
        }}
      />
    )
  }

  return (
    <>
      <title>Payouts · Tournament Director</title>
      <h1>Payouts</h1>
      <PayoutDisclaimer />
      <dl className={styles.summary}>
        <div>
          <dt>Payouts</dt>
          <dd>{data.summary.count}</dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd>{formatMoney(data.summary.total)}</dd>
        </div>
        <div>
          <dt>Not paid</dt>
          <dd>
            {data.summary.unpaidCount} ({formatMoney(data.summary.unpaidTotal)})
          </dd>
        </div>
      </dl>
      <nav aria-label="Payout views">
        <ul className={styles.tabs}>
          <li>
            <Link to="?view=payout" aria-current={view === 'payout' ? 'page' : undefined}>
              By payout
            </Link>
          </li>
          <li>
            <Link to="?view=bowler" aria-current={view === 'bowler' ? 'page' : undefined}>
              By bowler
            </Link>
          </li>
        </ul>
      </nav>
      {data.payouts.length === 0 ? (
        <p>
          No payouts are recorded yet. Open a completed squad or sweeper, or the Seeding page, to
          enter them.
        </p>
      ) : (
        <PayoutView view={view} id={id} data={data} />
      )}
    </>
  )
}
