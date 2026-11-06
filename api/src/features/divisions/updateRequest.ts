import { z } from 'zod'
import { describeFailure } from '../tournaments/createRequest.ts'
import { divisionFields, type FieldErrors, type NewDivision } from './createRequest.ts'

/** An edit after the field rules have run (DIV-12): only the fields that were sent. */
export type UpdateDivision = Partial<NewDivision>

/**
 * The `PATCH` body (D-147). Each field sent gets the add rule and message (D-141); a field left out
 * stays as stored. A field sent as `""` or `null` clears the value, except the name. Strict: `number`
 * and anything else unknown is refused (D-146). The rules that compare two fields need the stored
 * values, so the edit plan runs them, not this schema.
 */
const updateDivisionSchema = z.strictObject({
  ...z.strictObject(divisionFields).partial().shape,
  confirmWarnings: z.boolean({ error: 'Send confirmWarnings as true or false' }).optional(),
})

export type UpdateDivisionResult =
  | { success: true; changes: UpdateDivision; confirmWarnings: boolean }
  | { success: false; message: string; errors: FieldErrors }

/** Run the field rules on an edit (DIV-02, DIV-04 to DIV-11). */
export function parseUpdateDivision(body: unknown): UpdateDivisionResult {
  const parsed = updateDivisionSchema.safeParse(body)
  if (!parsed.success) return { success: false, ...describeFailure(parsed.error, 'division') }
  const { confirmWarnings, ...changes } = parsed.data
  // A key left out must stay left out, whatever the schema does with a missing key.
  const sent = Object.fromEntries(
    Object.entries(changes).filter(([, value]) => value !== undefined),
  ) as UpdateDivision
  return { success: true, changes: sent, confirmWarnings: confirmWarnings === true }
}
