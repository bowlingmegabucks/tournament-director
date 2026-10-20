import { z } from 'zod'

/** The shape `web/src/features/tournaments/types.ts` expects. Change both together. */
export const tournamentSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  date: z.iso.date(),
  entrants: z.number().int().nonnegative(),
})

export type Tournament = z.infer<typeof tournamentSchema>
