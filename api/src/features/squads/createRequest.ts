import { z } from 'zod'
import {
  describeFailure,
  hasAtMostDecimals,
  type FieldErrors,
} from '../tournaments/createRequest.ts'

export type { FieldErrors }

/**
 * A new squad, after the rules have run (SQD-02, SQD-04 to SQD-06, SQD-08). `date` is the center's
 * local time as `YYYY-MM-DDTHH:mm:00`. A fee or ratio that is `null` falls back on the
 * tournament's value (TRN-12, D-170). The squad is never complete (SQD-07, D-171).
 */
export interface NewSquad {
  date: string
  startingLane: number
  numberOfLanes: number
  maxPerPair: number
  entryFee: number | null
  finalsRatio: number | null
  cashRatio: number | null
}

// A blank box reaches the API as "", a missing key, or null. All three mean "not set".
const blankToNull = (value: unknown) => (value === undefined || value === '' ? null : value)

// Wrong type or missing: the same words the form uses, so the two never disagree.
const missing = (value: unknown) => value === undefined || value === null || value === ''

function whole(label: string) {
  return z
    .number({
      error: (issue) => (missing(issue.input) ? `${label} is required` : 'Enter a number'),
    })
    .refine((value) => Number.isInteger(value), { error: 'Enter a whole number' })
}

function ratio(label: string) {
  return z.preprocess(
    blankToNull,
    z
      .number({ error: 'Enter a number' })
      .refine((value) => value > 1, { error: `${label} must be greater than 1` })
      .refine((value) => value <= 99.9, { error: `${label} cannot be more than 99.9` })
      .refine((value) => hasAtMostDecimals(value, 1), { error: 'Use at most one decimal place' })
      .nullable(),
  )
}

const dateTimeShape = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::00(?:\.0+)?)?$/

/** `YYYY-MM-DDTHH:mm`, with seconds only as `00`, and a real calendar day and time. */
function toLocalDateTime(value: string): string | undefined {
  if (!dateTimeShape.test(value)) return undefined
  const minute = value.slice(0, 16)
  const parsed = new Date(`${minute}:00Z`)
  // 2026-02-30 rolls over to March in `Date`; the round trip catches that.
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 16) !== minute) {
    return undefined
  }
  return `${minute}:00`
}

/** The rule for each field (D-168 to D-170). Refused, never rounded (D-125). */
const squadFields = {
  date: z
    .string({
      error: (issue) =>
        missing(issue.input) ? 'Date and time is required' : 'Enter a date and time',
    })
    // Stryker disable next-line StringLiteral: an empty message falls back to the error function above, which says the same.
    .min(1, 'Date and time is required')
    .transform((value, ctx) => {
      const normal = toLocalDateTime(value)
      if (normal === undefined) {
        ctx.addIssue({ code: 'custom', message: 'Enter a date and time' })
        return z.NEVER
      }
      return normal
    }),
  startingLane: whole('Starting lane')
    .refine((value) => value >= 1 && value <= 199, {
      error: 'Starting lane must be between 1 and 199',
    })
    .refine((value) => value % 2 === 1, { error: 'Starting lane must be odd' }),
  numberOfLanes: whole('Number of lanes')
    .refine((value) => value >= 2 && value <= 200, {
      error: 'Number of lanes must be between 2 and 200',
    })
    .refine((value) => value % 2 === 0, { error: 'Number of lanes must be even' }),
  maxPerPair: whole('Max per pair').refine((value) => value >= 2 && value <= 5, {
    error: 'Max per pair must be between 2 and 5',
  }),
  entryFee: z.preprocess(
    blankToNull,
    z
      .number({ error: 'Enter a number' })
      .refine((value) => value >= 0 && value <= 999.99, {
        error: 'Entry fee must be between $0 and $999.99',
      })
      .refine((value) => hasAtMostDecimals(value, 2), { error: 'Use at most two decimal places' })
      .nullable(),
  ),
  finalsRatio: ratio('Finals ratio'),
  cashRatio: ratio('Cash ratio'),
}

/**
 * The create body. Strict: a key we do not know is refused, `complete` included, since a new
 * squad is always open (SQD-07, D-171).
 */
const createSquadSchema = z.strictObject(squadFields)

export type CreateSquadResult =
  { success: true; data: NewSquad } | { success: false; message: string; errors: FieldErrors }

/** Run the create rules (SQD-02, SQD-04 to SQD-08, D-168 to D-170). */
export function parseCreateSquad(body: unknown): CreateSquadResult {
  const parsed = createSquadSchema.safeParse(body)
  if (!parsed.success) return { success: false, ...describeFailure(parsed.error, 'squad') }
  return { success: true, data: parsed.data }
}
