import { z } from 'zod'

const gender = z.enum(['Male', 'Female']).nullable()
const wholeNumberOrNull = z.number().int().nullable()

/**
 * A division as the web app's Divisions page reads it (DIV-12, D-37). `web/src/features/divisions/types.ts`
 * expects this shape. Change both together. Not vendor-visible.
 */
export const divisionSchema = z.object({
  id: z.uuid(),
  number: z.number().int(),
  name: z.string().min(1),
  gender,
  minimumAge: wholeNumberOrNull,
  maximumAge: wholeNumberOrNull,
  minimumAverage: wholeNumberOrNull,
  maximumAverage: wholeNumberOrNull,
  /** A whole percent: stored `0.90` is `90`. */
  handicapPercentage: wholeNumberOrNull,
  handicapBase: wholeNumberOrNull,
  maximumHandicapPerGame: wholeNumberOrNull,
})

export type Division = z.infer<typeof divisionSchema>

export const divisionListSchema = z.object({ divisions: z.array(divisionSchema) })

/**
 * The part of a division the registration site already reads on the tournament detail (`API-04`).
 * Change it only after a vendor change doc (D-09).
 */
export const vendorDivisionSchema = divisionSchema.pick({
  id: true,
  name: true,
  minimumAge: true,
  maximumAge: true,
  minimumAverage: true,
  maximumAverage: true,
  gender: true,
})

export type VendorDivision = z.infer<typeof vendorDivisionSchema>

/** Drop the fields the vendor does not see. Parsing strips them. */
export function toVendorDivision(division: Division): VendorDivision {
  return vendorDivisionSchema.parse(division)
}
