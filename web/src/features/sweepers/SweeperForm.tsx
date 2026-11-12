import { useId, useState } from 'react'
import type { ChangeEvent, MouseEvent, SubmitEvent } from 'react'
import { Link } from 'react-router'
import { ConfirmChangesDialog } from '../../shared/ConfirmChangesDialog'
import { DateTimeInput } from '../../shared/DateTimeInput'
import { FieldNoteLines } from '../../shared/FieldNoteLines'
import { noteIds, type FieldNote, type SessionWarning } from '../../shared/sessionEdit'
import { formatDateRange } from '../tournaments/format'
import styles from '../../shared/sessionForm.module.css'
import type { TournamentDates } from '../../shared/sessionValidation'
import { describeChange } from './describeChange'
import {
  pinKey,
  sweeperScalarFields,
  type SweeperFieldErrors,
  type SweeperFormValues,
  type SweeperScalarField,
} from './types'
import { validateSweeper, validateSweeperChanges } from './validateSweeper'

interface BoxSpec {
  label: string
  hint: string
}

/** The text boxes. The date has its own markup below. */
const boxes: Record<Exclude<SweeperScalarField, 'date'>, BoxSpec> = {
  startingLane: { label: 'Starting lane (required)', hint: 'An odd number, 1 to 199.' },
  numberOfLanes: { label: 'Number of lanes (required)', hint: 'An even number, 2 to 200.' },
  maxPerPair: { label: 'Bowlers per pair (required)', hint: '2 to 5. Matches the lane page.' },
  entryFee: { label: 'Entry fee (required)', hint: 'Above 0, up to 999.99.' },
  games: { label: 'Games (required)', hint: '1 to 99.' },
  cashRatio: { label: 'Cash ratio (required)', hint: '1.1 to 99.9, one decimal.' },
}

/**
 * A mouse press on Save or Cancel must not take focus from the field being typed in. Leaving the
 * field puts its message under it, which moves the buttons before the mouse is released, and the
 * browser then drops the click. Keyboard focus is not affected.
 */
const keepFocus = (event: MouseEvent) => {
  event.preventDefault()
}

const without = (errors: SweeperFieldErrors, key: string): SweeperFieldErrors =>
  Object.fromEntries(Object.entries(errors).filter(([name]) => name !== key))

/**
 * What a send came to: the API's messages for fields, warnings to confirm (edit, D-180), another
 * failure such as an outage, or nothing for success.
 */
export type SweeperSubmitResult =
  { errors: SweeperFieldErrors } | { warnings: SessionWarning[] } | { failure: string } | undefined

/** A division of the tournament: one bonus-pins box (SQD-13). */
export interface FormDivision {
  id: string
  name: string
}

interface SweeperFormProps {
  /** The values the form starts with: lanes and per pair from the latest sweeper (D-178). */
  initialValues: SweeperFormValues
  /** The tournament's days: they limit the date box and run `SQD-10` in the browser. */
  dates: TournamentDates
  /** The tournament's divisions in order, one bonus-pins box each. */
  divisions: readonly FormDivision[]
  pending: boolean
  /** Edit (D-184): check only the boxes the director changed, and say so in the confirm dialog. */
  checkChangedOnly?: boolean
  /** Edit (D-185): what each box carries: a limit, a lock, or a confirmation. Pins use `bonusPins.<id>`. */
  notes?: Record<string, FieldNote>
  submitLabel?: string
  /** Send the values. `confirmWarnings` is true when the director has agreed to the warnings. */
  onSubmit: (values: SweeperFormValues, confirmWarnings: boolean) => Promise<SweeperSubmitResult>
  /** A failure that is not about a field. */
  onFailure: (message: string) => void
  /** Called when the director presses Add, before any check, so a page can drop an old failure. */
  onAttempt: () => void
  cancelTo: string
  /** Where the "no divisions" note sends the director (D-177). */
  addDivisionTo: string
}

/**
 * The add-sweeper form (SQD-10 to SQD-13, D-174 to D-178). Checks run in the browser; the API
 * checks again and stays the authority. A failed save puts a summary on top and moves focus to the
 * first problem.
 */
