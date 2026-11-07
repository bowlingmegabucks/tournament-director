import {
  dateProblem,
  hasAtMostDecimals,
  laneBlockProblem,
  numberOfLanesProblem,
  parse,
  perPairProblem,
  startingLaneProblem,
  type TournamentDates,
} from '../../shared/sessionValidation'
import {
  squadFields,
  type NewSquad,
  type Squad,
  type SquadChanges,
  type SquadField,
  type SquadFieldErrors,
  type SquadFormValues,
} from './types'

/**
 * The create rules (SQD-02 to SQD-06, SQD-08, D-168 to D-170), run in the browser for quick
 * feedback. The API runs the same rules with the same messages and stays the authority (D-167):
 * change both together.
 */

export const emptySquadForm: SquadFormValues = {
  date: '',
  startingLane: '',
  numberOfLanes: '',
  maxPerPair: '',
  entryFee: '',
  finalsRatio: '',
  cashRatio: '',
}

export type { TournamentDates }

export const beforeStartMessage = 'Squad date must be after tournament start'
export const afterEndMessage = 'Squad date must be before tournament end'

function ratio(label: string, text: string): string | undefined {
  const parsed = parse(text)
  if ('blank' in parsed) return undefined
  if ('error' in parsed) return parsed.error
  if (parsed.value <= 1) return `${label} must be greater than 1`
  if (parsed.value > 99.9) return `${label} cannot be more than 99.9`
  return hasAtMostDecimals(parsed.value, 1) ? undefined : 'Use at most one decimal place'
}

function fee(text: string): string | undefined {
  const parsed = parse(text)
  if ('blank' in parsed) return undefined
  if ('error' in parsed) return parsed.error
  if (parsed.value < 0 || parsed.value > 999.99) return 'Entry fee must be between $0 and $999.99'
  return hasAtMostDecimals(parsed.value, 2) ? undefined : 'Use at most two decimal places'
}

/** Check every field. An empty result means the form may be sent. */
export function validateSquad(values: SquadFormValues, dates?: TournamentDates): SquadFieldErrors {
  const problems: SquadFieldErrors = {
    date: dateProblem(values.date, dates, 'Squad'),
    startingLane: startingLaneProblem(values.startingLane),
    numberOfLanes:
      numberOfLanesProblem(values.numberOfLanes) ??
      laneBlockProblem(values.startingLane, values.numberOfLanes),
    maxPerPair: perPairProblem(values.maxPerPair),
    entryFee: fee(values.entryFee),
    finalsRatio: ratio('Finals ratio', values.finalsRatio),
    cashRatio: ratio('Cash ratio', values.cashRatio),
  }
  const errors: SquadFieldErrors = {}
  for (const [key, message] of Object.entries(problems)) {
    if (message !== undefined) errors[key as keyof SquadFieldErrors] = message
  }
  return errors
}

const numberOrNull = (text: string): number | null => (text.trim() === '' ? null : Number(text))

/** The request for values that passed `validateSquad`. */
export function toNewSquad(values: SquadFormValues): NewSquad {
  return {
    date: values.date.trim(),
    startingLane: Number(values.startingLane),
    numberOfLanes: Number(values.numberOfLanes),
    maxPerPair: Number(values.maxPerPair),
    entryFee: numberOrNull(values.entryFee),
    finalsRatio: numberOrNull(values.finalsRatio),
    cashRatio: numberOrNull(values.cashRatio),
  }
}

/**
 * The form's starting values: lanes and bowlers per pair from the tournament's latest squad, and
 * blank when there is none (D-172). The list arrives sorted by date, so the last one is the latest.
 * The date, fee, and ratios always start blank.
 */
export function startingValues(squads: readonly Squad[] | undefined): SquadFormValues {
  const latest = squads?.at(-1)
  if (!latest) return emptySquadForm
  return {
    ...emptySquadForm,
    startingLane: String(latest.startingLane),
    numberOfLanes: String(latest.numberOfLanes),
    maxPerPair: String(latest.maxPerPair),
  }
}

/**
 * The edit form's starting values (D-185): the stored values as text. A fee or ratio the squad does
 * not override is blank, so the box shows the tournament's value as a hint and saving leaves it.
 */
export function toFormValues(squad: Squad): SquadFormValues {
  return {
    // The box takes `YYYY-MM-DDTHH:mm`; the API sends seconds too.
    date: squad.date.slice(0, 16),
    startingLane: String(squad.startingLane),
    numberOfLanes: String(squad.numberOfLanes),
    maxPerPair: String(squad.maxPerPair),
    entryFee: squad.entryFeeOverridden ? String(squad.entryFee) : '',
    finalsRatio: squad.finalsRatioOverridden ? String(squad.finalsRatio) : '',
    cashRatio: squad.cashRatioOverridden ? String(squad.cashRatio) : '',
  }
}

/** The boxes whose text differs from where the form started. */
export function changedFields(initial: SquadFormValues, values: SquadFormValues): SquadField[] {
  return squadFields.filter((name) => values[name].trim() !== initial[name].trim())
}

/**
 * Check only the boxes the director changed (D-184): a stored value that breaks a limit must not
 * block an edit of something else. The lane block ties the two lane boxes, so a change to either
 * checks it.
 */
export function validateSquadChanges(
  initial: SquadFormValues,
  values: SquadFormValues,
  dates?: TournamentDates,
): SquadFieldErrors {
  const changed = new Set(changedFields(initial, values))
  if (changed.has('startingLane')) changed.add('numberOfLanes')
  const errors: SquadFieldErrors = {}
  for (const [key, message] of Object.entries(validateSquad(values, dates))) {
    if (changed.has(key as SquadField)) errors[key as SquadField] = message
  }
  return errors
}

/** The request for values that passed `validateSquadChanges`: only the boxes that changed. */
export function toSquadChanges(initial: SquadFormValues, values: SquadFormValues): SquadChanges {
  const all = toNewSquad(values)
  const changes: SquadChanges = {}
  for (const name of changedFields(initial, values)) Object.assign(changes, { [name]: all[name] })
  return changes
}
