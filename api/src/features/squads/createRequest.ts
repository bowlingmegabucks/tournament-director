import { z } from 'zod'
import { blankToNull, checkLaneBlock, sessionFields } from '../../shared/sessionCreate.ts'
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

/** The rule for each field (D-168 to D-170). Refused, never rounded (D-125). */
export const squadFields = {
  ...sessionFields,
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
const createSquadSchema = z.strictObject(squadFields).superRefine(checkLaneBlock)

export type CreateSquadResult =
  { success: true; data: NewSquad } | { success: false; message: string; errors: FieldErrors }

/** Run the create rules (SQD-02, SQD-04 to SQD-08, D-168 to D-170). */
export function parseCreateSquad(body: unknown): CreateSquadResult {
  const parsed = createSquadSchema.safeParse(body)
  if (!parsed.success) return { success: false, ...describeFailure(parsed.error, 'squad') }
  return { success: true, data: parsed.data }
}
