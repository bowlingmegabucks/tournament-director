import { useId, useState } from 'react'
import type { ChangeEvent, MouseEvent, SubmitEvent } from 'react'
import { Link } from 'react-router'
import { ConfirmChangesDialog } from '../../shared/ConfirmChangesDialog'
import { FieldNoteLines } from '../../shared/FieldNoteLines'
import { noteIds, type FieldNote, type SessionWarning } from '../../shared/sessionEdit'
import { formatDateRange } from '../tournaments/format'
import styles from '../../shared/sessionForm.module.css'
import { describeChange } from './describeChange'
import { squadFields, type SquadField, type SquadFieldErrors, type SquadFormValues } from './types'
import { validateSquad, validateSquadChanges, type TournamentDates } from './validateSquad'

interface BoxSpec {
  label: string
  hint: string
}

/** The text boxes. The date has its own markup below. */
const boxes: Record<Exclude<SquadField, 'date'>, BoxSpec> = {
  startingLane: { label: 'Starting lane (required)', hint: 'An odd number, 1 to 199.' },
  numberOfLanes: { label: 'Number of lanes (required)', hint: 'An even number, 2 to 200.' },
  maxPerPair: { label: 'Bowlers per pair (required)', hint: '2 to 5. Matches the lane page.' },
  entryFee: { label: 'Entry fee', hint: '0 to 999.99.' },
  finalsRatio: { label: 'Finals ratio', hint: '1.1 to 99.9, one decimal.' },
  cashRatio: { label: 'Cash ratio', hint: '1.1 to 99.9, one decimal.' },
}

/**
 * A mouse press on Save or Cancel must not take focus from the field being typed in. Leaving the
 * field puts its message under it, which moves the buttons before the mouse is released, and the
 * browser then drops the click. Keyboard focus is not affected.
 */
const keepFocus = (event: MouseEvent) => {
  event.preventDefault()
}

/**
 * What a send came to: the API's messages for fields, warnings to confirm (edit, D-180), another
 * failure such as an outage, or nothing for success.
 */
export type SquadSubmitResult =
  { errors: SquadFieldErrors } | { warnings: SessionWarning[] } | { failure: string } | undefined

interface SquadFormProps {
  /** The values the form starts with: lanes and per pair from the latest squad (D-172). */
  initialValues: SquadFormValues
  /** The tournament's days: they limit the date box and run `SQD-03` in the browser. */
  dates: TournamentDates
  /** What the tournament uses, shown under a blank box (D-170), as text such as `$50.00`. */
  tournamentValues: { entryFee: string; finalsRatio: string; cashRatio: string }
  pending: boolean
  /** Edit (D-184): check only the boxes the director changed, and say so in the confirm dialog. */
  checkChangedOnly?: boolean
  /** Edit (D-185): what each box carries: a limit, a lock, or a confirmation. */
  notes?: Partial<Record<SquadField, FieldNote>>
  submitLabel?: string
  /** Send the values. `confirmWarnings` is true when the director has agreed to the warnings. */
  onSubmit: (values: SquadFormValues, confirmWarnings: boolean) => Promise<SquadSubmitResult>
  /** A failure that is not about a field. */
  onFailure: (message: string) => void
  /** Called when the director presses Add, before any check, so a page can drop an old failure. */
  onAttempt: () => void
  cancelTo: string
}

/**
 * The add-squad form (SQD-02 to SQD-08, D-167 to D-172). Checks run in the browser; the API checks
 * again and stays the authority. A failed save puts a summary on top and moves focus to the first
 * problem.
 */
