import { useId, useState } from 'react'
import type { ChangeEvent, MouseEvent, ReactNode, SubmitEvent } from 'react'
import { Link } from 'react-router'
import { ConfirmChangesDialog } from './ConfirmChangesDialog'
import { describeChange } from './describeChange'
import styles from './TournamentForm.module.css'
import {
  tournamentFields,
  type FieldErrors,
  type TournamentField,
  type TournamentFormValues,
  type TournamentWarning,
} from './types'
import { endBeforeStartMessage, validateChanges, validateTournament } from './validateTournament'

const isTournamentField = (name: string): name is TournamentField =>
  (tournamentFields as readonly string[]).includes(name)

const labels: Record<TournamentField, string> = {
  name: 'Name',
  startDate: 'Start date',
  endDate: 'End date',
  bowlingCenter: 'Bowling center',
  entryFee: 'Entry fee in dollars',
  games: 'Games per squad',
  finalsRatio: 'Finals ratio',
  cashRatio: 'Cash ratio',
  superSweeperCashRatio: 'Super sweeper cash ratio',
}

const defaultHints: Partial<Record<TournamentField, string>> = {
  entryFee: 'Per squad entry. A squad can set its own later. Up to 999.99.',
  games: '1 to 99.',
  finalsRatio: '1 in N advance. Greater than 1. Example: 8.',
  cashRatio: '1 in N cash. Greater than 1. Example: 5.',
  superSweeperCashRatio: '1 in N super sweeper bowlers cash. At least 1.',
}

const types: Partial<Record<TournamentField, 'date'>> = { startDate: 'date', endDate: 'date' }
const inputModes: Partial<Record<TournamentField, 'decimal' | 'numeric'>> = {
  entryFee: 'decimal',
  games: 'numeric',
  finalsRatio: 'decimal',
  cashRatio: 'decimal',
  superSweeperCashRatio: 'decimal',
}

/**
 * A mouse press on Save or Cancel must not take focus from the field being typed in. Leaving the
 * field puts its message under it, which moves the buttons down before the mouse is released, and
 * the browser then drops the click. Keyboard focus is not affected.
 */
const keepFocus = (event: MouseEvent) => {
  event.preventDefault()
}

/** A line of text under a field, by field name. */
export type FieldNotes = Partial<Record<TournamentField, string>>

interface FieldProps {
  name: TournamentField
  id: string
  value: string
  error: string | undefined
  hint: string | undefined
  /** Why the field cannot change. It makes the field read-only (D-128). */
  lock: string | undefined
  /** What saving this field will ask the director to confirm (D-129). */
  confirm: string | undefined
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  onBlur: () => void
}

