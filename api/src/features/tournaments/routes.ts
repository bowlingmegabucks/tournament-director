import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../../shared/errors.ts'
import { toVendorDivision } from '../divisions/types.ts'
import type { DivisionRepository } from '../divisions/repository.ts'
import { toVendorSquad } from '../squads/types.ts'
import type { SquadRepository } from '../squads/repository.ts'
import { toVendorSweeper } from '../sweepers/types.ts'
import type { SweeperRepository } from '../sweepers/repository.ts'
import type { TournamentRepository } from './repository.ts'

const idParams = z.object({ id: z.uuid() })

export function createTournamentRouter(
  repository: TournamentRepository,
  divisions: DivisionRepository,
  squads: SquadRepository,
  sweepers: SweeperRepository,
): Router {
  const router = Router()

  // Express 5 sends a rejected promise to the error handler, so no try/catch here.
  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', async (_req, res) => {
    res.json({ tournaments: await repository.list() })
  })

  router.get('/:id', async (req, res) => {
    const { id } = idParams.parse(req.params)
    // Both reads start together. An unknown tournament costs one wasted read and still gives 404.
    const [tournament, storedDivisions, storedSquads, storedSweepers] = await Promise.all([
      repository.get(id),
      divisions.listByTournament(id),
      squads.listByTournament(id),
      sweepers.listByTournament(id),
    ])
    if (!tournament) throw new HttpError(404, 'Tournament not found')
    // D-25, D-37, D-41: the detail carries the vendor-shape divisions, squads, and sweepers (API-04).
    res.json({
      tournament: {
        ...tournament,
        divisions: storedDivisions.map(toVendorDivision),
        squads: storedSquads.map(toVendorSquad),
        sweepers: storedSweepers.map(toVendorSweeper),
      },
    })
  })

  return router
}
