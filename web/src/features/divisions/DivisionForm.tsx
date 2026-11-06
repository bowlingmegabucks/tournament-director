import { useId, useState } from 'react'
import type { ChangeEvent, MouseEvent, SubmitEvent } from 'react'
import { Link } from 'react-router'
import { ConfirmChangesDialog } from '../../shared/ConfirmChangesDialog'
import styles from './DivisionForm.module.css'
import { describeChange } from './describeChange'
import {
  divisionFields,
  type DivisionField,
  type DivisionFieldErrors,
  type DivisionFieldNotes,
  type DivisionFormValues,
  type DivisionWarning,
} from './types'
import {
  emptyDivisionForm,
  isDivisionField,
  validateDivision,
  validateDivisionChanges,
} from './validateDivision'

interface BoxSpec {
  label: string
  hint: string
  suffix?: string
}

const boxes: Record<Exclude<DivisionField, 'gender'>, BoxSpec> = {
  name: {
    label: 'Name (required)',
    hint: '1 to 100 characters. Each name is used once in a tournament.',
  },
  minimumAge: { label: 'Minimum age', hint: '1 to 120. Leave blank for no limit.' },
  maximumAge: { label: 'Maximum age', hint: 'Age on the tournament start date.' },
  minimumAverage: { label: 'Minimum average', hint: '1 to 300. Leave blank for no limit.' },
  maximumAverage: {
    label: 'Maximum average',
    hint: 'Compared with the average on the registration.',
  },
  handicapPercentage: {
    label: 'Handicap percent',
    hint: 'Type a whole number: 90 means 90 percent. 1 to 999.',
    suffix: '%',
  },
  handicapBase: {
    label: 'Handicap base',
    hint: 'The score handicap counts up to, such as 220. 0 to 300.',
  },
  maximumHandicapPerGame: {
    label: 'Maximum handicap per game',
    hint: 'Optional. 1 to 300. Needs the percent and the base.',
  },
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
 * What a send came to. `errors` are the API's messages for fields; `warnings` ask the director to
 * confirm (D-142); `failure` is anything else, such as an outage. Nothing means it worked.
 */
export type DivisionSubmitResult =
  | { errors: DivisionFieldErrors }
  | { warnings: DivisionWarning[] }
  | { failure: string }
  | undefined

interface DivisionFormProps {
  /**
   * Add: the number the new division will most likely get, `undefined` while it is not known
   * (D-139). Edit: the stored number, which cannot change (D-146).
   */
  number: number | undefined
  /** The values the form starts with: empty for add, the stored ones for edit. */
  initialValues?: DivisionFormValues
  /** Edit (D-147): check only the boxes the director changed, and say so in the confirm dialog. */
  checkChangedOnly?: boolean
  /** Boxes whose change asks for a confirmation, each with the reason (D-12, D-147). */
  confirms?: DivisionFieldNotes
  submitLabel?: string
  pending: boolean
  /** Send the values. `confirmWarnings` is true when the director has agreed to the warnings. */
  onSubmit: (values: DivisionFormValues, confirmWarnings: boolean) => Promise<DivisionSubmitResult>
  /** A failure that is not about a field and happened outside the confirm dialog. */
  onFailure: (message: string) => void
  /** Called when the director presses Add, before any check, so a page can drop an old failure. */
  onAttempt: () => void
  cancelTo: string
}

/**
 * The add-division form (DIV-02, DIV-04 to DIV-11, D-144). Checks run in the browser; the API checks
 * again and stays the authority (D-138). A failed save puts a summary on top and moves focus to the
 * first problem.
 */
export function DivisionForm({
  number,
  initialValues = emptyDivisionForm,
  checkChangedOnly = false,
  confirms = {},
  submitLabel = 'Add division',
  pending,
  onSubmit,
  onFailure,
  onAttempt,
  cancelTo,
}: Readonly<DivisionFormProps>) {
  const base = useId()
  const [values, setValues] = useState<DivisionFormValues>(initialValues)
  const [errors, setErrors] = useState<DivisionFieldErrors>({})
  const [summary, setSummary] = useState(false)
  // A field the director has typed in. Leaving one they never touched says nothing.
  const [edited, setEdited] = useState<Partial<Record<DivisionField, true>>>({})
  const [confirming, setConfirming] = useState<
    { warnings: DivisionWarning[]; failure?: string } | undefined
  >()

  const idOf = (name: DivisionField) => `${base}-${name}`
  const check = (candidate: DivisionFormValues) =>
    checkChangedOnly
      ? validateDivisionChanges(initialValues, candidate)
      : validateDivision(candidate)
  const invalid = divisionFields.filter((name) => errors[name] !== undefined)

  function focusField(name: DivisionField) {
    document.getElementById(idOf(name))?.focus()
  }

  function show(next: DivisionFieldErrors) {
    setErrors(next)
    setSummary(true)
    const first = divisionFields.find((name) => next[name] !== undefined)
    if (first) focusField(first)
  }

  function change(name: DivisionField) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = event.target.value
      setValues((current) => ({ ...current, [name]: value }))
      setEdited((current) => ({ ...current, [name]: true }))
      // A message about the old text would mislead.
      setErrors((current) => ({ ...current, [name]: undefined }))
    }
  }

  function blur(name: DivisionField) {
    return () => {
      // Tabbing through an empty box is not a mistake, unless a save has already failed.
      if (!edited[name] && !summary) return
      const found = check(values)
      // A pair of boxes can make each other wrong (the percent and the base), so refresh them all
      // that the director has touched.
      setErrors((current) => {
        const next = { ...current, [name]: found[name] }
        for (const other of divisionFields) {
          // Stryker disable next-line ConditionalExpression: skipping `other !== name` only sets the box being left to the value it already has.
          if (other !== name && (edited[other] || summary)) next[other] = found[other]
        }
        return next
      })
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

  const box = (name: Exclude<DivisionField, 'gender'>) => {
    const spec = boxes[name]
    const id = idOf(name)
    const error = errors[name]
    const confirm = confirms[name]
    const input = (
      <input
        className={styles.input}
        id={id}
        name={name}
        type="text"
        inputMode={name === 'name' ? undefined : 'numeric'}
        autoComplete="off"
        value={values[name]}
        aria-invalid={error ? true : undefined}
        // Stryker disable next-line MethodExpression: without the filter the list ends in a space, which assistive technology ignores.
        aria-describedby={[
          `${id}-hint`,
          confirm ? `${id}-confirm` : undefined,
          error ? `${id}-error` : undefined,
        ]
          .filter(Boolean)
          .join(' ')}
        onChange={change(name)}
        onBlur={blur(name)}
      />
    )
    return (
      <div className={styles.field}>
        <label className={styles.label} htmlFor={id}>
          {spec.label}
        </label>
        {spec.suffix ? (
          <span className={styles.suffixed}>
            {input}
            <span aria-hidden="true">{spec.suffix}</span>
          </span>
        ) : (
          input
        )}
        <p id={`${id}-hint`} className={styles.hint}>
          {spec.hint}
        </p>
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

  /** The change behind a warning: "Handicap percent: 90% → 85%" on edit, the typed percent on add. */
  function changeLine(name: string): string {
    if (!isDivisionField(name)) return ''
    if (checkChangedOnly) return describeChange(name, initialValues, values)
    return name === 'handicapPercentage'
      ? `Handicap percent: ${values.handicapPercentage.trim()}%`
      : ''
  }

  const genderId = idOf('gender')
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
        <p className={styles.number}>
          <strong>Number:</strong> <span>{number}</span>
        </p>
        <p className={styles.hint}>
          {checkChangedOnly && 'The number cannot change.'}
          {!checkChangedOnly && number === undefined && 'Assigned when you save.'}
          {!checkChangedOnly &&
            number !== undefined &&
            'Assigned when you save: one more than the highest number in this tournament.'}
        </p>
      </div>
      {box('name')}
      <div className={styles.field}>
        <label className={styles.label} htmlFor={genderId}>
          Gender
        </label>
        <select
          className={styles.input}
          id={genderId}
          name="gender"
          value={values.gender}
          aria-describedby={`${genderId}-hint${confirms.gender ? ` ${genderId}-confirm` : ''}`}
          onChange={change('gender')}
        >
          <option value="">Any gender</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select>
        <p id={`${genderId}-hint`} className={styles.hint}>
          Leave as Any gender to allow everyone.
        </p>
        {confirms.gender && (
          <p id={`${genderId}-confirm`} className={styles.note}>
            <span className={styles.noteLabel}>Asks you to confirm:</span> {confirms.gender}
          </p>
        )}
      </div>
      <fieldset className={styles.group}>
        <legend>Age limits</legend>
        <div className={styles.pair}>
          {box('minimumAge')}
          {box('maximumAge')}
        </div>
      </fieldset>
      <fieldset className={styles.group}>
        <legend>Average limits</legend>
        <div className={styles.pair}>
          {box('minimumAverage')}
          {box('maximumAverage')}
        </div>
      </fieldset>
      <fieldset className={styles.group}>
        <legend>Handicap</legend>
        <p className={styles.hint}>
          Fill in the percent and the base together, or leave both blank for a scratch division.
        </p>
        {box('handicapPercentage')}
        {box('handicapBase')}
        {box('maximumHandicapPerGame')}
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
          title={checkChangedOnly ? 'Save these changes?' : 'Add this division?'}
          confirmLabel={checkChangedOnly ? 'Save anyway' : 'Add division'}
          items={confirming.warnings.map((warning) => ({
            field: warning.field,
            message: warning.message,
            change: changeLine(warning.field),
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
