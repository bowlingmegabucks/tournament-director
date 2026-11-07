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

/** The tournament's first and last day, `YYYY-MM-DD`, for `SQD-03`. */
export interface TournamentDates {
  startDate: string
  endDate: string
}

export const beforeStartMessage = 'Squad date must be after tournament start'
export const afterEndMessage = 'Squad date must be before tournament end'

const NUMBER = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/

type Parsed = { blank: true } | { error: string } | { value: number }

function parse(text: string): Parsed {
  const trimmed = text.trim()
  if (trimmed === '') return { blank: true }
  if (!NUMBER.test(trimmed)) return { error: 'Enter a number' }
  return { value: Number(trimmed) }
}

// 6.25 * 10 is not exactly 62.5 in floating point, so allow a tiny error (the API does the same).
function hasAtMostDecimals(value: number, places: number): boolean {
  const scaled = value * 10 ** places
  // Stryker disable next-line EqualityOperator: a difference of exactly 1e-6 cannot occur for two or fewer places.
  return Math.abs(scaled - Math.round(scaled)) < 1e-6
}

/** A required whole number: blank, a non-number, or a fraction each has its own message. */
function whole(label: string, text: string): { error: string } | { value: number } {
  const parsed = parse(text)
  if ('blank' in parsed) return { error: `${label} is required` }
  if ('error' in parsed) return parsed
  if (!Number.isInteger(parsed.value)) return { error: 'Enter a whole number' }
  return parsed
}

function lane(
  label: string,
  text: string,
  range: { min: number; max: number },
  parity: { odd: boolean; message: string },
): string | undefined {
  const parsed = whole(label, text)
  if ('error' in parsed) return parsed.error
  if (parsed.value < range.min || parsed.value > range.max) {
    return `${label} must be between ${range.min} and ${range.max}`
  }
  return parsed.value % 2 === (parity.odd ? 1 : 0) ? undefined : parity.message
}

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

// Stryker disable next-line Regex: without an anchor the text before or after still fails the round trip in `dayOf` (`new Date` rejects it).
const DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/

/** `YYYY-MM-DDTHH:mm` of a real day and time, or `undefined`. */
function dayOf(text: string): string | undefined {
  const match = DATE_TIME.exec(text)
  if (!match) return undefined
  const parsed = new Date(`${text}:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 16) !== text) return undefined
  return match[1]
}

function dateProblem(text: string, dates: TournamentDates | undefined): string | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return 'Date and time is required'
  const day = dayOf(trimmed)
  if (day === undefined) return 'Enter a date and time'
  if (dates && day < dates.startDate) return beforeStartMessage
  if (dates && day > dates.endDate) return afterEndMessage
  return undefined
}

/** Check every field. An empty result means the form may be sent. */
export function validateSquad(values: SquadFormValues, dates?: TournamentDates): SquadFieldErrors {
  const problems: SquadFieldErrors = {
    date: dateProblem(values.date, dates),
    startingLane: lane(
      'Starting lane',
      values.startingLane,
      { min: 1, max: 199 },
      { odd: true, message: 'Starting lane must be odd' },
    ),
    numberOfLanes: lane(
      'Number of lanes',
      values.numberOfLanes,
      { min: 2, max: 200 },
      { odd: false, message: 'Number of lanes must be even' },
    ),
    maxPerPair: perPair(values.maxPerPair),
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

function perPair(text: string): string | undefined {
  const parsed = whole('Max per pair', text)
  if ('error' in parsed) return parsed.error
  return parsed.value >= 2 && parsed.value <= 5 ? undefined : 'Max per pair must be between 2 and 5'
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