export function SquadForm({
  initialValues,
  dates,
  tournamentValues,
  pending,
  checkChangedOnly = false,
  notes = {},
  submitLabel = 'Add squad',
  onSubmit,
  onFailure,
  onAttempt,
  cancelTo,
}: Readonly<SquadFormProps>) {
  const base = useId()
  const [values, setValues] = useState<SquadFormValues>(initialValues)
  const [errors, setErrors] = useState<SquadFieldErrors>({})
  const [summary, setSummary] = useState(false)
  // A field the director has typed in. Leaving one they never touched says nothing.
  const [edited, setEdited] = useState<Partial<Record<SquadField, true>>>({})
  const [confirming, setConfirming] = useState<
    { warnings: SessionWarning[]; failure?: string } | undefined
  >()

  const idOf = (name: SquadField) => `${base}-${name}`
  const check = (candidate: SquadFormValues) =>
    checkChangedOnly
      ? validateSquadChanges(initialValues, candidate, dates)
      : validateSquad(candidate, dates)
  const invalid = squadFields.filter((name) => errors[name] !== undefined)

  function focusField(name: SquadField) {
    document.getElementById(idOf(name))?.focus()
  }

  function show(next: SquadFieldErrors) {
    setErrors(next)
    setSummary(true)
    const first = squadFields.find((name) => next[name] !== undefined)
    if (first) focusField(first)
  }

  function change(name: SquadField) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value
      setValues((current) => ({ ...current, [name]: value }))
      setEdited((current) => ({ ...current, [name]: true }))
      // A message about the old text would mislead.
      setErrors((current) => ({ ...current, [name]: undefined }))
    }
  }

  function blur(name: SquadField) {
    return () => {
      // Tabbing through an empty box is not a mistake, unless a save has already failed.
      if (!edited[name] && !summary) return
      setErrors((current) => ({ ...current, [name]: check(values)[name] }))
    }
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    onAttempt()
    const found = check(values)
    if (Object.keys(found).length > 0) {
      show(found)
      return
    }
    // Stryker disable next-line BooleanLiteral,CallExpression: with the summary kept on, a box leaves its message only when it is wrong, and every box is right here.
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
      onFailure(result.failure)
    }
  }

  const describedBy = (name: SquadField) =>
    // Stryker disable next-line MethodExpression: without the filter the list ends in a space, which assistive technology ignores.
    [
      `${idOf(name)}-hint`,
      ...noteIds(idOf(name), notes[name]),
      errors[name] ? `${idOf(name)}-error` : undefined,
    ]
      .filter(Boolean)
      .join(' ')

  const message = (name: SquadField) =>
    errors[name] && (
      <p id={`${idOf(name)}-error`} className={styles.fieldError}>
        {errors[name]}
      </p>
    )

  const box = (name: Exclude<SquadField, 'date'>) => {
    const spec = boxes[name]
    const tournament =
      name === 'entryFee' || name === 'finalsRatio' || name === 'cashRatio'
        ? ` Tournament: ${tournamentValues[name]}.`
        : ''
    const input = (
      <input
        className={styles.input}
        id={idOf(name)}
        name={name}
        type="text"
        inputMode={name === 'entryFee' || name.endsWith('Ratio') ? 'decimal' : 'numeric'}
        autoComplete="off"
        value={values[name]}
        readOnly={notes[name]?.lock !== undefined}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={describedBy(name)}
        onChange={change(name)}
        onBlur={blur(name)}
      />
    )
    return (
      <div className={styles.field}>
        <label className={styles.label} htmlFor={idOf(name)}>
          {spec.label}
        </label>
        {name === 'entryFee' ? (
          <span className={styles.prefixed}>
            <span aria-hidden="true">$</span>
            {input}
          </span>
        ) : (
          input
        )}
        <p id={`${idOf(name)}-hint`} className={styles.hint}>
          {spec.hint}
          {tournament}
        </p>
        <FieldNoteLines id={idOf(name)} note={notes[name]} />
        {message(name)}
      </div>
    )
  }

  return (
    <form className={styles.form} noValidate onSubmit={submit}>
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
      <div className={styles.field}>
        <label className={styles.label} htmlFor={idOf('date')}>
          Date and time (required)
        </label>
        <input
          className={styles.input}
          id={idOf('date')}
          name="date"
          type="datetime-local"
          min={`${dates.startDate}T00:00`}
          max={`${dates.endDate}T23:59`}
          value={values.date}
          readOnly={notes.date?.lock !== undefined}
          aria-invalid={errors.date ? true : undefined}
          aria-describedby={describedBy('date')}
          onChange={change('date')}
          onBlur={blur('date')}
        />
        <p id={`${idOf('date')}-hint`} className={styles.hint}>
          Within the tournament dates: {formatDateRange(dates.startDate, dates.endDate)}.
        </p>
        <FieldNoteLines id={idOf('date')} note={notes.date} />
        {message('date')}
      </div>
      <fieldset className={styles.group}>
        <legend>Lanes</legend>
        <div className={styles.pair}>
          {box('startingLane')}
          {box('numberOfLanes')}
        </div>
        {box('maxPerPair')}
      </fieldset>
      <fieldset className={styles.group}>
        <legend>Fee and ratios</legend>
        <p className={styles.hint}>Leave a box blank to use the tournament&apos;s value.</p>
        {box('entryFee')}
        <div className={styles.pair}>
          {box('finalsRatio')}
          {box('cashRatio')}
        </div>
      </fieldset>
      <div className={styles.actions}>
        <button type="submit" disabled={pending} onMouseDown={keepFocus}>
          {pending ? 'Saving…' : submitLabel}
        </button>
        <Link className={styles.cancel} to={cancelTo} onMouseDown={keepFocus}>
          Cancel
        </Link>
      </div>
      {confirming && (
        <ConfirmChangesDialog
          items={confirming.warnings.map((warning) => ({
            field: warning.field,
            message: warning.message,
            change: squadFields.includes(warning.field as SquadField)
              ? describeChange(warning.field as SquadField, initialValues, values)
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
