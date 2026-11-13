import { isRealDate } from '../../shared/dateText'
import type { Squad } from '../squads/types'
import type { Sweeper } from '../sweepers/types'
import type {
  BowlerRegistration,
  BowlerResponse,
  BowlerValues,
  DeskFieldErrors,
  DeskRegistrationRequest,
} from './types'

export const bowlerFields = [
  'firstName',
  'middleInitial',
  'lastName',
  'suffix',
  'street',
  'city',
  'state',
  'zipCode',
  'email',
  'phoneNumber',
  'usbcId',
  'dateOfBirth',
  'gender',
] as const satisfies readonly (keyof BowlerValues)[]

export const emptyBowler: BowlerValues = {
  firstName: '',
  middleInitial: '',
  lastName: '',
  suffix: '',
  street: '',
  city: '',
  state: '',
  zipCode: '',
  email: '',
  phoneNumber: '',
  usbcId: '',
  dateOfBirth: '',
  gender: '',
}

/** The labels the Review step and the errors use for each bowler field. */
export const bowlerLabels: Record<keyof BowlerValues, string> = {
  firstName: 'First name',
  middleInitial: 'Middle initial',
  lastName: 'Last name',
  suffix: 'Suffix',
  street: 'Street',
  city: 'City',
  state: 'State',
  zipCode: 'Zip',
  email: 'Email',
  phoneNumber: 'Phone',
  usbcId: 'USBC ID',
  dateOfBirth: 'Date of birth',
  gender: 'Gender',
}

/** The form's registration part, all text so a box can hold what was typed. */
export interface RegistrationValues {
  divisionId: string
  average: string
  /** The squads ticked, including the ones already held and the one from the lane page. */
  squadIds: string[]
  sweeperIds: string[]
  superSweeper: boolean
}

export const emptyRegistration: RegistrationValues = {
  divisionId: '',
  average: '',
  squadIds: [],
  sweeperIds: [],
  superSweeper: false,
}

/** The stored bowler as the form's values (the id stays out). */
export function toBowlerValues(response: BowlerResponse['bowler']): BowlerValues {
  const values = { ...emptyBowler }
  for (const key of bowlerFields) Object.assign(values, { [key]: response[key] })
  return values
}

/** The registration part of a bowler already registered here: the form starts from what is stored (D-165). */
export function toRegistrationValues(registration: BowlerRegistration): RegistrationValues {
  return {
    divisionId: registration.divisionId,
    average: registration.average === null ? '' : String(registration.average),
    squadIds: [...registration.squadIds],
    sweeperIds: [...registration.sweeperIds],
    superSweeper: registration.superSweeper,
  }
}

/** What the desk typed on top of a stored bowler: a typed box wins, a blank one leaves the stored text (D-05). */
export function overlayBowler(stored: BowlerValues, typed: BowlerValues): BowlerValues {
  const values = { ...stored }
  for (const key of bowlerFields) {
    if (typed[key].trim() !== '') Object.assign(values, { [key]: typed[key] })
  }
  return values
}

/** The fields the desk changed on a stored bowler, as sent: trimmed, and never a blank (a blank changes nothing, D-05). */
export function changedFields(stored: BowlerValues, edited: BowlerValues): Partial<BowlerValues> {
  const changes: Partial<BowlerValues> = {}
  for (const key of bowlerFields) {
    const next = edited[key].trim()
    if (next !== '' && next !== stored[key].trim()) Object.assign(changes, { [key]: next })
  }
  return changes
}

/** What goes in `bowler` for a new bowler: every box with text in it. */
export function filledFields(values: BowlerValues): Partial<BowlerValues> {
  return changedFields(emptyBowler, values)
}

/** Step 1 needs the names (D-162) and a date of birth that is a whole date when given; the server checks the rest. */
export function checkBowlerStep(values: BowlerValues): DeskFieldErrors {
  const errors: DeskFieldErrors = {}
  const born = values.dateOfBirth.trim()
  if (born !== '' && !isRealDate(born)) {
    errors['bowler.dateOfBirth'] = 'Enter the date of birth as mm/dd/yyyy'
  }
  if (values.firstName.trim() === '') errors['bowler.firstName'] = 'First Name is Required'
  if (values.lastName.trim() === '') errors['bowler.lastName'] = 'Last Name is Required'
  return errors
}

/** The API's message for an edit that would leave no squad (`editRegister.ts`): change both together. */
export const lastSquadMessage =
  'Bowler must enter at least one squad. To remove the last one, delete the registration.'

