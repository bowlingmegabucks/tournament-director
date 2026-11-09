import { useId, useState } from 'react'
import dialog from '../../shared/Dialog.module.css'
import { closeDialogOf, showOnMount } from '../../shared/dialogParts'
import { Loading } from '../../shared/Loading'
import { plural } from '../../shared/plural'
import { formatSessionDate } from '../../shared/sessionFormat'
import { formatFee } from '../tournaments/format'
import styles from './DeleteRegistration.module.css'
import type { DeleteInfo } from './types'

export const scoresMessage = 'Cannot delete registration with scores.'
export const completeMessage =
  'This tournament is complete, so its registrations cannot be deleted.'

interface DeleteRegistrationDialogProps {
  bowlerName: string
  /** Undefined while it loads, or when it could not be read. */
  info: DeleteInfo | undefined
  loading: boolean
  /** The read is running again (a payment arrived): Delete waits for the new total. */
  refreshing?: boolean
  /** The read failed (D-212): Delete stays off until Try again works. */
  loadFailure?: string
  onRetry: () => void
  pending: boolean
  /** Why the request did not go through, when it did not. */
  failure?: string
  /** `confirmPaid` is the total paid the desk ticked for, or undefined with no real payment (D-210). */
  onConfirm: (confirmPaid: number | undefined) => void
  onClose: () => void
}

function systemsOf(payments: DeleteInfo['payments']): string {
  return [...new Set(payments.map((payment) => payment.system))].join(', ')
}

/**
 * The delete confirmation for a registration (REG-19, D-210 to D-213). Cancel has focus first, so
 * Enter on a fresh dialog is the safe choice. With scores or a complete tournament the dialog says
 * why the registration stays and offers only Close (D-211). With a real payment the desk must tick
 * the box for that total before Delete turns on; if the total changes the tick no longer counts.
 */
export function DeleteRegistrationDialog({
  bowlerName,
  info,
  loading,
  refreshing = false,
  loadFailure,
  onRetry,
  pending,
  failure,
  onConfirm,
  onClose,
}: Readonly<DeleteRegistrationDialogProps>) {
  const titleId = useId()
  const tickId = useId()
  // The total the desk ticked for. A new total (a payment arrived) leaves the box unticked.
  const [tickedFor, setTickedFor] = useState<number | undefined>()
  const refusals = [
    ...(info?.tournamentComplete ? [completeMessage] : []),
    ...(info?.hasScores ? [scoresMessage] : []),
  ]
  const blocked = refusals.length > 0
  const paid = info !== undefined && info.payments.length > 0
  const ticked = !paid || tickedFor === info.paidTotal
  const ready = info !== undefined && !blocked && ticked

  return (
    <dialog ref={showOnMount} className={dialog.dialog} aria-labelledby={titleId} onClose={onClose}>
      <div className={dialog.content}>
        <h2 id={titleId} className={dialog.title}>
          Delete {bowlerName}&apos;s registration?
        </h2>
        {loading && <Loading label="Loading registration…" />}
        {loadFailure && (
          <p role="alert" className={dialog.error}>
            {loadFailure}{' '}
            <button type="button" className={dialog.secondary} onClick={onRetry}>
              Try again
            </button>
          </p>
        )}
        {info && blocked && (
          <div role="alert" className={dialog.error}>
            <ul className={styles.reasons}>
              {refusals.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        )}
        {info && !blocked && (
          <>
            <p className={dialog.text}>
              Are you sure you want to delete this bowler&apos;s entire registration? The entries
              and their lane positions go. The bowler record stays. This cannot be undone.
            </p>
            {info.entries.length > 0 && (
              <table className={styles.fees}>
                <caption>Refund may be due, handled outside the app</caption>
                <thead>
                  <tr>
                    <th scope="col">Entry</th>
                    <th scope="col">Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {info.entries.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        {entry.kind === 'squad' ? 'Squad' : 'Sweeper'},{' '}
                        {formatSessionDate(entry.date)}
                      </td>
                      <td>{formatFee(entry.entryFee)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">{paid ? 'Entries total' : 'Total'}</th>
                    <td>{formatFee(info.entriesTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
            {paid && (
              <>
                <p role="alert" className={styles.paid}>
                  <strong>Paid outside this system: {formatFee(info.paidTotal)}</strong> (
                  {systemsOf(info.payments)}, {plural(info.payments.length, 'payment', 'payments')}
                  ). Deleting the registration removes the payment records. Any refund is handled
                  outside the app.
                </p>
                <div className={styles.tick}>
                  <input
                    id={tickId}
                    type="checkbox"
                    checked={tickedFor === info.paidTotal}
                    onChange={(event) => {
                      setTickedFor(event.target.checked ? info.paidTotal : undefined)
                    }}
                  />
                  <label htmlFor={tickId}>
                    I know this bowler paid outside this system and any refund is handled outside
                    the app.
                  </label>
                </div>
              </>
            )}
          </>
        )}
        {failure && (
          <p role="alert" className={dialog.error}>
            {failure}
          </p>
        )}
        <div className={dialog.actions}>
          <button
            type="button"
            className={dialog.secondary}
            disabled={pending}
            onClick={closeDialogOf}
          >
            {blocked ? 'Close' : 'Cancel'}
          </button>
          {!blocked && (
            <button
              type="button"
              className={dialog.destructive}
              disabled={!ready || pending || refreshing}
              onClick={() => {
                onConfirm(paid ? info.paidTotal : undefined)
              }}
            >
              {pending ? 'Deleting…' : 'Delete registration'}
            </button>
          )}
        </div>
      </div>
    </dialog>
  )
}
