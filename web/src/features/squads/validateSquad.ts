import {
  dateProblem,
  hasAtMostDecimals,
  numberOfLanesProblem,
  parse,
  perPairProblem,
  startingLaneProblem,
  type TournamentDates,
} from '../../shared/sessionValidation'
import type { NewSquad, Squad, SquadFieldErrors, SquadFormValues } from './types'

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
    numberOfLanes: numberOfLanesProblem(values.numberOfLanes),
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
