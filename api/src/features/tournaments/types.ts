import { z } from 'zod'
import { vendorDivisionSchema } from '../divisions/types.ts'
import { vendorSquadSchema } from '../squads/types.ts'
import { vendorSweeperSchema } from '../sweepers/types.ts'

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
  tournament: tournamentSchema.extend({
    divisions: z.array(vendorDivisionSchema),
    squads: z.array(vendorSquadSchema),
    sweepers: z.array(vendorSweeperSchema),
  }),
})

/**
 * The tournament-wide ratios the finals results need (RES-12, RES-28). Not part of the vendor shape
 * (D-09): no route sends them. The super sweeper ratio may hold the legacy 0 (D-17).
 */
export interface TournamentRatios {
  finalsRatio: number
  superSweeperCashRatio: number
}

/**
 * What the director typed beyond the summary: games and the three ratios (D-126). Web only (D-09).
 * The super sweeper ratio may hold the legacy 0 (D-17).
 */
export const tournamentSettingsSchema = z.object({
  games: z.number().int().min(1),
  finalsRatio: z.number(),
  cashRatio: z.number(),
  superSweeperCashRatio: z.number(),
})

export type TournamentSettings = z.infer<typeof tournamentSettingsSchema>

/**
 * What the settings route sends: the settings plus whether the tournament is complete (D-131). A
 * complete tournament is frozen (D-130). Nothing in the new app sets the flag yet.
 */
export const tournamentSettingsViewSchema = tournamentSettingsSchema.extend({
  completed: z.boolean(),
})

export type TournamentSettingsView = z.infer<typeof tournamentSettingsViewSchema>

/** What `POST /v1/tournaments` sends back: the summary plus the settings (D-121). */
export type CreatedTournament = Tournament & TournamentSettings

/** What `GET /v1/tournaments/{id}/edit-info` sends: the counts behind the edit page's locks (D-131). */
export const editInfoSchema = z.object({
  registrationCount: z.number().int().min(0),
  hasScores: z.boolean(),
  hasSweeperScores: z.boolean(),
})
