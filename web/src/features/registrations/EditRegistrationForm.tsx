import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ConfirmChangesDialog } from '../../shared/ConfirmChangesDialog'
import { Toast } from '../../shared/Toast'
import { formatSessionDate } from '../../shared/sessionFormat'
import type { Division } from '../divisions/types'
import type { Squad } from '../squads/types'
import type { Sweeper } from '../sweepers/types'
import { BowlerFields } from './BowlerFields'
import {
  checkBowlerStep,
  checkRegistrationStep,
  errorKeyOf,
  stepOfError,
  type RegistrationValues,
} from './deskForm'
import { Actions, ErrorSummary, StepList } from './DeskSteps'
import {
  ConfirmWarningsError,
  RegistrationChangedError,
  RegistrationNotFoundError,
} from './editApi'
import {
  buildEditRequest,
  describeResult,
  editChangesOf,
  hasChanges,
  moneyOf,
  removeLock,
  storedBowlerOf,
  toEditRegistrationValues,
} from './editForm'
import { EditReviewStep } from './EditReviewStep'
import { DeskRejectedError } from './bowlerApi'
import { RegistrationFields } from './RegistrationFields'
import { focusOnMount, stepNames, type Step } from './stepInfo'
import type {
  BowlerValues,
  DeskFieldErrors,
  EditInfo,
  EditWarning,
  ExistingRegistration,
} from './types'
import { useEditRegistration } from './useEditRegistration'
import styles from './AddRegistration.module.css'

interface EditRegistrationFormProps {
  tournamentId: string
  info: EditInfo
  divisions: Division[]
  squads: Squad[]
  sweepers: Sweeper[]
  /** Read the registration again and start the form over (D-199). */
  onReload: () => void
}

const nameOf = (values: BowlerValues) => {
  const name = `${values.firstName.trim()} ${values.lastName.trim()}`
  const suffix = values.suffix.trim()
  return suffix === '' ? name : `${name}, ${suffix}`
}

const keepErrors = (errors: DeskFieldErrors, keep: (key: string) => boolean): DeskFieldErrors =>
  Object.fromEntries(Object.entries(errors).filter(([key]) => keep(key)))

/** What a failed save asks the screen to do. */
type Outcome =
  | { kind: 'changed'; error: RegistrationChangedError }
  | { kind: 'warnings'; warnings: EditWarning[] }
  | { kind: 'rejected'; errors: DeskFieldErrors; at: Step }
  | { kind: 'failure'; message: string }

function outcomeOf(error: unknown): Outcome {
  if (error instanceof RegistrationChangedError) return { kind: 'changed', error }
  if (error instanceof ConfirmWarningsError) return { kind: 'warnings', warnings: error.warnings }
  if (error instanceof RegistrationNotFoundError) {
    return { kind: 'failure', message: 'This registration no longer exists.' }
  }
  if (error instanceof DeskRejectedError) {
    const keys = Object.keys(error.errors)
    if (keys.length === 0) return { kind: 'rejected', errors: { form: error.message }, at: 3 }
    return {
      kind: 'rejected',
      errors: error.errors,
      at: Math.min(...keys.map(stepOfError)) as Step,
    }
  }
  // Stryker disable next-line StringLiteral: a mutation always rejects with an Error, so the fallback never shows.
  const message = error instanceof Error ? error.message : 'Failed to save the registration'
  return { kind: 'failure', message }
}

function lockReasons(info: EditInfo, sessions: { id: string; complete: boolean }[]) {
  const held = new Set([...info.registration.squadIds, ...info.registration.sweeperIds])
  const reasons: Record<string, string> = {}
  for (const session of sessions) {
    if (!held.has(session.id)) continue
    const reason = removeLock(session, info)
    if (reason) reasons[session.id] = reason
  }
  return reasons
}

