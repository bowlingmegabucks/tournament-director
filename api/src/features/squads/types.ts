import { z } from 'zod'
import { sessionFields } from '../../shared/sessions.ts'

/**
 * A squad as the web app's Squads page reads it (SQD-21, D-41, D-43). The fee and ratios are the
 * values that apply: the squad's own if set, else the tournament's (TRN-12), with a flag for each
 * override. `web/src/features/squads/types.ts` expects this shape. Change both together.
 * Not vendor-visible.
 */
export const squadSchema = z.object({
  ...sessionFields,
  entryFee: z.number(),
  entryFeeOverridden: z.boolean(),
  finalsRatio: z.number(),
  finalsRatioOverridden: z.boolean(),
  cashRatio: z.number(),
  cashRatioOverridden: z.boolean(),
  /** Games each bowler bowls on this squad: the tournament's (TRN-04). The recap sheets use it. */
  games: z.number().int(),
})

export type Squad = z.infer<typeof squadSchema>

export const squadListSchema = z.object({ squads: z.array(squadSchema) })

/**
 * The part of a squad the registration site already reads on the tournament detail (`API-04`).
 * `entryFee` is `null` when the squad uses the tournament fee. Change it only after a vendor
 * change doc (D-09).
 */
export const vendorSquadSchema = z.object({
  id: z.uuid(),
  date: sessionFields.date,
  entryFee: z.number().nullable(),
})

export type VendorSquad = z.infer<typeof vendorSquadSchema>

export function toVendorSquad(squad: Squad): VendorSquad {
  return {
    id: squad.id,
    date: squad.date,
    entryFee: squad.entryFeeOverridden ? squad.entryFee : null,
  }
}
