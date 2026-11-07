import {
  dateProblem,
  hasAtMostDecimals,
  numberOfLanesProblem,
  parse,
  perPairProblem,
  startingLaneProblem,
  whole,
  type TournamentDates,
} from '../../shared/sessionValidation'
import {
  pinKey,
  type NewSweeper,
  type Sweeper,
  type SweeperFieldErrors,
  type SweeperFormValues,
} from './types'

/**
 * The create rules (SQD-10 to SQD-13, D-168, D-175, D-176), run in the browser for quick feedback.
 * The API runs the same rules with the same messages and stays the authority (D-174): change both
 * together.
 */

export const emptySweeperForm: SweeperFormValues = {
  date: '',
  startingLane: '',
  numberOfLanes: '',
  maxPerPair: '',
  entryFee: '',
  games: '',
  cashRatio: '',
  bonusPins: {},
}

function fee(text: string): string | undefined {
  const parsed = parse(text)
  if ('blank' in parsed) return 'Entry fee is required'
  if ('error' in parsed) return parsed.error
  if (parsed.value <= 0) return 'Entry fee must be greater than $0'
  if (parsed.value > 999.99) return 'Entry fee cannot be more than $999.99'
  return hasAtMostDecimals(parsed.value, 2) ? undefined : 'Use at most two decimal places'
}

function games(text: string): string | undefined {
  const parsed = whole('Games', text)
  if ('error' in parsed) return parsed.error
  return parsed.value >= 1 && parsed.value <= 99 ? undefined : 'Games must be between 1 and 99'
}

function cashRatio(text: string): string | undefined {
  const parsed = parse(text)
  if ('blank' in parsed) return 'Cash ratio is required'
  if ('error' in parsed) return parsed.error
  if (parsed.value <= 1) return 'Cash ratio must be greater than 1'
  if (parsed.value > 99.9) return 'Cash ratio cannot be more than 99.9'
  return hasAtMostDecimals(parsed.value, 1) ? undefined : 'Use at most one decimal place'
}

/** Blank is fine: no row, so 0 (D-176). */
function pins(text: string): string | undefined {
  const parsed = parse(text)
  if ('blank' in parsed) return undefined
  if ('error' in parsed) return parsed.error
  if (!Number.isInteger(parsed.value)) return 'Enter a whole number'
  return parsed.value >= 0 && parsed.value <= 99 ? undefined : 'Bonus pins must be between 0 and 99'
}

/** Check every field and the box of each division shown. An empty result means the form may be sent. */
export function validateSweeper(
  values: SweeperFormValues,
  dates: TournamentDates | undefined,
  divisionIds: readonly string[],
): SweeperFieldErrors {
  const problems: [string, string | undefined][] = [
    ['date', dateProblem(values.date, dates, 'Sweeper')],
    ['startingLane', startingLaneProblem(values.startingLane)],
    ['numberOfLanes', numberOfLanesProblem(values.numberOfLanes)],
    ['maxPerPair', perPairProblem(values.maxPerPair)],
    ['entryFee', fee(values.entryFee)],
    ['games', games(values.games)],
    ['cashRatio', cashRatio(values.cashRatio)],
    ...divisionIds.map((id): [string, string | undefined] => [
      pinKey(id),
      pins(values.bonusPins[id] ?? ''),
    ]),
  ]
  const errors: SweeperFieldErrors = {}
  for (const [key, message] of problems) {
    if (message !== undefined) errors[key] = message
  }
  return errors
}

/** The request for values that passed `validateSweeper`: one entry for each division shown. */
export function toNewSweeper(
  values: SweeperFormValues,
  divisionIds: readonly string[],
): NewSweeper {
  return {
    date: values.date.trim(),
    startingLane: Number(values.startingLane),
    numberOfLanes: Number(values.numberOfLanes),
    maxPerPair: Number(values.maxPerPair),
    entryFee: Number(values.entryFee),
    games: Number(values.games),
    cashRatio: Number(values.cashRatio),
    bonusPins: Object.fromEntries(
      divisionIds.map((id) => {
        const text = (values.bonusPins[id] ?? '').trim()
        return [id, text === '' ? null : Number(text)]
      }),
    ),
  }
}

/**
 * The form's starting values: lanes and bowlers per pair from the tournament's latest sweeper, and
 * blank when there is none (D-178). The list arrives sorted by date, so the last one is the latest.
 * The date, fee, games, cash ratio, and pins always start blank.
 */
export function startingValues(sweepers: readonly Sweeper[] | undefined): SweeperFormValues {
  const latest = sweepers?.at(-1)
  if (!latest) return emptySweeperForm
  return {
    ...emptySweeperForm,
    startingLane: String(latest.startingLane),
    numberOfLanes: String(latest.numberOfLanes),
    maxPerPair: String(latest.maxPerPair),
  }
}
