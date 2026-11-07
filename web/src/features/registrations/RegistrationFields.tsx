import { formatSessionDate } from '../../shared/sessionFormat'
import type { Division } from '../divisions/types'
import type { Squad } from '../squads/types'
import type { Sweeper } from '../sweepers/types'
import type { RegistrationValues } from './deskForm'
import type { DeskFieldErrors } from './types'
import styles from './AddRegistration.module.css'

interface SessionsProps {
  legend: string
  hint?: string
  sessions: { id: string; date: string; complete: boolean }[]
  chosen: string[]
  /** Already on the bowler's registration: checked and locked (REG-11, D-165). */
  held: string[]
  /** Came from the lane page: checked and locked (REG-22, D-164). */
  preset: string | undefined
  error: string | undefined
  errorId: string
  onToggle: (id: string, on: boolean) => void
}

function Sessions({
  legend,
  hint,
  sessions,
  chosen,
  held,
  preset,
  error,
  errorId,
  onToggle,
}: Readonly<SessionsProps>) {
  return (
    <fieldset
      className={styles.checks}
      aria-describedby={error ? errorId : undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend>{legend}</legend>
      {sessions.length === 0 && <p className={styles.hint}>None in this tournament.</p>}
      {sessions.map((session) => {
        const isHeld = held.includes(session.id)
        const isPreset = session.id === preset
        const locked = isHeld || isPreset
        const closed = session.complete && !isHeld
        return (
          <label className={`${styles.check} ${closed ? styles.off : ''}`} key={session.id}>
            <input
              type="checkbox"
              checked={locked || chosen.includes(session.id)}
              disabled={locked || closed}
              onChange={(event) => {
                onToggle(session.id, event.target.checked)
              }}
            />
            <span>{formatSessionDate(session.date)}</span>
            {closed && <span className={styles.badge}>Complete</span>}
            {isHeld && <span className={styles.badge}>Already entered</span>}
            {isPreset && !isHeld && <span className={styles.badge}>Added from the lane page</span>}
          </label>
        )
      })}
      {hint && <p className={styles.hint}>{hint}</p>}
      {error && (
        <p id={errorId} className={styles.fieldError}>
          {error}
        </p>
      )}
    </fieldset>
  )
}

interface RegistrationFieldsProps {
  values: RegistrationValues
  errors: DeskFieldErrors
  divisions: Division[]
  squads: Squad[]
  sweepers: Sweeper[]
  heldSquadIds: string[]
  heldSweeperIds: string[]
  presetSquadId: string | undefined
  presetSweeperId: string | undefined
  legend: string
  hint?: string
  onChange: (values: RegistrationValues) => void
}

const toggled = (ids: string[], id: string, on: boolean) =>
  on ? [...ids.filter((other) => other !== id), id] : ids.filter((other) => other !== id)

/** Division, average, squads, sweepers, and the super sweeper (REG-03, REG-04, REG-06, REG-16). */
export function RegistrationFields({
  values,
  errors,
  divisions,
  squads,
  sweepers,
  heldSquadIds,
  heldSweeperIds,
  presetSquadId,
  presetSweeperId,
  legend,
  hint,
  onChange,
}: Readonly<RegistrationFieldsProps>) {
  const divisionError = errors['divisionId']
  const averageError = errors['average']
  const sorted = [...divisions].sort((a, b) => a.number - b.number)
  return (
    <fieldset className={styles.group}>
      <legend>{legend}</legend>
      {hint && <p className={styles.hint}>{hint}</p>}
      <div className={styles.field}>
        <label className={styles.label} htmlFor="registration-division">
          Division (required)
        </label>
        <select
          id="registration-division"
          className={styles.input}
          value={values.divisionId}
          aria-invalid={divisionError ? true : undefined}
          aria-describedby={divisionError ? 'registration-division-error' : undefined}
          onChange={(event) => {
            onChange({ ...values, divisionId: event.target.value })
          }}
        >
          <option value="">Pick a division</option>
          {sorted.map((division) => (
            <option key={division.id} value={division.id}>
              {division.name}
            </option>
          ))}
        </select>
        {divisionError && (
          <p id="registration-division-error" className={styles.fieldError}>
            {divisionError}
          </p>
        )}
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="registration-average">
          Average
        </label>
        <input
          id="registration-average"
          className={styles.input}
          inputMode="numeric"
          autoComplete="off"
          value={values.average}
          aria-invalid={averageError ? true : undefined}
          aria-describedby={
            averageError ? 'registration-average-error' : 'registration-average-hint'
          }
          onChange={(event) => {
            onChange({ ...values, average: event.target.value })
          }}
        />
        <p id="registration-average-hint" className={styles.hint}>
          1 to 300. Handicap and some divisions need it.
        </p>
        {averageError && (
          <p id="registration-average-error" className={styles.fieldError}>
            {averageError}
          </p>
        )}
      </div>
      <Sessions
        legend="Squads (pick at least one)"
        sessions={squads}
        chosen={values.squadIds}
        held={heldSquadIds}
        preset={presetSquadId}
        error={errors['squadIds']}
        errorId="registration-squads-error"
        onToggle={(id, on) => {
          onChange({ ...values, squadIds: toggled(values.squadIds, id, on) })
        }}
      />
      <Sessions
        legend="Sweepers"
        sessions={sweepers}
        chosen={values.sweeperIds}
        held={heldSweeperIds}
        preset={presetSweeperId}
        error={errors['sweeperIds']}
        errorId="registration-sweepers-error"
        onToggle={(id, on) => {
          onChange({ ...values, sweeperIds: toggled(values.sweeperIds, id, on) })
        }}
      />
      <div>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={values.superSweeper}
            onChange={(event) => {
              onChange({ ...values, superSweeper: event.target.checked })
            }}
          />
          <span>Super sweeper</span>
          <span className={styles.badge}>Needs every sweeper</span>
        </label>
        {errors['superSweeper'] && (
          <p className={styles.fieldError} role="alert">
            {errors['superSweeper']}
          </p>
        )}
      </div>
    </fieldset>
  )
}
