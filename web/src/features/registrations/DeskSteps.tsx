import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { Division } from '../divisions/types'
import type { Squad } from '../squads/types'
import type { Sweeper } from '../sweepers/types'
import { BowlerFields } from './BowlerFields'
import { bowlerFieldId, type RegistrationValues } from './deskForm'
import { RegistrationFields } from './RegistrationFields'
import { ReviewStep } from './ReviewStep'
import type { BowlerRegistration, BowlerResponse, BowlerValues, DeskFieldErrors } from './types'
import { focusOnMount, stepNames, type Step } from './stepInfo'
import styles from './AddRegistration.module.css'

interface StepListProps {
  step: Step
  onGo: (step: Step) => void
}

/** The progress list: the current step, earlier steps as buttons, later steps as plain text. */
export function StepList({ step, onGo }: Readonly<StepListProps>) {
  return (
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
        if (number > step) {
          return (
            <li key={number}>
              <span className={styles.step}>{label}</span>
            </li>
          )
        }
        return (
          <li key={number}>
            <button
              type="button"
              className={styles.step}
              onClick={() => {
                onGo(number)
              }}
            >
              {label}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** The "Fix n things" box. Renders nothing when there are no messages. */
export function ErrorSummary({ errors }: Readonly<{ errors: DeskFieldErrors }>) {
  const messages = Object.entries(errors)
  if (messages.length === 0) return null
  return (
    <div role="alert" className={styles.summary} tabIndex={-1} ref={focusOnMount}>
      <strong>
        Fix {messages.length} {messages.length === 1 ? 'thing' : 'things'} to save.
      </strong>
      <ul className={styles.summaryList}>
        {messages.map(([key, message]) => (
          <li key={key}>
            {key.startsWith('bowler.') ? <FieldLink fieldKey={key} message={message} /> : message}
          </li>
        ))}
      </ul>
    </div>
  )
}

function FieldLink({ fieldKey, message }: Readonly<{ fieldKey: string; message: string }>) {
  const id = bowlerFieldId(fieldKey.slice(7) as keyof BowlerValues)
  return (
    <a
      href={`#${id}`}
      onClick={(event) => {
        event.preventDefault()
        document.getElementById(id)?.focus()
      }}
    >
      {message}
    </a>
  )
}

interface NoticeProps {
  existing: BowlerRegistration | null
  detail: BowlerResponse | undefined
  name: string
  onPickAnother: () => void
}

/** Says whose record the form uses: a registered bowler, a bowler on file, or a new one. */
export function Notice({ existing, detail, name, onPickAnother }: Readonly<NoticeProps>) {
  const pick = (label: string) => (
    <button type="button" className={styles.secondary} onClick={onPickAnother}>
      {label}
    </button>
  )
  if (existing) {
    return (
      <output className={styles.notice}>
        <strong>{name} is already registered</strong> in {existing.divisionName}. You are adding to
        that registration. {pick('Pick someone else')}
      </output>
    )
  }
  if (detail) {
    const usbcId = detail.bowler.usbcId === '' ? '' : `, ${detail.bowler.usbcId}`
    return (
      <output className={styles.notice}>
        Using the bowler on file: <strong>{name}</strong>
        {usbcId}. {pick('Pick someone else')}
      </output>
    )
  }
  return (
    <p className={styles.notice}>
      New bowler. Only first and last name are required. {pick('Search again')}
    </p>
  )
}

interface ActionsProps {
  listUrl: string
  children: ReactNode
}

export function Actions({ listUrl, children }: Readonly<ActionsProps>) {
  return (
    <div className={styles.actions}>
      {children}
      <Link className={styles.cancel} to={listUrl}>
        Cancel
      </Link>
    </div>
  )
}

interface BowlerStepProps {
  notice: ReactNode
  detail: BowlerResponse | undefined
  values: BowlerValues
  errors: DeskFieldErrors
  listUrl: string
  onChange: (key: keyof BowlerValues, value: string) => void
  onBack: () => void
  onNext: () => void
}

export function BowlerStep({
  notice,
  detail,
  values,
  errors,
  listUrl,
  onChange,
  onBack,
  onNext,
}: Readonly<BowlerStepProps>) {
  const hint = detail
    ? 'Filled from the record on file. Change what is out of date. Changed fields save to the bowler; blank boxes change nothing.'
    : undefined
  return (
    <>
      {notice}
      <BowlerFields
        values={values}
        errors={errors}
        legend={detail ? 'Bowler details' : 'New bowler'}
        hint={hint}
        onChange={onChange}
      />
      <Actions listUrl={listUrl}>
        <button type="button" className={styles.secondary} onClick={onBack}>
          Back to search
        </button>
        <button type="button" onClick={onNext}>
          Next: registration
        </button>
      </Actions>
    </>
  )
}

interface RegistrationStepProps {
  notice: ReactNode
  existing: BowlerRegistration | null
  values: RegistrationValues
  errors: DeskFieldErrors
  divisions: Division[]
  squads: Squad[]
  sweepers: Sweeper[]
  presetSquadId: string | undefined
  presetSweeperId: string | undefined
  listUrl: string
  onChange: (values: RegistrationValues) => void
  onBack: () => void
  onNext: () => void
}

export function RegistrationStep({
  notice,
  existing,
  values,
  errors,
  divisions,
  squads,
  sweepers,
  presetSquadId,
  presetSweeperId,
  listUrl,
  onChange,
  onBack,
  onNext,
}: Readonly<RegistrationStepProps>) {
  const hint = existing
    ? 'Squads and sweepers already entered show checked and locked. A different division moves the registration.'
    : undefined
  return (
    <>
      {existing && notice}
      <RegistrationFields
        values={values}
        errors={errors}
        divisions={divisions}
        squads={squads}
        sweepers={sweepers}
        heldSquadIds={existing?.squadIds ?? []}
        heldSweeperIds={existing?.sweeperIds ?? []}
        presetSquadId={presetSquadId}
        presetSweeperId={presetSweeperId}
        legend={existing ? 'Add to the registration' : 'Registration'}
        hint={hint}
        onChange={onChange}
      />
      <Actions listUrl={listUrl}>
        <button type="button" className={styles.secondary} onClick={onBack}>
          {existing ? 'Back to bowler details' : 'Back'}
        </button>
        <button type="button" onClick={onNext}>
          Next: review
        </button>
      </Actions>
    </>
  )
}

interface ReviewPanelProps {
  name: string
  bowler: BowlerValues
  stored: BowlerValues | undefined
  registration: RegistrationValues
  existing: BowlerRegistration | null
  divisions: Division[]
  squads: Squad[]
  sweepers: Sweeper[]
  listUrl: string
  pending: boolean
  saving: boolean
  onBack: () => void
  onSave: () => void
}

export function ReviewPanel({
  name,
  bowler,
  stored,
  registration,
  existing,
  divisions,
  squads,
  sweepers,
  listUrl,
  pending,
  saving,
  onBack,
  onSave,
}: Readonly<ReviewPanelProps>) {
  let saveLabel = existing ? 'Add to registration' : 'Add registration'
  if (saving) saveLabel = 'Saving…'
  return (
    <>
      <ReviewStep
        heading="Check and save"
        name={name}
        bowler={bowler}
        stored={stored}
        registration={registration}
        existing={existing}
        divisions={divisions}
        squads={squads}
        sweepers={sweepers}
      />
      <Actions listUrl={listUrl}>
        <button type="button" className={styles.secondary} disabled={pending} onClick={onBack}>
          Back
        </button>
        <button type="button" disabled={pending} onClick={onSave}>
          {saveLabel}
        </button>
      </Actions>
    </>
  )
}
