import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Loading } from '../../shared/Loading'
import { QueryError } from '../../shared/QueryError'
import { Toast } from '../../shared/Toast'
import { formatSessionDate } from '../../shared/sessionFormat'
import { useDivisions } from '../divisions/useDivisions'
import { useSquads } from '../squads/useSquads'
import { useSweepers } from '../sweepers/useSweepers'
import { AlreadyRegisteredError, DeskRejectedError, UsbcIdOnFileError } from './bowlerApi'
import { BowlerFields } from './BowlerFields'
import {
  bowlerFieldId,
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
} from './deskForm'
import { RegistrationFields } from './RegistrationFields'
import { AlreadyRegisteredDialog, UsbcIdOnFileDialog } from './RegistrationDialogs'
import { ReviewStep } from './ReviewStep'
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

type Step = 1 | 2 | 3

const stepNames: Record<Step, string> = { 1: 'Bowler', 2: 'Registration', 3: 'Review' }

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

const nameOf = (values: BowlerValues) =>
  `${values.firstName.trim()} ${values.lastName.trim()}${values.suffix.trim() === '' ? '' : `, ${values.suffix.trim()}`}`

/** A callback ref that moves focus when its element appears: a new step, or a new summary. */
const focusOnMount = (node: HTMLElement | null) => {
  node?.focus()
}

/**
 * The three steps, Bowler, Registration, Review (D-164). A bowler already registered here starts
 * on Registration, with the Bowler step one click away (D-165). Step one checks the names, step
 * two the division and a squad; the server checks everything else and a refusal returns to the
 * step that holds the field.
 */