function Field({
  name,
  id,
  value,
  error,
  hint,
  lock,
  confirm,
  onChange,
  onBlur,
}: Readonly<FieldProps>) {
  const describedBy = [
    hint ? `${id}-hint` : undefined,
    lock ? `${id}-lock` : undefined,
    confirm ? `${id}-confirm` : undefined,
    error ? `${id}-error` : undefined,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {labels[name]} (required)
      </label>
      <input
        className={styles.input}
        id={id}
        name={name}
        type={types[name] ?? 'text'}
        inputMode={inputModes[name]}
        autoComplete="off"
        value={value}
        readOnly={lock !== undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        onChange={onChange}
        onBlur={onBlur}
      />
      {hint && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
      {lock && (
        <p id={`${id}-lock`} className={styles.note}>
          <span className={styles.noteLabel}>Locked:</span> {lock}
        </p>
      )}
      {confirm && (
        <p id={`${id}-confirm`} className={styles.note}>
          <span className={styles.noteLabel}>Asks you to confirm:</span> {confirm}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className={styles.fieldError}>
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * What a send came to. `errors` are the API's messages for fields; `warnings` ask the director to
 * confirm (D-129); `failure` is anything else, such as an outage. Nothing means it worked.
 */
export type SubmitResult =
  { errors: FieldErrors } | { warnings: TournamentWarning[] } | { failure: string } | undefined

interface TournamentFormProps {
  /** The values the form starts with: empty for create, the stored ones for edit. */
  initialValues: TournamentFormValues
  /** Edit (D-127): check only the fields the director changed. */
  checkChangedOnly?: boolean
  submitLabel: string
  pending: boolean
  /** Send the values. `confirmWarnings` is true when the director has agreed to the warnings. */
  onSubmit: (values: TournamentFormValues, confirmWarnings: boolean) => Promise<SubmitResult>
  /** A failure that is not about a field and happened outside the confirm dialog. */
  onFailure?: (message: string) => void
  cancelTo: string
  cancelLabel?: string
  /** Called when the director presses Save, before any check, so a page can drop an old failure. */
  onAttempt?: () => void
  /** Fields that cannot change, each with the reason (D-128, D-130). */
  locks?: FieldNotes
  /** Fields whose change asks for a confirmation, each with the reason (D-129). */
  confirms?: FieldNotes
  /** Replace a field's usual hint. */
  hints?: FieldNotes
  /** Shown above the fields. */
  banner?: ReactNode
  /** Nothing can be saved: no Save button (a complete tournament, D-130). */
  frozen?: boolean
  /** After Save and Cancel, set apart from them: the Delete button on the edit page (D-136). */
  endActions?: ReactNode
}

/**
 * The create and edit form (TRN-22, TRN-29). Checks run in the browser; the API checks again and
 * stays the authority (D-121). A failed save puts a summary on top and moves focus to the first
 * problem.
 */
export function TournamentForm({
  initialValues,
  checkChangedOnly = false,
  submitLabel,
  pending,
  onSubmit,
  cancelTo,
  cancelLabel = 'Cancel',
  onAttempt,
  onFailure,
  locks = {},
  confirms = {},
  hints = {},
  banner,
  frozen = false,
  endActions,
}: Readonly<TournamentFormProps>) {
  const base = useId()
  const [values, setValues] = useState<TournamentFormValues>(initialValues)
  const [errors, setErrors] = useState<FieldErrors>({})
  // The summary appears after a failed save and stays until the next one.
  const [summary, setSummary] = useState(false)
  // A field the director has typed in. Leaving one they never touched says nothing.
  const [edited, setEdited] = useState<Partial<Record<TournamentField, true>>>({})
  // Set while the confirm dialog is open (TRN-30).
  const [confirming, setConfirming] = useState<
    { warnings: TournamentWarning[]; failure?: string } | undefined
  >()

  const idOf = (name: TournamentField) => `${base}-${name}`
  const invalid = tournamentFields.filter((name) => errors[name] !== undefined)
  const check = (candidate: TournamentFormValues) =>
    checkChangedOnly ? validateChanges(initialValues, candidate) : validateTournament(candidate)

  function focusField(name: TournamentField) {
    document.getElementById(idOf(name))?.focus()
  }

  function show(next: FieldErrors) {
    setErrors(next)
    setSummary(true)
    const first = tournamentFields.find((name) => next[name] !== undefined)
    if (first) focusField(first)
  }

  function change(name: TournamentField) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value
      setValues((current) => ({ ...current, [name]: value }))
      setEdited((current) => ({ ...current, [name]: true }))
      setErrors((current) => {
        // A message about the old text would mislead.
        const next = { ...current, [name]: undefined }
        // The end date's message depends on the start date, so it may be stale now.
        // An emptied start date has nothing to compare, so the message waits for the next one.
        if (name === 'startDate' && value !== '' && current.endDate === endBeforeStartMessage) {
          next.endDate = check({ ...values, startDate: value }).endDate
        }
        return next
      })
    }
  }

  function blur(name: TournamentField) {
    return () => {
      // Tabbing through an empty field is not a mistake, unless a save has already failed.
      if (!edited[name] && !summary) return
      const found = check(values)
      setErrors((current) => ({
        ...current,
        [name]: found[name],
        // Moving the start date past a typed end date makes the end date wrong.
        ...(name === 'startDate' && values.endDate !== '' ? { endDate: found.endDate } : {}),
      }))
    }
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    onAttempt?.()
    const found = check(values)
    if (Object.keys(found).length > 0) {
      show(found)
      return
    }
    setSummary(false)
    void send(false)
  }

  async function send(confirmWarnings: boolean) {
    const result = await onSubmit(values, confirmWarnings)
    if (result === undefined) return
    if ('errors' in result) {
      // The dialog goes first, so the focus that `show` sets lands on the form.
      setConfirming(undefined)
      show(result.errors)
    } else if ('warnings' in result) {
      setConfirming({ warnings: result.warnings })
    } else if (confirmWarnings) {
      setConfirming((current) => current && { ...current, failure: result.failure })
    } else {
      onFailure?.(result.failure)
    }
  }

  const field = (name: TournamentField) => (
    <Field
      name={name}
      id={idOf(name)}
      value={values[name]}
      error={errors[name]}
      hint={hints[name] ?? defaultHints[name]}
      lock={locks[name]}
      confirm={confirms[name]}
      onChange={change(name)}
      onBlur={blur(name)}
    />
  )

  return (
    <form className={styles.form} noValidate onSubmit={submit}>
      {banner && <div className={styles.banner}>{banner}</div>}
      {summary && invalid.length > 0 && (
        <div role="alert" className={styles.summary}>
          <strong>
            Fix {invalid.length} {invalid.length === 1 ? 'field' : 'fields'} to save.
          </strong>
          <ul className={styles.summaryList}>
            {invalid.map((name) => (
              <li key={name}>
                <a
                  href={`#${idOf(name)}`}
                  onClick={(event) => {
                    event.preventDefault()
                    focusField(name)
                  }}
                >
                  {errors[name]}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {field('name')}
      <div className={styles.pair}>
        {field('startDate')}
        {field('endDate')}
      </div>
      {field('bowlingCenter')}
      <div className={styles.pair}>
        {field('entryFee')}
        {field('games')}
      </div>
      <div className={styles.pair}>
        {field('finalsRatio')}
        {field('cashRatio')}
      </div>
      {field('superSweeperCashRatio')}
      <div className={styles.actions}>
        {!frozen && (
          <button type="submit" disabled={pending} onMouseDown={keepFocus}>
            {pending ? 'Saving…' : submitLabel}
          </button>
        )}
        <Link className={styles.cancel} to={cancelTo} onMouseDown={keepFocus}>
          {cancelLabel}
        </Link>
        {endActions && <span className={styles.endActions}>{endActions}</span>}
      </div>
      {confirming && (
        <ConfirmChangesDialog
          items={confirming.warnings.map((warning) => ({
            field: warning.field,
            message: warning.message,
            change: isTournamentField(warning.field)
              ? describeChange(warning.field, initialValues, values)
              : '',
          }))}
          pending={pending}
          failure={confirming.failure}
          onConfirm={() => {
            setConfirming((current) => current && { warnings: current.warnings })
            void send(true)
          }}
          onClose={() => {
            setConfirming(undefined)
          }}
        />
      )}
    </form>
  )
}