/** The "this changed" notice (D-199): what the record holds now, and a button that reads it again. */
function ChangedNotice({
  existing,
  squads,
  sweepers,
  onReload,
}: Readonly<{
  existing: ExistingRegistration | undefined
  squads: Squad[]
  sweepers: Sweeper[]
  onReload: () => void
}>) {
  const dates = (ids: string[], sessions: { id: string; date: string }[], word: string) =>
    ids.flatMap((id) => {
      const found = sessions.find((session) => session.id === id)
      return found ? [`${word} ${formatSessionDate(found.date)}`] : []
    })
  const now = existing
    ? [
        ...dates(existing.squadIds, squads, 'Squad'),
        ...dates(existing.sweeperIds, sweepers, 'Sweeper'),
      ]
    : []
  return (
    <div role="alert" className={styles.notice}>
      <p>
        <strong>This registration changed.</strong> Review and save again.
      </p>
      {now.length > 0 && <p className={styles.hint}>Now entered: {now.join(', ')}.</p>}
      <button type="button" className={styles.secondary} onClick={onReload}>
        Reload registration
      </button>
    </div>
  )
}

/**
 * The three steps of an edit, Bowler, Registration, Review (D-197). It starts on Registration, as
 * a bowler already registered does on add (D-165). Step one checks the names, step two the division
 * and a squad; the server checks the rest and a refusal returns to the step that holds the field.
 * Changes go as additions and removals (D-199), and a removal needs a tick on Review (D-207).
 */
