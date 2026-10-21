import { Router } from 'express'
import { z } from 'zod'
import { HttpError } from '../../shared/errors.ts'
import type { TournamentRepository } from './repository.ts'

const idParams = z.object({ id: z.uuid() })

export function createTournamentRouter(repository: TournamentRepository): Router {
  const router = Router()

  // Express 5 sends a rejected promise to the error handler, so no try/catch here.
  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', async (_req, res) => {
    res.json({ tournaments: await repository.list() })
  })

  router.get('/:id', async (req, res) => {
    const { id } = idParams.parse(req.params)
    const tournament = await repository.get(id)
    if (!tournament) throw new HttpError(404, 'Tournament not found')
    res.json({ tournament })
  })

  return router
}
