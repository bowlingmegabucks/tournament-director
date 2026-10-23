import { z } from 'zod'
import { sessionFields } from '../../shared/sessions.ts'

/** Bonus pins per game for one division. Only divisions with pins other than 0 appear (D-45). */
export const bonusPinsSchema = z.object({
  divisionId: z.uuid(),
  divisionName: z.string(),
  bonusPinsPerGame: z
    .number()
    .int()
    .refine((pins) => pins !== 0),
})

export type BonusPins = z.infer<typeof bonusPinsSchema>

/**
 * A sweeper as the web app's Sweepers page reads it (SQD-22, D-41). Fee, games, and cash ratio are
 * the sweeper's own and never inherited (D-43). `web/src/features/sweepers/types.ts` expects this
 * shape. Change both together. Not vendor-visible.
 */
export const sweeperSchema = z.object({
  ...sessionFields,
  entryFee: z.number(),
  games: z.number().int(),
  cashRatio: z.number(),
  bonusPins: z.array(bonusPinsSchema),
})

export type Sweeper = z.infer<typeof sweeperSchema>

export const sweeperListSchema = z.object({ sweepers: z.array(sweeperSchema) })

/**
 * The part of a sweeper the registration site already reads on the tournament detail (`API-04`).
 * Change it only after a vendor change doc (D-09).
 */
export const vendorSweeperSchema = z.object({
  id: z.uuid(),
  date: sessionFields.date,
  entryFee: z.number(),
  games: z.number().int(),
})

export type VendorSweeper = z.infer<typeof vendorSweeperSchema>

export function toVendorSweeper(sweeper: Sweeper): VendorSweeper {
  return {
    id: sweeper.id,
    date: sweeper.date,
    entryFee: sweeper.entryFee,
    games: sweeper.games,
  }
}
