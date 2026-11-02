import { useId, useState } from 'react'
import type { ChangeEvent, SubmitEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Page } from '../../shared/Page'
import { Toast } from '../../shared/Toast'
import { TournamentRejectedError } from './api'
import styles from './NewTournamentPage.module.css'
import type { FieldErrors, TournamentField, TournamentFormValues } from './types'
import { useCreateTournament } from './useCreateTournament'
import { emptyTournamentForm, toNewTournament, validateTournament } from './validateTournament'

// The order on the page, so the summary and the focus start at the top.
const fieldOrder: readonly TournamentField[] = [
  'name',
  'startDate',
  'endDate',
  'bowlingCenter',
  'entryFee',
  'games',
  'finalsRatio',
  'cashRatio',
  'superSweeperCashRatio',
]

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

interface FieldProps {
  name: TournamentField
  id: string
  value: string
  error: string | undefined
  hint?: string
  type?: 'text' | 'date'
  inputMode?: 'decimal' | 'numeric'
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  onBlur: () => void
}

function Field({
  name,
  id,
  value,
  error,
  hint,
  type = 'text',
  inputMode,
  onChange,
  onBlur,
}: Readonly<FieldProps>) {
  const describedBy = [hint ? `${id}-hint` : undefined, error ? `${id}-error` : undefined]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{labels[name]} (required)</label>
      <input
        id={id}
        name={name}
        type={type}
        inputMode={inputMode}
        autoComplete="off"
        value={value}
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
      {error && (
        <p id={`${id}-error`} className={styles.fieldError}>
          {error}
        </p>
      )}
    </div>
  )
}

/** The create form (TRN-22, D-120). Checks run in the browser; the API checks again (D-121). */
export function NewTournamentPage() {
  const base = useId()
  const navigate = useNavigate()
  const create = useCreateTournament()
  const [values, setValues] = useState<TournamentFormValues>(emptyTournamentForm)
  const [errors, setErrors] = useState<FieldErrors>({})
  // The summary appears after a failed save and stays until the next one.
  const [summary, setSummary] = useState(false)
  const [failure, setFailure] = useState<string | undefined>()

  const idOf = (name: TournamentField) => `${base}-${name}`
  const invalid = fieldOrder.filter((name) => errors[name] !== undefined)

  function focusField(name: TournamentField) {
    document.getElementById(idOf(name))?.focus()
  }

  function show(next: FieldErrors) {
    setErrors(next)
    setSummary(true)
    const first = fieldOrder.find((name) => next[name] !== undefined)
    if (first) focusField(first)
  }

  function change(name: TournamentField) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setValues((current) => ({ ...current, [name]: event.target.value }))
      // A message about the old text would mislead.
      setErrors((current) => ({ ...current, [name]: undefined }))
    }
  }

  function blur(name: TournamentField) {
    return () => {
      const message = validateTournament(values)[name]
      setErrors((current) => ({ ...current, [name]: message }))
    }
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setFailure(undefined)
    const found = validateTournament(values)
    if (Object.keys(found).length > 0) {
      show(found)
      return
    }
    setSummary(false)
    create.mutate(toNewTournament(values), {
      onSuccess: (tournament) => {
        // The overview shows the toast; router state outlives this page.
        void navigate(`/tournaments/${tournament.id}`, { state: { created: true } })
      },
      onError: (error) => {
        if (error instanceof TournamentRejectedError && Object.keys(error.errors).length > 0) {
          show(error.errors)
        } else {
          setFailure(error.message)
        }
      },
    })
  }

  const field = (name: TournamentField, extra: Partial<FieldProps> = {}) => (
    <Field
      name={name}
      id={idOf(name)}
      value={values[name]}
      error={errors[name]}
      onChange={change(name)}
      onBlur={blur(name)}
      {...extra}
    />
  )

  return (
    <Page>
      <title>New tournament · Tournament Director</title>
      <h1>New tournament</h1>
      <form className={styles.form} noValidate onSubmit={submit}>
        {summary && invalid.length > 0 && (
          <div role="alert" className={styles.summary}>
            <strong>
              Fix {invalid.length} {invalid.length === 1 ? 'field' : 'fields'} to save.
            </strong>
            <ul>
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
          {field('startDate', { type: 'date' })}
          {field('endDate', { type: 'date' })}
        </div>
        {field('bowlingCenter')}
        <div className={styles.pair}>
          {field('entryFee', {
            inputMode: 'decimal',
            hint: 'Per squad entry. A squad can set its own later. Up to 999.99.',
          })}
          {field('games', { inputMode: 'numeric', hint: '1 to 99.' })}
        </div>
        <div className={styles.pair}>
          {field('finalsRatio', {
            inputMode: 'decimal',
            hint: '1 in N advance. Greater than 1. Example: 8.',
          })}
          {field('cashRatio', {
            inputMode: 'decimal',
            hint: '1 in N cash. Greater than 1. Example: 5.',
          })}
        </div>
        {field('superSweeperCashRatio', {
          inputMode: 'decimal',
          hint: '1 in N super sweeper bowlers cash. At least 1.',
        })}
        <div className={styles.actions}>
          <button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Saving…' : 'Save tournament'}
          </button>
          <Link className={styles.cancel} to="/tournaments">
            Cancel
          </Link>
        </div>
      </form>
      {failure && (
        <Toast
          kind="error"
          onDismiss={() => {
            setFailure(undefined)
          }}
        >
          {failure}
        </Toast>
      )}
    </Page>
  )
}