export function SweeperForm({
  initialValues,
  dates,
  divisions,
  pending,
  checkChangedOnly = false,
  notes = {},
  submitLabel = 'Add sweeper',
  onSubmit,
  onFailure,
  onAttempt,
  cancelTo,
  addDivisionTo,
}: Readonly<SweeperFormProps>) {
  const base = useId()
  const [values, setValues] = useState<SweeperFormValues>(initialValues)
  const [errors, setErrors] = useState<SweeperFieldErrors>({})
  const [summary, setSummary] = useState(false)
  // A field the director has typed in. Leaving one they never touched says nothing.
  const [edited, setEdited] = useState<Record<string, true>>({})
  const [confirming, setConfirming] = useState<
    { warnings: SessionWarning[]; failure?: string } | undefined
  >()

  const divisionIds = divisions.map((division) => division.id)
  // In the order the form shows them, so the summary and the focus start at the first box.
  const order = [...sweeperScalarFields, ...divisionIds.map(pinKey), 'bonusPins']
  const idOf = (key: string) => {
    // The group's own message sits under the group; focus goes to its first box.
    const target = key === 'bonusPins' && divisionIds[0] ? pinKey(divisionIds[0]) : key
    return `${base}-${target}`
  }
  const invalid = order.filter((key) => errors[key] !== undefined)
  const labelOf = (key: string) => errors[key]

  function focusField(key: string) {
    document.getElementById(idOf(key))?.focus()
  }

  function show(next: SweeperFieldErrors) {
    setErrors(next)
    setSummary(true)
    const first = order.find((key) => next[key] !== undefined)
    if (first) focusField(first)
  }

  const found = (current: SweeperFormValues) =>
    checkChangedOnly
      ? validateSweeperChanges(initialValues, current, dates, divisionIds)
      : validateSweeper(current, dates, divisionIds)

  function changeText(key: string, set: (current: SweeperFormValues) => SweeperFormValues) {
    setValues(set)
    setEdited((current) => ({ ...current, [key]: true }))
    // A message about the old text would mislead. A gone division's message goes with any edit of pins.
    setErrors((current) => without(current, key))
  }

  function change(
    key: string,
    set: (current: SweeperFormValues, text: string) => SweeperFormValues,
  ) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const text = event.target.value
      changeText(key, (current) => set(current, text))
    }
  }

  function blur(key: string) {
    return () => {
      // Tabbing through an empty box is not a mistake, unless a save has already failed.
      if (!edited[key] && !summary) return
      const problem = found(values)[key]
      setErrors((current) => {
        const rest = without(current, key)
        // Stryker disable next-line ConditionalExpression: a key holding `undefined` reads as no message everywhere (`invalid` and `message` test the value).
        return problem === undefined ? rest : { ...rest, [key]: problem }
      })
    }
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    onAttempt()
    const problems = found(values)
    if (Object.keys(problems).length > 0) {
      show(problems)
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

  const describedBy = (key: string) =>
    // Stryker disable next-line MethodExpression: without the filter the list ends in a space, which assistive technology ignores.
    [
      `${idOf(key)}-hint`,
      ...noteIds(idOf(key), notes[key]),
      errors[key] ? `${idOf(key)}-error` : undefined,
    ]
      .filter(Boolean)
      .join(' ')

  const message = (key: string) =>
    errors[key] && (
      <p id={`${idOf(key)}-error`} className={styles.fieldError}>
        {errors[key]}
      </p>
    )

  const box = (name: Exclude<SweeperScalarField, 'date'>) => {
    const spec = boxes[name]
    const input = (
      <input
        className={styles.input}
        id={idOf(name)}
        name={name}
        type="text"
        inputMode={name === 'entryFee' || name === 'cashRatio' ? 'decimal' : 'numeric'}
        autoComplete="off"
        value={values[name]}
        readOnly={notes[name]?.lock !== undefined}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={describedBy(name)}
        onChange={change(name, (current, text) => ({ ...current, [name]: text }))}
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
        </p>
        <FieldNoteLines id={idOf(name)} note={notes[name]} />
        {message(name)}
      </div>
    )
  }

  const pinBox = (division: FormDivision) => {
    const key = pinKey(division.id)
    return (
      <div className={styles.field} key={division.id}>
        <label className={styles.label} htmlFor={idOf(key)}>
          {division.name}
        </label>
        <input
          className={styles.input}
          id={idOf(key)}
          name={key}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={values.bonusPins[division.id] ?? ''}
          readOnly={notes[key]?.lock !== undefined}
          aria-invalid={errors[key] ? true : undefined}
          aria-describedby={describedBy(key)}
          onChange={change(key, (current, text) => ({
            ...current,
            bonusPins: { ...current.bonusPins, [division.id]: text },
          }))}
          onBlur={blur(key)}
        />
        <p id={`${idOf(key)}-hint`} className={styles.hint}>
          0 to 99. Leave blank for none.
        </p>
        <FieldNoteLines id={idOf(key)} note={notes[key]} />
        {message(key)}
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
            {invalid.map((key) => (
              <li key={key}>
                <a
                  href={`#${idOf(key)}`}
                  onClick={(event) => {
                    event.preventDefault()
                    focusField(key)
                  }}
                >
                  {labelOf(key)}
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
        <DateTimeInput
          id={idOf('date')}
          name="date"
          firstDay={dates.startDate}
          inputClassName={styles.input}
          value={values.date}
          readOnly={notes['date']?.lock !== undefined}
          invalid={Boolean(errors['date'])}
          describedBy={describedBy('date')}
          onValueChange={(text) => {
            changeText('date', (current) => ({ ...current, date: text }))
          }}
          onBlur={blur('date')}
        />
        <p id={`${idOf('date')}-hint`} className={styles.hint}>
          Within the tournament dates: {formatDateRange(dates.startDate, dates.endDate)}.
        </p>
        <FieldNoteLines id={idOf('date')} note={notes['date']} />
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
        <legend>Entry and payout</legend>
        <p className={styles.hint}>
          A sweeper has its own fee, games, and cash ratio. It never uses the tournament&apos;s.
        </p>
        {box('entryFee')}
        <div className={styles.pair}>
          {box('games')}
          {box('cashRatio')}
        </div>
      </fieldset>
      <fieldset className={styles.group}>
        <legend>Bonus pins per game</legend>
        {divisions.length === 0 ? (
          <p>
            This tournament has no divisions yet, so no bonus pins apply.{' '}
            <Link to={addDivisionTo}>Add a division</Link> first if you want them.
          </p>
        ) : (
          <>
            <p className={styles.hint}>
              Pins added to each game for a bowler in that division. Blank means none.
            </p>
            {divisions.map(pinBox)}
          </>
        )}
        {errors['bonusPins'] && <p className={styles.fieldError}>{errors['bonusPins']}</p>}
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
            change: describeChange(warning.field, initialValues, values, divisions),
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
