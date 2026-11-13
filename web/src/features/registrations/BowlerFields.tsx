import { DateInput } from '../../shared/DateInput'
import type { DeskFieldErrors, BowlerValues } from './types'
import { bowlerFieldId, bowlerLabels, errorKeyOf } from './deskForm'
import styles from './AddRegistration.module.css'

interface Spec {
  key: keyof BowlerValues
  label?: string
  type?: 'text' | 'email' | 'tel' | 'date'
  autoComplete?: string
  maxLength?: number
  hint?: string
}

const rows: Spec[][] = [
  [
    { key: 'firstName', label: 'First name (required)' },
    { key: 'lastName', label: 'Last name (required)' },
  ],
  [{ key: 'middleInitial', maxLength: 1 }, { key: 'suffix' }],
  [{ key: 'street', autoComplete: 'off' }],
  [
    { key: 'city' },
    { key: 'state', label: 'State (2 letters)', maxLength: 2 },
    { key: 'zipCode', label: 'Zip' },
  ],
  [
    { key: 'email', type: 'email' },
    { key: 'phoneNumber', label: 'Phone', type: 'tel' },
  ],
  [
    { key: 'usbcId', hint: 'Like 1234-56789. A handicap division needs one.' },
    { key: 'dateOfBirth', type: 'date' },
  ],
]

interface BowlerFieldsProps {
  values: BowlerValues
  errors: DeskFieldErrors
  legend: string
  hint?: string
  onChange: (key: keyof BowlerValues, value: string) => void
}

/** The bowler's details (BWL-01 to BWL-10). Only the names are required here; the division decides the rest (D-162). */
export function BowlerFields({
  values,
  errors,
  legend,
  hint,
  onChange,
}: Readonly<BowlerFieldsProps>) {
  function box(spec: Spec) {
    const { key, type = 'text', maxLength } = spec
    const boxHint = spec.hint
    const id = bowlerFieldId(key)
    const error = errors[errorKeyOf(key)]
    const describedBy = [error ? `${id}-error` : undefined, boxHint ? `${id}-hint` : undefined]
      .filter(Boolean)
      .join(' ')
    return (
      <div className={styles.field} key={key}>
        <label className={styles.label} htmlFor={id}>
          {spec.label ?? bowlerLabels[key]}
        </label>
        {type === 'date' ? (
          <DateInput
            id={id}
            className={styles.input}
            value={values[key]}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy === '' ? undefined : describedBy}
            onValueChange={(value) => {
              onChange(key, value)
            }}
          />
        ) : (
          <input
            id={id}
            className={styles.input}
            type={type}
            value={values[key]}
            maxLength={maxLength}
            autoComplete={spec.autoComplete ?? 'off'}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy === '' ? undefined : describedBy}
            onChange={(event) => {
              onChange(key, event.target.value)
            }}
          />
        )}
        {boxHint && (
          <p id={`${id}-hint`} className={styles.hint}>
            {boxHint}
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

  const genderError = errors['bowler.gender']
  return (
    <fieldset className={styles.group}>
      <legend>{legend}</legend>
      {hint && <p className={styles.hint}>{hint}</p>}
      {rows.map((row) => (
        <div
          className={row.length === 1 ? undefined : styles.pair}
          key={row.map((spec) => spec.key).join()}
        >
          {row.map(box)}
        </div>
      ))}
      <div className={styles.field}>
        <label className={styles.label} htmlFor={bowlerFieldId('gender')}>
          Gender
        </label>
        <select
          id={bowlerFieldId('gender')}
          className={styles.input}
          value={values.gender}
          aria-invalid={genderError ? true : undefined}
          aria-describedby={genderError ? 'bowler-gender-error' : undefined}
          onChange={(event) => {
            onChange('gender', event.target.value)
          }}
        >
          <option value="">Not given</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select>
        {genderError && (
          <p id="bowler-gender-error" className={styles.fieldError}>
            {genderError}
          </p>
        )}
      </div>
    </fieldset>
  )
}