export function EditRegistrationForm({
  tournamentId,
  info,
  divisions,
  squads,
  sweepers,
  onReload,
}: Readonly<EditRegistrationFormProps>) {
  const navigate = useNavigate()
  const edit = useEditRegistration(tournamentId, info.registration.id)
  const stored = storedBowlerOf(info)

  const [step, setStep] = useState<Step>(2)
  const [bowler, setBowler] = useState(stored)
  const [registration, setRegistration] = useState<RegistrationValues>(() =>
    toEditRegistrationValues(info.registration),
  )
  const [errors, setErrors] = useState<DeskFieldErrors>({})
  const [attempt, setAttempt] = useState(0)
  const [removalConfirmed, setRemovalConfirmed] = useState(false)
  const [changed, setChanged] = useState<RegistrationChangedError>()
  const [warnings, setWarnings] = useState<EditWarning[]>()
  const [dialogFailure, setDialogFailure] = useState<string>()
  const [failure, setFailure] = useState<string>()

  const name = nameOf(bowler)
  const listUrl = `/tournaments/${tournamentId}/registrations`
  const request = buildEditRequest({ info, bowler, registration })
  const money = moneyOf({ info, registration, squads, sweepers })
  const somethingChanged = hasChanges(request)
  const needsTick = money.refund.length > 0 && !removalConfirmed

  function show(next: DeskFieldErrors, at: Step) {
    setErrors(next)
    setAttempt((count) => count + 1)
    setStep(at)
  }

  function goTo(at: Step) {
    setErrors({})
    setStep(at)
  }

  function next() {
    const found =
      step === 1 ? checkBowlerStep(bowler) : checkRegistrationStep(registration, { editing: true })
    if (Object.keys(found).length > 0) show(found, step)
    else goTo(step === 1 ? 2 : 3)
  }

  async function submit(confirmWarnings: boolean): Promise<void> {
    try {
      const result = await edit.mutateAsync(
        buildEditRequest({ info, bowler, registration, confirmWarnings }),
      )
      await navigate(listUrl, { state: { updated: `${name}: ${describeResult(result)}` } })
    } catch (error) {
      const outcome = outcomeOf(error)
      if (outcome.kind === 'changed') {
        setWarnings(undefined)
        setChanged(outcome.error)
      } else if (outcome.kind === 'warnings') {
        setDialogFailure(undefined)
        setWarnings(outcome.warnings)
      } else if (outcome.kind === 'rejected') {
        setWarnings(undefined)
        show(outcome.errors, outcome.at)
      } else if (warnings) {
        setDialogFailure(outcome.message)
      } else {
        setFailure(outcome.message)
      }
    }
  }

  const sessions = [...squads, ...sweepers]
  return (
    <div className={styles.stack}>
      <output className={styles.notice}>
        Editing <strong>{name}</strong>. Changes save together when you press Save on the last step.
      </output>
      <StepList step={step} onGo={goTo} />
      <ErrorSummary key={attempt} errors={errors} />
      {changed && (
        <ChangedNotice
          existing={changed.existing}
          squads={squads}
          sweepers={sweepers}
          onReload={onReload}
        />
      )}

      <h2
        tabIndex={-1}
        key={`${String(step)}-heading`}
        ref={Object.keys(errors).length > 0 ? undefined : focusOnMount}
      >
        {stepNames[step]}
      </h2>

      {step === 1 && (
        <>
          <BowlerFields
            values={bowler}
            errors={errors}
            legend="Bowler details"
            hint="Filled from the record on file. Change what is out of date. Empty a box to clear it."
            onChange={(key, value) => {
              setBowler({ ...bowler, [key]: value })
              setErrors((current) => keepErrors(current, (found) => found !== errorKeyOf(key)))
            }}
          />
          <Actions listUrl={listUrl}>
            <button type="button" onClick={next}>
              Next: registration
            </button>
          </Actions>
        </>
      )}
      {step === 2 && (
        <>
          <RegistrationFields
            values={registration}
            errors={errors}
            divisions={divisions}
            squads={squads}
            sweepers={sweepers}
            heldSquadIds={[]}
            heldSweeperIds={[]}
            presetSquadId={undefined}
            presetSweeperId={undefined}
            legend="Registration"
            hint="Untick a squad or sweeper to remove it, tick one to add it. To switch squads, untick one and tick another."
            edit={{
              enteredSquadIds: info.registration.squadIds,
              enteredSweeperIds: info.registration.sweeperIds,
              reasons: lockReasons(info, sessions),
              divisionLock: info.locks.hasScores
                ? 'Cannot change after scores have been recorded.'
                : undefined,
              superSweeperLock: info.locks.hasSweeperScores
                ? 'Cannot change: this bowler has sweeper scores.'
                : undefined,
            }}
            onChange={(values) => {
              setRegistration(values)
              setRemovalConfirmed(false)
              // Errors on this step are for this step: moving to another step already cleared the rest.
              setErrors({})
            }}
          />
          <Actions listUrl={listUrl}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                goTo(1)
              }}
            >
              Back to bowler details
            </button>
            <button type="button" onClick={next}>
              Next: review
            </button>
          </Actions>
        </>
      )}
      {step === 3 && (
        <>
          <EditReviewStep
            name={name}
            info={info}
            registration={registration}
            divisions={divisions}
            bowlerChanges={editChangesOf(stored, bowler)}
            money={money}
            changed={somethingChanged}
            removalConfirmed={removalConfirmed}
            onConfirmRemoval={setRemovalConfirmed}
          />
          <Actions listUrl={listUrl}>
            <button
              type="button"
              className={styles.secondary}
              disabled={edit.isPending}
              onClick={() => {
                goTo(2)
              }}
            >
              Back
            </button>
            <button
              type="button"
              disabled={edit.isPending || !somethingChanged || needsTick}
              onClick={() => {
                void submit(false)
              }}
            >
              {edit.isPending && !warnings ? 'Saving…' : 'Save changes'}
            </button>
          </Actions>
        </>
      )}

      {warnings && (
        <ConfirmChangesDialog
          title="Save these changes?"
          items={warnings.map((warning) => ({
            field: warning.field,
            message: warning.message,
            change: warning.field === 'average' ? averageChange(info, registration) : '',
          }))}
          pending={edit.isPending}
          failure={dialogFailure}
          onConfirm={() => {
            setDialogFailure(undefined)
            void submit(true)
          }}
          onClose={() => {
            setWarnings(undefined)
            setDialogFailure(undefined)
          }}
        />
      )}
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
    </div>
  )
}

function averageChange(info: EditInfo, registration: RegistrationValues): string {
  const was = info.registration.average === null ? 'not set' : String(info.registration.average)
  const now = registration.average.trim() === '' ? 'cleared' : registration.average.trim()
  return `Average: ${was} → ${now}`
}
