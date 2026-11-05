import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../../shared/errors.ts'
import type { TournamentRepository } from './repository.ts'

const idParams = z.object({ id: z.uuid() })

/**
 * Mounted at `/v1/tournaments/:id/edit-info`, behind `tournaments.write` (D-131). Web only (D-09).
 * The counts of registrations stay behind sign-in, like the registrations list (D-105).
 */
export function createEditInfoRouter(repository: TournamentRepository): Router {
  const router = Router({ mergeParams: true })

  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', async (req, res) => {
    const { id } = idParams.parse(req.params)
    const editInfo = await repository.getEditInfo(id)
    if (!editInfo) throw new HttpError(404, 'Tournament not found')
    res.json({ editInfo })
  })

  return router
}
