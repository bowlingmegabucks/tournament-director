import { useEffect, useId, useRef, useState } from 'react'
import { showOnMount } from '../../shared/dialogParts'
import dialog from '../../shared/Dialog.module.css'
import { formatMoney } from '../../shared/formatMoney'
import { LeaveDialog } from '../../shared/LeaveDialog'
import { plural } from '../../shared/plural'
import { useLeaveGuard } from '../../shared/useLeaveGuard'
import { PaidConfirmError, PayoutFieldErrorsError } from './api'
import { AddBowlerDialog } from './AddBowlerDialog'
import { formatCents } from './amount'
import { ConfirmPaidDialog } from './ConfirmPaidDialog'
import { PayoutDisclaimer } from './PayoutDisclaimer'
import styles from './PayoutSheet.module.css'
import shared from './Payouts.module.css'
import { SameAmountDialog } from './SameAmountDialog'
import {
  addedRow,
  fillAmount,
  isDirty,
  rowsOf,
  sameAmountTargets,
  saveRowsOf,
  totalOf,
  validateRows,
  type RowState,
} from './sheetForm'
import type { PaidChange, PayoutSheet } from './types'
import { useSavePayouts } from './usePayouts'

interface PayoutSheetDialogProps {
  sheet: PayoutSheet
  tournamentId: string
  onSaved: () => void
  onClose: () => void
}

type Sub = 'same' | 'add' | 'discard' | undefined

/** A line for the wording of one row's boxes: "Amount" plus the bowler, so a screen reader hears whose. */
function rowsNeedFixing(count: number): string {
  return count === 1 ? '1 row needs' : `${count} rows need`
}

function Named({ label, name }: Readonly<{ label: string; name: string }>) {
  return (
    <>
      {label}
      <span className={shared.hidden}> for {name}</span>
    </>
  )
}

interface RowEditorProps {
  row: RowState
  finals: boolean
  errors: Record<string, string>
  onChange: (change: Partial<RowState>) => void
}

function RowEditor({ row, finals, errors, onChange }: Readonly<RowEditorProps>) {
  const id = useId()
  const amountError = errors[`amount:${row.registrationId}`]
  const noteError = errors[`note:${row.registrationId}`]
  const noteVisible = row.noteOpen || noteError !== undefined
  return (
    <li className={styles.row}>
      {finals && (
        <label className={`${shared.check} ${styles.tick}`}>
          <input
            type="checkbox"
            checked={row.ticked}
            onChange={(event) => {
              onChange({ ticked: event.target.checked })
            }}
          />
          <span>
            <span className={shared.hidden}>Include {row.name} in </span>
            Same amount
          </span>
        </label>
      )}
      <div className={styles.who}>
        <strong>
          {row.name}
          {!row.inferred && <span className={shared.tag}>added by hand</span>}
        </strong>
        <span className={shared.muted}>
          {row.divisionName} · {row.detail}
        </span>
      </div>
      <div className={`${shared.field} ${styles.amount}`}>
        <label htmlFor={`${id}-amount`}>
          <Named label="Amount" name={row.name} />
        </label>
        <span className={styles.money}>
          <span aria-hidden="true">$</span>
          <input
            id={`${id}-amount`}
            className={shared.input}
            inputMode="decimal"
            autoComplete="off"
            value={row.amount}
            aria-invalid={amountError ? true : undefined}
            aria-describedby={amountError ? `${id}-amount-error` : undefined}
            onChange={(event) => {
              onChange({ amount: event.target.value })
            }}
          />
        </span>
        {amountError && (
          <span id={`${id}-amount-error`} className={shared.fieldError}>
            {amountError}
          </span>
        )}
      </div>
      <div className={`${shared.field} ${styles.note} ${noteVisible ? '' : styles.closedOnPhone}`}>
        <label htmlFor={`${id}-note`}>
          <Named label={row.inferred ? 'Note (optional)' : 'Note (required)'} name={row.name} />
        </label>
        <input
          id={`${id}-note`}
          className={shared.input}
          autoComplete="off"
          value={row.note}
          aria-invalid={noteError ? true : undefined}
          aria-describedby={noteError ? `${id}-note-error` : undefined}
          onChange={(event) => {
            onChange({ note: event.target.value })
          }}
        />
        {noteError && (
          <span id={`${id}-note-error`} className={shared.fieldError}>
            {noteError}
          </span>
        )}
      </div>
      <div className={styles.meta}>
        <label className={`${shared.check} ${styles.paid}`}>
          <input
            type="checkbox"
            checked={row.paid}
            onChange={(event) => {
              onChange({ paid: event.target.checked })
            }}
          />
          <Named label="Paid" name={row.name} />
        </label>
        {!noteVisible && (
          <button
            type="button"
            className={`${styles.link} ${styles.linkOnly}`}
            aria-label={`Add note for ${row.name}`}
            onClick={() => {
              onChange({ noteOpen: true })
            }}
          >
            Add note
          </button>
        )}
      </div>
    </li>
  )
}

