import { z } from 'zod'
import { checkLaneBlock } from '../../shared/sessionCreate.ts'
import {
  describeSweeperFailure,
  sweeperFields,
  type FieldErrors,
  type NewSweeper,
} from './createRequest.ts'

/**
 * An edit after the field rules have run (SQD-23, SQD-29): only the fields that were sent.
 * `bonusPins` holds only the divisions to change: a whole number for each, 0 for a blank box,
 * which deletes that row (D-184).
 */
export type UpdateSweeper = Partial<NewSweeper>

/**
 * The `PATCH` body (D-184). Each field sent gets the add rule and message (D-168, D-175, D-176);
 * a field left out stays as stored. Strict: `complete`, `finalsRatio`, and anything else unknown
 * is refused, so an edit cannot reopen a sweeper (SQD-18, D-181). The lane block needs the
 * stored value when only one lane field is sent, so the edit plan checks that case.
 */
const updateSweeperSchema = z
  .strictObject({
    ...z.strictObject(sweeperFields).partial().shape,
    confirmWarnings: z.boolean({ error: 'Send confirmWarnings as true or false' }).optional(),
  })
  .superRefine(checkLaneBlock)

export type UpdateSweeperResult =
  | { success: true; changes: UpdateSweeper; confirmWarnings: boolean }
  | { success: false; message: string; errors: FieldErrors }

/** Run the field rules on an edit (SQD-10 to SQD-13). */
export function parseUpdateSweeper(body: unknown): UpdateSweeperResult {
  const parsed = updateSweeperSchema.safeParse(body)
  if (!parsed.success) return { success: false, ...describeSweeperFailure(parsed.error) }
  const { confirmWarnings, ...changes } = parsed.data
  // A key left out must stay left out, whatever the schema does with a missing key.
  const sent = Object.fromEntries(
    Object.entries(changes).filter(([, value]) => value !== undefined),
  ) as UpdateSweeper
  return { success: true, changes: sent, confirmWarnings: confirmWarnings === true }
}
