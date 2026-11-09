import { z } from 'zod'
import { normalizePhone, normalizeZip, type BowlerPatch } from './bowler.ts'
import type { FieldErrors } from './deskRequest.ts'

// REG-16 wording for the average. A key left out means "unchanged"; null or a blank box clears it.
const average = z.preprocess(
  (value) => (value === '' ? null : value),
  z
    .number({ error: 'Enter a number' })
    .refine((value) => Number.isInteger(value), { error: 'Enter a whole number' })
    .refine((value) => value > 0, { error: 'Average must be greater than 0.' })
    .refine((value) => value <= 300, { error: 'Average must be less than or equal to 300.' })
    .nullable()
    .optional(),
)

// The database column is Char(2); see `deskRequest.ts`.
const state = z.string().trim().max(2, { error: 'State must be Postal Abbreviation' }).optional()

// A key left out is unchanged. A key sent as '' clears the field (D-206).
const editBowlerSchema = z.object({
  firstName: z.string().optional(),
  middleInitial: z.string().optional(),
  lastName: z.string().optional(),
  suffix: z.string().optional(),
  street: z.string().optional(),
  city: z.string().optional(),
  state,
  zipCode: z.string().optional(),
  email: z.string().optional(),
  phoneNumber: z.string().optional(),
  usbcId: z.string().optional(),
  dateOfBirth: z.union([z.iso.date(), z.literal('')]).optional(),
  gender: z.enum(['Male', 'Female', '']).optional(),
})

const ids = z.array(z.uuid()).default([])

const disjoint = (added: string[], removed: string[]) => !added.some((id) => removed.includes(id))

/**
 * `PATCH /v1/tournaments/{id}/registrations/{registrationId}` (D-197). Web only, never the vendor
 * shape (D-09). Every part is optional. The squad and sweeper lists are changes, not full lists
 * (D-199).
 */
export const editRequestSchema = z
  .object({
    divisionId: z.uuid({ error: 'Pick a division' }).optional(),
    average,
    superSweeper: z.boolean().optional(),
    addSquadIds: ids,
    removeSquadIds: ids,
    addSweeperIds: ids,
    removeSweeperIds: ids,
    bowler: editBowlerSchema.default({}),
    /** The desk confirmed the warnings of an earlier answer (D-201). */
    confirmWarnings: z.boolean().default(false),
  })
  .refine(
    (request) =>
      disjoint(request.addSquadIds, request.removeSquadIds) &&
      disjoint(request.addSweeperIds, request.removeSweeperIds),
    { error: 'A squad or sweeper cannot be added and removed in one change.' },
  )

export type EditRequest = z.infer<typeof editRequestSchema>
export type EditBowler = z.infer<typeof editBowlerSchema>

export type ParsedEditRequest =
  { success: true; data: EditRequest } | { success: false; message: string; errors: FieldErrors }

/** The first message per field, keyed by its path (`bowler.state`); a whole-form issue is `form`. */
export function parseEditRequest(body: unknown): ParsedEditRequest {
  const result = editRequestSchema.safeParse(body)
  if (result.success) return { success: true, data: result.data }
  const errors: FieldErrors = {}
  for (const issue of result.error.issues) {
    errors[issue.path.join('.') || 'form'] ??= issue.message
  }
  // Stryker disable next-line StringLiteral: a failed parse always has an issue, so the fallback never shows.
  return { success: false, message: Object.values(errors)[0] ?? 'Invalid request', errors }
}

/**
 * The fields the desk changed, as a patch (D-206). Unlike a returning bowler on the add page (D-05),
 * a field sent as '' is cleared. The rules then refuse an empty name, or an empty USBC ID where the
 * division needs one.
 */
export function toEditBowlerPatch(bowler: EditBowler): BowlerPatch {
  const patch: BowlerPatch = {}
  const text = (
    field:
      | 'firstName'
      | 'middleInitial'
      | 'lastName'
      | 'suffix'
      | 'street'
      | 'city'
      | 'state'
      | 'email'
      | 'usbcId',
  ) => {
    const value = bowler[field]
    if (value !== undefined) patch[field] = value.trim()
  }
  text('firstName')
  text('middleInitial')
  text('lastName')
  text('suffix')
  text('street')
  text('city')
  text('state')
  text('email')
  text('usbcId')
  if (bowler.zipCode !== undefined) patch.zipCode = normalizeZip(bowler.zipCode)
  if (bowler.phoneNumber !== undefined) patch.phoneNumber = normalizePhone(bowler.phoneNumber)
  if (bowler.dateOfBirth !== undefined) patch.dateOfBirth = bowler.dateOfBirth || null
  if (bowler.gender !== undefined) patch.gender = bowler.gender || null
  return patch
}
