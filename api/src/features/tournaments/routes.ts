import { Router } from 'express'
import type { TournamentRepository } from './repository.ts'

export function createTournamentRouter(repository: TournamentRepository): Router {
  const router = Router()

  // Express 5 sends a rejected promise to the error handler, so no try/catch here.
  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', async (_req, res) => {
    res.json(await repository.list())
  })

  return router
}
