import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { Toast } from '../../shared/Toast'
import { formatSessionDate } from '../../shared/sessionFormat'
import type { Division } from '../divisions/types'
import { useDivisions } from '../divisions/useDivisions'
import type { Squad } from '../squads/types'
import { useSquads } from '../squads/useSquads'
import type { Sweeper } from '../sweepers/types'
import { useSweepers } from '../sweepers/useSweepers'
import {
  AlreadyRegisteredError,
  BowlerNotFoundError,
  DeskRejectedError,
  UsbcIdOnFileError,
} from './bowlerApi'
import {
  buildRequest,
  checkBowlerStep,
  checkRegistrationStep,
  emptyBowler,
  emptyRegistration,
  errorKeyOf,
  overlayBowler,
  stepOfError,
  toBowlerValues,
  toRegistrationValues,
  type RegistrationValues,
  bowlerNameOf,
} from './deskForm'
import {
  BowlerStep,
  ErrorSummary,
  Notice,
  RegistrationStep,
  ReviewPanel,
  StepList,
} from './DeskSteps'
import { focusOnMount, stepNames, type Step } from './stepInfo'
import { AlreadyRegisteredDialog, UsbcIdOnFileDialog } from './RegistrationDialogs'
import type { BowlerResponse, BowlerValues, DeskFieldErrors, ExistingRegistration } from './types'
import { useCreateRegistration } from './useCreateRegistration'
import styles from './AddRegistration.module.css'

/** What the desk already typed, kept when it switches to a stored bowler (D-161). */
export interface Carry {
  bowler: BowlerValues
  registration: RegistrationValues
}

interface AddRegistrationFormProps {
  tournamentId: string
  /** The stored bowler picked from search, or `undefined` for a new one. */
  detail: BowlerResponse | undefined
  carry: Carry | undefined
  /** A squad or sweeper opened from a lane page: checked and locked (REG-22, D-164). */
  presetSquadId: string | undefined
  presetSweeperId: string | undefined
  onPickAnother: () => void
  onUseStored: (id: string, carry: Carry) => void
}

type Conflict =
  | { type: 'registered'; existing: ExistingRegistration }
  | { type: 'usbc'; bowler: { id: string; name: string } }

const union = (a: string[], b: string[]) => [...new Set([...a, ...b])]

function initialBowler(detail: BowlerResponse | undefined, carry: Carry | undefined): BowlerValues {
  if (detail) {
    const stored = toBowlerValues(detail.bowler)
    return carry ? overlayBowler(stored, carry.bowler) : stored
  }
  return carry?.bowler ?? emptyBowler
}

function initialRegistration(
  detail: BowlerResponse | undefined,
  carry: Carry | undefined,
  presetSquadId: string | undefined,
  presetSweeperId: string | undefined,
): RegistrationValues {
  const base = detail?.registration ? toRegistrationValues(detail.registration) : emptyRegistration
  const typed = carry?.registration ?? emptyRegistration
  return {
    divisionId: typed.divisionId === '' ? base.divisionId : typed.divisionId,
    average: typed.average === '' ? base.average : typed.average,
    squadIds: union(
      union(base.squadIds, typed.squadIds),
      presetSquadId === undefined ? [] : [presetSquadId],
    ),
    sweeperIds: union(
      union(base.sweeperIds, typed.sweeperIds),
      presetSweeperId === undefined ? [] : [presetSweeperId],
    ),
    superSweeper: base.superSweeper || typed.superSweeper,
  }
}

function firstStep(carry: Carry | undefined, existing: unknown): Step {
  if (carry) return 3
  return existing ? 2 : 1
}

/** The step that follows a step the desk just passed. */
const stepAfter = (step: Step): Step => (step === 1 ? 2 : 3)

const checkStep = (step: Step, bowler: BowlerValues, registration: RegistrationValues) =>
  step === 1 ? checkBowlerStep(bowler) : checkRegistrationStep(registration)

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : 'Failed to save the registration'

/** What the screen does after a save fails. */
type Outcome =
  | { kind: 'conflict'; conflict: Conflict }
  | { kind: 'gone' }
  | { kind: 'rejected'; errors: DeskFieldErrors; at: Step }
  | { kind: 'dialogFailure'; message: string }
  | { kind: 'failure'; message: string }

