import {
  dateProblem,
  hasAtMostDecimals,
  laneBlockProblem,
  numberOfLanesProblem,
  parse,
  perPairProblem,
  startingLaneProblem,
  whole,
  type TournamentDates,
} from '../../shared/sessionValidation'
import {
  pinKey,
  sweeperScalarFields,
  type NewSweeper,
  type Sweeper,
  type SweeperChanges,
  type SweeperFieldErrors,
  type SweeperFormValues,
  type SweeperScalarField,
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
    [
      'numberOfLanes',
      numberOfLanesProblem(values.numberOfLanes) ??
        laneBlockProblem(values.startingLane, values.numberOfLanes),
    ],
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

/**
 * The edit form's starting values (D-185): the stored values as text. A division with no pins
 * starts blank, which means 0.
 */
export function toFormValues(sweeper: Sweeper): SweeperFormValues {
  return {
    // The box takes `YYYY-MM-DDTHH:mm`; the API sends seconds too.
    date: sweeper.date.slice(0, 16),
    startingLane: String(sweeper.startingLane),
    numberOfLanes: String(sweeper.numberOfLanes),
    maxPerPair: String(sweeper.maxPerPair),
    entryFee: String(sweeper.entryFee),
    games: String(sweeper.games),
    cashRatio: String(sweeper.cashRatio),
    bonusPins: Object.fromEntries(
      sweeper.bonusPins.map((pins) => [pins.divisionId, String(pins.bonusPinsPerGame)]),
    ),
  }
}

/**
 * A blank pin box and a 0 mean the same: no bonus (D-176). `Number` reads blank or spaces as 0 and
 * ignores spaces around a number; text that is not a number gives NaN, which matches nothing.
 */
const pinValue = (text: string | undefined) => Number(text ?? '')

/** The scalar boxes whose text differs from where the form started. */
export function changedScalars(
  initial: SweeperFormValues,
  values: SweeperFormValues,
): SweeperScalarField[] {
  return sweeperScalarFields.filter((name) => values[name].trim() !== initial[name].trim())
}

/** The divisions whose pin box means something different from where the form started. */
export function changedPins(
  initial: SweeperFormValues,
  values: SweeperFormValues,
  divisionIds: readonly string[],
): string[] {
  return divisionIds.filter(
    (id) => !Object.is(pinValue(values.bonusPins[id]), pinValue(initial.bonusPins[id])),
  )
}

/**
 * Check only the boxes the director changed (D-184): a stored value that breaks a limit must not
 * block an edit of something else. The lane block ties the two lane boxes, so a change to the
 * starting lane checks it too.
 */
export function validateSweeperChanges(
  initial: SweeperFormValues,
  values: SweeperFormValues,
  dates: TournamentDates | undefined,
  divisionIds: readonly string[],
): SweeperFieldErrors {
  const changed = new Set<string>(changedScalars(initial, values))
  if (changed.has('startingLane')) changed.add('numberOfLanes')
  for (const id of changedPins(initial, values, divisionIds)) changed.add(pinKey(id))
  const errors: SweeperFieldErrors = {}
  for (const [key, message] of Object.entries(validateSweeper(values, dates, divisionIds))) {
    if (changed.has(key)) errors[key] = message
  }
  return errors
}

/** The request for values that passed `validateSweeperChanges`: only the boxes that changed. */
export function toSweeperChanges(
  initial: SweeperFormValues,
  values: SweeperFormValues,
  divisionIds: readonly string[],
): SweeperChanges {
  const all = toNewSweeper(values, divisionIds)
  const changes: SweeperChanges = {}
  for (const name of changedScalars(initial, values)) Object.assign(changes, { [name]: all[name] })
  const pins = changedPins(initial, values, divisionIds)
  if (pins.length > 0) {
    changes.bonusPins = Object.fromEntries(pins.map((id) => [id, all.bonusPins[id] ?? null]))
  }
  return changes
}