/**
 * The entry sheet of one event (PAY-02 to PAY-08, PAY-12, D-268 to D-278). One Save sends the whole
 * list in one request. A mistake shows next to its row; a paid payout that would change asks first
 * (D-273). A dialog from 40rem, a full-screen sheet on a phone. Cancel asks first when something was
 * typed.
 */
export function PayoutSheetDialog({
  sheet,
  tournamentId,
  onSaved,
  onClose,
}: Readonly<PayoutSheetDialogProps>) {
  const titleId = useId()
  const [rows, setRows] = useState(() => rowsOf(sheet))
  const [originalCount] = useState(rows.length)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<string>()
  const [attempt, setAttempt] = useState(0)
  const [sub, setSub] = useState<Sub>()
  const [paidChanges, setPaidChanges] = useState<PaidChange[]>()
  const summaryRef = useRef<HTMLParagraphElement>(null)
  const save = useSavePayouts(sheet.event.source, tournamentId, sheet.event.eventId)
  const { source } = sheet.event
  const dirty = isDirty(rows, originalCount)
  // A move to another page (or a reload) with typed work asks first; Close and Escape ask on their own.
  const guard = useLeaveGuard(dirty)
  const total = totalOf(rows)
  const targets = sameAmountTargets(source, rows)
  const listed = new Set(rows.map((row) => row.registrationId))
  const others = sheet.others.filter((other) => !listed.has(other.registrationId))
  const failedRows = Object.keys(errors).length
  const [show] = useState(() => (node: HTMLDialogElement | null) => {
    showOnMount(node)
  })

  // Move focus to the error summary after a failed save, so a keyboard or screen reader user lands on it.
  useEffect(() => {
    if (attempt > 0) summaryRef.current?.focus()
  }, [attempt])

  const change = (registrationId: string, patch: Partial<RowState>) => {
    setRows((current) =>
      current.map((row) => (row.registrationId === registrationId ? { ...row, ...patch } : row)),
    )
  }

  const send = async (confirmPaid: boolean) => {
    try {
      await guard.whileSaving(() => save.mutateAsync({ rows: saveRowsOf(rows), confirmPaid }))
    } catch (error) {
      if (error instanceof PaidConfirmError) {
        setPaidChanges(error.changes)
        return
      }
      setPaidChanges(undefined)
      if (error instanceof PayoutFieldErrorsError) {
        setErrors(error.errors)
        setFailure(undefined)
      } else {
        setFailure(error instanceof Error ? error.message : 'Failed to save the payouts')
      }
      setAttempt((count) => count + 1)
      return
    }
    setPaidChanges(undefined)
    onSaved()
  }

  const submit = () => {
    const found = validateRows(rows)
    setErrors(found)
    setFailure(undefined)
    if (Object.keys(found).length > 0) {
      setAttempt((count) => count + 1)
      return
    }
    void send(false)
  }

  const close = () => {
    if (dirty) setSub('discard')
    else onClose()
  }

  const readOnly = sheet.status !== 'open'
  return (
    <>
      <dialog
        ref={show}
        className={styles.dialog}
        aria-labelledby={titleId}
        onCancel={(event) => {
          // Escape asks first when typed work would go, and never closes while the save runs.
          if (save.isPending || dirty) event.preventDefault()
          if (dirty && !save.isPending) setSub('discard')
        }}
        onClose={onClose}
      >
        <form
          className={styles.form}
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            if (!save.isPending && !readOnly) submit()
          }}
        >
          <div className={styles.head}>
            <h2 id={titleId} className={styles.title}>
              Payouts: {sheet.event.label}
            </h2>
            <button
              type="button"
              className={styles.secondary}
              disabled={save.isPending}
              onClick={close}
            >
              Close
            </button>
          </div>
          <div className={styles.body}>
            <PayoutDisclaimer />
            {readOnly ? (
              <output className={shared.disclaimer}>{sheet.reason}</output>
            ) : (
              <>
                {(failedRows > 0 || failure) && (
                  <p ref={summaryRef} tabIndex={-1} role="alert" className={styles.errorSummary}>
                    {failure ?? `${rowsNeedFixing(failedRows)} fixing. Nothing was saved.`}
                  </p>
                )}
                <div className={shared.toolbar}>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => {
                      setSub('same')
                    }}
                  >
                    {source === 'finals' ? 'Same amount for ticked' : 'Same amount for all'}
                  </button>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => {
                      setSub('add')
                    }}
                  >
                    Add another bowler
                  </button>
                </div>
                {rows.length === 0 ? (
                  <p>
                    No bowler is inferred to be paid in this event. Add another bowler to pay one.
                  </p>
                ) : (
                  <ul className={styles.rows}>
                    {rows.map((row) => (
                      <RowEditor
                        key={row.registrationId}
                        row={row}
                        finals={source === 'finals'}
                        errors={errors}
                        onChange={(patch) => {
                          change(row.registrationId, patch)
                        }}
                      />
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
          <div className={styles.foot}>
            <span className={styles.total}>
              <strong>{formatMoney(formatCents(total.cents))}</strong>
              <span className={shared.muted}>{plural(total.count, 'bowler', 'bowlers')}</span>
            </span>
            <span className={styles.footActions}>
              {!readOnly && (
                <button type="submit" disabled={save.isPending}>
                  {save.isPending && paidChanges === undefined ? 'Saving…' : 'Save payouts'}
                </button>
              )}
            </span>
          </div>
        </form>
      </dialog>

      {sub === 'same' && (
        <SameAmountDialog
          source={source}
          targets={targets}
          onFill={(amount) => {
            setRows((current) => fillAmount(current, sameAmountTargets(source, current), amount))
          }}
          onClose={() => {
            setSub(undefined)
          }}
        />
      )}
      {sub === 'add' && (
        <AddBowlerDialog
          others={others}
          onAdd={(other) => {
            setRows((current) => [...current, addedRow(other)])
          }}
          onClose={() => {
            setSub(undefined)
          }}
        />
      )}
      {sub === 'discard' && (
        <dialog
          ref={show}
          className={dialog.dialog}
          aria-labelledby={`${titleId}-discard`}
          onClose={() => {
            setSub(undefined)
          }}
        >
          <div className={dialog.content}>
            <h2 id={`${titleId}-discard`} className={dialog.title}>
              Discard what you typed?
            </h2>
            <p className={dialog.text}>The amounts and notes you typed are not saved yet.</p>
            <div className={dialog.actions}>
              <button
                type="button"
                className={dialog.secondary}
                onClick={() => {
                  setSub(undefined)
                }}
              >
                Keep editing
              </button>
              <button type="button" className={dialog.destructive} onClick={onClose}>
                Discard
              </button>
            </div>
          </div>
        </dialog>
      )}
      <LeaveDialog blocker={guard.blocker} />
      {paidChanges && (
        <ConfirmPaidDialog
          changes={paidChanges}
          pending={save.isPending}
          onConfirm={() => {
            void send(true)
          }}
          onClose={() => {
            setPaidChanges(undefined)
          }}
        />
      )}
    </>
  )
}
