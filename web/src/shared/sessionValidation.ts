/**
 * The checks a squad and a sweeper share in the browser (SQD-03 to SQD-06, SQD-10, D-168, D-169):
 * numbers as text, the date, and the lanes. The API runs the same rules with the same words and
 * stays the authority (D-167): change both together.
 */

/** The tournament's first and last day, `YYYY-MM-DD`, for `SQD-03`. */
export interface TournamentDates {
  startDate: string
  endDate: string
}

const NUMBER = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/

export type Parsed = { blank: true } | { error: string } | { value: number }

export function parse(text: string): Parsed {
  const trimmed = text.trim()
  if (trimmed === '') return { blank: true }
  if (!NUMBER.test(trimmed)) return { error: 'Enter a number' }
  return { value: Number(trimmed) }
}

// 6.25 * 10 is not exactly 62.5 in floating point, so allow a tiny error (the API does the same).
export function hasAtMostDecimals(value: number, places: number): boolean {
  const scaled = value * 10 ** places
  // Stryker disable next-line EqualityOperator: a difference of exactly 1e-6 cannot occur for two or fewer places.
  return Math.abs(scaled - Math.round(scaled)) < 1e-6
}

/** A required whole number: blank, a non-number, or a fraction each has its own message. */
export function whole(label: string, text: string): { error: string } | { value: number } {
  const parsed = parse(text)
  if ('blank' in parsed) return { error: `${label} is required` }
  if ('error' in parsed) return parsed
  if (!Number.isInteger(parsed.value)) return { error: 'Enter a whole number' }
  return parsed
}

export function lane(
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

export function startingLaneProblem(text: string): string | undefined {
  return lane(
    'Starting lane',
    text,
    { min: 1, max: 199 },
    { odd: true, message: 'Starting lane must be odd' },
  )
}

export function numberOfLanesProblem(text: string): string | undefined {
  return lane(
    'Number of lanes',
    text,
    { min: 2, max: 200 },
    { odd: false, message: 'Number of lanes must be even' },
  )
}

export function perPairProblem(text: string): string | undefined {
  const parsed = whole('Max per pair', text)
  if ('error' in parsed) return parsed.error
  return parsed.value >= 2 && parsed.value <= 5 ? undefined : 'Max per pair must be between 2 and 5'
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

/** SQD-03, SQD-10: `subject` is "Squad" or "Sweeper", as in the API's messages. */
export function dateProblem(
  text: string,
  dates: TournamentDates | undefined,
  subject: string,
): string | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return 'Date and time is required'
  const day = dayOf(trimmed)
  if (day === undefined) return 'Enter a date and time'
  if (dates && day < dates.startDate) return `${subject} date must be after tournament start`
  if (dates && day > dates.endDate) return `${subject} date must be before tournament end`
  return undefined
}
