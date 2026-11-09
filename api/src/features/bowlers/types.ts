import { z } from 'zod'

/**
 * What the desk's bowler search returns (BWL-14, D-157). `web/src/features/registrations/types.ts`
 * expects this shape. Change both together. Not vendor-visible. Never the SSN, date of birth,
 * email, phone, or street: the picker needs enough to tell two Marias apart, and no more.
 */
export const bowlerSearchResultSchema = z.object({
  id: z.uuid(),
  /** `First Last`, plus `, Suffix` (BWL-13). */
  name: z.string().min(1),
  firstName: z.string(),
  lastName: z.string(),
  /** `''` when the bowler has none. */
  usbcId: z.string(),
  city: z.string(),
  state: z.string(),
  /** The division of this bowler's registration in the tournament asked about, or `null`. */
  registered: z.object({ divisionName: z.string() }).nullable(),
})

export type BowlerSearchResult = z.infer<typeof bowlerSearchResultSchema>

export const bowlerSearchSchema = z.object({
  bowlers: z.array(bowlerSearchResultSchema),
  /** True when more than 25 bowlers matched and the list was cut. */
  more: z.boolean(),
})

/** The bowler fields the desk form shows and edits (D-158). No SSN (BWL-17). */
export const bowlerDetailSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  middleInitial: z.string(),
  lastName: z.string(),
  suffix: z.string(),
  street: z.string(),
  city: z.string(),
  state: z.string(),
  zipCode: z.string(),
  email: z.string(),
  phoneNumber: z.string(),
  usbcId: z.string(),
  /** `YYYY-MM-DD`, or `''` when none. */
  dateOfBirth: z.string(),
  /** `''` when unknown. */
  gender: z.enum(['Male', 'Female', '']),
})

export type BowlerDetail = z.infer<typeof bowlerDetailSchema>

/** The bowler's registration in the tournament asked about (REG-01, D-165). */
export const bowlerRegistrationSchema = z.object({
  id: z.uuid(),
  divisionId: z.uuid(),
  divisionName: z.string(),
  average: z.number().int().nullable(),
  superSweeper: z.boolean(),
  squadIds: z.array(z.uuid()),
  sweeperIds: z.array(z.uuid()),
  /** Any score in this tournament: a division move is refused (D-160). */
  hasScores: z.boolean(),
})

export const bowlerResponseSchema = z.object({
  bowler: bowlerDetailSchema,
  registration: bowlerRegistrationSchema.nullable(),
})

export type BowlerResponse = z.infer<typeof bowlerResponseSchema>

/** Filters, all optional and combined with AND (BWL-14). At least one of the first four is needed. */
export interface BowlerFilter {
  /** Starts with. */
  lastName?: string
  /** Starts with. */
  firstName?: string
  /** Equals. */
  email?: string
  /** Equals. */
  usbcId?: string
  /** Adds `registered` to each result. */
  tournamentId?: string
}

export const searchLimit = 25