function outcomeOf(error: unknown, confirmAppend: boolean): Outcome {
  if (error instanceof AlreadyRegisteredError) {
    if (confirmAppend) return { kind: 'dialogFailure', message: error.message }
    return { kind: 'conflict', conflict: { type: 'registered', existing: error.existing } }
  }
  if (error instanceof BowlerNotFoundError) return { kind: 'gone' }
  if (error instanceof UsbcIdOnFileError) {
    return { kind: 'conflict', conflict: { type: 'usbc', bowler: error.bowler } }
  }
  if (error instanceof DeskRejectedError) {
    const keys = Object.keys(error.errors)
    if (keys.length === 0) return { kind: 'rejected', errors: { form: error.message }, at: 3 }
    const at = Math.min(...keys.map(stepOfError)) as Step
    return { kind: 'rejected', errors: error.errors, at }
  }
  const message = messageOf(error)
  return confirmAppend ? { kind: 'dialogFailure', message } : { kind: 'failure', message }
}

interface OutcomeHandlers {
  setConflict: (conflict: Conflict | undefined) => void
  setDialogFailure: (message: string | undefined) => void
  setFailure: (message: string | undefined) => void
  show: (errors: DeskFieldErrors, at: Step) => void
}

function applyOutcome(outcome: Outcome, handlers: OutcomeHandlers) {
  switch (outcome.kind) {
    case 'conflict':
      handlers.setConflict(outcome.conflict)
      break
    case 'gone':
      // Someone removed the stored bowler after the desk picked them.
      handlers.setConflict(undefined)
      handlers.setFailure('That bowler is no longer on file. Go back to the search and pick again.')
      break
    case 'rejected':
      handlers.setConflict(undefined)
      handlers.show(outcome.errors, outcome.at)
      break
    case 'dialogFailure':
      handlers.setDialogFailure(outcome.message)
      break
    case 'failure':
      handlers.setFailure(outcome.message)
      break
  }
}

function labelled(
  ids: string[],
  held: string[],
  sessions: { id: string; date: string }[],
  word: string,
) {
  return ids
    .filter((id) => !held.includes(id))
    .flatMap((id) => {
      const found = sessions.find((session) => session.id === id)
      return found ? [{ id, label: `${word}: ${formatSessionDate(found.date)}` }] : []
    })
}

/** The lines the "already registered" dialog lists as being added. */
function newItemsOf(
  registration: RegistrationValues,
  existing: { squadIds: string[]; sweeperIds: string[] } | null,
  squads: Squad[],
  sweepers: Sweeper[],
) {
  return [
    ...labelled(registration.squadIds, existing?.squadIds ?? [], squads, 'Squad'),
    ...labelled(registration.sweeperIds, existing?.sweeperIds ?? [], sweepers, 'Sweeper'),
  ]
}

const keepErrors = (errors: DeskFieldErrors, keep: (key: string) => boolean): DeskFieldErrors =>
  Object.fromEntries(Object.entries(errors).filter(([key]) => keep(key)))

/**
 * Loads the three lists, then shows the steps.
 */
export function AddRegistrationForm(props: Readonly<AddRegistrationFormProps>) {
  const divisions = useDivisions(props.tournamentId)
  const squads = useSquads(props.tournamentId)
  const sweepers = useSweepers(props.tournamentId)

  const lists = [divisions, squads, sweepers]
  const failed = lists.find((query) => query.error)
  if (failed?.error) {
    return (
      <QueryError
        error={failed.error}
        onRetry={() => {
          for (const query of lists) void query.refetch()
        }}
      />
    )
  }
  if (!divisions.data || !squads.data || !sweepers.data) {
    return <Loading label="Loading…" rows={3} />
  }
  return (
    <Steps {...props} divisions={divisions.data} squads={squads.data} sweepers={sweepers.data} />
  )
}

type StepsProps = AddRegistrationFormProps & {
  divisions: Division[]
  squads: Squad[]
  sweepers: Sweeper[]
}

/**
 * The three steps, Bowler, Registration, Review (D-164). A bowler already registered here starts
 * on Registration, with the Bowler step one click away (D-165). Step one checks the names, step
 * two the division and a squad; the server checks everything else and a refusal returns to the
 * step that holds the field.
 */
