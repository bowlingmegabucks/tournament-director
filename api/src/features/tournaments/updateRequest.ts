import { z } from 'zod'
import {
  describeFailure,
  tournamentFields,
  type FieldErrors,
  type NewTournament,
} from './createRequest.ts'

/**
 * An edit after the field rules have run (TRN-24, D-127): only the fields that were sent, plus
 * whether the director has seen the warnings (D-129). Text is trimmed.
 */
export type UpdateTournament = Partial<NewTournament> & { confirmWarnings?: boolean }

/**
 * The `PATCH` body. Each field sent gets the create rule and message (D-125); a field not sent is
 * not checked, so a stored super sweeper ratio of 0 stays until someone changes it (D-17). Strict,
 * like create: `completed` and anything else unknown is refused. The order of the dates needs the
 * stored values, so the edit plan checks it, not this schema.
 */
export const updateTournamentSchema = z.strictObject({
  ...z.strictObject(tournamentFields).partial().shape,
  confirmWarnings: z.boolean({ error: 'Send confirmWarnings as true or false' }).optional(),
})

export type UpdateTournamentResult =
  | { success: true; data: UpdateTournament }
  | { success: false; message: string; errors: FieldErrors }

/** Run the field rules on an edit (TRN-24). */
export function parseUpdateTournament(body: unknown): UpdateTournamentResult {
  const parsed = updateTournamentSchema.safeParse(body)
  if (parsed.success) return { success: true, data: parsed.data }
  return { success: false, ...describeFailure(parsed.error) }
}
