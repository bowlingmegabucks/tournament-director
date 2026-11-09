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
  /** Edit page: on the registration now, still free to untick (D-197). Shows a badge. */
  entered?: string[]
  /** Edit page: a session that cannot be changed, with the reason in words (REG-34, D-10). */
  reasons?: Record<string, string>
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
  entered = [],
  reasons = {},
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
        const isEntered = entered.includes(session.id)
        const reason = reasons[session.id]
        const locked = isHeld || isPreset || reason !== undefined
        const closed = session.complete && !isHeld && !isEntered
        const reasonId = `${session.id}-reason`
        return (
          <div key={session.id}>
            <label className={`${styles.check} ${closed || reason ? styles.off : ''}`}>
              <input
                type="checkbox"
                checked={locked || chosen.includes(session.id)}
                disabled={locked || closed}
                aria-describedby={reason ? reasonId : undefined}
                onChange={(event) => {
                  onToggle(session.id, event.target.checked)
                }}
              />
              <span>{formatSessionDate(session.date)}</span>
              {closed && <span className={styles.badge}>Complete</span>}
              {isHeld && <span className={styles.badge}>Already entered</span>}
              {isEntered && <span className={styles.badge}>Entered</span>}
              {isPreset && !isHeld && (
                <span className={styles.badge}>Added from the lane page</span>
              )}
            </label>
            {reason && (
              <p id={reasonId} className={styles.hint}>
                {reason}
              </p>
            )}
          </div>
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
  /** Edit page only (D-197): the sessions on the registration, and what is locked and why. */
  edit?: {
    enteredSquadIds: string[]
    enteredSweeperIds: string[]
    reasons: Record<string, string>
    /** Why the division cannot change (REG-15), or `undefined`. */
    divisionLock: string | undefined
    /** Why super sweeper cannot change (REG-18), or `undefined`. */
    superSweeperLock: string | undefined
  }
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
  edit,
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
          disabled={edit?.divisionLock !== undefined}
          aria-invalid={divisionError ? true : undefined}
          aria-describedby={
            [
              divisionError ? 'registration-division-error' : undefined,
              edit?.divisionLock ? 'registration-division-lock' : undefined,
            ]
              .filter(Boolean)
              .join(' ') || undefined
          }
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
        {edit?.divisionLock && (
          <p id="registration-division-lock" className={styles.hint}>
            {edit.divisionLock}
          </p>
        )}
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
        entered={edit?.enteredSquadIds}
        reasons={edit?.reasons}
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
        entered={edit?.enteredSweeperIds}
        reasons={edit?.reasons}
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
            disabled={edit?.superSweeperLock !== undefined}
            aria-describedby={edit?.superSweeperLock ? 'registration-super-lock' : undefined}
            onChange={(event) => {
              onChange({ ...values, superSweeper: event.target.checked })
            }}
          />
          <span>Super sweeper</span>
          <span className={styles.badge}>Needs every sweeper</span>
        </label>
        {edit?.superSweeperLock && (
          <p id="registration-super-lock" className={styles.hint}>
            {edit.superSweeperLock}
          </p>
        )}
        {errors['superSweeper'] && (
          <p className={styles.fieldError} role="alert">
            {errors['superSweeper']}
          </p>
        )}
      </div>
    </fieldset>
  )
}
