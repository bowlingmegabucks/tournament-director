import { Router } from 'express'

/** `GET /` (API-01, D-111): a short text, so a person who opens the address sees the API is there. */
export function createRootRouter(): Router {
  const router = Router()
  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', (_req, res) => {
    res.type('text/plain').send('Northeast Megabucks API')
  })
  return router
}
