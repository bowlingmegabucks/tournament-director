import { z } from 'zod'
import type { BowlerInput } from './request.ts'
import { toBowlerPatch, type BowlerPatch } from './bowler.ts'

// A blank box reaches the API as "", a missing key, or null. All three mean "nothing sent" (D-05).
const text = z.string().nullish()

// REG-16 wording for the average, since the desk types it.
const average = z.preprocess(
  (value) => (value === undefined || value === '' ? null : value),
  z
    .number({ error: 'Enter a number' })
    .refine((value) => Number.isInteger(value), { error: 'Enter a whole number' })
    .refine((value) => value > 0, { error: 'Average must be greater than 0.' })
    .refine((value) => value <= 300, { error: 'Average must be less than or equal to 300.' })
    .nullable(),
)

const deskBowlerSchema = z.object({
  firstName: text,
  middleInitial: text,
  lastName: text,
  suffix: text,
  street: text,
  city: text,
  state: text,
  zipCode: text,
  email: text,
  phoneNumber: text,
  usbcId: text,
  dateOfBirth: z.union([z.iso.date(), z.literal('')]).nullish(),
  gender: z.enum(['Male', 'Female', '']).nullish(),
})

/** `POST /v1/tournaments/{id}/registrations` (D-157). Web only, never the vendor shape (D-09). */
export const deskRequestSchema = z.object({
  divisionId: z.uuid({ error: 'Pick a division' }),
  average,
  squadIds: z.array(z.uuid()).default([]),
  sweeperIds: z.array(z.uuid()).default([]),
  superSweeper: z.boolean().default(false),
  /** A stored bowler; `bowler` is then a patch. Absent means a new bowler (D-157, D-162). */
  bowlerId: z.uuid().optional(),
  bowler: deskBowlerSchema.default({}),
  /** The desk already confirmed adding to an existing registration (D-159, D-165). */
  appendToExisting: z.boolean().default(false),
})

export type DeskRequest = z.infer<typeof deskRequestSchema>
export type DeskBowler = z.infer<typeof deskBowlerSchema>

export type FieldErrors = Record<string, string>

export type ParsedDeskRequest =
  { success: true; data: DeskRequest } | { success: false; message: string; errors: FieldErrors }

/** The first message per field, keyed by its path (`bowler.dateOfBirth`). */
export function parseDeskRequest(body: unknown): ParsedDeskRequest {
  const result = deskRequestSchema.safeParse(body)
  if (result.success) return { success: true, data: result.data }
  const errors: FieldErrors = {}
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || 'form'
    errors[key] ??= issue.message
  }
  // Stryker disable next-line StringLiteral: a failed parse always has an issue, so the fallback never shows.
  return { success: false, message: Object.values(errors)[0] ?? 'Invalid request', errors }
}

/** The desk sends a word; `toBowlerPatch` reads "F" as Female and any other value sent as Male (D-113). */
const vendorGender: Record<string, string | undefined> = { Female: 'F', Male: 'M', '': undefined }

/**
 * The desk's flat bowler fields as the vendor shape, so `toBowlerPatch` applies the same
 * "only fields sent with a value change" rule (D-05) and the same formatting (BWL-07a).
 */
export function toDeskBowlerPatch(bowler: DeskBowler): BowlerPatch {
  const input: BowlerInput = {
    firstName: bowler.firstName ?? '',
    middleInitial: bowler.middleInitial,
    lastName: bowler.lastName ?? '',
    suffix: bowler.suffix,
    address: {
      street: bowler.street ?? '',
      city: bowler.city ?? '',
      state: bowler.state ?? '',
      // Stryker disable next-line StringLiteral: any text without digits normalizes to the same empty zip.
      zipCode: bowler.zipCode ?? '',
    },
    email: bowler.email ?? '',
    phoneNumber: bowler.phoneNumber,
    usbcId: bowler.usbcId ?? '',
    dateOfBirth: bowler.dateOfBirth,
    // `toBowlerPatch` reads "F" as Female and anything sent as Male (D-113). The desk sends a word.
    // Stryker disable next-line StringLiteral: an unknown key reads as undefined, as the empty one does.
    gender: vendorGender[bowler.gender ?? ''],
  }
  return toBowlerPatch(input)
}
