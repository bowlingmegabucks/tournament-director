import { z } from 'zod'
import { missing, blankToNull, sessionFields, whole } from '../../shared/sessionCreate.ts'
import { hasAtMostDecimals, type FieldErrors } from '../tournaments/createRequest.ts'

export type { FieldErrors }

/**
 * A new sweeper, after the rules have run (SQD-10 to SQD-13). `date` is the center's local time as
 * `YYYY-MM-DDTHH:mm:00`. `bonusPins` holds a whole number for every division the request names,
 * 0 for a blank box; storage saves only the nonzero ones (D-176). The sweeper is never complete.
 */
export interface NewSweeper {
  date: string
  startingLane: number
  numberOfLanes: number
  maxPerPair: number
  entryFee: number
  games: number
  cashRatio: number
  bonusPins: Record<string, number>
}

const required = (label: string) =>
  z.number({
    error: (issue) => (missing(issue.input) ? `${label} is required` : 'Enter a number'),
  })

/** The rule for each field (D-168, D-175, D-176). Refused, never rounded (D-125). */
const sweeperFields = {
  ...sessionFields,
  entryFee: required('Entry fee')
    .refine((value) => value > 0, { error: 'Entry fee must be greater than $0' })
    .refine((value) => value <= 999.99, { error: 'Entry fee cannot be more than $999.99' })
    .refine((value) => hasAtMostDecimals(value, 2), { error: 'Use at most two decimal places' }),
  games: whole('Games').refine((value) => value >= 1 && value <= 99, {
    error: 'Games must be between 1 and 99',
  }),
  cashRatio: required('Cash ratio')
    .refine((value) => value > 1, { error: 'Cash ratio must be greater than 1' })
    .refine((value) => value <= 99.9, { error: 'Cash ratio cannot be more than 99.9' })
    .refine((value) => hasAtMostDecimals(value, 1), { error: 'Use at most one decimal place' }),
  bonusPins: z.preprocess(
    (value) => (value === undefined || value === null ? {} : value),
    z
      .record(
        z.string(),
        z.preprocess(
          blankToNull,
          z
            .number({ error: 'Enter a number' })
            .refine((value) => Number.isInteger(value), { error: 'Enter a whole number' })
            .refine((value) => value >= 0 && value <= 99, {
              error: 'Bonus pins must be between 0 and 99',
            })
            .nullable()
            .transform((value) => value ?? 0),
        ),
        { error: 'Send bonus pins as an object of division ids' },
      )
      .refine((pins) => Object.keys(pins).every((key) => z.uuid().safeParse(key).success), {
        error: 'Bonus pins must be keyed by division id',
      }),
  ),
}

/** Strict: a key we do not know is refused, `complete` included (SQD-07, D-171). */
const createSweeperSchema = z.strictObject(sweeperFields)

export type CreateSweeperResult =
  { success: true; data: NewSweeper } | { success: false; message: string; errors: FieldErrors }

/** One message per field; a pin problem is keyed `bonusPins.<divisionId>` (D-176). */
function describe(error: z.ZodError): { message: string; errors: FieldErrors } {
  const errors: FieldErrors = {}
  let general: string | undefined
  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) errors[key] ??= 'This field is not accepted'
      continue
    }
    const [key, division] = issue.path
    if (typeof key !== 'string') {
      general ??= 'Send the sweeper as a JSON object.'
    } else if (key === 'bonusPins' && typeof division === 'string') {
      errors[`bonusPins.${division}`] ??= issue.message
    } else {
      errors[key] ??= issue.message
    }
  }
  const first = Object.values(errors)[0]
  return {
    message:
      general ??
      (first ? `Check the highlighted fields. ${first}` : 'Check the highlighted fields.'),
    errors,
  }
}

/** Run the create rules (SQD-10 to SQD-13, D-168, D-175, D-176). */
export function parseCreateSweeper(body: unknown): CreateSweeperResult {
  const parsed = createSweeperSchema.safeParse(body)
  if (!parsed.success) return { success: false, ...describe(parsed.error) }
  return { success: true, data: parsed.data }
}
