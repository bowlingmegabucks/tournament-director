import { z } from 'zod'
import { describeFailure, type FieldErrors } from '../tournaments/createRequest.ts'

export type { FieldErrors }

/** A new division, after the rules have run (DIV-02, DIV-04 to DIV-11). The number is not here: the server assigns it (D-139). */
export interface NewDivision {
  name: string
  gender: 'Male' | 'Female' | null
  minimumAge: number | null
  maximumAge: number | null
  minimumAverage: number | null
  maximumAverage: number | null
  /** A whole percent as typed: 90 means 90 percent. */
  handicapPercentage: number | null
  handicapBase: number | null
  maximumHandicapPerGame: number | null
}

// A blank box reaches the API as "", a missing key, or null. All three mean "not set".
const blankToNull = (value: unknown) => (value === undefined || value === '' ? null : value)

function limit(range: { min: number; max: number; message: string }) {
  return z.preprocess(
    blankToNull,
    z
      .number({ error: 'Enter a number' })
      .refine((value) => Number.isInteger(value), { error: 'Enter a whole number' })
      .refine((value) => value >= range.min && value <= range.max, { error: range.message })
      .nullable(),
  )
}

// A string, even an empty one, is text: the "required" message for it comes from `.min(1)`.
const missing = (value: unknown) => value === undefined || value === null

/** The rule for each field (D-141). Refused, never rounded (D-125). */
export const divisionFields = {
  name: z
    .string({ error: (issue) => (missing(issue.input) ? 'Name is required' : 'Enter text') })
    .trim()
    // Stryker disable next-line StringLiteral: an empty message falls back to the error function above, which says the same.
    .min(1, 'Name is required')
    .max(100, 'Name cannot be longer than 100 characters'),
  gender: z.preprocess(
    (value) => (value === undefined || value === '' ? null : value),
    z.enum(['Male', 'Female'], { error: 'Gender must be Male or Female, or blank' }).nullable(),
  ),
  minimumAge: limit({ min: 1, max: 120, message: 'Minimum age must be between 1 and 120' }),
  maximumAge: limit({ min: 1, max: 120, message: 'Maximum age must be between 1 and 120' }),
  minimumAverage: limit({ min: 1, max: 300, message: 'Minimum average must be between 1 and 300' }),
  maximumAverage: limit({ min: 1, max: 300, message: 'Maximum average must be between 1 and 300' }),
  handicapPercentage: z.preprocess(
    blankToNull,
    z
      .number({ error: 'Enter a number' })
      .refine((value) => Number.isInteger(value), { error: 'Enter a whole number' })
      .refine((value) => value >= 1, {
        error: 'Handicap percentage must be at least 1, or leave it blank',
      })
      .refine((value) => value <= 999, { error: 'Handicap percentage cannot be more than 999' })
      .nullable(),
  ),
  handicapBase: limit({ min: 0, max: 300, message: 'Handicap base must be between 0 and 300' }),
  maximumHandicapPerGame: limit({
    min: 1,
    max: 300,
    message: 'Maximum handicap per game must be between 1 and 300',
  }),
}

// Compare only two numbers: a field that failed its own rule may hold anything.
const above = (a: unknown, b: unknown) => typeof a === 'number' && typeof b === 'number' && a > b

type PairFields = Pick<
  NewDivision,
  | 'minimumAge'
  | 'maximumAge'
  | 'minimumAverage'
  | 'maximumAverage'
  | 'handicapPercentage'
  | 'handicapBase'
  | 'maximumHandicapPerGame'
>

/**
 * The rules that look at two fields at once (DIV-05, DIV-07, DIV-09, DIV-11), keyed by the field the
 * message belongs under. Create runs them on the body; edit runs them on the merged result (D-147).
 * A field that failed its own rule may hold anything, so only two numbers are compared.
 */
export function pairErrors(values: PairFields): FieldErrors {
  const errors: FieldErrors = {}
  if (above(values.minimumAge, values.maximumAge)) {
    errors.minimumAge = 'Minimum age must be less than or equal to maximum age' // DIV-05
  }
  if (above(values.minimumAverage, values.maximumAverage)) {
    errors.minimumAverage = 'Minimum average must be less than or equal to maximum average' // DIV-07
  }
  const hasPercent = values.handicapPercentage !== null
  const hasBase = values.handicapBase !== null
  if (hasPercent && !hasBase) {
    errors.handicapBase = 'Handicap base is required with a handicap percentage' // DIV-09
  }
  if (hasBase && !hasPercent) {
    errors.handicapPercentage = 'Handicap percentage is required with a handicap base' // DIV-09
  }
  if (values.maximumHandicapPerGame !== null && !(hasPercent && hasBase)) {
    errors.maximumHandicapPerGame =
      'Maximum handicap per game is allowed only with a handicap percentage and base' // DIV-11
  }
  return errors
}

/**
 * The create body (DIV-02, DIV-04 to DIV-11, D-141). Strict: a key we do not know is refused. A
 * sent `number` is allowed and dropped, since the server picks it (D-139). `confirmWarnings`
 * agrees to the warnings (D-142).
 */
const createDivisionSchema = z
  .strictObject({
    ...divisionFields,
    number: z.unknown().optional(),
    confirmWarnings: z.boolean({ error: 'Send true or false' }).optional(),
  })
  .superRefine((body, ctx) => {
    for (const [path, message] of Object.entries(pairErrors(body))) {
      ctx.addIssue({ code: 'custom', path: [path], message })
    }
  })

export type CreateDivisionResult =
  | { success: true; data: NewDivision; confirmWarnings: boolean }
  | { success: false; message: string; errors: FieldErrors }

/** Run the create rules (D-141). */
export function parseCreateDivision(body: unknown): CreateDivisionResult {
  const parsed = createDivisionSchema.safeParse(body)
  if (!parsed.success) return { success: false, ...describeFailure(parsed.error, 'division') }
  const sent = parsed.data
  // Named one by one, so a sent `number` never reaches storage (D-139).
  const data: NewDivision = {
    name: sent.name,
    gender: sent.gender,
    minimumAge: sent.minimumAge,
    maximumAge: sent.maximumAge,
    minimumAverage: sent.minimumAverage,
    maximumAverage: sent.maximumAverage,
    handicapPercentage: sent.handicapPercentage,
    handicapBase: sent.handicapBase,
    maximumHandicapPerGame: sent.maximumHandicapPerGame,
  }
  return { success: true, data, confirmWarnings: sent.confirmWarnings === true }
}
