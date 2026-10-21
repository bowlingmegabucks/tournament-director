import { Router } from 'express'

export function createHealthRouter(): Router {
  const router = Router()
  // Stryker disable next-line StringLiteral: '' and '/' match the same path.
  router.get('/', (_req, res) => {
    res.json({ status: 'ok' })
  })
  return router
}