/** Step 2 needs a division, a squad, and an average in range; the server rechecks (REG-03, REG-16). */
export function checkRegistrationStep(
  values: RegistrationValues,
  { editing = false }: { editing?: boolean } = {},
): DeskFieldErrors {
  const errors: DeskFieldErrors = {}
  if (values.divisionId === '') errors['divisionId'] = 'Pick a division'
  if (values.squadIds.length === 0) {
    // An edit cannot end with no squad: the way out is to delete the registration (D-203, D-214).
    errors['squadIds'] = editing ? lastSquadMessage : 'Bowler must enter at least one squad'
  }
  const average = values.average.trim()
  if (average !== '') {
    const value = Number(average)
    if (!Number.isInteger(value)) errors['average'] = 'Enter a whole number'
    else if (value <= 0) errors['average'] = 'Average must be greater than 0.'
    else if (value > 300) errors['average'] = 'Average must be less than or equal to 300.'
  }
  return errors
}

interface BuildInput {
  /** The stored bowler's id and values, or `undefined` for a new bowler. */
  stored: { id: string; values: BowlerValues } | undefined
  bowler: BowlerValues
  registration: RegistrationValues
  /** The registration the bowler already holds here, if any (D-165). */
  existing: BowlerRegistration | null
  /** Sent after the desk said yes to adding to the existing registration (D-159). */
  confirmAppend: boolean
}

/** The request body. Squads and sweepers already held are left out: only the new ones go (REG-11). */
export function buildRequest(input: BuildInput): DeskRegistrationRequest {
  const { stored, bowler, registration, existing } = input
  // Stryker disable next-line ArrayDeclaration: with no registration the set only gains a text no session has.
  const held = new Set([...(existing?.squadIds ?? []), ...(existing?.sweeperIds ?? [])])
  const average = registration.average.trim()
  const request: DeskRegistrationRequest = {
    divisionId: registration.divisionId,
    average: average === '' ? null : Number(average),
    squadIds: registration.squadIds.filter((id) => !held.has(id)),
    sweeperIds: registration.sweeperIds.filter((id) => !held.has(id)),
    superSweeper: registration.superSweeper,
    bowler: stored ? changedFields(stored.values, bowler) : filledFields(bowler),
  }
  if (stored) request.bowlerId = stored.id
  if (existing || input.confirmAppend) request.appendToExisting = true
  return request
}

/** Which step holds a server error key: the bowler's fields are step 1, the rest step 2. */
export function stepOfError(key: string): 1 | 2 {
  return key.startsWith('bowler.') ? 1 : 2
}

export interface Change {
  key: keyof BowlerValues
  from: string
  to: string
}

/** The fields the desk changed on a stored bowler, old against new, for the Review step (D-158). */
export function changesOf(stored: BowlerValues, edited: BowlerValues): Change[] {
  return bowlerFields.flatMap((key) => {
    const to = edited[key].trim()
    return to !== '' && to !== stored[key].trim() ? [{ key, from: stored[key], to }] : []
  })
}

export const bowlerFieldId = (key: keyof BowlerValues) => `bowler-${key}`
export const errorKeyOf = (key: keyof BowlerValues) => `bowler.${key}`

/** One squad or sweeper the desk collects for (D-166). */
export interface DueLine {
  kind: 'squad' | 'sweeper'
  id: string
  /** The session date as the API sends it. */
  date: string
  amount: number
}

interface DueInput {
  registration: RegistrationValues
  existing: BowlerRegistration | null
  squads: Squad[]
  sweepers: Sweeper[]
}

/**
 * What the desk collects: the entry fee of each squad (its own fee, else the tournament's, which
 * the API has already settled, TRN-12) and of each sweeper being added, in the order the lists
 * come. A squad or sweeper the bowler already holds is not charged again (D-166). There is no
 * super sweeper fee: it is a choice to enter every sweeper, whose fees are counted here.
 */
export function dueLines({ registration, existing, squads, sweepers }: DueInput): DueLine[] {
  // Stryker disable next-line ArrayDeclaration: with no registration the set only gains a text no session has.
  const held = new Set([...(existing?.squadIds ?? []), ...(existing?.sweeperIds ?? [])])
  const lines = (kind: DueLine['kind'], chosen: string[], sessions: (Squad | Sweeper)[]) =>
    sessions
      .filter((session) => chosen.includes(session.id) && !held.has(session.id))
      .map((session) => ({ kind, id: session.id, date: session.date, amount: session.entryFee }))
  return [
    ...lines('squad', registration.squadIds, squads),
    ...lines('sweeper', registration.sweeperIds, sweepers),
  ]
}

/** The total in whole cents, added as cents so 0.1 and 0.2 make 0.3 (D-166). */
export function totalDue(lines: DueLine[]): number {
  return lines.reduce((cents, line) => cents + Math.round(line.amount * 100), 0) / 100
}

/** "First Last" or "First Last, Suffix": the display name the registrations list shows. */
export function bowlerNameOf(
  values: Pick<BowlerValues, 'firstName' | 'lastName' | 'suffix'>,
): string {
  const name = `${values.firstName.trim()} ${values.lastName.trim()}`
  const suffix = values.suffix.trim()
  return suffix === '' ? name : `${name}, ${suffix}`
}
