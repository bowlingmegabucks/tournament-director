import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../../shared/errors.ts'
import type { TournamentRepository } from '../tournaments/repository.ts'
import type { SquadRepository } from './repository.ts'

const idParams = z.object({ id: z.uuid() })

/**
 * Mounted at `/v1/tournaments/:id/squads`. Web only, not part of the vendor contract (D-41).
 * `mergeParams` lets this router see the `:id` from the mount path.
 */
export function createSquadRouter(
  squads: SquadRepository,
  tournaments: TournamentRepository,
): Router {
  const router = Router({ mergeParams: true })

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', async (req, res) => {
    const { id } = idParams.parse(req.params)
    // Both reads start together. An unknown tournament is a 404, not an empty list (as TRN-15).
    const [tournament, stored] = await Promise.all([
      tournaments.get(id),
      squads.listByTournament(id),
    ])
    if (!tournament) throw new HttpError(404, 'Tournament not found')
    res.json({ squads: stored })
  })

  return router
}
