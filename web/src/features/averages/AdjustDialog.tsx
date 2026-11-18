import { useId, useRef, useState } from 'react'
import { closeDialogOf, showOnMount } from '../../shared/dialogParts'
import styles from '../../shared/Dialog.module.css'
import { AverageConfirmError, AverageFieldErrorsError } from './api'
import own from './Averages.module.css'
import type { AverageRow } from './types'
import { useSaveCheck } from './useAverages'

interface AdjustDialogProps {
  tournamentId: string
  row: AverageRow
  onClose: () => void
  /** Called after a save, so the page can say so. */
  onSaved: (row: AverageRow) => void
}

const noteLimit = 500

/**
 * Adjust one bowler's average (AVG-04 to AVG-06, D-291, D-294): a whole average and the reason it
 * changed or where it came from. The API says what is wrong with each field (a limit of the
 * division, a missing note). A bowler with scores gets a warning first, and the button then says
 * "Adjust anyway".
 */
export function AdjustDialog({ tournamentId, row, onClose, onSaved }: Readonly<AdjustDialogProps>) {
  const titleId = useId()
  const averageId = useId()
  const averageErrorId = useId()
  const noteId = useId()
  const noteErrorId = useId()
  const averageRef = useRef<HTMLInputElement>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const [average, setAverage] = useState(row.averageInUse === null ? '' : String(row.averageInUse))
  const [note, setNote] = useState(row.note ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [warning, setWarning] = useState<string>()
  const [failure, setFailure] = useState<string>()
  const save = useSaveCheck(tournamentId)
  const [open] = useState(() => (node: HTMLDialogElement | null) => {
    showOnMount(node)
  })

  const submit = () => {
    setErrors({})
    setFailure(undefined)
    const trimmed = average.trim()
    save.mutate(
      {
        registrationId: row.registrationId,
        change: {
          action: 'adjust',
          average: trimmed === '' ? null : Number(trimmed),
          note,
        },
        confirm: warning !== undefined,
      },
      {
        onSuccess: () => {
          onSaved(row)
          onClose()
        },
        onError: (error) => {
          if (error instanceof AverageConfirmError) {
            setWarning(error.message)
          } else if (error instanceof AverageFieldErrorsError) {
            setWarning(undefined)
            setErrors(error.errors)
            if (error.errors['average']) averageRef.current?.focus()
            else if (error.errors['note']) noteRef.current?.focus()
            // A refusal that names no field (not a handicap division, say) shows as the message.
            else setFailure(error.message)
          } else {
            setFailure(error.message)
          }
        },
      },
    )
  }

  const idleLabel = warning ? 'Adjust anyway' : 'Save adjusted average'
  const saveLabel = save.isPending ? 'Saving…' : idleLabel

  return (
    <dialog
      ref={open}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        if (save.isPending) event.preventDefault()
      }}
      onClose={onClose}
    >
      <form
        className={styles.content}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (!save.isPending) submit()
        }}
      >
        <h2 id={titleId} className={styles.title}>
          Adjust average: {row.bowlerName}
        </h2>
        <p className={own.hint}>
          {row.divisionName} · provided {row.providedAverage ?? 'none'}
        </p>
        <div className={own.field}>
          <label htmlFor={averageId}>Verified average</label>
          <input
            ref={averageRef}
            id={averageId}
            className={own.input}
            inputMode="numeric"
            autoComplete="off"
            value={average}
            aria-invalid={errors['average'] ? true : undefined}
            aria-describedby={errors['average'] ? averageErrorId : undefined}
            onChange={(event) => {
              setAverage(event.target.value)
              setWarning(undefined)
            }}
          />
          {errors['average'] && (
            <p id={averageErrorId} className={own.fieldError} role="alert">
              {errors['average']}
            </p>
          )}
        </div>
        <div className={own.field}>
          <label htmlFor={noteId}>
            Why was it adjusted, or where did the new average come from?
          </label>
          <textarea
            ref={noteRef}
            id={noteId}
            className={own.input}
            rows={3}
            value={note}
            aria-invalid={errors['note'] ? true : undefined}
            aria-describedby={errors['note'] ? noteErrorId : undefined}
            onChange={(event) => {
              setNote(event.target.value)
              setWarning(undefined)
            }}
          />
          {errors['note'] ? (
            <p id={noteErrorId} className={own.fieldError} role="alert">
              {errors['note']}
            </p>
          ) : (
            <p className={own.hint}>
              Required. {note.length} of {noteLimit} characters.
            </p>
          )}
        </div>
        {warning && (
          <p className={own.notice} role="alert">
            {warning}
          </p>
        )}
        {failure && (
          <p className={own.fieldError} role="alert">
            {failure}
          </p>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            disabled={save.isPending}
            onClick={closeDialogOf}
          >
            Cancel
          </button>
          <button type="submit" disabled={save.isPending}>
            {saveLabel}
          </button>
        </div>
      </form>
    </dialog>
  )
}
