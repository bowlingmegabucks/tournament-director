import { useCallback, useState } from 'react'
import { useOutletContext } from 'react-router'
import { Can } from '../auth/Can'
import { formatMoney } from '../../shared/formatMoney'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { Toast } from '../../shared/Toast'
import { formatSessionDate } from '../../shared/sessionFormat'
import { TournamentNotFoundError } from '../../shared/tournamentQuery'
import type { Tournament } from '../tournaments/types'
import { formatCents, parseAmount } from './amount'
import { PayoutDisclaimer } from './PayoutDisclaimer'
import { PrintPayoutsButton } from './PayoutPrint'
import { PayoutSheetDialog } from './PayoutSheetDialog'
import { smartCents, smartNotice, splitMoney, totalFigures } from './smartTotals'
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
/** "these finals" or "this squad", for the empty message. */
function eventNoun(label: string): string {
  const lower = label.toLowerCase()
  return lower.startsWith('finals') ? 'these finals' : `this ${lower}`
}

/** The printed title names the event, since the page's own heading sits in the session portal. */
function printTitleOf(sheet: PayoutSheet): string {
  return sheet.event.source === 'squad' || sheet.event.source === 'sweeper'
    ? `${sheet.event.label} payouts`
    : titleOf(sheet)
}

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
  const lines = saved.map(({ payee, payout }) => ({
    amount: payout.amount,
    smartScholarship: payee.smartScholarship,
    paid: payout.paid,
  }))
  const smart = smartCents(lines)
  const unpaidSmart = smartCents(lines.filter((line) => !line.paid))
  return { saved, total, unpaid, unpaidCount, smart, unpaidSmart }
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
  const tournament = useOutletContext<Tournament>()
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

  const { saved: payouts, total, unpaid, unpaidCount, smart, unpaidSmart } = figuresOf(data)
  const emptyMessage =
    data.status === 'notReady' ? null : (
      <p>{`No payouts are recorded for ${eventNoun(data.event.label)}.`}</p>
    )
  // What both printed sheets share. Each sheet picks its own figures from the named parts below.
  const countFigure = `${payouts.length} ${payouts.length === 1 ? 'payout' : 'payouts'}`
  const totals = totalFigures(total, smart)
  const unpaidFigure = `Not paid ${splitMoney(unpaid, unpaidSmart)}`
  const printBase = {
    tournamentName: tournament.name,
    subtitle: data.event.date ? formatSessionDate(data.event.date) : undefined,
    signature: true,
  }
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
        {smart > 0 && (
          <>
            <div>
              <dt>Cash</dt>
              <dd>{formatMoney(formatCents(total - smart))}</dd>
            </div>
            <div>
              <dt>SMART scholarship</dt>
              <dd>{formatMoney(formatCents(smart))}</dd>
            </div>
          </>
        )}
        <div>
          <dt>Not paid</dt>
          <dd>
            {unpaidCount} ({splitMoney(unpaid, unpaidSmart)})
          </dd>
        </div>
      </dl>
      {data.reason && <output className={styles.block}>{data.reason}</output>}
      <div className={styles.toolbar}>
        <Can permission="payouts.write">
          <button
            type="button"
            disabled={data.status !== 'open'}
            onClick={() => {
              setEditing(true)
            }}
          >
            Enter payouts
          </button>
        </Can>
        {payouts.length > 0 && (
          <PrintPayoutsButton
            {...printBase}
            label="Print sign-off sheet"
            title={`${printTitleOf(data)}: sign-off`}
            columns={[
              { id: 'bowler', label: 'Bowler' },
              { id: 'division', label: 'Division' },
              { id: 'result', label: 'Result' },
              { id: 'amount', label: 'Amount', num: true },
            ]}
            rows={payouts.map(({ payee, payout }) => ({
              key: payee.registrationId,
              cells: [payee.name, payee.divisionName, payee.detail, formatMoney(payout.amount)],
              signatureText: payee.smartScholarship ? smartNotice : undefined,
            }))}
            figures={[countFigure, ...totals]}
            tall
          />
        )}
        {payouts.length > 0 && (
          <PrintPayoutsButton
            {...printBase}
            label="Print payouts"
            title={printTitleOf(data)}
            figures={[countFigure, ...totals, unpaidFigure]}
            columns={[
              { id: 'bowler', label: 'Bowler' },
              { id: 'division', label: 'Division' },
              { id: 'amount', label: 'Amount', num: true },
              { id: 'note', label: 'Note' },
              { id: 'paid', label: 'Paid' },
            ]}
            rows={payouts.map(({ payee, payout }) => ({
              key: payee.registrationId,
              cells: [
                payee.name,
                payee.divisionName,
                formatMoney(payout.amount),
                payout.note ?? '',
                payout.paid ? 'Paid' : 'Not paid',
              ],
              signatureText: payee.smartScholarship ? smartNotice : undefined,
            }))}
          />
        )}
      </div>
      {payouts.length === 0 ? (
        emptyMessage
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
                  {payee.smartScholarship && <span className={styles.tag}>{smartNotice}</span>}
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
