import { z } from 'zod'
import { checkLaneBlock } from '../../shared/sessionCreate.ts'
import { describeFailure } from '../tournaments/createRequest.ts'
import { squadFields, type FieldErrors, type NewSquad } from './createRequest.ts'

/**
 * An edit after the field rules have run (SQD-23): only the fields that were sent. A fee or ratio
 * sent as `null` clears the override, so the tournament's value applies (D-183).
 */
export type UpdateSquad = Partial<NewSquad>

/**
 * The `PATCH` body (D-184). Each field sent gets the add rule and message (D-168 to D-170); a
 * field left out stays as stored. Strict: `complete`, `games`, and anything else unknown is
 * refused, so an edit cannot reopen a squad (SQD-18, D-181). The lane block needs the stored
 * value when only one lane field is sent, so the edit plan checks that case.
 */
const updateSquadSchema = z
  .strictObject({
    ...z.strictObject(squadFields).partial().shape,
    confirmWarnings: z.boolean({ error: 'Send confirmWarnings as true or false' }).optional(),
  })
  .superRefine(checkLaneBlock)

export type UpdateSquadResult =
  | { success: true; changes: UpdateSquad; confirmWarnings: boolean }
  | { success: false; message: string; errors: FieldErrors }

/** Run the field rules on an edit (SQD-02, SQD-04 to SQD-06, SQD-08). */
export function parseUpdateSquad(body: unknown): UpdateSquadResult {
  const parsed = updateSquadSchema.safeParse(body)
  if (!parsed.success) return { success: false, ...describeFailure(parsed.error, 'squad') }
  const { confirmWarnings, ...changes } = parsed.data
  // A key left out must stay left out, whatever the schema does with a missing key.
  const sent = Object.fromEntries(
    Object.entries(changes).filter(([, value]) => value !== undefined),
  ) as UpdateSquad
  return { success: true, changes: sent, confirmWarnings: confirmWarnings === true }
}