function Steps({
  tournamentId,
  detail,
  carry,
  presetSquadId,
  presetSweeperId,
  onPickAnother,
  onUseStored,
  divisions,
  squads,
  sweepers,
}: Readonly<StepsProps>) {
  const navigate = useNavigate()
  const create = useCreateRegistration(tournamentId)
  const existing = detail?.registration ?? null

  const [step, setStep] = useState<Step>(firstStep(carry, existing))
  const [bowler, setBowler] = useState(() => initialBowler(detail, carry))
  const [typedRegistration, setTypedRegistration] = useState(() =>
    initialRegistration(detail, carry, presetSquadId, presetSweeperId),
  )
  const [errors, setErrors] = useState<DeskFieldErrors>({})
  const [attempt, setAttempt] = useState(0)
  const [conflict, setConflict] = useState<Conflict>()
  const [dialogFailure, setDialogFailure] = useState<string>()
  const [failure, setFailure] = useState<string>()

  // A link can name a squad or sweeper this tournament does not have. Drop it here, where the lists
  // are known, so the desk never submits an id it cannot see or untick.
  const registration: RegistrationValues = {
    ...typedRegistration,
    squadIds: typedRegistration.squadIds.filter((id) => squads.some((s) => s.id === id)),
    sweeperIds: typedRegistration.sweeperIds.filter((id) => sweepers.some((s) => s.id === id)),
  }
  const stored = detail ? toBowlerValues(detail.bowler) : undefined
  const name = bowlerNameOf(bowler)
  const listUrl = `/tournaments/${tournamentId}/registrations`

  function goTo(at: Step) {
    setErrors({})
    setStep(at)
  }

  function show(next: DeskFieldErrors, at: Step) {
    setErrors(next)
    setAttempt((count) => count + 1)
    setStep(at)
  }

  function changeBowler(key: keyof BowlerValues, value: string) {
    setBowler({ ...bowler, [key]: value })
    setErrors((current) => keepErrors(current, (found) => found !== errorKeyOf(key)))
  }

  function changeRegistration(values: RegistrationValues) {
    setTypedRegistration(values)
    setErrors((current) => keepErrors(current, (key) => key.startsWith('bowler.')))
  }

  function next() {
    const found = checkStep(step, bowler, registration)
    if (Object.keys(found).length > 0) {
      show(found, step)
      return
    }
    goTo(stepAfter(step))
  }

  async function submit(confirmAppend: boolean): Promise<void> {
    const request = buildRequest({
      stored: detail ? { id: detail.bowler.id, values: toBowlerValues(detail.bowler) } : undefined,
      bowler,
      registration,
      existing,
      confirmAppend,
    })
    try {
      await create.mutateAsync(request)
      await navigate(listUrl, { state: { added: name } })
    } catch (error) {
      applyOutcome(outcomeOf(error, confirmAppend), {
        setConflict,
        setDialogFailure,
        setFailure,
        show,
      })
    }
  }

  const notice = (
    <Notice existing={existing} detail={detail} name={name} onPickAnother={onPickAnother} />
  )

  return (
    <div className={styles.stack}>
      <StepList step={step} onGo={goTo} />
      <ErrorSummary key={attempt} errors={errors} />

      <h2
        tabIndex={-1}
        key={`${String(step)}-heading`}
        ref={Object.keys(errors).length > 0 ? undefined : focusOnMount}
      >
        {stepNames[step]}
      </h2>

      {step === 1 && (
        <BowlerStep
          notice={notice}
          detail={detail}
          values={bowler}
          errors={errors}
          listUrl={listUrl}
          onChange={changeBowler}
          onBack={onPickAnother}
          onNext={next}
        />
      )}
      {step === 2 && (
        <RegistrationStep
          notice={notice}
          existing={existing}
          values={registration}
          errors={errors}
          divisions={divisions}
          squads={squads}
          sweepers={sweepers}
          presetSquadId={presetSquadId}
          presetSweeperId={presetSweeperId}
          listUrl={listUrl}
          onChange={changeRegistration}
          onBack={() => {
            goTo(1)
          }}
          onNext={next}
        />
      )}
      {step === 3 && (
        <ReviewPanel
          name={name}
          bowler={bowler}
          stored={stored}
          registration={registration}
          existing={existing}
          divisions={divisions}
          squads={squads}
          sweepers={sweepers}
          listUrl={listUrl}
          pending={create.isPending}
          saving={create.isPending && !conflict}
          onBack={() => {
            goTo(2)
          }}
          onSave={() => {
            void submit(false)
          }}
        />
      )}

      {conflict?.type === 'registered' && (
        <AlreadyRegisteredDialog
          name={name}
          existing={conflict.existing}
          adding={newItemsOf(registration, existing, squads, sweepers)}
          pending={create.isPending}
          failure={dialogFailure}
          onConfirm={() => {
            setDialogFailure(undefined)
            void submit(true)
          }}
          onClose={() => {
            setConflict(undefined)
            setDialogFailure(undefined)
          }}
        />
      )}
      {conflict?.type === 'usbc' && (
        <UsbcIdOnFileDialog
          stored={conflict.bowler}
          usbcId={bowler.usbcId.trim()}
          onUse={() => {
            onUseStored(conflict.bowler.id, { bowler, registration })
          }}
          onClose={() => {
            setConflict(undefined)
            show({ 'bowler.usbcId': 'This USBC ID belongs to another bowler on file.' }, 1)
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
