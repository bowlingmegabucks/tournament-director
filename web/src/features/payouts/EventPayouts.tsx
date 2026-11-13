import { useCallback, useState } from 'react'
import { Can } from '../auth/Can'
import { formatMoney } from '../../shared/formatMoney'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { Toast } from '../../shared/Toast'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import { formatCents, parseAmount } from './amount'
import { PayoutDisclaimer } from './PayoutDisclaimer'
import { PayoutSheetDialog } from './PayoutSheetDialog'
import styles from './Payouts.module.css'
import type { PayoutSheet, PayoutSource } from './types'
import { titleOf } from './eventTitle'
import { usePayoutSheet } from './usePayouts'

interface EventPayoutsProps {
  source: PayoutSource
  tournamentId: string
  /** The squad, sweeper, or division id. The super sweeper has none. */
  eventId: string
}

/** The saved payouts of the sheet, with the figures above the table. */
function figuresOf(sheet: PayoutSheet) {
  const saved = sheet.payees.flatMap((payee) =>
    payee.payout ? [{ payee, payout: payee.payout }] : [],
  )
  let total = 0
  let unpaid = 0
  let unpaidCount = 0
  for (const { payout } of saved) {
    const parsed = parseAmount(payout.amount)
    const cents = parsed.kind === 'amount' ? parsed.cents : 0
    total += cents
    if (!payout.paid) {
      unpaid += cents
      unpaidCount += 1
    }
  }
  return { saved, total, unpaid, unpaidCount }
}

/**
 * The payouts of one event (PAY-02 to PAY-06, PAY-13, D-276): the disclaimer, the figures, an "Enter
 * payouts" button for a user with `payouts.write`, and the saved payouts as a table that reflows to
 * cards on a phone. The button is off, with the reason, until the event is ready (D-272) and once
 * the tournament is complete (D-273).
 */
export function EventPayouts({ source, tournamentId, eventId }: Readonly<EventPayoutsProps>) {
  const { data, isPending, error, refetch } = usePayoutSheet(source, tournamentId, eventId)
  const [editing, setEditing] = useState(false)
  const [saved, setSaved] = useState(false)
  const dismiss = useCallback(() => {
    setSaved(false)
  }, [])

  if (isPending) return <Loading label="Loading payouts…" rows={3} />
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

  const { saved: payouts, total, unpaid, unpaidCount } = figuresOf(data)
  const Heading = source === 'squad' || source === 'sweeper' ? 'h2' : 'h1'
  return (
    <>
      <title>{`${titleOf(data)} · Tournament Director`}</title>
      <Heading>{titleOf(data)}</Heading>
      <PayoutDisclaimer />
      {saved && (
        <Toast kind="success" autoDismissMs={6000} onDismiss={dismiss}>
          Payouts saved.
        </Toast>
      )}
      <dl className={styles.summary}>
        <div>
          <dt>Payouts</dt>
          <dd>{payouts.length}</dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd>{formatMoney(formatCents(total))}</dd>
        </div>
        <div>
          <dt>Not paid</dt>
          <dd>
            {unpaidCount} ({formatMoney(formatCents(unpaid))})
          </dd>
        </div>
      </dl>
      {data.reason && <p role="status">{data.reason}</p>}
      <Can permission="payouts.write">
        <div className={styles.toolbar}>
          <button
            type="button"
            disabled={data.status !== 'open'}
            onClick={() => {
              setEditing(true)
            }}
          >
            Enter payouts
          </button>
        </div>
      </Can>
      {payouts.length === 0 ? (
        data.status === 'notReady' ? null : (
          <p>{`No payouts are recorded for ${data.event.label.toLowerCase().startsWith('finals') ? 'these finals' : `this ${data.event.label.toLowerCase()}`}.`}</p>
        )
      ) : (
        <table className={`${styles.table} ${styles.stack}`}>
          <caption className={styles.hidden}>Payouts</caption>
          <thead>
            <tr>
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
            {payouts.map(({ payee, payout }) => (
              <tr key={payee.registrationId}>
                <th scope="row">
                  {payee.name}
                  {!payee.inferred && <span className={styles.tag}>added by hand</span>}
                </th>
                <td>{payee.divisionName}</td>
                <td className={styles.num}>{formatMoney(payout.amount)}</td>
                <td>{payout.note}</td>
                <td>{payout.paid ? '✓ Paid' : 'Not paid'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && (
        <PayoutSheetDialog
          sheet={data}
          tournamentId={tournamentId}
          onSaved={() => {
            setEditing(false)
            setSaved(true)
          }}
          onClose={() => {
            setEditing(false)
          }}
        />
      )}
    </>
  )
}