export function AddRegistrationForm({
  tournamentId,
  detail,
  carry,
  presetSquadId,
  presetSweeperId,
  onPickAnother,
  onUseStored,
}: Readonly<AddRegistrationFormProps>) {
  const navigate = useNavigate()
  const divisions = useDivisions(tournamentId)
  const squads = useSquads(tournamentId)
  const sweepers = useSweepers(tournamentId)
  const create = useCreateRegistration(tournamentId)
  const existing = detail?.registration ?? null

  const [step, setStep] = useState<Step>(carry ? 3 : existing ? 2 : 1)
  const [bowler, setBowler] = useState(() => initialBowler(detail, carry))
  const [registration, setRegistration] = useState(() =>
    initialRegistration(detail, carry, presetSquadId, presetSweeperId),
  )
  const [errors, setErrors] = useState<DeskFieldErrors>({})
  const [attempt, setAttempt] = useState(0)
  const [conflict, setConflict] = useState<Conflict>()
  const [dialogFailure, setDialogFailure] = useState<string>()
  const [failure, setFailure] = useState<string>()

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

  const stored = detail ? toBowlerValues(detail.bowler) : undefined
  const name = nameOf(bowler)
  const listUrl = `/tournaments/${tournamentId}/registrations`

  function show(next: DeskFieldErrors, at: Step) {
    setErrors(next)
    setAttempt((count) => count + 1)
    setStep(at)
  }

  function changeBowler(key: keyof BowlerValues, value: string) {
    setBowler({ ...bowler, [key]: value })
    setErrors((current) =>
      Object.fromEntries(Object.entries(current).filter(([name]) => name !== errorKeyOf(key))),
    )
  }

  function changeRegistration(values: RegistrationValues) {
    setRegistration(values)
    setErrors((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => key.startsWith('bowler.'))),
    )
  }

  function next() {
    if (step === 1) {
      const found = checkBowlerStep(bowler)
      if (Object.keys(found).length > 0) return show(found, 1)
      setErrors({})
      setStep(2)
    } else if (step === 2) {
      const found = checkRegistrationStep(registration)
      if (Object.keys(found).length > 0) return show(found, 2)
      setErrors({})
      setStep(3)
    }
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
      if (error instanceof AlreadyRegisteredError) {
        if (confirmAppend) setDialogFailure(error.message)
        else setConflict({ type: 'registered', existing: error.existing })
      } else if (error instanceof UsbcIdOnFileError) {
        setConflict({ type: 'usbc', bowler: error.bowler })
      } else if (error instanceof DeskRejectedError) {
        setConflict(undefined)
        const keys = Object.keys(error.errors)
        const at = keys.length === 0 ? 3 : (Math.min(...keys.map(stepOfError)) as Step)
        show(keys.length === 0 ? { form: error.message } : error.errors, at)
      } else if (confirmAppend) {
        setDialogFailure(error instanceof Error ? error.message : 'Failed to save the registration')
      } else {
        setFailure(error instanceof Error ? error.message : 'Failed to save the registration')
      }
    }
  }

  const messages = Object.entries(errors)
  const heldSquads = existing?.squadIds ?? []
  const heldSweepers = existing?.sweeperIds ?? []

  const notice = existing ? (
    <p className={styles.notice} role="status">
      <strong>{name} is already registered</strong> in {existing.divisionName}. You are adding to
      that registration.{' '}
      <button type="button" className={styles.secondary} onClick={onPickAnother}>
        Pick someone else
      </button>
    </p>
  ) : detail ? (
    <p className={styles.notice} role="status">
      Using the bowler on file: <strong>{name}</strong>
      {detail.bowler.usbcId !== '' && `, ${detail.bowler.usbcId}`}.{' '}
      <button type="button" className={styles.secondary} onClick={onPickAnother}>
        Pick someone else
      </button>
    </p>
  ) : (
    <p className={styles.notice}>
      New bowler. Only first and last name are required.{' '}
      <button type="button" className={styles.secondary} onClick={onPickAnother}>
        Search again
      </button>
    </p>
  )

  const addLabel = existing ? 'Add to registration' : 'Add registration'
  const newItems = [
    ...registration.squadIds
      .filter((id) => !heldSquads.includes(id))
      .flatMap((id) => squads.data.find((squad) => squad.id === id)?.date ?? [])
      .map((date) => `Squad: ${formatSessionDate(date)}`),
    ...registration.sweeperIds
      .filter((id) => !heldSweepers.includes(id))
      .flatMap((id) => sweepers.data.find((sweeper) => sweeper.id === id)?.date ?? [])
      .map((date) => `Sweeper: ${formatSessionDate(date)}`),
  ]

  return (
    <div className={styles.stack}>
      <ol className={styles.steps} aria-label="Progress">
        {([1, 2, 3] as const).map((number) => {
          const label = `${String(number)}. ${stepNames[number]}`
          if (number === step) {
            return (
              <li key={number} className={styles.step} aria-current="step">
                {label}
              </li>
            )
          }
          return (
            <li key={number}>
              {number < step ? (
                <button
                  type="button"
                  className={styles.step}
                  onClick={() => {
                    setErrors({})
                    setStep(number)
                  }}
                >
                  {label}
                </button>
              ) : (
                <span className={styles.step}>{label}</span>
              )}
            </li>
          )
        })}
      </ol>

      {messages.length > 0 && (
        <div role="alert" className={styles.summary} tabIndex={-1} key={attempt} ref={focusOnMount}>
          <strong>
            Fix {messages.length} {messages.length === 1 ? 'thing' : 'things'} to save.
          </strong>
          <ul className={styles.summaryList}>
            {messages.map(([key, message]) => (
              <li key={key}>
                {key.startsWith('bowler.') ? (
                  <a
                    href={`#${bowlerFieldId(key.slice(7) as keyof BowlerValues)}`}
                    onClick={(event) => {
                      event.preventDefault()
                      document
                        .getElementById(bowlerFieldId(key.slice(7) as keyof BowlerValues))
                        ?.focus()
                    }}
                  >
                    {message}
                  </a>
                ) : (
                  message
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2
        tabIndex={-1}
        key={`${String(step)}-heading`}
        ref={messages.length > 0 ? undefined : focusOnMount}
      >
        {stepNames[step]}
      </h2>

      {step === 1 && (
        <>
          {notice}
          <BowlerFields
            values={bowler}
            errors={errors}
            legend={detail ? 'Bowler details' : 'New bowler'}
            hint={
              detail
                ? 'Filled from the record on file. Change what is out of date. Changed fields save to the bowler; blank boxes change nothing.'
                : undefined
            }
            onChange={changeBowler}
          />
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={onPickAnother}>
              Back to search
            </button>
            <button type="button" onClick={next}>
              Next: registration
            </button>
            <Link className={styles.cancel} to={listUrl}>
              Cancel
            </Link>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          {existing && notice}
          <RegistrationFields
            values={registration}
            errors={errors}
            divisions={divisions.data}
            squads={squads.data}
            sweepers={sweepers.data}
            heldSquadIds={heldSquads}
            heldSweeperIds={heldSweepers}
            presetSquadId={presetSquadId}
            presetSweeperId={presetSweeperId}
            legend={existing ? 'Add to the registration' : 'Registration'}
            hint={
              existing
                ? 'Squads and sweepers already entered show checked and locked. A different division moves the registration.'
                : undefined
            }
            onChange={changeRegistration}
          />
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                setErrors({})
                setStep(1)
              }}
            >
              {existing ? 'Back to bowler details' : 'Back'}
            </button>
            <button type="button" onClick={next}>
              Next: review
            </button>
            <Link className={styles.cancel} to={listUrl}>
              Cancel
            </Link>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <ReviewStep
            heading="Check and save"
            name={name}
            bowler={bowler}
            stored={stored}
            registration={registration}
            existing={existing}
            divisions={divisions.data}
            squads={squads.data}
            sweepers={sweepers.data}
          />
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              disabled={create.isPending}
              onClick={() => {
                setErrors({})
                setStep(2)
              }}
            >
              Back
            </button>
            <button
              type="button"
              disabled={create.isPending}
              onClick={() => {
                void submit(false)
              }}
            >
              {create.isPending && !conflict ? 'Saving…' : addLabel}
            </button>
            <Link className={styles.cancel} to={listUrl}>
              Cancel
            </Link>
          </div>
        </>
      )}

      {conflict?.type === 'registered' && (
        <AlreadyRegisteredDialog
          name={name}
          existing={conflict.existing}
          adding={newItems}
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
