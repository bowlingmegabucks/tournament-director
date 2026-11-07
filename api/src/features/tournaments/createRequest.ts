import { z } from 'zod'

/** A new tournament, after the rules have run (TRN-01 to TRN-07, TRN-09). Text is trimmed. */
export interface NewTournament {
  name: string
  startDate: string
  endDate: string
  entryFee: number
  games: number
  finalsRatio: number
  cashRatio: number
  superSweeperCashRatio: number
  bowlingCenter: string
}

/** One message per field name (D-121). */
export type FieldErrors = Record<string, string>

// Wrong type or missing: the same words the form uses, so the two never disagree.
const missing = (value: unknown) => value === undefined || value === null || value === ''

function text(label: string) {
  return (
    z
      .string({ error: (issue) => (missing(issue.input) ? `${label} is required` : 'Enter text') })
      .trim()
      // Stryker disable next-line StringLiteral: an empty message falls back to the error function above, which says the same.
      .min(1, `${label} is required`)
      .max(100, `${label} cannot be longer than 100 characters`)
  )
}

function date(label: string) {
  return z.iso.date({
    error: (issue) => (missing(issue.input) ? `${label} is required` : 'Enter a valid date'),
  })
}

const isDate = (value: unknown) => z.iso.date().safeParse(value).success

function amount(label: string) {
  return z.number({
    error: (issue) => (missing(issue.input) ? `${label} is required` : 'Enter a number'),
  })
}

// 7.55 * 100 is not exactly 755 in floating point, so allow a tiny error.
export function hasAtMostDecimals(value: number, places: number): boolean {
  const scaled = value * 10 ** places
  // Stryker disable next-line EqualityOperator: a difference of exactly 1e-6 cannot occur for two or fewer places.
  return Math.abs(scaled - Math.round(scaled)) < 1e-6
}

function ratio(label: string, minimum: { value: number; message: string; inclusive: boolean }) {
  return amount(label)
    .refine((value) => (minimum.inclusive ? value >= minimum.value : value > minimum.value), {
      error: minimum.message,
    })
    .refine((value) => value <= 99.9, { error: `${label} cannot be more than 99.9` })
    .refine((value) => hasAtMostDecimals(value, 1), { error: 'Use at most one decimal place' })
}

/**
 * The rule for each field (TRN-01 to TRN-07, TRN-09, D-125). Create asks for all of them; edit
 * accepts any of them (TRN-24).
 */
export const tournamentFields = {
  name: text('Name'),
  startDate: date('Start date'),
  endDate: date('End date'),
  entryFee: amount('Entry fee')
    .refine((value) => value > 0, { error: 'Entry fee must be greater than $0' })
    .refine((value) => value <= 999.99, { error: 'Entry fee cannot be more than $999.99' })
    .refine((value) => hasAtMostDecimals(value, 2), { error: 'Use at most two decimal places' }),
  games: amount('Games')
    .refine((value) => value >= 1, { error: 'Must have at least one game' })
    .refine((value) => value <= 99, { error: 'Games cannot be more than 99' })
    .refine((value) => Number.isInteger(value), { error: 'Enter a whole number' }),
  finalsRatio: ratio('Finals ratio', {
    value: 1,
    inclusive: false,
    message: 'Finals ratio must be greater than 1',
  }),
  cashRatio: ratio('Cash ratio', {
    value: 1,
    inclusive: false,
    message: 'Cash ratio must be greater than 1',
  }),
  superSweeperCashRatio: ratio('Super sweeper cash ratio', {
    value: 1,
    inclusive: true,
    message: 'Super sweeper cash ratio must be at least 1',
  }),
  bowlingCenter: text('Bowling center'),
}

/**
 * The create body (TRN-01 to TRN-07, TRN-09, D-125). Strict: a key we do not know, such as
 * `completed`, is refused (D-119). Dates may be in the past (D-124).
 */
export const createTournamentSchema = z
  .strictObject(tournamentFields)
  // ISO dates compare as text. The check also runs when a date failed its own rule, so skip those.
  .refine(
    (body) => !isDate(body.startDate) || !isDate(body.endDate) || body.endDate >= body.startDate,
    {
      path: ['endDate'],
      error: 'End date must be on or after start date',
    },
  )

export type CreateTournamentResult =
  { success: true; data: NewTournament } | { success: false; message: string; errors: FieldErrors }

/**
 * Turn a failed parse into one message per field and a summary line for clients that show only one
 * (D-121). The first problem a field has wins. Create and edit share it, so the two never word a
 * problem differently.
 */
export function describeFailure(
  error: z.ZodError,
  subject = 'tournament',
): { message: string; errors: FieldErrors } {
  const errors: FieldErrors = {}
  let general: string | undefined
  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) errors[key] ??= 'This field is not accepted'
      continue
    }
    const key = issue.path[0]
    if (typeof key === 'string') errors[key] ??= issue.message
    else general ??= `Send the ${subject} as a JSON object.`
  }
  const first = Object.values(errors)[0]
  const summary = 'Check the highlighted fields.'
  return { message: general ?? (first ? `${summary} ${first}` : summary), errors }
}

/** Run the create rules (D-121). */
export function parseCreateTournament(body: unknown): CreateTournamentResult {
  const parsed = createTournamentSchema.safeParse(body)
  if (parsed.success) return { success: true, data: parsed.data }
  return { success: false, ...describeFailure(parsed.error) }
}
