import { z } from 'zod'
import { vendorDivisionSchema } from '../divisions/types.ts'

/**
 * The tournament summary the registration site already reads (`API-03`, `API-04`).
 * `web/src/features/tournaments/types.ts` expects this shape. Change both together,
 * and only after a vendor change doc (D-09).
 */
export const tournamentSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  entryFee: z.number().positive(),
  bowlingCenter: z.string().min(1),
})

export type Tournament = z.infer<typeof tournamentSchema>

export const tournamentListSchema = z.object({ tournaments: z.array(tournamentSchema) })

export const tournamentDetailSchema = z.object({
  tournament: tournamentSchema.extend({ divisions: z.array(vendorDivisionSchema) }),
})
