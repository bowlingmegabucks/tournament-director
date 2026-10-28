import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../../shared/errors.ts'
import type { DivisionRepository } from '../divisions/repository.ts'
import type { SquadRepository } from '../squads/repository.ts'
import type { SweeperRepository } from '../sweepers/repository.ts'
import type { TournamentRepository } from '../tournaments/repository.ts'
import type { RegistrationRepository } from './repository.ts'
import { summarize } from './summary.ts'
import type { Registration } from './types.ts'

const idParams = z.object({ id: z.uuid() })

/**
 * Mounted at `/v1/tournaments/:id/registrations`. Web only, not part of the vendor contract
 * (D-47, D-09). Public for 0.2.0; it moves behind auth right after 0.3.0 (D-46, D-52).
 * `mergeParams` lets this router see the `:id` from the mount path.
 */
export function createRegistrationRouter(
  registrations: RegistrationRepository,
  tournaments: TournamentRepository,
  divisions: DivisionRepository,
  squads: SquadRepository,
  sweepers: SweeperRepository,
): Router {
  const router = Router({ mergeParams: true })

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', async (req, res) => {
    const { id } = idParams.parse(req.params)
    // All reads start together. An unknown tournament is a 404, not an empty list (as TRN-15).
    const [tournament, stored, tournamentDivisions, tournamentSquads, tournamentSweepers] =
      await Promise.all([
        tournaments.get(id),
        registrations.listByTournament(id),
        divisions.listByTournament(id),
        squads.listByTournament(id),
        sweepers.listByTournament(id),
      ])
    if (!tournament) throw new HttpError(404, 'Tournament not found')

    res.json({
      registrations: stored.map(({ squadIds, sweeperIds, ...registration }): Registration => ({
        ...registration,
        squads: squadIds.length,
        sweepers: sweeperIds.length,
      })),
      summary: summarize(stored, tournamentDivisions, tournamentSquads, tournamentSweepers),
    })
  })

  return router
}
